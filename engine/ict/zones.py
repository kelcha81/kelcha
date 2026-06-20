"""
Premium/discount and the Optimal Trade Entry (OTE) zone.

Over a dealing range (a swing low -> swing high leg, or vice-versa) ICT splits
price into a *premium* half (sell zone) and a *discount* half (buy zone) around
the 50% equilibrium. The OTE is the 62%-79% retracement of the impulse leg — the
preferred entry band in the direction of the leg.
"""

from __future__ import annotations

from typing import Literal

OTE_LOW = 0.62
OTE_HIGH = 0.79
STANDARD_FIBS = (0.0, 0.236, 0.382, 0.5, 0.618, 0.705, 0.79, 1.0)


def fib_levels(leg_start: float, leg_end: float,
               levels: tuple[float, ...] = STANDARD_FIBS) -> dict[float, float]:
    """
    Map fib ratio -> price for a leg from ``leg_start`` to ``leg_end``.

    Ratio 0.0 = leg_end (the extreme), 1.0 = leg_start (the origin), so the
    retracement deepens toward the origin as the ratio grows — matching how a
    fib is drawn from a swing.
    """
    span = leg_end - leg_start
    return {lvl: leg_end - lvl * span for lvl in levels}


def equilibrium(hi: float, lo: float) -> float:
    return (hi + lo) / 2.0


def premium_discount(price: float, hi: float, lo: float) -> Literal["premium", "discount", "equilibrium"]:
    eq = equilibrium(hi, lo)
    if price > eq:
        return "premium"
    if price < eq:
        return "discount"
    return "equilibrium"


def ote_zone(leg_start: float, leg_end: float) -> tuple[float, float]:
    """
    (top, bottom) of the 62%-79% retracement band of the leg.

    Works for both directions; the returned tuple is always (higher, lower).
    """
    span = leg_end - leg_start
    a = leg_end - OTE_LOW * span
    b = leg_end - OTE_HIGH * span
    return (max(a, b), min(a, b))


def in_ote(price: float, leg_start: float, leg_end: float) -> bool:
    top, bottom = ote_zone(leg_start, leg_end)
    return bottom <= price <= top
