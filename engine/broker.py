"""
Simulated broker for the backtester.

Models a single open position at a time (ICT style), pending limit/stop orders,
and a queued market order that fills at the *next* bar's open (decision-at-close,
act-next-open — no lookahead). SL/TP are resolved intra-bar: if an M1 sub-path is
supplied the broker walks it so SL-vs-TP ordering is realistic; otherwise it falls
back to the bar itself with a pessimistic (SL-first) rule.

Costs mirror the front-end (tradingStore.ts): commission per lot per side, spread
once per round-trip, applied at close via ``trade_costs`` — so a backtest values a
trade exactly like a manual replay session.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Optional

from models import Account, Candle, Side, Trade, trade_costs, trade_pnl


@dataclass(slots=True)
class OpenPosition:
    side: Side
    qty: float                 # lots
    contract_size: float
    entry_price: float
    entry_time: int
    sl: Optional[float] = None
    tp: Optional[float] = None


@dataclass(slots=True)
class PendingOrder:
    kind: str                  # 'limit' | 'stop'
    side: Side
    qty: float
    price: float
    sl: Optional[float] = None
    tp: Optional[float] = None


class Broker:
    def __init__(self, account: Account, contract_size: float, pessimistic: bool = True,
                 on_open: Optional[Callable[[OpenPosition], None]] = None,
                 on_close: Optional[Callable[[Trade], None]] = None):
        self.account = account
        self.contract_size = contract_size
        self.pessimistic = pessimistic
        self.position: Optional[OpenPosition] = None
        self.pending: list[PendingOrder] = []
        self._market: Optional[tuple] = None  # (side, qty, sl, tp)
        self.trades: list[Trade] = []
        self.balance = account.balance
        self._on_open = on_open
        self._on_close = on_close
        self._seq = 0

    # --- order entry ---------------------------------------------------------

    def submit_market(self, side: Side, qty: float, sl: Optional[float] = None,
                      tp: Optional[float] = None) -> None:
        if qty > 0:
            self._market = (side, qty, sl, tp)

    def submit_limit(self, side: Side, qty: float, price: float,
                     sl: Optional[float] = None, tp: Optional[float] = None) -> None:
        if qty > 0:
            self.pending.append(PendingOrder("limit", side, qty, price, sl, tp))

    def submit_stop(self, side: Side, qty: float, price: float,
                    sl: Optional[float] = None, tp: Optional[float] = None) -> None:
        if qty > 0:
            self.pending.append(PendingOrder("stop", side, qty, price, sl, tp))

    def cancel_pending(self) -> None:
        self.pending.clear()
        self._market = None

    # --- per-bar processing --------------------------------------------------

    def process_bar(self, bar: Candle, subpath: Optional[list[Candle]] = None) -> None:
        """Fill queued/pending orders against ``bar`` then manage SL/TP."""
        if self._market is not None and self.position is None:
            side, qty, sl, tp = self._market
            self._open(side, qty, bar.open, bar.timestamp, sl, tp)
            self._market = None

        if self.pending and self.position is None:
            still: list[PendingOrder] = []
            for o in self.pending:
                fill = self._touch(o, bar)
                if fill is not None and self.position is None:
                    self._open(o.side, o.qty, fill, bar.timestamp, o.sl, o.tp)
                else:
                    still.append(o)
            self.pending = still

        if self.position is not None:
            self._manage(bar, subpath or [bar])

    def close_at(self, price: float, time: int, reason: str = "manual") -> None:
        """Force-close the open position (e.g. end of data)."""
        if self.position is not None:
            self._close(price, time, reason)

    # --- internals -----------------------------------------------------------

    def _open(self, side: Side, qty: float, price: float, time: int,
              sl: Optional[float], tp: Optional[float]) -> None:
        self.position = OpenPosition(side, qty, self.contract_size, price, time, sl, tp)
        if self._on_open:
            self._on_open(self.position)

    def _touch(self, o: PendingOrder, bar: Candle) -> Optional[float]:
        """Return fill price if ``bar`` triggers the pending order, else None."""
        lo, hi = bar.low, bar.high
        if o.kind == "limit":
            # buy limit fills when price drops to/below; sell limit when rises to/above
            if o.side == "long" and lo <= o.price:
                return min(o.price, bar.open)  # gap-through fills at open
            if o.side == "short" and hi >= o.price:
                return max(o.price, bar.open)
        else:  # stop
            if o.side == "long" and hi >= o.price:
                return max(o.price, bar.open)
            if o.side == "short" and lo <= o.price:
                return min(o.price, bar.open)
        return None

    def _manage(self, bar: Candle, subpath: list[Candle]) -> None:
        p = self.position
        assert p is not None
        for c in subpath:
            if p.side == "long":
                hit_sl = p.sl is not None and c.low <= p.sl
                hit_tp = p.tp is not None and c.high >= p.tp
            else:
                hit_sl = p.sl is not None and c.high >= p.sl
                hit_tp = p.tp is not None and c.low <= p.tp

            if hit_sl and hit_tp:
                # both inside one sub-bar: pessimistic assumes SL first
                if self.pessimistic:
                    self._close(p.sl, c.timestamp, "sl")  # type: ignore[arg-type]
                else:
                    self._close(p.tp, c.timestamp, "tp")  # type: ignore[arg-type]
                return
            if hit_sl:
                self._close(p.sl, c.timestamp, "sl")  # type: ignore[arg-type]
                return
            if hit_tp:
                self._close(p.tp, c.timestamp, "tp")  # type: ignore[arg-type]
                return

    def _close(self, exit_price: float, exit_time: int, reason: str) -> None:
        p = self.position
        assert p is not None
        gross = trade_pnl(p.side, p.entry_price, exit_price, p.qty, p.contract_size)
        pnl = gross - trade_costs(p.qty, p.contract_size, self.account)
        risk = (abs(p.entry_price - p.sl) * p.contract_size * p.qty) if p.sl is not None else None
        self._seq += 1
        tr = Trade(
            id=f"e{self._seq}", side=p.side, size=p.qty, contractSize=p.contract_size,
            entryPrice=p.entry_price, entryTime=p.entry_time,
            exitPrice=exit_price, exitTime=exit_time, pnl=pnl, reason=reason, risk=risk,
            sl=p.sl, tp=p.tp,
        )
        self.trades.append(tr)
        self.balance += pnl
        self.position = None
        if self._on_close:
            self._on_close(tr)
