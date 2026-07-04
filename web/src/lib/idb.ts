import { openDB, type IDBPDatabase } from 'idb';
import type { Candle, Timeframe } from '@/store/replayStore';

// IndexedDB is a CACHE over the server's packaged candles (lazy, on-demand):
//   `${symbol}:${tf}:${YYYY-MM}` -> Candle[]   (chunked tfs: m1 + m5/m15/h1)
//   `${symbol}:${tf}`            -> Candle[]   (whole-file tfs: h4/d1/w1/mo1)
//   `${symbol}:cacheMeta`        -> CacheMeta  (per-record dataMax-at-fetch)
//
// Freshness is gated on SCHEMA_VERSION inside the cacheMeta record — NOT on
// the IDB version — so changing the data model never needs a destructive (and
// deadlock-prone) IndexedDB upgrade. Records without a cacheMeta entry (e.g.
// leftovers from the old full-seed schema) are simply never trusted and get
// overwritten on first fetch.

const DB_NAME = 'forex-replay-data';
const DB_VERSION = 4;
const STORE = 'series';
const BACKTESTS = 'backtests'; // latest backtest result per tab (survives reload)

/** Bump when the stored data shape changes; invalidates the cache. */
export const SCHEMA_VERSION = 4;

/** Per-symbol cache bookkeeping: for each stored record ('m1:2024-03' or
 *  'h4:whole'), the manifest.dataMax observed when it was fetched — the basis
 *  of the truncated-month freshness rule in candleSource. */
export interface CacheMeta {
  symbol: string;
  schemaVersion: number;
  fetchedAt: Record<string, number>;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      // Idempotent + non-destructive: just ensure the stores exist.
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        if (!db.objectStoreNames.contains(BACKTESTS)) db.createObjectStore(BACKTESTS);
      },
      blocked() {
        console.warn('[idb] open blocked by another connection — close other tabs of this app');
      },
      blocking() {
        // This connection is blocking a newer version elsewhere — release it.
        dbPromise?.then((db) => db.close()).catch(() => {});
        dbPromise = null;
      },
      terminated() {
        dbPromise = null;
      }
    });
  }
  return dbPromise;
}

const aggKey = (symbol: string, tf: Timeframe) => `${symbol}:${tf}`;
const chunkKey = (symbol: string, tf: Timeframe, month: string) => `${symbol}:${tf}:${month}`;
const cacheMetaKey = (symbol: string) => `${symbol}:cacheMeta`;

export async function getAggregate(symbol: string, tf: Timeframe): Promise<Candle[] | undefined> {
  return (await getDb()).get(STORE, aggKey(symbol, tf));
}

export async function putAggregate(symbol: string, tf: Timeframe, candles: Candle[]): Promise<void> {
  await (await getDb()).put(STORE, candles, aggKey(symbol, tf));
}

export async function getChunk(symbol: string, tf: Timeframe, month: string): Promise<Candle[] | undefined> {
  return (await getDb()).get(STORE, chunkKey(symbol, tf, month));
}

export async function putChunk(symbol: string, tf: Timeframe, month: string, candles: Candle[]): Promise<void> {
  await (await getDb()).put(STORE, candles, chunkKey(symbol, tf, month));
}

export async function getCacheMeta(symbol: string): Promise<CacheMeta | undefined> {
  const meta = (await (await getDb()).get(STORE, cacheMetaKey(symbol))) as CacheMeta | undefined;
  return meta && meta.schemaVersion === SCHEMA_VERSION ? meta : undefined;
}

export async function putCacheMeta(meta: CacheMeta): Promise<void> {
  await (await getDb()).put(STORE, meta, cacheMetaKey(meta.symbol));
}

/** Has ANY locally cached data on the current schema (cache is lazy/partial). */
export async function hasSymbol(symbol: string): Promise<boolean> {
  const meta = await getCacheMeta(symbol);
  return meta !== undefined && Object.keys(meta.fetchedAt).length > 0;
}

// --- backtest results (latest per tab) --------------------------------------

/** All persisted backtest results, keyed by tabId — for hydrating on load. */
export async function getAllBacktests<T = unknown>(): Promise<Record<string, T>> {
  const db = await getDb();
  const keys = (await db.getAllKeys(BACKTESTS)) as string[];
  const vals = (await db.getAll(BACKTESTS)) as T[];
  const out: Record<string, T> = {};
  keys.forEach((k, i) => (out[k] = vals[i]));
  return out;
}

export async function putBacktest(tabId: string, data: unknown): Promise<void> {
  await (await getDb()).put(BACKTESTS, data, tabId);
}

export async function deleteBacktest(tabId: string): Promise<void> {
  await (await getDb()).delete(BACKTESTS, tabId);
}

/** Remove every stored key for a symbol (M1 chunks, aggregates, meta) so it reseeds. */
export async function deleteSymbol(symbol: string): Promise<void> {
  const db = await getDb();
  const keys = await db.getAllKeys(STORE);
  const prefix = `${symbol}:`;
  const tx = db.transaction(STORE, 'readwrite');
  await Promise.all(
    keys
      .filter((k): k is string => typeof k === 'string' && k.startsWith(prefix))
      .map((k) => tx.store.delete(k))
  );
  await tx.done;
}
