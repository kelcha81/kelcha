"""
Market structure: swing points, break of structure (BOS) and market-structure
shift / change of character (MSS / CHoCH).

A swing high/low is a simple fractal: a high (low) that exceeds the ``lookback``
bars on either side. It is only *confirmed* ``lookback`` bars later, which is the
event's ``confirm_ts`` — the engine must wait that long before trusting it.

BOS = a close beyond the most recent unbroken swing in the direction of the
prevailing trend (continuation). MSS/CHoCH = the first such break *against* the
prevailing trend (reversal of character).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from models import Candle, ICTEvent

Kind = Literal["high", "low"]


@dataclass(slots=True)
class Swing:
    index: int
    timestamp: int
    price: float
    kind: Kind
    confirm_ts: int


def find_swings(candles: list[Candle], lookback: int = 2) -> list[Swing]:
    """Fractal swing highs/lows, confirmed ``lookback`` bars after they occur."""
    out: list[Swing] = []
    n = len(candles)
    for i in range(lookback, n - lookback):
        c = candles[i]
        left = candles[i - lookback:i]
        right = candles[i + 1:i + 1 + lookback]
        if all(c.high > x.high for x in left) and all(c.high > x.high for x in right):
            out.append(Swing(i, c.timestamp, c.high, "high", candles[i + lookback].timestamp))
        if all(c.low < x.low for x in left) and all(c.low < x.low for x in right):
            out.append(Swing(i, c.timestamp, c.low, "low", candles[i + lookback].timestamp))
    out.sort(key=lambda s: (s.confirm_ts, s.timestamp))
    return out


def swings(candles: list[Candle], lookback: int = 2) -> list[ICTEvent]:
    return [
        ICTEvent(type="swing", direction=s.kind, t_start=s.timestamp, price=s.price,
                 confirm_ts=s.confirm_ts, meta={"index": s.index})
        for s in find_swings(candles, lookback)
    ]


def structure_breaks(candles: list[Candle], lookback: int = 2) -> list[ICTEvent]:
    """
    BOS + MSS/CHoCH events, in time order.

    Walks the candles, keeping the set of confirmed-but-unbroken swings. When a
    close clears the most recent swing high/low we emit a break, tagged ``bos``
    (with-trend) or ``mss`` (counter-trend), and flip the running trend.
    """
    sw = find_swings(candles, lookback)
    si = 0
    active_highs: list[Swing] = []
    active_lows: list[Swing] = []
    trend = 0  # 1 up, -1 down, 0 neutral
    events: list[ICTEvent] = []

    # Within one kind, swings confirm in timestamp order (fixed lookback) and the
    # prunes below preserve order, so each active list stays timestamp-sorted and
    # the most recent swing is simply the last element.
    for c in candles:
        # admit swings that are now confirmed (no lookahead).
        while si < len(sw) and sw[si].confirm_ts <= c.timestamp:
            (active_highs if sw[si].kind == "high" else active_lows).append(sw[si])
            si += 1

        ref_high = active_highs[-1] if active_highs else None
        if ref_high is not None and c.close > ref_high.price:
            kind = "mss" if trend == -1 else "bos"
            events.append(ICTEvent(
                type=kind, direction="bull", t_start=c.timestamp, price=ref_high.price,
                confirm_ts=c.timestamp,
                meta={"brokenSwingTs": ref_high.timestamp, "trendBefore": trend},
            ))
            trend = 1
            active_highs = [s for s in active_highs if s.price > c.close]
            continue

        ref_low = active_lows[-1] if active_lows else None
        if ref_low is not None and c.close < ref_low.price:
            kind = "mss" if trend == 1 else "bos"
            events.append(ICTEvent(
                type=kind, direction="bear", t_start=c.timestamp, price=ref_low.price,
                confirm_ts=c.timestamp,
                meta={"brokenSwingTs": ref_low.timestamp, "trendBefore": trend},
            ))
            trend = -1
            active_lows = [s for s in active_lows if s.price < c.close]

    return events
