import type { Candle, Timeframe } from '@/store/replayStore';
import {
  getAggregate,
  putAggregate,
  getChunk,
  putChunk,
  getCacheMeta,
  putCacheMeta,
  SCHEMA_VERSION
} from '@/lib/idb';

// Windowed candle access, network-backed with IndexedDB as a CACHE (lazy,
// on-demand — no upfront seeding). getRange() resolves which server files
// cover [from, to] from the symbol's manifest, fetches only the missing ones
// from /api/data, and caches them (memory LRU + IDB). Closed months are
// immutable; the current month refreshes when the manifest's dataMax advances.

export interface Bounds {
  min: number;
  max: number;
}

// ---- manifest ---------------------------------------------------------------

export interface ManifestTf {
  chunks?: string[]; // e.g. ["m1/2024-01.json", ...] — preferred when present
  file?: string; // whole-array file (small tfs; also the fallback)
}

export interface Manifest {
  symbol: string;
  pricePrecision: number;
  dataMin?: number;
  dataMax?: number;
  timeframes: Record<string, ManifestTf>;
}

const MANIFEST_TTL = 5 * 60_000;
const manifests = new Map<string, { at: number; promise: Promise<Manifest> }>();

export function getManifest(symbol: string): Promise<Manifest> {
  const hit = manifests.get(symbol);
  if (hit && Date.now() - hit.at < MANIFEST_TTL) return hit.promise;
  const promise = (async () => {
    const res = await fetch(`/api/data/${symbol}/manifest.json`);
    if (!res.ok) throw new Error(`No packaged data for ${symbol} (HTTP ${res.status})`);
    return (await res.json()) as Manifest;
  })();
  manifests.set(symbol, { at: Date.now(), promise });
  promise.catch(() => manifests.delete(symbol)); // failed fetches retry next call
  return promise;
}

// ---- pure helpers (unit-tested) ----------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0');

/** UTC YYYY-MM of a timestamp (chunk files are split by UTC month). */
export function monthOfUTC(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** YYYY-MM keys for every UTC month overlapping [from, to]. */
export function monthsInRange(from: number, to: number): string[] {
  const months: string[] = [];
  const d = new Date(from);
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  while (d.getTime() <= to) {
    months.push(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`);
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return months;
}

export type ChunkRequest = { kind: 'chunk'; month: string; path: string } | { kind: 'whole'; path: string };

/** Which server files cover [from, to] for a timeframe: prefer monthly chunks
 *  (only months that exist), fall back to the whole file. */
export function resolveRequests(from: number, to: number, mtf: ManifestTf | undefined): ChunkRequest[] {
  if (!mtf) return [];
  if (mtf.chunks?.length) {
    const byMonth = new Map<string, string>();
    for (const path of mtf.chunks) {
      const m = /(\d{4}-\d{2})\.json$/.exec(path);
      if (m) byMonth.set(m[1], path);
    }
    return monthsInRange(from, to)
      .filter((month) => byMonth.has(month))
      .map((month) => ({ kind: 'chunk' as const, month, path: byMonth.get(month) as string }));
  }
  if (mtf.file) return [{ kind: 'whole', path: mtf.file }];
  return [];
}

/**
 * Truncated-month freshness rule. `month` is null for whole files.
 * - Never fetched → stale.
 * - Chunk from a month that was already CLOSED when fetched → final, forever.
 *   (A month is closed once data beyond it existed at fetch time.)
 * - Otherwise (hot chunk / whole file) → fresh only while the server has no
 *   newer data than we saw at fetch time.
 */
export function isRecordFresh(month: string | null, fetchedAt: number | undefined, dataMax: number): boolean {
  if (fetchedAt === undefined) return false;
  if (month !== null && monthOfUTC(fetchedAt) > month) return true;
  return fetchedAt >= dataMax;
}

/** First index i where arr[i].timestamp >= ts. */
function lowerBound(arr: Candle[], ts: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid].timestamp < ts) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** First index i where arr[i].timestamp > ts. */
function upperBound(arr: Candle[], ts: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid].timestamp <= ts) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function sliceRange(arr: Candle[], from: number, to: number): Candle[] {
  return arr.slice(lowerBound(arr, from), upperBound(arr, to));
}

// ---- record loading (memory LRU → IDB-if-fresh → deduped fetch) -------------

const MEM_MAX = 16;
const memCache = new Map<string, Candle[]>(); // insertion order = LRU

function memGet(key: string): Candle[] | undefined {
  const v = memCache.get(key);
  if (v) {
    memCache.delete(key);
    memCache.set(key, v); // refresh recency
  }
  return v;
}

function memPut(key: string, v: Candle[]): void {
  memCache.delete(key);
  memCache.set(key, v);
  while (memCache.size > MEM_MAX) {
    const oldest = memCache.keys().next().value as string;
    memCache.delete(oldest);
  }
}

/** Drop the in-memory cache (all symbols, or one) — e.g. after Clear cache. */
export function clearMemCache(symbol?: string): void {
  if (!symbol) {
    memCache.clear();
    return;
  }
  for (const key of [...memCache.keys()]) {
    if (key.startsWith(`${symbol}|`)) memCache.delete(key);
  }
}

const inflight = new Map<string, Promise<Candle[]>>();

// cacheMeta read-modify-writes are serialized per symbol.
const metaLocks = new Map<string, Promise<void>>();
function withMetaLock(symbol: string, fn: () => Promise<void>): Promise<void> {
  const prev = metaLocks.get(symbol) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  metaLocks.set(symbol, next);
  return next;
}

async function fetchJson(path: string): Promise<Candle[]> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`Failed to fetch ${path} (HTTP ${res.status})`);
      return (await res.json()) as Candle[];
    } catch (e) {
      if (attempt >= 2) throw e;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

async function loadRecord(symbol: string, tf: Timeframe, req: ChunkRequest, manifest: Manifest): Promise<Candle[]> {
  const month = req.kind === 'chunk' ? req.month : null;
  const recordKey = `${tf}:${month ?? 'whole'}`;
  const memKey = `${symbol}|${recordKey}`;

  const cachedInMem = memGet(memKey);
  if (cachedInMem) return cachedInMem;

  const running = inflight.get(memKey);
  if (running) return running;

  const p = (async () => {
    const dataMax = manifest.dataMax ?? 0;
    const meta = await getCacheMeta(symbol);
    if (isRecordFresh(month, meta?.fetchedAt[recordKey], dataMax)) {
      const cached = month !== null ? await getChunk(symbol, tf, month) : await getAggregate(symbol, tf);
      if (cached) {
        memPut(memKey, cached);
        return cached;
      }
    }

    const data = await fetchJson(`/api/data/${symbol}/${req.path}`);
    // Chunk first, meta second: a crash between them means a harmless refetch,
    // never a trusted-but-truncated record.
    if (month !== null) await putChunk(symbol, tf, month, data);
    else await putAggregate(symbol, tf, data);
    await withMetaLock(symbol, async () => {
      const cur = (await getCacheMeta(symbol)) ?? { symbol, schemaVersion: SCHEMA_VERSION, fetchedAt: {} };
      cur.fetchedAt[recordKey] = dataMax;
      await putCacheMeta(cur);
    });
    memPut(memKey, data);
    return data;
  })();

  inflight.set(memKey, p);
  try {
    return await p;
  } finally {
    inflight.delete(memKey);
  }
}

// ---- public API ---------------------------------------------------------------

/** Candles for [from, to] inclusive, loaded lazily (server → IDB → memory). */
export async function getRange(symbol: string, tf: Timeframe, from: number, to: number): Promise<Candle[]> {
  if (to < from) return [];
  const manifest = await getManifest(symbol);
  const reqs = resolveRequests(from, to, manifest.timeframes[tf]);
  if (!reqs.length) return [];

  const parts = await Promise.all(reqs.map((r) => loadRecord(symbol, tf, r, manifest)));

  // Warm the NEXT month when the window nears a month boundary (m1 playback
  // crosses months often; do it for any chunked tf — it's one small fetch).
  const last = reqs[reqs.length - 1];
  if (last.kind === 'chunk') {
    const monthEnd = new Date(`${last.month}-01T00:00:00Z`);
    monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
    if (monthEnd.getTime() - to < 48 * 3_600_000) {
      const next = resolveRequests(monthEnd.getTime(), monthEnd.getTime(), manifest.timeframes[tf]);
      if (next.length && (next[0].kind !== 'chunk' || next[0].month !== last.month)) {
        void loadRecord(symbol, tf, next[0], manifest).catch(() => {});
      }
    }
  }

  const merged = parts.length === 1 ? parts[0] : ([] as Candle[]).concat(...parts);
  return sliceRange(merged, from, to);
}

/** The symbol's full data range — from the server manifest (works on a fresh
 *  device, no seeding), with a cache-derived fallback when offline. */
export async function getBounds(symbol: string): Promise<Bounds | null> {
  try {
    const m = await getManifest(symbol);
    if (m.dataMin != null && m.dataMax != null && m.dataMax > m.dataMin) return { min: m.dataMin, max: m.dataMax };
    // Older manifests lack dataMin/dataMax — approximate from the m1 chunk list.
    const chunks = m.timeframes.m1?.chunks ?? [];
    if (chunks.length) {
      const months = chunks.map((c) => /(\d{4}-\d{2})\.json$/.exec(c)?.[1]).filter(Boolean) as string[];
      months.sort();
      const min = Date.parse(`${months[0]}-01T00:00:00Z`);
      const end = new Date(`${months[months.length - 1]}-01T00:00:00Z`);
      end.setUTCMonth(end.getUTCMonth() + 1);
      return { min, max: end.getTime() - 60_000 };
    }
  } catch {
    // Offline: fall back to what the local cache has seen.
    const meta = await getCacheMeta(symbol);
    if (meta) {
      const months = Object.keys(meta.fetchedAt)
        .map((k) => /^(?:m1|m5|m15|h1):(\d{4}-\d{2})$/.exec(k)?.[1])
        .filter(Boolean) as string[];
      const maxSeen = Math.max(0, ...Object.values(meta.fetchedAt));
      if (months.length && maxSeen > 0) {
        months.sort();
        return { min: Date.parse(`${months[0]}-01T00:00:00Z`), max: maxSeen };
      }
    }
  }
  return null;
}

// ---- optional full preload (Data Manager "Preload") ---------------------------

export interface SeedProgress {
  done: number;
  total: number;
  label: string;
}

/** Background-fetch EVERYTHING for a symbol into the cache (optional; the app
 *  never requires it — charts load lazily). */
export async function preloadSymbol(symbol: string, onProgress?: (p: SeedProgress) => void): Promise<void> {
  const manifest = await getManifest(symbol);
  const jobs: { tf: Timeframe; req: ChunkRequest; label: string }[] = [];
  for (const [tf, mtf] of Object.entries(manifest.timeframes) as [Timeframe, ManifestTf][]) {
    for (const req of resolveRequests(-8.64e15, 8.64e15, mtf)) {
      jobs.push({ tf, req, label: req.kind === 'chunk' ? `${tf.toUpperCase()} ${req.month}` : tf.toUpperCase() });
    }
  }
  let done = 0;
  for (const job of jobs) {
    await loadRecord(symbol, job.tf, job.req, manifest);
    onProgress?.({ done: ++done, total: jobs.length, label: job.label });
  }
}
