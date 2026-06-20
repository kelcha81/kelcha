import unittest

from ict.liquidity import equal_levels, liquidity_sweeps, prior_levels
from tests.helpers import mk, MIN, find


class TestEqualHighs(unittest.TestCase):
    def test_clusters_equal_highs(self):
        candles = [
            mk(0 * MIN, 10, 10, 5, 7),
            mk(1 * MIN, 10, 12, 6, 11),    # swing high 12
            mk(2 * MIN, 9, 9, 4, 5),
            mk(3 * MIN, 10, 12.0, 6, 11),  # swing high 12 (equal)
            mk(4 * MIN, 8, 8, 5, 6),
        ]
        pools = equal_levels(candles, kind="high", lookback=1, tolerance=0.05)
        self.assertEqual(len(pools), 1)
        self.assertAlmostEqual(pools[0].price, 12)
        self.assertEqual(pools[0].meta["count"], 2)
        self.assertEqual(pools[0].meta["side"], "buy")


class TestSweep(unittest.TestCase):
    def test_buy_side_sweep_is_bearish(self):
        candles = [
            mk(0 * MIN, 10, 10, 5, 7),
            mk(1 * MIN, 10, 12, 6, 11),     # swing high 12
            mk(2 * MIN, 9, 9, 4, 5),
            mk(3 * MIN, 8, 13, 8, 11.5),    # wick above 12, closes back below
        ]
        sweeps = find(liquidity_sweeps(candles, lookback=1), type="liquidity_sweep", direction="bear")
        self.assertTrue(sweeps)
        self.assertAlmostEqual(sweeps[0].price, 12)
        self.assertEqual(sweeps[0].meta["side"], "buy")
        self.assertEqual(sweeps[0].t_start, 3 * MIN)


class TestPriorLevels(unittest.TestCase):
    def test_previous_period_high_low(self):
        daily = [mk(0, 10, 20, 5, 15), mk(MIN, 15, 25, 12, 22)]
        levels = prior_levels(daily, count=1, label="PD")
        pdh = find(levels, price=20)
        pdl = find(levels, price=5)
        self.assertTrue(pdh and pdl)
        self.assertEqual(pdh[0].meta["kind"], "PDH")
        self.assertEqual(pdl[0].meta["kind"], "PDL")
        self.assertEqual(pdh[0].t_start, MIN)  # active from the next candle


if __name__ == "__main__":
    unittest.main()
