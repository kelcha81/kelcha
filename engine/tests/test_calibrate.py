import unittest

from calibrate import align, evaluate, sweep
from models import Trade
from tests.helpers import mk, MIN


# A single bullish FVG [10, 11] confirmed at 2*MIN, then flat (no other structure).
CANDLES = [
    mk(0 * MIN, 5, 10, 4, 9),
    mk(1 * MIN, 9, 15, 9, 14),     # displacement up (mid)
    mk(2 * MIN, 14, 16, 11, 15),   # low 11 > prev.high 10 -> bull FVG [10, 11]
    mk(3 * MIN, 15, 15.5, 14.5, 15),
    mk(4 * MIN, 15, 15.5, 14.5, 15),
    mk(5 * MIN, 15, 15.5, 14.5, 15),
    mk(6 * MIN, 15, 15.5, 14.5, 15),
    mk(7 * MIN, 15, 15.5, 14.5, 15),
]

PARAMS = {"fvg_min_atr": 0.0, "swing_lookback": 2, "atr_period": 14, "displacement_atr": 1.5}


def _long(entry_time, entry_price):
    return Trade(id="x", side="long", size=1, contractSize=100000, entryPrice=entry_price,
                 entryTime=entry_time, exitPrice=entry_price, exitTime=entry_time + MIN,
                 pnl=0.0, reason="manual")


class TestAlign(unittest.TestCase):
    def test_entry_in_zone_is_captured(self):
        m = align(CANDLES, [_long(4 * MIN, 10.5)], PARAMS)[0]
        self.assertTrue(m.captured)
        self.assertEqual(m.by, "fvg")

    def test_entry_outside_any_structure_not_captured(self):
        m = align(CANDLES, [_long(6 * MIN, 50.0)], PARAMS)[0]
        self.assertFalse(m.captured)

    def test_coverage_half(self):
        trades = [_long(4 * MIN, 10.5), _long(6 * MIN, 50.0)]
        r = evaluate(CANDLES, trades, PARAMS)
        self.assertEqual(r["n"], 2)
        self.assertAlmostEqual(r["coverage"], 0.5)


class TestSweep(unittest.TestCase):
    def test_picks_threshold_that_captures(self):
        trades = [_long(4 * MIN, 10.5)]
        grid = {"fvg_min_atr": [0.0, 50.0], "swing_lookback": [2], "atr_period": [14], "displacement_atr": [1.5]}
        best, rows = sweep(CANDLES, trades, grid=grid)
        self.assertEqual(best["fvg_min_atr"], 0.0)  # 50.0 is too strict -> no FVG -> 0 coverage
        self.assertEqual(len(rows), 2)
        self.assertGreaterEqual(rows[0]["score"], rows[1]["score"])


if __name__ == "__main__":
    unittest.main()
