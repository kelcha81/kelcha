import { describe, it, expect } from 'vitest';
import { buildVisibleData } from '@/lib/visibleData';
import type { Candle, FullData } from '@/store/replayStore';

const t0 = Date.parse('2026-01-05T10:00:00Z');
const MIN = 60_000;
const c = (ts: number, o: number, h: number, l: number, cl: number, v = 1): Candle => ({
  timestamp: ts,
  open: o,
  high: h,
  low: l,
  close: cl,
  volume: v
});

// 10 one-minute bars 10:00..10:09 and two m5 bars (10:00, 10:05).
const m1: Candle[] = Array.from({ length: 10 }, (_, i) =>
  c(t0 + i * MIN, 1 + i, 1 + i + 0.5, 1 + i - 0.5, 1 + i + 0.25, 2)
);
const m5: Candle[] = [c(t0, 1, 5.5, 0.5, 5.25, 10), c(t0 + 5 * MIN, 6, 10.5, 5.5, 10.25, 10)];
const data: FullData = { m1, m5 } as FullData;

describe('buildVisibleData', () => {
  it('rebuilds the forming bar from only the m1 bars up to the head', () => {
    // Head at 10:07 → first m5 bar closed, second m5 bar forming from 10:05-10:07.
    const head = t0 + 7 * MIN;
    const out = buildVisibleData(data, head, 'm5');
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual(m5[0]); // closed bar passes through untouched
    const forming = out[1];
    expect(forming.timestamp).toBe(t0 + 5 * MIN); // aligned to period start
    expect(forming.open).toBe(m1[5].open);
    expect(forming.close).toBe(m1[7].close); // latest m1 close, not the full bar's
    expect(forming.high).toBe(Math.max(m1[5].high, m1[6].high, m1[7].high));
    expect(forming.low).toBe(Math.min(m1[5].low, m1[6].low, m1[7].low));
    expect(forming.volume).toBe(m1[5].volume + m1[6].volume + m1[7].volume);
  });

  it('returns empty when the head is before all data', () => {
    expect(buildVisibleData(data, t0 - MIN, 'm5')).toEqual([]);
  });

  it('drops the forming bar when no m1 falls in the current period (market closed)', () => {
    const sparse: FullData = { m1: [m1[0]], m5 } as FullData;
    const out = buildVisibleData(sparse, t0 + 6 * MIN, 'm5');
    expect(out).toHaveLength(1); // only the closed first bar
  });

  it('m1 head mid-stream shows bars up to the head inclusive', () => {
    const out = buildVisibleData(data, t0 + 3 * MIN, 'm1');
    expect(out).toHaveLength(4);
    expect(out[3]).toEqual(m1[3]);
  });
});
