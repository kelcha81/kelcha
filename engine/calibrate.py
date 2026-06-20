"""
Calibrate ICT detector thresholds against human-tagged trades.

The premise (the project's whole bridge from discretionary to coded): when you
trade ICT setups by hand in the replay app and export them, those entries are
ground truth. Good detector thresholds should "see" a setup where you actually
entered — and not fire everywhere. So we:

  1. align each human entry to the detector events around it (a same-direction
     FVG/OB zone the entry sits inside, or a recent BOS/MSS/sweep), and
  2. sweep detector thresholds to maximize coverage of your entries while
     penalizing event density (looseness), so the tightest thresholds that still
     capture your trades win.

This is detector↔human alignment only; profitability tuning lives in optimize.py.

    python calibrate.py eurusd --timeframe h1

Pure stdlib (grid search). No pip required.
"""

from __future__ import annotations

import argparse
import itertools
import json
import os
import statistics
from dataclasses import dataclass
from typing import Optional

from models import Candle, ICTEvent, Trade
from ict.fvg import detect_fvgs
from ict.orderblock import detect_order_blocks
from ict.structure import structure_breaks
from ict.liquidity import liquidity_sweeps


@dataclass(slots=True)
class Match:
    trade: Trade
    captured: bool
    by: Optional[str]          # 'fvg' | 'order_block' | 'bos' | 'mss' | 'liquidity_sweep'
    event_ts: Optional[int]


def _typical_step(candles: list[Candle]) -> int:
    if len(candles) < 2:
        return 60_000
    diffs = [candles[i + 1].timestamp - candles[i].timestamp for i in range(min(200, len(candles) - 1))]
    return int(statistics.median(diffs)) or 60_000


def detect_all(candles: list[Candle], params: dict) -> dict[str, list[ICTEvent]]:
    lb = int(params.get("swing_lookback", 3))
    ap = int(params.get("atr_period", 14))
    zones = (
        detect_fvgs(candles, atr_period=ap, min_gap_atr=float(params.get("fvg_min_atr", 0.25)))
        + detect_order_blocks(candles, atr_period=ap, displacement_atr=float(params.get("displacement_atr", 1.5)))
    )
    return {
        "zones": zones,
        "breaks": structure_breaks(candles, lookback=lb),
        "sweeps": liquidity_sweeps(candles, lookback=lb),
    }


def align(candles: list[Candle], trades: list[Trade], params: dict,
          max_lag_bars: int = 10, events: Optional[dict] = None) -> list[Match]:
    ev = events if events is not None else detect_all(candles, params)
    max_lag = max_lag_bars * _typical_step(candles)
    out: list[Match] = []

    for t in trades:
        want = "bull" if t.side == "long" else "bear"
        et, ep = t.entryTime, t.entryPrice
        hit: Optional[Match] = None

        # 1) entry sitting inside a same-direction, already-confirmed zone
        for z in ev["zones"]:
            if z.direction != want or z.confirm_ts is None or z.confirm_ts > et:
                continue
            if z.top is None or z.bottom is None:
                continue
            if z.bottom <= ep <= z.top and (et - z.confirm_ts) <= max_lag:
                hit = Match(t, True, z.type, z.confirm_ts)
                break

        # 2) a recent same-direction structure break or liquidity sweep
        if hit is None:
            for e in ev["breaks"] + ev["sweeps"]:
                if e.direction != want or e.confirm_ts is None or e.confirm_ts > et:
                    continue
                if (et - e.confirm_ts) <= max_lag:
                    hit = Match(t, True, e.type, e.confirm_ts)
                    break

        out.append(hit or Match(t, False, None, None))
    return out


def evaluate(candles: list[Candle], trades: list[Trade], params: dict,
             max_lag_bars: int = 10, penalty: float = 0.5) -> dict:
    ev = detect_all(candles, params)
    matches = align(candles, trades, params, max_lag_bars, events=ev)
    n = len(trades)
    captured = sum(1 for m in matches if m.captured)
    coverage = captured / n if n else 0.0
    total_events = sum(len(v) for v in ev.values())
    density = total_events / len(candles) if candles else 0.0
    return {
        "coverage": coverage,
        "captured": captured,
        "n": n,
        "events": total_events,
        "density": density,
        "score": coverage - penalty * density,
    }


def default_grid() -> dict[str, list]:
    return {
        "swing_lookback": [2, 3, 5],
        "atr_period": [14],
        "fvg_min_atr": [0.0, 0.25, 0.5, 1.0],
        "displacement_atr": [1.0, 1.5, 2.0],
    }


def sweep(candles: list[Candle], trades: list[Trade], grid: Optional[dict] = None,
          max_lag_bars: int = 10, penalty: float = 0.5) -> tuple[dict, list[dict]]:
    grid = grid or default_grid()
    keys = list(grid)
    rows: list[dict] = []
    for combo in itertools.product(*(grid[k] for k in keys)):
        params = dict(zip(keys, combo))
        m = evaluate(candles, trades, params, max_lag_bars, penalty)
        rows.append({"params": params, **m})
    rows.sort(key=lambda r: r["score"], reverse=True)
    best = rows[0]["params"] if rows else {}
    return best, rows


# --- CLI ---------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description="Calibrate ICT detector thresholds vs human trades")
    ap.add_argument("symbol")
    ap.add_argument("--timeframe", default="h1")
    ap.add_argument("--max-lag-bars", type=int, default=10)
    ap.add_argument("--penalty", type=float, default=0.5)
    ap.add_argument("--top", type=int, default=8)
    args = ap.parse_args()

    from candles import load_series
    from labels import load_labels, has_labels, labels_dir

    if not has_labels(args.symbol):
        print(f"No labels at {os.path.join(labels_dir(), args.symbol + '.json')}.")
        print("Export tagged trades from the replay app (Performance report -> Export JSON) and drop them there.")
        return 1

    candles = load_series(args.symbol, args.timeframe)
    trades = load_labels(args.symbol)
    print(f"{args.symbol} {args.timeframe}: {len(candles)} candles, {len(trades)} human trades\n")

    best, rows = sweep(candles, trades, max_lag_bars=args.max_lag_bars, penalty=args.penalty)
    print(f"{'score':>7} {'cover':>6} {'dens':>6} {'events':>7}  params")
    for r in rows[: args.top]:
        print(f"{r['score']:7.3f} {r['coverage']:6.2f} {r['density']:6.3f} {r['events']:7d}  {r['params']}")

    out_path = os.path.join(labels_dir(), f"{args.symbol}.calibrated.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"symbol": args.symbol, "timeframe": args.timeframe, "params": best}, f, indent=2)
    print(f"\nbest -> {best}\nwritten -> {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
