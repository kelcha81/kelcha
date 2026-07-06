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

describe('tradingStore position management (C1)', () => {
  const TAB = 'tab-mgmt';
  beforeEach(() => useTradingStore.getState().reset());

  const openLong = (over: Partial<Parameters<ReturnType<typeof useTradingStore.getState>['open']>[1]> = {}) => {
    useTradingStore.getState().open(TAB, {
      side: 'long',
      size: 1,
      contractSize: 100000,
      entryPrice: 1.1,
      entryTime: t0,
      sl: 1.09,
      tp: 1.13,
      ...over
    });
    return useTradingStore.getState().positions[TAB][0];
  };

  it('modify adjusts SL/TP and clears a level with null', () => {
    const p = openLong();
    useTradingStore.getState().modify(TAB, p.id, { sl: 1.095, tp: 1.14 });
    let pos = useTradingStore.getState().positions[TAB][0];
    expect(pos.sl).toBe(1.095);
    expect(pos.tp).toBe(1.14);
    useTradingStore.getState().modify(TAB, p.id, { tp: null });
    pos = useTradingStore.getState().positions[TAB][0];
    expect(pos.tp).toBeUndefined();
    expect(pos.sl).toBe(1.095); // untouched
  });

  it('modifyPending moves entry/size/levels before fill', () => {
    useTradingStore.getState().placePending(TAB, {
      side: 'long',
      size: 1,
      contractSize: 100000,
      entryPrice: 1.09,
      createdTime: t0
    });
    const id = useTradingStore.getState().pending[TAB][0].id;
    useTradingStore.getState().modifyPending(TAB, id, { entryPrice: 1.085, size: 2, sl: 1.08 });
    const o = useTradingStore.getState().pending[TAB][0];
    expect(o.entryPrice).toBe(1.085);
    expect(o.size).toBe(2);
    expect(o.sl).toBe(1.08);
  });

  it('partial close books a trade for the closed lots and leaves the rest open', () => {
    const p = openLong({ size: 1 });
    useTradingStore.getState().close(TAB, p.id, 1.12, t0 + MIN, 'manual', 0.4);
    const st = useTradingStore.getState();
    expect(st.positions[TAB]).toHaveLength(1);
    expect(st.positions[TAB][0].size).toBeCloseTo(0.6);
    expect(st.positions[TAB][0].id).toBe(p.id); // remaining keeps the id
    expect(st.trades[TAB]).toHaveLength(1);
    const tr = st.trades[TAB][0];
    expect(tr.size).toBeCloseTo(0.4);
    expect(tr.id).not.toBe(p.id); // booked partial gets a fresh id
    expect(tr.pnl).toBeCloseTo(tradePnl('long', 1.1, 1.12, 0.4, 100000));
    expect(tr.sl).toBe(1.09); // Trade retains SL/TP for journaling
    expect(tr.tp).toBe(1.13);
  });

  it('close beyond remaining size closes fully (clamped)', () => {
    const p = openLong({ size: 0.5 });
    useTradingStore.getState().close(TAB, p.id, 1.12, t0 + MIN, 'manual', 5);
    const st = useTradingStore.getState();
    expect(st.positions[TAB]).toHaveLength(0);
    expect(st.trades[TAB]).toHaveLength(1);
    expect(st.trades[TAB][0].size).toBeCloseTo(0.5);
    expect(st.trades[TAB][0].id).toBe(p.id); // full close keeps id
  });

  it('reverse closes and opens the opposite side same size', () => {
    const p = openLong({ size: 1 });
    useTradingStore.getState().reverse(TAB, p.id, 1.12, t0 + MIN);
    const st = useTradingStore.getState();
    expect(st.positions[TAB]).toHaveLength(1);
    const opp = st.positions[TAB][0];
    expect(opp.side).toBe('short');
    expect(opp.size).toBe(1);
    expect(opp.entryPrice).toBe(1.12);
    expect(opp.sl).toBeUndefined(); // levels dropped on reverse
    expect(st.trades[TAB]).toHaveLength(1);
    expect(st.trades[TAB][0].exitPrice).toBe(1.12);
  });

  it('a full close via settle SL retains SL/TP on the booked trade', () => {
    openLong({ sl: 1.09, tp: 1.2 });
    useTradingStore.getState().settle(TAB, [bar(0, 1.1, 1.1, 1.085, 1.09)]); // hits SL 1.09
    const tr = useTradingStore.getState().trades[TAB][0];
    expect(tr.reason).toBe('sl');
    expect(tr.sl).toBe(1.09);
    expect(tr.tp).toBe(1.2);
  });
});
