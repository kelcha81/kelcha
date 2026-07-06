import type { Candle } from '@/store/replayStore';
import type { Position, PendingOrder, Side } from '@/store/tradingStore';

/**
 * Classify a pending entry from where it sits relative to the live price
 * (TradingView-style): a buy below price / sell above price is a LIMIT; a buy
 * above / sell below is a STOP. Callers treat a null entry as a market order.
 */
export function classifyEntry(side: Side, entry: number, price: number): 'limit' | 'stop' {
  if (side === 'long') return entry <= price ? 'limit' : 'stop';
  return entry >= price ? 'limit' : 'stop';
}

// Pure paper-trading settlement engine. Walks EVERY m1 bar between the previous
// replay head and the new one (exclusive, inclusive], so limit fills and SL/TP
// exits are honored even when the head jumps hours or days at once (fast
// playback speeds, scrubber seeks, day jumps). Type-only imports — no runtime
// deps, fully unit-testable.
//
// Intra-bar assumptions (m1 resolution can't order ticks within a bar):
// - A pending LIMIT fills when its price is inside the bar's [low, high], at the
//   limit price, no earlier than the bar it was created in.
// - A pending STOP fills when price trades THROUGH the trigger in the order's
//   direction (buy-stop: high >= price; sell-stop: low <= price), at the trigger
//   price — or at the bar's OPEN when the bar gapped past it (slippage).
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

/** Fill price for a pending order against one bar, or null if it doesn't trigger. */
function triggerFill(o: PendingOrder, bar: Candle): number | null {
  const price = o.entryPrice;
  if (o.kind === 'stop') {
    if (o.side === 'long') {
      // buy-stop: triggers as price rises to/through it; gap above → fill at open
      if (bar.open >= price) return bar.open;
      return bar.high >= price ? price : null;
    }
    // sell-stop: triggers as price falls to/through it; gap below → fill at open
    if (bar.open <= price) return bar.open;
    return bar.low <= price ? price : null;
  }
  // limit (default): fills when the price is inside the bar's range
  return bar.low <= price && price <= bar.high ? price : null;
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
        const fill = bar.timestamp >= o.createdTime ? triggerFill(o, bar) : null;
        if (fill != null) {
          const position: Position = {
            id: makeId(),
            side: o.side,
            size: o.size,
            contractSize: o.contractSize,
            entryPrice: fill,
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
