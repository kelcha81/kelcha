import type { Candle, FullData, Timeframe } from '@/store/replayStore';

// Type-only imports above are erased at runtime, so this module has NO runtime
// dependency on React or Zustand — it's pure and unit-testable on its own.

/**
 * Approximate minutes per bar — used only for sizing the load window in
 * useVisibleData (over-fetch + slice handles the imprecision for weekly/monthly).
 * It is NOT used for period boundaries; those come from the series itself.
 */
export const TIMEFRAME_MINUTES: Record<Timeframe, number> = {
  m1: 1,
  m5: 5,
  m15: 15,
  h1: 60,
  h4: 240,
  d1: 1440,
  w1: 10080,
  mo1: 43200 // ~30 days
};

/** First index i where arr[i].timestamp > ts (upper bound). Binary search. */
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

/** First index i where arr[i].timestamp >= ts (lower bound). Binary search. */
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

/**
 * Aggregate the M1 candles in [periodStart, currentTimestamp] into a single
 * partial ("forming") candle:
 *   open   = first M1 open
 *   high   = highest M1 high
 *   low    = lowest M1 low
 *   close  = latest M1 close
 *   volume = sum of M1 volume
 *   timestamp = periodStart (so it lines up on the chart's x-axis)
 *
 * Returns null when no M1 data falls in the window (e.g. market closed).
 */
function buildFormingCandle(
  m1: Candle[],
  periodStart: number,
  currentTimestamp: number
): Candle | null {
  let open = 0;
  let high = -Infinity;
  let low = Infinity;
  let close = 0;
  let volume = 0;
  let count = 0;

  for (
    let i = lowerBound(m1, periodStart);
    i < m1.length && m1[i].timestamp <= currentTimestamp;
    i++
  ) {
    const c = m1[i];
    if (count === 0) open = c.open;
    if (c.high > high) high = c.high;
    if (c.low < low) low = c.low;
    close = c.close;
    volume += c.volume;
    count++;
  }

  if (count === 0) return null;
  return { timestamp: periodStart, open, high, low, close, volume };
}

/**
 * Build the candle array a chart should currently show for `timeframe`:
 *
 *   [ ...closed candles up to the replay head, formingCandle? ]
 *
 * Period boundaries are taken from the timeframe series itself (each bar's start),
 * NOT from a fixed minutes-per-bar — so variable-length bars (weekly, monthly)
 * work the same as fixed ones. The bar whose start is the greatest <= the head is
 * the one "in progress"; it's rebuilt from M1 so it reflects only price action up
 * to the head (not the full future bar). Every bar before it is closed.
 *
 * Pure function: same inputs -> same output, no React.
 */
export function buildVisibleData(
  fullData: FullData,
  currentTimestamp: number,
  timeframe: Timeframe
): Candle[] {
  const series = fullData[timeframe] ?? [];
  if (series.length === 0 || !currentTimestamp) return [];

  // First index whose start > head; the one before it is the current period.
  const idx = upperBound(series, currentTimestamp);
  if (idx === 0) return []; // head is before the first candle

  const currentStart = series[idx - 1].timestamp;
  const closed = series.slice(0, idx - 1); // every bar before the current period

  const forming = buildFormingCandle(fullData.m1 ?? [], currentStart, currentTimestamp);
  return forming ? [...closed, forming] : closed;
}
