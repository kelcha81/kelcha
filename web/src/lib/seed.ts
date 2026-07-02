import type { Candle, Timeframe } from '@/store/replayStore';
import {
  putM1Chunk,
  putAggregate,
  putMeta,
  getMeta,
  SCHEMA_VERSION,
  type SymbolMeta
} from '@/lib/idb';

interface Manifest {
  symbol: string;
  pricePrecision: number;
  dataMin?: number;
  dataMax?: number;
  timeframes: Record<string, { chunks?: string[]; file?: string }>;
}

export interface SeedProgress {
  done: number;
  total: number;
  label: string;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url} (HTTP ${res.status})`);
  return res.json() as Promise<T>;
}

export function getManifest(symbol: string): Promise<Manifest> {
  return fetchJson<Manifest>(`/api/data/${symbol}/manifest.json`);
}

/**
 * Seed (or incrementally refresh) a symbol in IndexedDB. Skips when already
 * seeded on the current schema and the manifest has no newer data; otherwise
 * writes new/changed M1 monthly chunks, refetches the (recomputed) aggregates,
 * and updates the bounds/months meta — so the daily refresh Job's new bars show
 * up in charts on the next session load.
 */
export async function seedSymbol(
  symbol: string,
  onProgress?: (p: SeedProgress) => void
): Promise<void> {
  const manifest = await getManifest(symbol);
  const existing = await getMeta(symbol);
  const current = existing?.schemaVersion === SCHEMA_VERSION ? existing : undefined;

  // Already seeded on this schema and nothing newer in the manifest → done.
  const manifestMax = manifest.dataMax ?? 0;
  if (current && (!manifestMax || manifestMax <= current.maxTs)) return;

  const monthOf = (cp: string) => cp.replace('m1/', '').replace('.json', '');
  const m1Chunks = manifest.timeframes.m1.chunks ?? [];
  const aggTfs = (Object.keys(manifest.timeframes) as Timeframe[]).filter((tf) => tf !== 'm1');

  // Seed any month not yet stored, plus the last stored month (its final bars may
  // have grown). Aggregates are recomputed every refresh, so always refetch them.
  const seeded = new Set(current?.months ?? []);
  const lastSeeded = current?.months?.length ? current.months[current.months.length - 1] : null;
  const chunksToSeed = m1Chunks.filter((cp) => !seeded.has(monthOf(cp)) || monthOf(cp) === lastSeeded);

  const total = chunksToSeed.length + aggTfs.length;
  let done = 0;
  const tick = (label: string) => onProgress?.({ done: ++done, total, label });

  let minTs = current?.minTs ?? Infinity;
  let maxTs = current?.maxTs ?? -Infinity;
  const months = new Set(current?.months ?? []);

  for (const chunkPath of chunksToSeed) {
    const part = await fetchJson<Candle[]>(`/api/data/${symbol}/${chunkPath}`);
    const month = monthOf(chunkPath);
    await putM1Chunk(symbol, month, part);
    months.add(month);
    if (part.length) {
      minTs = Math.min(minTs, part[0].timestamp);
      maxTs = Math.max(maxTs, part[part.length - 1].timestamp);
    }
    tick(`M1 ${month}`);
  }

  for (const tf of aggTfs) {
    const file = manifest.timeframes[tf]?.file;
    if (!file) continue;
    const arr = await fetchJson<Candle[]>(`/api/data/${symbol}/${file}`);
    await putAggregate(symbol, tf, arr);
    tick(tf.toUpperCase());
  }

  const meta: SymbolMeta = {
    symbol,
    minTs: Number.isFinite(minTs) ? minTs : 0,
    maxTs: Number.isFinite(maxTs) ? maxTs : 0,
    months: [...months].sort(),
    schemaVersion: SCHEMA_VERSION
  };
  await putMeta(meta);
}
