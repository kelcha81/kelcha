"""
Performance metrics — a faithful port of
``forex-replay-app/src/lib/performance.ts`` so a backtest and the manual replay
UI report identical numbers for an identical trade list.

``compute_stats`` returns the rich PerfStats set plus ``avgPnl`` (alias of
expectancy) for back-compat with the front-end's BacktestStats shape.
"""

from __future__ import annotations

import math
from typing import Optional

from models import Trade


def equity_curve(trades: list[Trade], start_balance: float) -> list[dict]:
    """Running equity + drawdown-from-peak at each close, ordered by exit time."""
    first_entry = trades[0].entryTime if trades else 0
    pts = [{"t": first_entry, "equity": start_balance, "drawdown": 0.0}]
    eq = start_balance
    peak = start_balance
    for tr in sorted(trades, key=lambda t: t.exitTime):
        eq += tr.pnl
        peak = max(peak, eq)
        pts.append({"t": tr.exitTime, "equity": eq, "drawdown": peak - eq})
    return pts


def compute_stats(trades: list[Trade], start_balance: float) -> dict:
    n = len(trades)
    pnls = [t.pnl for t in trades]
    gross_win = sum(p for p in pnls if p > 0)
    gross_loss = abs(sum(p for p in pnls if p < 0))
    total = gross_win - gross_loss

    rs = [t.pnl / t.risk for t in trades if t.risk and t.risk > 0]

    # Sharpe of per-trade returns (not annualised — a comparability metric).
    rets = [p / start_balance for p in pnls]
    m = len(rets) or 1
    mean = sum(rets) / m
    sd = math.sqrt(sum((r - mean) ** 2 for r in rets) / m)
    sharpe = (mean / sd) * math.sqrt(m) if sd > 0 else 0.0

    eq = equity_curve(trades, start_balance)
    max_dd = max((p["drawdown"] for p in eq), default=0.0)

    if gross_loss > 0:
        profit_factor = gross_win / gross_loss
    elif gross_win > 0:
        profit_factor = math.inf
    else:
        profit_factor = 0.0

    expectancy = total / n if n else 0.0
    return {
        "trades": n,
        "winRate": (sum(1 for p in pnls if p > 0) / n) if n else 0.0,
        "totalPnl": total,
        "profitFactor": profit_factor,
        "expectancy": expectancy,
        "avgPnl": expectancy,  # back-compat alias (BacktestStats)
        "avgR": (sum(rs) / len(rs)) if rs else 0.0,
        "sharpe": sharpe,
        "maxDrawdown": max_dd,
    }
