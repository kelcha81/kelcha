import { describe, it, expect, beforeEach } from 'vitest';
import { useTradingStore, tradePnl, DEFAULT_ACCOUNT } from '@/store/tradingStore';
import type { Candle } from '@/store/replayStore';

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

describe('tradePnl', () => {
  it('computes account-currency P&L both sides', () => {
    expect(tradePnl('long', 1.1, 1.11, 1, 100000)).toBeCloseTo(1000);
    expect(tradePnl('short', 1.1, 1.11, 1, 100000)).toBeCloseTo(-1000);
    expect(tradePnl('short', 1.1, 1.09, 2, 100000)).toBeCloseTo(2000);
  });
});

describe('tradingStore.settle', () => {
  const TAB = 'tab-test';
  beforeEach(() => useTradingStore.getState().reset());

  it('fills a limit then stops it out across a multi-bar window, applying account costs', () => {
    const s = useTradingStore.getState();
    s.setAccount(TAB, { ...DEFAULT_ACCOUNT, commission: 5, spread: 0 });
    s.placePending(TAB, {
      side: 'long',
      size: 1,
      contractSize: 100000,
      entryPrice: 1.09,
      sl: 1.085,
      createdTime: t0 - MIN
    });

    useTradingStore.getState().settle(TAB, [
      bar(0, 1.095, 1.096, 1.0895, 1.09), // fill @1.09
      bar(1, 1.09, 1.091, 1.084, 1.085) // SL @1.085
    ]);

    const st = useTradingStore.getState();
    expect(st.pending[TAB]).toHaveLength(0);
    expect(st.positions[TAB]).toHaveLength(0);
    expect(st.trades[TAB]).toHaveLength(1);
    const t = st.trades[TAB][0];
    expect(t.reason).toBe('sl');
    expect(t.entryPrice).toBe(1.09);
    expect(t.exitPrice).toBe(1.085);
    // gross -500 minus commission 5/lot/side * 2
    expect(t.pnl).toBeCloseTo(-500 - 10);
    expect(t.risk).toBeCloseTo(500);
  });

  it('leaves open positions that never touch SL/TP', () => {
    const s = useTradingStore.getState();
    s.open(TAB, {
      side: 'long',
      size: 1,
      contractSize: 100000,
      entryPrice: 1.1,
      entryTime: t0 - MIN,
      sl: 1.0,
      tp: 1.2
    });
    useTradingStore.getState().settle(TAB, [bar(0, 1.1, 1.101, 1.099, 1.1)]);
    const st = useTradingStore.getState();
    expect(st.positions[TAB]).toHaveLength(1);
    expect(st.trades[TAB] ?? []).toHaveLength(0);
  });
});
