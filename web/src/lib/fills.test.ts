import { describe, it, expect } from 'vitest';
import { settleBars } from '@/lib/fills';
import type { Candle } from '@/store/replayStore';
import type { Position, PendingOrder } from '@/store/tradingStore';

// Bar helper: minute bars starting at t0; [open, high, low, close].
const t0 = Date.parse('2026-01-05T10:00:00Z');
const MIN = 60_000;
const bar = (i: number, o: number, h: number, l: number, c: number): Candle => ({
  timestamp: t0 + i * MIN,
  open: o,
  high: h,
  low: l,
  close: c,
  volume: 1
});

let n = 0;
const makeId = () => `p${n++}`;

const long = (over: Partial<Position> = {}): Position => ({
  id: makeId(),
  side: 'long',
  size: 1,
  contractSize: 100000,
  entryPrice: 1.1,
  entryTime: t0 - MIN,
  ...over
});

const limit = (over: Partial<PendingOrder> = {}): PendingOrder => ({
  id: makeId(),
  side: 'long',
  size: 1,
  contractSize: 100000,
  entryPrice: 1.09,
  createdTime: t0 - MIN,
  ...over
});

describe('settleBars', () => {
  it('fills a pending limit and stops it out on LATER bars in the same window (the multi-bar jump case)', () => {
    // Old engine only saw the last bar and missed both events.
    const o = limit({ entryPrice: 1.09, sl: 1.085 });
    const bars = [
      bar(0, 1.095, 1.096, 1.0895, 1.09), // touches 1.09 → fill
      bar(1, 1.09, 1.091, 1.088, 1.088),
      bar(2, 1.088, 1.088, 1.084, 1.084), // touches 1.085 → SL
      bar(3, 1.084, 1.086, 1.083, 1.085)
    ];
    const r = settleBars([], [o], bars, makeId);
    expect(r.fills).toHaveLength(1);
    expect(r.fills[0].position.entryTime).toBe(t0); // filled on bar 0
    expect(r.pending).toHaveLength(0);
    expect(r.closures).toHaveLength(1);
    expect(r.closures[0]).toMatchObject({ reason: 'sl', price: 1.085, time: t0 + 2 * MIN });
    expect(r.positions).toHaveLength(0);
  });

  it('closes SL/TP at intermediate bars, not the final bar price', () => {
    const p = long({ entryPrice: 1.1, tp: 1.105 });
    const bars = [
      bar(0, 1.1, 1.106, 1.099, 1.104), // touches TP
      bar(1, 1.104, 1.11, 1.103, 1.109) // later, higher — must NOT matter
    ];
    const r = settleBars([p], [], bars, makeId);
    expect(r.closures[0]).toMatchObject({ reason: 'tp', price: 1.105, time: t0 });
  });

  it('is pessimistic when SL and TP are both touched in one bar (SL wins)', () => {
    const p = long({ entryPrice: 1.1, sl: 1.095, tp: 1.105 });
    const r = settleBars([p], [], [bar(0, 1.1, 1.106, 1.094, 1.1)], makeId);
    expect(r.closures[0].reason).toBe('sl');
  });

  it('exits at the bar open when price gapped through the level', () => {
    const p = long({ entryPrice: 1.1, sl: 1.095 });
    const r = settleBars([p], [], [bar(0, 1.09, 1.091, 1.088, 1.089)], makeId); // opens below SL
    expect(r.closures[0].price).toBe(1.09);
  });

  it('does not fill a pending on bars before it was created', () => {
    const o = limit({ entryPrice: 1.09, createdTime: t0 + 2 * MIN });
    const bars = [
      bar(0, 1.091, 1.092, 1.089, 1.091), // touches, but pre-creation
      bar(1, 1.091, 1.092, 1.0905, 1.092)
    ];
    const r = settleBars([], [o], bars, makeId);
    expect(r.fills).toHaveLength(0);
    expect(r.pending).toHaveLength(1);
  });

  it('checks SL on the same bar a pending fills (pessimistic same-bar entry+stop)', () => {
    const o = limit({ entryPrice: 1.09, sl: 1.088 });
    const r = settleBars([], [o], [bar(0, 1.095, 1.095, 1.087, 1.088)], makeId);
    expect(r.fills).toHaveLength(1);
    expect(r.closures).toHaveLength(1);
    expect(r.closures[0]).toMatchObject({ reason: 'sl', price: 1.088 });
  });

  it('handles the short side symmetrically', () => {
    const p: Position = { ...long(), side: 'short', entryPrice: 1.1, sl: 1.105, tp: 1.09 };
    const rSl = settleBars([p], [], [bar(0, 1.1, 1.106, 1.099, 1.105)], makeId);
    expect(rSl.closures[0]).toMatchObject({ reason: 'sl', price: 1.105 });

    const p2: Position = { ...long(), side: 'short', entryPrice: 1.1, sl: 1.105, tp: 1.09 };
    const rTp = settleBars([p2], [], [bar(0, 1.095, 1.096, 1.089, 1.09)], makeId);
    expect(rTp.closures[0]).toMatchObject({ reason: 'tp', price: 1.09 });
  });

  it('leaves untouched state alone', () => {
    const p = long({ entryPrice: 1.1, sl: 1.05, tp: 1.15 });
    const o = limit({ entryPrice: 1.05 });
    const r = settleBars([p], [o], [bar(0, 1.1, 1.101, 1.099, 1.1)], makeId);
    expect(r.fills).toHaveLength(0);
    expect(r.closures).toHaveLength(0);
    expect(r.positions).toHaveLength(1);
    expect(r.pending).toHaveLength(1);
  });
});
