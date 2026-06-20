"""Fixture helpers for the detector tests."""

from __future__ import annotations

from models import Candle

MIN = 60_000  # one minute in ms


def mk(ts: int, o: float, h: float, l: float, c: float, v: float = 0.0) -> Candle:
    return Candle(ts, o, h, l, c, v)


def series(rows: list[tuple[float, float, float, float]], start: int = 0, step: int = MIN) -> list[Candle]:
    """Build candles from (open, high, low, close) tuples with evenly-spaced ts."""
    return [mk(start + i * step, o, h, l, c) for i, (o, h, l, c) in enumerate(rows)]


def find(events, **kw):
    """Return events whose attributes match all given keyword filters."""
    out = []
    for e in events:
        if all(getattr(e, k) == v for k, v in kw.items()):
            out.append(e)
    return out
