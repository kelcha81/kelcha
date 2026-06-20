"""
Jesse-shaped strategy base class.

A strategy subclasses ``Strategy`` and overrides the lifecycle hooks. The engine
injects market data and a context each closed base-timeframe candle, in this
order: ``before`` -> entry decision (``should_long``/``go_long`` ...) or, when in
a trade, ``update_position`` -> ``after``. Position/order events fire the
``on_*`` hooks.

Decisions are made on the just-closed bar and orders act on the next bar (the
broker enforces this), so nothing here can see the future.
"""

from __future__ import annotations

from dataclasses import replace
from typing import Any, Callable, Optional

import sessions
from models import Candle, ICTEvent, Side
from ict.fvg import detect_fvgs
from ict.orderblock import detect_order_blocks
from ict.liquidity import liquidity_sweeps, equal_levels
from ict.structure import structure_breaks, swings
from ict.displacement import detect_displacement


class Strategy:
    #: override to declare tunable parameters + defaults
    params: dict[str, Any] = {}

    def __init__(self, params: Optional[dict] = None):
        self.hp: dict[str, Any] = {**self.params, **(params or {})}
        # injected by the engine each step
        self.candles: list[Candle] = []
        self.index: int = 0
        self.ctx: Any = None

    # --- market data ---------------------------------------------------------

    @property
    def candle(self) -> Candle:
        return self.candles[-1]

    @property
    def price(self) -> float:
        return self.candle.close

    @property
    def open(self) -> float: return self.candle.open
    @property
    def high(self) -> float: return self.candle.high
    @property
    def low(self) -> float: return self.candle.low
    @property
    def close(self) -> float: return self.candle.close
    @property
    def time(self) -> int: return self.candle.timestamp

    def get_candles(self, timeframe: str) -> list[Candle]:
        """Closed candles of a context timeframe at the current time (no lookahead)."""
        return self.ctx.htf(timeframe)

    # --- ICT helpers ---------------------------------------------------------
    # Each detector runs ONCE over the full series (cached on the context) and is
    # then sliced by ``confirm_ts <= now`` every bar — O(events) per call instead
    # of recomputing O(n) detectors each bar (which made backtests quadratic).
    # Forward-looking mitigation is clamped so the view stays no-lookahead.

    def fvgs(self, timeframe: Optional[str] = None, **kw):
        return self._detect("fvg", detect_fvgs, timeframe, kw)

    def order_blocks(self, timeframe: Optional[str] = None, **kw):
        return self._detect("order_block", detect_order_blocks, timeframe, kw)

    def sweeps(self, timeframe: Optional[str] = None, **kw):
        return self._detect("sweep", liquidity_sweeps, timeframe, kw)

    def equal_highs_lows(self, timeframe: Optional[str] = None, **kw):
        return self._detect("equal_levels", equal_levels, timeframe, kw)

    def breaks(self, timeframe: Optional[str] = None, **kw):
        return self._detect("breaks", structure_breaks, timeframe, kw)

    def swing_points(self, timeframe: Optional[str] = None, **kw):
        return self._detect("swings", swings, timeframe, kw)

    def displacement(self, timeframe: Optional[str] = None, **kw):
        return self._detect("displacement", detect_displacement, timeframe, kw)

    def in_killzone(self, name: str) -> bool:
        return sessions.in_killzone(self.time, name)

    def killzone(self) -> Optional[str]:
        return sessions.killzone_at(self.time)

    def _cands(self, timeframe: Optional[str]) -> list[Candle]:
        return self.candles if timeframe is None else self.get_candles(timeframe)

    def _detect(self, name: str, fn: Callable[..., list[ICTEvent]],
                timeframe: Optional[str], kwargs: dict) -> list[ICTEvent]:
        """Cached detector run over the full series, sliced to ``now``."""
        cache = self.ctx.detector_cache
        key = (name, timeframe, tuple(sorted(kwargs.items())))
        events = cache.get(key)
        if events is None:
            events = fn(self.ctx.full(timeframe), **kwargs)
            cache[key] = events
        cutoff = self.ctx.cutoff(timeframe, self.time)
        if cutoff is None:
            return []  # no candle of this timeframe has closed yet
        out: list[ICTEvent] = []
        for e in events:
            if e.confirm_ts is not None and e.confirm_ts > cutoff:
                continue  # not yet knowable
            if e.mitigated_at is not None and e.mitigated_at > cutoff:
                e = replace(e, mitigated_at=None, t_end=None)  # don't reveal future mitigation
            out.append(e)
        return out

    # --- position / orders ---------------------------------------------------

    @property
    def position(self):
        return self.ctx.broker.position

    @property
    def has_position(self) -> bool:
        return self.ctx.broker.position is not None

    @property
    def is_long(self) -> bool:
        return self.has_position and self.ctx.broker.position.side == "long"

    @property
    def is_short(self) -> bool:
        return self.has_position and self.ctx.broker.position.side == "short"

    @property
    def has_pending(self) -> bool:
        return bool(self.ctx.broker.pending) or self.ctx.broker._market is not None

    @property
    def balance(self) -> float:
        return self.ctx.broker.balance

    def buy_market(self, qty: float, sl: Optional[float] = None, tp: Optional[float] = None):
        self.ctx.broker.submit_market("long", qty, sl, tp)

    def sell_market(self, qty: float, sl: Optional[float] = None, tp: Optional[float] = None):
        self.ctx.broker.submit_market("short", qty, sl, tp)

    def buy_limit(self, qty: float, price: float, sl=None, tp=None):
        self.ctx.broker.submit_limit("long", qty, price, sl, tp)

    def sell_limit(self, qty: float, price: float, sl=None, tp=None):
        self.ctx.broker.submit_limit("short", qty, price, sl, tp)

    def cancel(self):
        self.ctx.broker.cancel_pending()

    def position_size(self, risk_pct: float, entry: float, sl: float, min_lots: float = 0.01) -> float:
        """Lots so that being stopped at ``sl`` loses ``risk_pct`` % of balance."""
        risk_amount = self.balance * (risk_pct / 100.0)
        per_lot = abs(entry - sl) * self.ctx.contract_size
        if per_lot <= 0:
            return 0.0
        lots = risk_amount / per_lot
        return max(min_lots, round(lots, 2))

    # --- lifecycle (override) ------------------------------------------------

    def before(self): ...
    def should_long(self) -> bool: return False
    def should_short(self) -> bool: return False
    def go_long(self): ...
    def go_short(self): ...
    def should_cancel_entry(self) -> bool: return False
    def update_position(self): ...
    def after(self): ...

    # --- event hooks (override) ----------------------------------------------

    def on_open_position(self, position): ...
    def on_close_position(self, trade): ...
