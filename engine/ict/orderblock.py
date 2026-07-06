"""
Order Blocks (OB).

A bullish OB is the last down-close candle immediately before an up displacement
leg; a bearish OB is the last up-close candle before a down displacement. The OB
box is that origin candle's high/low (full candle by default). It is confirmed
when the displacement that validates it closes (``confirm_ts``).

We optionally require the displacement to break recent structure (a stronger,
"breaker"-style OB) — left to the strategy via the ``require_break`` flag through
``structure_breaks``.
"""

from __future__ import annotations

from typing import Optional

from models import Candle, ICTEvent
from ict.scan import FirstCross
from ict.util import atr


def detect_order_blocks(candles: list[Candle], atr_period: int = 14,
                        displacement_atr: float = 1.5, body_only: bool = False) -> list[ICTEvent]:
    n = len(candles)
    if n < 2:
        return []
    a = atr(candles, atr_period)
    lows = FirstCross([c.low for c in candles], find_leq=True)
    highs = FirstCross([c.high for c in candles], find_leq=False)
    out: list[ICTEvent] = []
    # last opposite-color candle so far (dojis update neither).
    last_down: Optional[int] = None
    last_up: Optional[int] = None

    for i in range(1, n):
        p = candles[i - 1]
        if p.close < p.open:
            last_down = i - 1
        elif p.close > p.open:
            last_up = i - 1

        c = candles[i]
        if a[i] <= 0:
            continue
        move = c.close - c.open
        if abs(move) / a[i] < displacement_atr:
            continue
        up = move > 0
        # last opposite-color candle before this displacement candle.
        j = last_down if up else last_up
        if j is None:
            continue
        ob = candles[j]
        top = ob.body_top if body_only else ob.high
        bottom = ob.body_bottom if body_only else ob.low
        direction = "bull" if up else "bear"
        # first candle that returns to tap the block after the displacement.
        k = lows.first(i + 1, top) if up else highs.first(i + 1, bottom)
        mitigated_at = candles[k].timestamp if k is not None else None
        out.append(ICTEvent(
            type="order_block", direction=direction,
            t_start=ob.timestamp, t_end=mitigated_at, top=top, bottom=bottom,
            strength=abs(move) / a[i], confirm_ts=c.timestamp, mitigated_at=mitigated_at,
            meta={"originTs": ob.timestamp, "displacementTs": c.timestamp},
        ))
    return out
