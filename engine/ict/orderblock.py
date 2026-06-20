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
from ict.util import atr


def detect_order_blocks(candles: list[Candle], atr_period: int = 14,
                        displacement_atr: float = 1.5, body_only: bool = False) -> list[ICTEvent]:
    n = len(candles)
    if n < 2:
        return []
    a = atr(candles, atr_period)
    out: list[ICTEvent] = []

    for i in range(1, n):
        c = candles[i]
        if a[i] <= 0:
            continue
        move = c.close - c.open
        if abs(move) / a[i] < displacement_atr:
            continue
        up = move > 0
        # last opposite-color candle before this displacement candle.
        j = _last_opposite(candles, i, want_down=up)
        if j is None:
            continue
        ob = candles[j]
        top = ob.body_top if body_only else ob.high
        bottom = ob.body_bottom if body_only else ob.low
        direction = "bull" if up else "bear"
        mitigated_at = _mitigation(candles, i + 1, direction, top, bottom)
        out.append(ICTEvent(
            type="order_block", direction=direction,
            t_start=ob.timestamp, t_end=mitigated_at, top=top, bottom=bottom,
            strength=abs(move) / a[i], confirm_ts=c.timestamp, mitigated_at=mitigated_at,
            meta={"originTs": ob.timestamp, "displacementTs": c.timestamp},
        ))
    return out


def _last_opposite(candles: list[Candle], i: int, want_down: bool) -> Optional[int]:
    for j in range(i - 1, -1, -1):
        c = candles[j]
        if want_down and c.close < c.open:
            return j
        if not want_down and c.close > c.open:
            return j
    return None


def _mitigation(candles: list[Candle], start: int, direction: str,
                top: float, bottom: float) -> Optional[int]:
    """First candle that returns to tap the order block, else None."""
    for j in range(start, len(candles)):
        c = candles[j]
        if direction == "bull" and c.low <= top:
            return c.timestamp
        if direction == "bear" and c.high >= bottom:
            return c.timestamp
    return None
