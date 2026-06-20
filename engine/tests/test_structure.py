import unittest

from ict.structure import find_swings, structure_breaks
from tests.helpers import mk, MIN, find


# A hand-built zigzag (lookback=1): swing low, swing high, BOS up, then a
# swing high/low and a close that breaks structure to the downside (MSS).
CANDLES = [
    mk(0 * MIN, 10, 10, 5, 7),
    mk(1 * MIN, 9, 9, 3, 4),       # swing low @ 3
    mk(2 * MIN, 10, 12, 6, 11),    # swing high @ 12
    mk(3 * MIN, 8, 8, 5, 6),       # swing low @ 5
    mk(4 * MIN, 10, 15, 10, 14),   # close 14 > 12 -> BOS bull
    mk(5 * MIN, 14, 16, 11, 15),   # swing high @ 16
    mk(6 * MIN, 13, 13, 9, 12),    # swing low @ 9
    mk(7 * MIN, 12, 14, 10, 13),   # confirms the @9 swing low (low 10 > 9)
    mk(8 * MIN, 12, 12, 7, 8),     # close 8 < 9 -> MSS bear (trend was up)
]


class TestSwings(unittest.TestCase):
    def test_finds_high_and_low(self):
        sw = find_swings(CANDLES, lookback=1)
        highs = [s for s in sw if s.kind == "high"]
        lows = [s for s in sw if s.kind == "low"]
        self.assertTrue(any(abs(s.price - 12) < 1e-9 for s in highs))
        self.assertTrue(any(abs(s.price - 3) < 1e-9 for s in lows))

    def test_confirm_lag(self):
        sw = find_swings(CANDLES, lookback=1)
        # the @12 swing high occurs at 2*MIN, confirmed one bar later
        s = next(s for s in sw if abs(s.price - 12) < 1e-9 and s.kind == "high")
        self.assertEqual(s.timestamp, 2 * MIN)
        self.assertEqual(s.confirm_ts, 3 * MIN)


class TestBreaks(unittest.TestCase):
    def test_bos_then_mss(self):
        ev = structure_breaks(CANDLES, lookback=1)
        bos = find(ev, type="bos", direction="bull")
        mss = find(ev, type="mss", direction="bear")
        self.assertTrue(bos, "expected a bullish BOS")
        self.assertAlmostEqual(bos[0].price, 12)
        self.assertEqual(bos[0].t_start, 4 * MIN)
        self.assertTrue(mss, "expected a bearish MSS")
        self.assertAlmostEqual(mss[0].price, 9)
        self.assertEqual(mss[0].t_start, 8 * MIN)


if __name__ == "__main__":
    unittest.main()
