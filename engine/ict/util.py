"""Shared helpers for the detectors: true range / ATR and price scaling."""

from __future__ import annotations

from typing import Optional

from models import Candle


def true_ranges(candles: list[Candle]) -> list[float]:
    """Per-bar true range. First bar uses its own high-low."""
    out: list[float] = []
    prev_close: Optional[float] = None
    for c in candles:
        if prev_close is None:
            out.append(c.high - c.low)
        else:
            out.append(max(c.high - c.low, abs(c.high - prev_close), abs(c.low - prev_close)))
        prev_close = c.close
    return out


def atr(candles: list[Candle], period: int = 14) -> list[float]:
    """
    Wilder's ATR as a per-bar list (same length as ``candles``).

    Index ``i`` holds the ATR using data through bar ``i`` (no lookahead).
    Indices before the first full window are seeded with the running mean so
    early bars still get a usable, if rough, volatility estimate.
    """
    tr = true_ranges(candles)
    out: list[float] = [0.0] * len(candles)
    if not candles:
        return out
    run = 0.0
    a: Optional[float] = None
    for i, t in enumerate(tr):
        if i < period:
            run += t
            a = run / (i + 1)
        else:
            a = ((a * (period - 1)) + t) / period  # type: ignore[operator]
        out[i] = a  # type: ignore[assignment]
    return out


def pip_size(price_precision: int) -> float:
    """
    Price value of one 'pip' for thresholds.

    Mirrors the front-end (pips = move * 10^(precision-1)): 5/3-dp forex ->
    pip = 1e-(precision-1) (the 4th/2nd decimal); 2-dp metals (gold) -> 0.1;
    indices (precision 1) -> 1 point is the unit.
    """
    if price_precision >= 2:
        return 10.0 ** (-(price_precision - 1))
    return 1.0
