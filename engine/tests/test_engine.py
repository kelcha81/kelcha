import unittest

from engine import run_backtest
from models import Account
from strategy import Strategy
from strategies.killzone_fvg_ob import KillzoneFvgOB
from tests.helpers import mk, MIN


class _BuyOnce(Strategy):
    """Enters one long at bar index 2 with a fixed bracket."""
    def should_long(self) -> bool:
        return self.index == 2

    def go_long(self):
        self.buy_market(1, sl=self.close - 1, tp=self.close + 2)


class _SellOnce(Strategy):
    def should_short(self) -> bool:
        return self.index == 2

    def go_short(self):
        self.sell_market(1, sl=self.close + 1, tp=self.close - 2)


BASE = [
    mk(0 * MIN, 10, 10, 10, 10),
    mk(1 * MIN, 10, 10, 10, 10),
    mk(2 * MIN, 10, 11, 9, 10),     # decision bar (close 10 -> sl 9, tp 12)
    mk(3 * MIN, 10.2, 10.5, 9.5, 10),  # fills long at next-bar OPEN = 10.2
    mk(4 * MIN, 10, 12, 10, 12),    # high 12 -> take profit
]


class TestEngineLong(unittest.TestCase):
    def test_next_bar_open_fill_and_tp(self):
        res = run_backtest(_BuyOnce(), BASE, {}, contract_size=1, warmup=2,
                           account=Account(balance=10000))
        self.assertEqual(len(res.trades), 1)
        t = res.trades[0]
        self.assertEqual(t.side, "long")
        self.assertAlmostEqual(t.entryPrice, 10.2)      # next-bar open, not decision close
        self.assertEqual(t.entryTime, 3 * MIN)
        self.assertEqual(t.reason, "tp")
        self.assertAlmostEqual(t.exitPrice, 12)
        self.assertAlmostEqual(t.pnl, (12 - 10.2) * 1)  # contract_size 1, no costs
        # risk uses the actual fill (10.2), not the decision close: |10.2 - 9| * 1
        self.assertAlmostEqual(t.risk, 1.2)

    def test_costs_applied(self):
        res = run_backtest(_BuyOnce(), BASE, {}, contract_size=1, warmup=2,
                           account=Account(balance=10000, spread=0.1, commission=0.5))
        t = res.trades[0]
        # gross (12-10.2)=1.8 ; costs = comm 0.5*1*2 + spread 0.1*1*1 = 1.1
        self.assertAlmostEqual(t.pnl, 1.8 - 1.1)


class TestEngineShort(unittest.TestCase):
    def test_short_stop_loss(self):
        base = [
            mk(0, 10, 10, 10, 10),
            mk(1, 10, 10, 10, 10),
            mk(2, 10, 11, 9, 10),       # short: sl 11, tp 8
            mk(3, 10, 10.5, 9.5, 10),   # fill short at open 10
            mk(4, 10, 11.5, 10, 11),    # high 11.5 >= sl 11 -> stopped
        ]
        res = run_backtest(_SellOnce(), base, {}, contract_size=1, warmup=2)
        self.assertEqual(len(res.trades), 1)
        t = res.trades[0]
        self.assertEqual(t.reason, "sl")
        self.assertAlmostEqual(t.exitPrice, 11)
        self.assertAlmostEqual(t.pnl, (10 - 11) * 1)  # short loss


class TestReferenceStrategySmoke(unittest.TestCase):
    def test_runs_without_error(self):
        # deterministic zigzag; HTF not loaded -> bias falls back to base structure
        base = []
        price = 1.1000
        for i in range(300):
            price += 0.0005 if (i // 10) % 2 == 0 else -0.0005
            o = price
            h = price + 0.0010
            l = price - 0.0010
            c = price + 0.0004
            base.append(mk(i * 15 * MIN, o, h, l, c))
        res = run_backtest(KillzoneFvgOB(), base, {}, contract_size=100000,
                           price_precision=5, warmup=50)
        self.assertIsInstance(res.trades, list)


if __name__ == "__main__":
    unittest.main()
