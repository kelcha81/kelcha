"""
Core data shapes for the ICT engine.

These mirror the shapes the front-end already speaks so the HTTP contract stays
unchanged and exported numbers line up across the two apps:

  - ``Candle``  matches ``forex-replay-app/src/store/replayStore.ts``  (Candle)
  - ``Trade``   matches ``forex-replay-app/src/store/tradingStore.ts`` (Trade)
  - ``Account`` matches ``forex-replay-app/src/store/tradingStore.ts`` (Account)

The P&L helpers (``trade_pnl``, ``trade_costs``) are a 1:1 port of the
front-end's ``tradePnl``/``costs`` so a backtest and a manual replay session
value an identical trade identically.

Pure stdlib — no third-party deps, so the core + its tests run on any Python 3.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any, Literal, Optional

Side = Literal["long", "short"]


# --- market data -------------------------------------------------------------

@dataclass(slots=True)
class Candle:
    """A single OHLCV bar. ``timestamp`` is the bar's OPEN time in Unix ms."""

    timestamp: int
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0

    @property
    def is_up(self) -> bool:
        return self.close >= self.open

    @property
    def body_top(self) -> float:
        return max(self.open, self.close)

    @property
    def body_bottom(self) -> float:
        return min(self.open, self.close)

    @property
    def range(self) -> float:
        return self.high - self.low

    @property
    def body(self) -> float:
        return abs(self.close - self.open)


def candle_from_dict(d: dict) -> Candle:
    return Candle(
        timestamp=int(d["timestamp"]),
        open=float(d["open"]),
        high=float(d["high"]),
        low=float(d["low"]),
        close=float(d["close"]),
        volume=float(d.get("volume", 0.0)),
    )


def candles_from_json(rows: list[dict]) -> list[Candle]:
    """Parse the packaged JSON array shape into Candle objects (sorted by time)."""
    out = [candle_from_dict(r) for r in rows]
    out.sort(key=lambda c: c.timestamp)
    return out


# --- detector events ---------------------------------------------------------

@dataclass(slots=True)
class ICTEvent:
    """
    A detected ICT structure (FVG, order block, liquidity pool, swing, ...).

    Detectors emit these; they triple as (1) strategy inputs, (2) chart overlays
    rendered by the replay app, and (3) feature rows for calibration.

    Times are Unix ms. ``confirm_ts`` is when the event first becomes knowable
    without lookahead (e.g. an FVG is only confirmed on its third candle, a
    fractal swing only after ``lookback`` bars). The engine must not act on an
    event before its ``confirm_ts``.
    """

    type: str                              # 'fvg' | 'order_block' | 'swing' | 'bos' | ...
    t_start: int                           # anchor time of the structure
    direction: Optional[str] = None        # 'bull' | 'bear' | None
    t_end: Optional[int] = None            # for ranged structures (boxes); None = open
    top: Optional[float] = None            # upper price bound (boxes / levels)
    bottom: Optional[float] = None         # lower price bound (boxes)
    price: Optional[float] = None          # single-level structures (swings, liquidity lines)
    strength: Optional[float] = None       # detector-specific score (e.g. ATR multiples)
    confirm_ts: Optional[int] = None       # first time the event is knowable (no lookahead)
    mitigated_at: Optional[int] = None     # when price first returned into the zone, else None
    meta: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        """camelCase dict for the JSON annotations contract the front-end reads."""
        return {
            "type": self.type,
            "direction": self.direction,
            "tStart": self.t_start,
            "tEnd": self.t_end,
            "top": self.top,
            "bottom": self.bottom,
            "price": self.price,
            "strength": self.strength,
            "confirmTs": self.confirm_ts,
            "mitigatedAt": self.mitigated_at,
            "meta": self.meta,
        }


# --- trading / accounting (port of tradingStore.ts) --------------------------

@dataclass(slots=True)
class Account:
    balance: float = 10000.0   # starting capital (account currency)
    spread: float = 0.0        # price units, charged once per round-trip
    commission: float = 0.0    # per lot, per side


@dataclass(slots=True)
class Trade:
    id: str
    side: Side
    size: float                # lots
    contractSize: float        # units per lot (forex 100k, index 1)
    entryPrice: float
    entryTime: int
    exitPrice: float
    exitTime: int
    pnl: float                 # account currency, net of costs
    reason: str = "manual"     # 'manual' | 'sl' | 'tp' (+ engine extras)
    risk: Optional[float] = None
    sl: Optional[float] = None  # stop/target the position carried (for chart brackets)
    tp: Optional[float] = None
    note: Optional[str] = None
    tags: Optional[str] = None

    def to_dict(self) -> dict:
        d = asdict(self)
        # drop Nones the front-end treats as absent (matches its optional fields)
        return {k: v for k, v in d.items() if v is not None}


def trade_pnl(side: Side, entry: float, exit: float, size: float, contract_size: float) -> float:
    """Gross P&L in account currency: price move x contract size x lots."""
    move = (exit - entry) if side == "long" else (entry - exit)
    return move * contract_size * size


def trade_costs(size: float, contract_size: float, acc: Account) -> float:
    """Round-trip costs: commission per lot per side (x2) + spread once."""
    return acc.commission * size * 2 + acc.spread * contract_size * size
