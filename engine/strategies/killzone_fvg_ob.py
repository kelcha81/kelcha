"""
Reference ICT strategy: HTF-biased fair-value-gap entries during a killzone.

Logic (deliberately simple — it exists to exercise the API and produce trades;
thresholds are parameters meant to be calibrated, not hand-tuned truths):

  1. Bias = direction of the most recent market-structure break on the bias
     timeframe (falls back to the base timeframe if the HTF isn't loaded).
  2. Only trade while a configured killzone is active.
  3. Enter when the current bar retraces into a fresh FVG aligned with bias.
  4. Stop just beyond the gap; target a fixed reward:risk multiple.

This shows every part of the Jesse-shaped API: HTF context, ICT helpers, killzone
gating, risk-based sizing and bracket orders.
"""

from __future__ import annotations

from typing import Optional

from strategy import Strategy
from models import ICTEvent
from ict.util import pip_size


class KillzoneFvgOB(Strategy):
    params = {
        "risk_pct": 0.5,          # % of balance risked per trade
        "rr": 2.0,                # reward:risk target
        "swing_lookback": 3,      # fractal lookback for structure
        "atr_period": 14,
        "fvg_min_atr": 0.25,      # min gap size as ATR multiple
        "sl_buffer_pips": 2.0,    # padding beyond the gap for the stop
        "bias_tf": "h4",          # higher timeframe for directional bias
        # killzones to trade (NY local windows defined in sessions.py)
        "kz_london": 1,
        "kz_ny_am": 1,
    }

    def before(self):
        self._bias = self._compute_bias()

    def _active_killzones(self) -> list[str]:
        names = []
        if self.hp.get("kz_london"):
            names.append("london")
        if self.hp.get("kz_ny_am"):
            names.append("ny_am")
        return names

    def _in_any_killzone(self) -> bool:
        return any(self.in_killzone(n) for n in self._active_killzones())

    def _compute_bias(self) -> Optional[str]:
        lookback = int(self.hp["swing_lookback"])
        try:
            breaks = self.breaks(self.hp["bias_tf"], lookback=lookback)
        except KeyError:
            breaks = self.breaks(None, lookback=lookback)  # bias TF not loaded -> base
        return breaks[-1].direction if breaks else None

    def _buffer(self) -> float:
        return self.hp["sl_buffer_pips"] * pip_size(self.ctx.price_precision)

    def _entry_fvg(self, direction: str) -> Optional[ICTEvent]:
        """Most recent FVG of ``direction`` that the current bar is tapping."""
        fvgs = self.fvgs(atr_period=int(self.hp["atr_period"]),
                         min_gap_atr=float(self.hp["fvg_min_atr"]))
        bar = self.candle
        for e in reversed(fvgs):
            if e.direction != direction or e.t_start >= bar.timestamp:
                continue
            if e.bottom <= bar.low <= e.top:   # price retraced into the gap
                return e
        return None

    # --- entries -------------------------------------------------------------

    def should_long(self) -> bool:
        return self._bias == "bull" and self._in_any_killzone() and self._entry_fvg("bull") is not None

    def should_short(self) -> bool:
        return self._bias == "bear" and self._in_any_killzone() and self._entry_fvg("bear") is not None

    def go_long(self):
        e = self._entry_fvg("bull")
        if e is None:
            return
        entry = self.close
        sl = e.bottom - self._buffer()
        if sl >= entry:
            return
        tp = entry + self.hp["rr"] * (entry - sl)
        qty = self.position_size(self.hp["risk_pct"], entry, sl)
        if qty > 0:
            self.buy_market(qty, sl, tp)

    def go_short(self):
        e = self._entry_fvg("bear")
        if e is None:
            return
        entry = self.close
        sl = e.top + self._buffer()
        if sl <= entry:
            return
        tp = entry - self.hp["rr"] * (sl - entry)
        qty = self.position_size(self.hp["risk_pct"], entry, sl)
        if qty > 0:
            self.sell_market(qty, sl, tp)
