"""
Displacement: an energetic, one-directional candle (or the leg it belongs to).

A bar is a displacement when its move (body by default, optionally full range)
is at least ``threshold_atr`` times the current ATR. Displacement is the engine's
proxy for "intent" — it gates order blocks (the origin of a displacement leg) and
can confirm a structure break.
"""

from __future__ import annotations

from models import Candle, ICTEvent
from ict.util import atr


def detect_displacement(candles: list[Candle], atr_period: int = 14,
                        threshold_atr: float = 1.5, use_body: bool = True) -> list[ICTEvent]:
    a = atr(candles, atr_period)
    out: list[ICTEvent] = []
    for i, c in enumerate(candles):
        if a[i] <= 0:
            continue
        move = (c.close - c.open) if use_body else (c.high - c.low if c.is_up else -(c.high - c.low))
        mult = abs(move) / a[i]
        if mult >= threshold_atr:
            out.append(ICTEvent(
                type="displacement", direction="bull" if move > 0 else "bear",
                t_start=c.timestamp, top=c.high, bottom=c.low,
                strength=mult, confirm_ts=c.timestamp,
                meta={"index": i, "atr": a[i]},
            ))
    return out
