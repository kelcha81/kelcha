"""
System prompt + message builder for AI strategy authoring.

The system prompt is the ICT ``Strategy`` authoring contract (kept in sync with
``strategy.py``) plus the reference strategy as a worked example, so generated
code uses the real API and passes the AST validator.
"""

from __future__ import annotations

import os

_ENGINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_REFERENCE = os.path.join(_ENGINE, "strategies", "killzone_fvg_ob.py")


def _reference_example() -> str:
    try:
        with open(_REFERENCE, "r", encoding="utf-8") as f:
            return f.read()
    except OSError:
        return "(reference strategy unavailable)"


_API_GUIDE = """\
You write Python strategy modules for an ICT (Inner Circle Trader) backtesting
engine. A strategy is a subclass of `Strategy` (from the `strategy` module).

HARD RULES (the file is rejected otherwise):
- Output ONLY a complete Python module — no prose, no markdown fences.
- Subclass `Strategy`. Put a module docstring at the top describing the strategy
  (this is shown to the user as the explanation).
- Imports allowed ONLY from: strategy, models, ict.*, sessions, math, statistics,
  typing, dataclasses, __future__. No os/sys/subprocess/open/eval/exec/network,
  no dunder-attribute access.
- Declare tunable numbers in a class-level `params` dict (used by the UI).

THE Strategy API you may use:
  Market data (current closed bar): self.price, self.open, self.high, self.low,
    self.close, self.time (ms), self.candle, self.candles (list, closed only).
    self.get_candles(timeframe) -> higher/lower timeframe closed candles, e.g.
    self.get_candles(self.hp["bias_tf"]). Timeframes: 'm1','m5','m15','h1','h4','d1'.
  ICT helpers (return list[ICTEvent]; pass detector kwargs through):
    self.fvgs(tf=None, min_gap=0.0, atr_period=14, min_gap_atr=0.0)
    self.order_blocks(tf=None, atr_period=14, displacement_atr=1.5, body_only=False)
    self.sweeps(tf=None, lookback=2)
    self.equal_highs_lows(tf=None, kind='high'|'low', lookback=2, tolerance=0.0, tolerance_atr=0.0)
    self.breaks(tf=None, lookback=2)          # BOS / MSS events
    self.swing_points(tf=None, lookback=2)
    self.displacement(tf=None, atr_period=14, threshold_atr=1.5)
    self.in_killzone(name) -> bool            # 'london','ny_am','ny_pm','asia',...
    self.killzone() -> name | None
  ICTEvent fields: .type, .direction ('bull'/'bear'), .t_start, .t_end, .top,
    .bottom, .price, .strength, .confirm_ts, .mitigated_at, .meta (dict).
    Only act on an event once self.time >= event.confirm_ts (no lookahead).
  Position/orders: self.has_position, self.is_long, self.is_short, self.position,
    self.has_pending, self.balance.
    self.buy_market(qty, sl=None, tp=None); self.sell_market(qty, sl, tp)
    self.buy_limit(qty, price, sl, tp); self.sell_limit(qty, price, sl, tp); self.cancel()
    self.position_size(risk_pct, entry, sl) -> lots (risk_pct % of balance).
  Lifecycle to override (called once per closed bar, in order):
    before(); should_long()->bool; should_short()->bool; go_long(); go_short();
    should_cancel_entry()->bool; update_position(); after().
    Entries are only attempted when flat and with no pending order.
  Event hooks (optional): on_open_position(position); on_close_position(trade).
  Read params via self.hp["key"]. Use ATR-relative thresholds where possible so
  params travel across instruments. Always set a stop; size with position_size.

REFERENCE EXAMPLE (study the structure, then write a NEW strategy):
```python
%s
```
""" % _reference_example()

SYSTEM_PROMPT = _API_GUIDE


def build_user_message(description: str, base_code: str | None = None,
                       name: str | None = None) -> str:
    if base_code:
        return (
            "Here is the current strategy module:\n\n```python\n"
            f"{base_code}\n```\n\n"
            f"Modify it as follows: {description}\n\n"
            "Return the COMPLETE updated module (only the .py contents)."
        )
    suggested = name or "GeneratedStrategy"
    return (
        f"Write a complete ICT strategy module for this description:\n\n{description}\n\n"
        f"Name the class `{suggested}`. Return only the .py file contents."
    )
