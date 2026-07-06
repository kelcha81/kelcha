"""
Liquidity: resting pools (equal highs/lows), sweeps/stop-hunts, and prior-period
reference levels (PDH/PDL/PWH/PWL).

Conventions:
  - Buy-side liquidity rests *above* swing highs (buy stops); sell-side rests
    *below* swing lows. ICT "sweeps" run that liquidity then reverse, so a swept
    high implies an anticipated move *down* and vice-versa. The event
    ``direction`` carries that anticipated reaction.
"""

from __future__ import annotations

from typing import Optional

from models import Candle, ICTEvent
from ict.structure import find_swings
from ict.util import atr


def equal_levels(candles: list[Candle], kind: str = "high", lookback: int = 2,
                 tolerance: float = 0.0, tolerance_atr: float = 0.0) -> list[ICTEvent]:
    """
    Cluster confirmed swing highs (or lows) that sit within tolerance of each
    other into a single liquidity pool event.
    """
    swings = [s for s in find_swings(candles, lookback) if s.kind == kind]
    if not swings:
        return []
    a = atr(candles, 14) if tolerance_atr > 0 else None
    # map swing index -> atr at that bar for tolerance
    out: list[ICTEvent] = []
    group: list = [swings[0]]

    def tol_for(s) -> float:
        t = tolerance
        if a is not None:
            t = max(t, tolerance_atr * a[s.index])
        return t

    def flush(g: list) -> None:
        if len(g) < 2:
            return
        prices = [s.price for s in g]
        level = sum(prices) / len(prices)
        side = "buy" if kind == "high" else "sell"
        out.append(ICTEvent(
            type="liquidity", direction=("bear" if kind == "high" else "bull"),
            t_start=g[0].timestamp, t_end=g[-1].timestamp, price=level,
            confirm_ts=g[-1].confirm_ts,
            meta={"kind": f"equal_{kind}s", "side": side, "count": len(g)},
        ))

    for s in swings[1:]:
        if abs(s.price - group[-1].price) <= tol_for(s):
            group.append(s)
        else:
            flush(group)
            group = [s]
    flush(group)
    return out


def liquidity_sweeps(candles: list[Candle], lookback: int = 2) -> list[ICTEvent]:
    """
    Wick beyond a prior confirmed swing that closes back inside = a sweep.

    ``direction`` is the anticipated reaction: 'bear' after a buy-side (high)
    sweep, 'bull' after a sell-side (low) sweep.
    """
    sw = find_swings(candles, lookback)
    si = 0
    highs: list = []
    lows: list = []
    out: list[ICTEvent] = []

    # Within one kind, swings confirm in timestamp order (fixed lookback) and the
    # prune below preserves order, so each list stays timestamp-sorted and the
    # most recent swing is simply the last element.
    for c in candles:
        while si < len(sw) and sw[si].confirm_ts <= c.timestamp:
            (highs if sw[si].kind == "high" else lows).append(sw[si])
            si += 1

        ref_high = highs[-1] if highs else None
        if ref_high is not None and c.high > ref_high.price and c.close < ref_high.price:
            out.append(ICTEvent(
                type="liquidity_sweep", direction="bear", t_start=c.timestamp,
                price=ref_high.price, confirm_ts=c.timestamp,
                meta={"side": "buy", "sweptTs": ref_high.timestamp},
            ))
            highs = [s for s in highs if s.price > c.high]

        ref_low = lows[-1] if lows else None
        if ref_low is not None and c.low < ref_low.price and c.close > ref_low.price:
            out.append(ICTEvent(
                type="liquidity_sweep", direction="bull", t_start=c.timestamp,
                price=ref_low.price, confirm_ts=c.timestamp,
                meta={"side": "sell", "sweptTs": ref_low.timestamp},
            ))
            lows = [s for s in lows if s.price < c.low]

    return out


def prior_levels(htf_candles: list[Candle], count: int = 1,
                 label: str = "PD") -> list[ICTEvent]:
    """
    Prior-period high/low reference levels from a higher timeframe.

    For each completed HTF candle, the candle ``count`` bars back supplies the
    active high/low (e.g. previous day = PDH/PDL on a daily series). The level
    becomes active at the new candle's open, recorded as ``confirm_ts``.
    """
    out: list[ICTEvent] = []
    for i in range(count, len(htf_candles)):
        src = htf_candles[i - count]
        active_from = htf_candles[i].timestamp
        out.append(ICTEvent(
            type="liquidity", direction="bear", t_start=active_from, price=src.high,
            confirm_ts=active_from, meta={"kind": f"{label}H", "side": "buy", "sourceTs": src.timestamp},
        ))
        out.append(ICTEvent(
            type="liquidity", direction="bull", t_start=active_from, price=src.low,
            confirm_ts=active_from, meta={"kind": f"{label}L", "side": "sell", "sourceTs": src.timestamp},
        ))
    return out
