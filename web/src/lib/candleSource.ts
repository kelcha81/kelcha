import type { Candle, Timeframe } from '@/store/replayStore';
import { getAggregate, getM1Chunk, getMeta } from '@/lib/idb';

// Windowed candle access over IndexedDB. The replay engine reads ranges through
// getRange() rather than holding whole series in memory. Swapping IndexedDB for
// a Node/Next API route or a Python backend later only touches this module.

export interface Bounds {
  min: number;
  max: number;
}

// Whole aggregate arrays (m5/m15/h1) are cached in memory per active symbol.
const aggCache = new Map<string, Candle[]>();

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

/** YYYY-MM keys for every month overlapping [from, to] (UTC). */
function monthsInRange(from: number, to: number): string[] {
  const months: string[] = [];
  const d = new Date(from);
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  while (d.getTime() <= to) {
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return months;
}

/** Candles for [from, to] inclusive. M1 reads only the overlapping month chunks. */
export async function getRange(
  symbol: string,
  tf: Timeframe,
  from: number,
  to: number
): Promise<Candle[]> {
  if (to < from) return [];

  if (tf === 'm1') {
    const months = monthsInRange(from, to);
    const chunks = await Promise.all(months.map((m) => getM1Chunk(symbol, m)));
    const merged: Candle[] = [];
    for (const chunk of chunks) {
      if (chunk) for (const c of chunk) merged.push(c);
    }
    return sliceRange(merged, from, to);
  }

  const key = `${symbol}:${tf}`;
  let whole = aggCache.get(key);
  if (!whole) {
    whole = (await getAggregate(symbol, tf)) ?? [];
    aggCache.set(key, whole);
  }
  return sliceRange(whole, from, to);
}

export async function getBounds(symbol: string): Promise<Bounds | null> {
  const meta = await getMeta(symbol);
  return meta ? { min: meta.minTs, max: meta.maxTs } : null;
}

/** Drop the in-memory aggregate cache (all symbols, or one). */
export function clearAggCache(symbol?: string): void {
  if (!symbol) {
    aggCache.clear();
    return;
  }
  for (const key of [...aggCache.keys()]) {
    if (key.startsWith(`${symbol}:`)) aggCache.delete(key);
  }
}
