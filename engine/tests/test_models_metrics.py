import math
import unittest

from models import Account, Trade, trade_pnl, trade_costs
from metrics import compute_stats, equity_curve


def _trade(pnl, risk, entry_t, exit_t, side="long"):
    return Trade(id=f"t{exit_t}", side=side, size=1, contractSize=100000,
                 entryPrice=1.0, entryTime=entry_t, exitPrice=1.1, exitTime=exit_t,
                 pnl=pnl, risk=risk, reason="tp")


class TestPnl(unittest.TestCase):
    def test_long_pnl(self):
        self.assertAlmostEqual(trade_pnl("long", 1.1, 1.2, 1, 100000), 10000)

    def test_short_pnl(self):
        self.assertAlmostEqual(trade_pnl("short", 1.2, 1.1, 1, 100000), 10000)

    def test_costs(self):
        acc = Account(balance=10000, spread=0.0001, commission=3)
        # commission 3*1*2 + spread 0.0001*100000*1 = 6 + 10 = 16
        self.assertAlmostEqual(trade_costs(1, 100000, acc), 16)


class TestStats(unittest.TestCase):
    def setUp(self):
        self.trades = [_trade(100, 50, 0, 10), _trade(-50, 50, 20, 30)]

    def test_core_metrics(self):
        s = compute_stats(self.trades, 10000)
        self.assertEqual(s["trades"], 2)
        self.assertAlmostEqual(s["winRate"], 0.5)
        self.assertAlmostEqual(s["totalPnl"], 50)
        self.assertAlmostEqual(s["profitFactor"], 2.0)
        self.assertAlmostEqual(s["expectancy"], 25)
        self.assertAlmostEqual(s["avgPnl"], 25)
        self.assertAlmostEqual(s["avgR"], 0.5)
        self.assertAlmostEqual(s["maxDrawdown"], 50)

    def test_profit_factor_no_losses(self):
        s = compute_stats([_trade(100, 50, 0, 10)], 10000)
        self.assertEqual(s["profitFactor"], math.inf)

    def test_equity_curve_orders_by_exit(self):
        pts = equity_curve(self.trades, 10000)
        self.assertEqual(pts[0]["equity"], 10000)
        self.assertEqual(pts[-1]["equity"], 10050)
        self.assertEqual(max(p["drawdown"] for p in pts), 50)


if __name__ == "__main__":
    unittest.main()
