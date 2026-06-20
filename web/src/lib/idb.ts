import { openDB, type IDBPDatabase } from 'idb';
import type { Candle, Timeframe } from '@/store/replayStore';

// IndexedDB storage:
//   `${symbol}:m1:${YYYY-MM}` -> Candle[]   (M1 chunked by month for ranged reads)
//   `${symbol}:${tf}`         -> Candle[]   (m5..mo1 stored whole)
//   `${symbol}:meta`          -> SymbolMeta (bounds + months + schemaVersion)
//
// Reseeding is gated on SCHEMA_VERSION inside the meta record — NOT on the IDB
// version — so changing the data model never needs a destructive (and
// deadlock-prone) IndexedDB upgrade.

const DB_NAME = 'forex-replay-data';
const DB_VERSION = 4;
const STORE = 'series';
const BACKTESTS = 'backtests'; // latest backtest result per tab (survives reload)

/** Bump when the stored data shape changes; forces a (non-destructive) reseed. */
export const SCHEMA_VERSION = 3;

export interface SymbolMeta {
  symbol: string;
  minTs: number;
  maxTs: number;
  months: string[];
  schemaVersion: number;
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
const m1Key = (symbol: string, month: string) => `${symbol}:m1:${month}`;
const metaKey = (symbol: string) => `${symbol}:meta`;

export async function getAggregate(symbol: string, tf: Timeframe): Promise<Candle[] | undefined> {
  return (await getDb()).get(STORE, aggKey(symbol, tf));
}

export async function putAggregate(symbol: string, tf: Timeframe, candles: Candle[]): Promise<void> {
  await (await getDb()).put(STORE, candles, aggKey(symbol, tf));
}

export async function getM1Chunk(symbol: string, month: string): Promise<Candle[] | undefined> {
  return (await getDb()).get(STORE, m1Key(symbol, month));
}

export async function putM1Chunk(symbol: string, month: string, candles: Candle[]): Promise<void> {
  await (await getDb()).put(STORE, candles, m1Key(symbol, month));
}

export async function getMeta(symbol: string): Promise<SymbolMeta | undefined> {
  return (await getDb()).get(STORE, metaKey(symbol));
}

export async function putMeta(meta: SymbolMeta): Promise<void> {
  await (await getDb()).put(STORE, meta, metaKey(meta.symbol));
}

/** Seeded AND on the current schema (else it needs a reseed). */
export async function hasSymbol(symbol: string): Promise<boolean> {
  const meta = await getMeta(symbol);
  return meta !== undefined && meta.schemaVersion === SCHEMA_VERSION;
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
