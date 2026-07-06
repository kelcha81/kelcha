"""
Build ICT chart annotations for a window of candles.

The backtest response carries these so the replay app can render the same zones
the strategy reasoned over (FVGs, order blocks, structure breaks, sweeps,
liquidity pools). Detectors run over the *closed* candles only.
"""

from __future__ import annotations

from typing import Optional

from models import Candle
from ict.fvg import detect_fvgs
from ict.orderblock import detect_order_blocks
from ict.structure import structure_breaks
from ict.liquidity import liquidity_sweeps, equal_levels


def build_annotations(base: list[Candle], params: Optional[dict] = None,
                      cache: Optional[dict] = None) -> list[dict]:
    p = params or {}
    lookback = int(p.get("swing_lookback", 3))
    atr_period = int(p.get("atr_period", 14))
    fvg_min_atr = float(p.get("fvg_min_atr", 0.25))

    def run(name, fn, **kw):
        # Same key scheme as Strategy._detect, so a pass already computed for
        # the strategy (or a previous request on the same data) is reused.
        if cache is None:
            return fn(base, **kw)
        key = (name, None, tuple(sorted(kw.items())))
        events = cache.get(key)
        if events is None:
            events = fn(base, **kw)
            cache[key] = events
        return events

    events = []
    events += run("fvg", detect_fvgs, atr_period=atr_period, min_gap_atr=fvg_min_atr)
    events += run("order_block", detect_order_blocks, atr_period=atr_period)
    events += run("breaks", structure_breaks, lookback=lookback)
    events += run("sweep", liquidity_sweeps, lookback=lookback)
    events += run("equal_levels", equal_levels, kind="high", lookback=lookback, tolerance_atr=0.1)
    events += run("equal_levels", equal_levels, kind="low", lookback=lookback, tolerance_atr=0.1)

    return [e.to_dict() for e in events]
