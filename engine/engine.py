"""
Candle-driven backtest engine.

Iterates the base timeframe one closed bar at a time. Each step the broker first
settles the previous bar's orders and any SL/TP (intra-bar via M1 when available),
then the strategy decides on the just-closed bar. Higher timeframes are exposed
through the context as *closed* candles only, so a strategy never sees a forming
HTF bar or future data.
"""

from __future__ import annotations

import bisect
from dataclasses import dataclass, field
from typing import Optional

from broker import Broker
from candles import TimeframeSeries
from models import Account, Candle, Trade
from strategy import Strategy


@dataclass
class Route:
    symbol: str
    timeframe: str
    strategy: str
    htf: list[str] = field(default_factory=list)
    params: dict = field(default_factory=dict)


class _CandlePrefix:
    """Zero-copy read-only prefix view over ``base[:_n]`` (no lookahead, O(1) per bar)."""

    __slots__ = ("_base", "_n")

    def __init__(self, base: list[Candle], n: int = 0):
        self._base = base
        self._n = n

    def __len__(self) -> int:
        return self._n

    def __bool__(self) -> bool:
        return self._n > 0

    def __getitem__(self, item):
        if isinstance(item, slice):
            start, stop, step = item.indices(self._n)
            return [self._base[i] for i in range(start, stop, step)]
        idx = item if item >= 0 else self._n + item
        if idx < 0 or idx >= self._n:
            raise IndexError("candle prefix index out of range")
        return self._base[idx]

    def __iter__(self):
        base = self._base
        for i in range(self._n):
            yield base[i]

    def __reversed__(self):
        base = self._base
        for i in range(self._n - 1, -1, -1):
            yield base[i]


class EngineContext:
    """Per-step view handed to the strategy: broker + HTF access + symbol specs."""

    def __init__(self, broker: Broker, base: list[Candle], htf: dict[str, TimeframeSeries],
                 contract_size: float, price_precision: int,
                 detector_cache: Optional[dict] = None,
                 symbol: str = "", timeframe: str = "", asset_class: str = ""):
        self.broker = broker
        self._base_full = base
        self._htf = htf
        self.contract_size = contract_size
        self.price_precision = price_precision
        self.symbol = symbol
        self.timeframe = timeframe
        self.asset_class = asset_class
        self.now: int = 0
        # detector events computed once over the FULL series, keyed per
        # (detector, timeframe, params); sliced by confirm_ts each bar (no
        # lookahead). The server injects a cross-request cache here (see
        # seriescache.RouteDetectorCache); default is per-run.
        self.detector_cache: dict = {} if detector_cache is None else detector_cache

    def has_htf(self, timeframe: str) -> bool:
        return timeframe in self._htf

    def htf(self, timeframe: str) -> list[Candle]:
        series = self._htf.get(timeframe)
        if series is None:
            raise KeyError(f"timeframe {timeframe!r} not loaded for this route")
        return series.closed(self.now)

    def htf_closed_count(self, timeframe: str) -> int:
        """Number of closed candles of ``timeframe`` at ``now`` (O(log N), zero copy)."""
        series = self._htf.get(timeframe)
        if series is None:
            raise KeyError(f"timeframe {timeframe!r} not loaded for this route")
        return series.closed_count(self.now)

    def full(self, timeframe: Optional[str]) -> list[Candle]:
        """Full (all-bars) series for a timeframe — base when ``timeframe`` is None.

        Detectors run once over this; the Strategy slices the result by the
        timeframe's ``cutoff`` so nothing leaks from the future."""
        if timeframe is None:
            return self._base_full
        series = self._htf.get(timeframe)
        if series is None:
            raise KeyError(f"timeframe {timeframe!r} not loaded for this route")
        return series.candles

    def cutoff(self, timeframe: Optional[str], base_time: int) -> Optional[int]:
        """Timestamp of the last *visible* candle of ``timeframe`` at the current
        decision point — the slice boundary for cached detectors.

        Base: the just-closed bar (``base_time``). HTF: the most recent candle
        closed by ``now`` (so a forming HTF bar is excluded). This makes the
        cached slice identical to recomputing detectors over the visible candles
        each bar — i.e. behaviour-preserving and still no-lookahead."""
        if timeframe is None:
            return base_time
        series = self._htf.get(timeframe)
        if series is None:
            raise KeyError(f"timeframe {timeframe!r} not loaded for this route")
        n = series.closed_count(self.now)
        return series.candles[n - 1].timestamp if n else None


@dataclass
class BacktestResult:
    trades: list[Trade]
    final_balance: float


def _subpath(m1: Optional[TimeframeSeries], start: int, end: int, fallback: Candle) -> list[Candle]:
    """M1 candles within [start, end); falls back to the bar itself when no M1."""
    if m1 is None or len(m1) == 0:
        return [fallback]
    opens = m1._opens
    lo = bisect.bisect_left(opens, start)
    hi = bisect.bisect_left(opens, end)
    seg = m1.candles[lo:hi]
    return seg if seg else [fallback]


def run_backtest(strategy: Strategy, base: list[Candle], htf_map: dict[str, list[Candle]],
                 m1: Optional[list[Candle]] = None, account: Optional[Account] = None,
                 contract_size: float = 100000.0, price_precision: int = 5,
                 warmup: int = 50, detector_cache: Optional[dict] = None,
                 symbol: str = "", timeframe: str = "", asset_class: str = "") -> BacktestResult:
    account = account or Account()
    base_series = TimeframeSeries(timeframe or "base", base)
    htf_series = {tf: TimeframeSeries(tf, c) for tf, c in htf_map.items()}
    m1_series = TimeframeSeries("m1", m1) if m1 else None

    broker = Broker(account, contract_size,
                    on_open=lambda p: strategy.on_open_position(p),
                    on_close=lambda t: strategy.on_close_position(t))
    ctx = EngineContext(broker, base, htf_series, contract_size, price_precision,
                        detector_cache=detector_cache,
                        symbol=symbol, timeframe=timeframe, asset_class=asset_class)
    strategy.ctx = ctx
    prefix = _CandlePrefix(base, 0)
    strategy.candles = prefix  # type: ignore[assignment]

    n = len(base)
    for i in range(warmup, n):
        bar = base[i]
        now = base_series.close_time(i)
        ctx.now = now

        broker.process_bar(bar, _subpath(m1_series, bar.timestamp, now, bar))

        prefix._n = i + 1
        strategy.index = i
        strategy.before()
        if not strategy.has_position and not strategy.has_pending:
            if strategy.should_long():
                strategy.go_long()
            elif strategy.should_short():
                strategy.go_short()
        else:
            if strategy.has_position:
                strategy.update_position()
            if strategy.should_cancel_entry():
                broker.cancel_pending()
        strategy.after()

    if broker.position is not None and base:
        broker.close_at(base[-1].close, base[-1].timestamp, "eod")

    return BacktestResult(trades=broker.trades, final_balance=broker.balance)
