import unittest

from ict.fvg import detect_fvgs
from tests.helpers import mk, MIN, find


class TestFvg(unittest.TestCase):
    def test_bullish_gap_and_mitigation(self):
        candles = [
            mk(0, 5, 10, 4, 9),
            mk(MIN, 9, 15, 9, 14),        # mid (displacement up)
            mk(2 * MIN, 14, 16, 11, 15),  # low 11 > prev.high 10 -> bull FVG [10, 11]
            mk(3 * MIN, 15, 15, 10.5, 12),  # dips to 10.5 -> mitigates
        ]
        fvgs = detect_fvgs(candles)
        bull = find(fvgs, direction="bull")
        self.assertEqual(len(bull), 1)
        e = bull[0]
        self.assertAlmostEqual(e.bottom, 10)
        self.assertAlmostEqual(e.top, 11)
        self.assertEqual(e.confirm_ts, 2 * MIN)
        self.assertEqual(e.mitigated_at, 3 * MIN)

    def test_bearish_gap(self):
        candles = [
            mk(0, 25, 26, 20, 21),
            mk(MIN, 21, 21, 10, 11),
            mk(2 * MIN, 11, 18, 8, 9),  # high 18 < prev.low 20 -> bear FVG [18, 20]
        ]
        bear = find(detect_fvgs(candles), direction="bear")
        self.assertEqual(len(bear), 1)
        self.assertAlmostEqual(bear[0].bottom, 18)
        self.assertAlmostEqual(bear[0].top, 20)
        self.assertIsNone(bear[0].mitigated_at)

    def test_size_filter_rejects_small_gap(self):
        candles = [mk(0, 5, 10, 4, 9), mk(MIN, 9, 15, 9, 14), mk(2 * MIN, 14, 16, 11, 15)]
        self.assertEqual(len(detect_fvgs(candles, min_gap=2)), 0)  # gap is only 1


if __name__ == "__main__":
    unittest.main()
