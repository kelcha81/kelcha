"""
Fair Value Gaps (FVG) — three-candle imbalances.

Bullish FVG: candle[i-1].high < candle[i+1].low  (a gap left below price).
Bearish FVG: candle[i-1].low  > candle[i+1].high (a gap left above price).

The gap box spans the imbalance; it is confirmed on the third candle (i+1), the
event's ``confirm_ts``. We track *mitigation*: the first later candle that trades
back into the gap (price returning to rebalance it). Size filters are by absolute
price or as an ATR multiple so the same params travel across instruments.
"""

from __future__ import annotations

from models import Candle, ICTEvent
from ict.scan import FirstCross
from ict.util import atr


def detect_fvgs(candles: list[Candle], min_gap: float = 0.0,
                atr_period: int = 14, min_gap_atr: float = 0.0) -> list[ICTEvent]:
    n = len(candles)
    if n < 3:
        return []
    a = atr(candles, atr_period) if min_gap_atr > 0 else None
    lows = FirstCross([c.low for c in candles], find_leq=True)
    highs = FirstCross([c.high for c in candles], find_leq=False)
    out: list[ICTEvent] = []

    for i in range(1, n - 1):
        prev, mid, nxt = candles[i - 1], candles[i], candles[i + 1]
        floor = min_gap
        if a is not None:
            floor = max(floor, min_gap_atr * a[i])

        direction = top = bottom = None
        if prev.high < nxt.low and (nxt.low - prev.high) >= floor:
            direction, bottom, top = "bull", prev.high, nxt.low
        elif prev.low > nxt.high and (prev.low - nxt.high) >= floor:
            direction, bottom, top = "bear", nxt.high, prev.low
        if direction is None:
            continue

        confirm_ts = nxt.timestamp
        # first later candle trading back into the gap: bull gaps are filled
        # from above (a low dipping to the top), bear gaps from below.
        j = lows.first(i + 2, top) if direction == "bull" else highs.first(i + 2, bottom)
        mitigated_at = candles[j].timestamp if j is not None else None
        out.append(ICTEvent(
            type="fvg", direction=direction,
            t_start=mid.timestamp, t_end=mitigated_at,
            top=top, bottom=bottom,
            strength=(top - bottom),
            confirm_ts=confirm_ts, mitigated_at=mitigated_at,
            meta={"midTs": mid.timestamp},
        ))
    return out
