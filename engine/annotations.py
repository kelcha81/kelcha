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


def build_annotations(base: list[Candle], params: Optional[dict] = None) -> list[dict]:
    p = params or {}
    lookback = int(p.get("swing_lookback", 3))
    atr_period = int(p.get("atr_period", 14))
    fvg_min_atr = float(p.get("fvg_min_atr", 0.25))

    events = []
    events += detect_fvgs(base, atr_period=atr_period, min_gap_atr=fvg_min_atr)
    events += detect_order_blocks(base, atr_period=atr_period)
    events += structure_breaks(base, lookback=lookback)
    events += liquidity_sweeps(base, lookback=lookback)
    events += equal_levels(base, kind="high", lookback=lookback, tolerance_atr=0.1)
    events += equal_levels(base, kind="low", lookback=lookback, tolerance_atr=0.1)

    return [e.to_dict() for e in events]
