import type { Candle } from '@/store/replayStore';
import type { Position, PendingOrder } from '@/store/tradingStore';

// Pure paper-trading settlement engine. Walks EVERY m1 bar between the previous
// replay head and the new one (exclusive, inclusive], so limit fills and SL/TP
// exits are honored even when the head jumps hours or days at once (fast
// playback speeds, scrubber seeks, day jumps). Type-only imports — no runtime
// deps, fully unit-testable.
//
// Intra-bar assumptions (m1 resolution can't order ticks within a bar):
// - A pending limit fills when its price is inside the bar's [low, high],
//   at the limit price, no earlier than the bar it was created in.
// - SL/TP exit at the level, or at the bar's OPEN when the bar gapped through
//   the level (you can't do better than the gap).
// - If BOTH SL and TP are touched by the same bar, the SL wins (pessimistic).
// - A position filled from a pending this bar is SL/TP-checked on this same
//   bar too (pessimistic: the adverse move may have happened after entry).

export interface Closure {
  position: Position;
  price: number;
  time: number;
  reason: 'sl' | 'tp';
}

export interface Fill {
  order: PendingOrder;
  position: Position;
}

export interface Settlement {
  /** Open positions after all bars are applied (filled ones included). */
  positions: Position[];
  /** Pending orders still waiting. */
  pending: PendingOrder[];
  fills: Fill[];
  closures: Closure[];
}

/** Settle `bars` (ascending m1) against open positions + pending orders. */
export function settleBars(
  positions: Position[],
  pending: PendingOrder[],
  bars: Candle[],
  makeId: () => string
): Settlement {
  const open = [...positions];
  let waiting = [...pending];
  const fills: Fill[] = [];
  const closures: Closure[] = [];

  for (const bar of bars) {
    // 1) Limit fills — order must already exist when this bar trades.
    if (waiting.length) {
      const still: PendingOrder[] = [];
      for (const o of waiting) {
        if (bar.timestamp >= o.createdTime && bar.low <= o.entryPrice && o.entryPrice <= bar.high) {
          const position: Position = {
            id: makeId(),
            side: o.side,
            size: o.size,
            contractSize: o.contractSize,
            entryPrice: o.entryPrice,
            entryTime: bar.timestamp,
            sl: o.sl,
            tp: o.tp
          };
          open.push(position);
          fills.push({ order: o, position });
        } else {
          still.push(o);
        }
      }
      waiting = still;
    }

    // 2) SL/TP exits (including positions filled this bar — see header note).
    for (let i = open.length - 1; i >= 0; i--) {
      const p = open[i];
      if (bar.timestamp < p.entryTime) continue;
      const long = p.side === 'long';
      const slHit = p.sl != null && (long ? bar.low <= p.sl : bar.high >= p.sl);
      const tpHit = p.tp != null && (long ? bar.high >= p.tp : bar.low <= p.tp);
      if (slHit) {
        const sl = p.sl as number;
        const gapped = long ? bar.open <= sl : bar.open >= sl;
        closures.push({ position: p, price: gapped ? bar.open : sl, time: bar.timestamp, reason: 'sl' });
        open.splice(i, 1);
      } else if (tpHit) {
        const tp = p.tp as number;
        const gapped = long ? bar.open >= tp : bar.open <= tp;
        closures.push({ position: p, price: gapped ? bar.open : tp, time: bar.timestamp, reason: 'tp' });
        open.splice(i, 1);
      }
    }
  }

  return { positions: open, pending: waiting, fills, closures };
}
