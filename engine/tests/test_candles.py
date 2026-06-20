import unittest

from candles import TimeframeSeries, MultiTimeframe
from tests.helpers import mk, MIN


class TestNoLookahead(unittest.TestCase):
    def setUp(self):
        self.ts = TimeframeSeries("m1", [mk(0, 1, 2, 0, 1), mk(MIN, 1, 2, 0, 1), mk(2 * MIN, 1, 2, 0, 1)])

    def test_close_times(self):
        self.assertEqual(self.ts.close_time(0), MIN)
        self.assertEqual(self.ts.close_time(1), 2 * MIN)
        self.assertEqual(self.ts.close_time(2), 3 * MIN)  # last bar uses nominal duration

    def test_forming_bar_excluded(self):
        # at the first bar's open time nothing has closed yet
        self.assertEqual(len(self.ts.closed(0)), 0)
        # exactly at a close time that bar is now available
        self.assertEqual(len(self.ts.closed(MIN)), 1)
        self.assertEqual(len(self.ts.closed(2 * MIN)), 2)
        self.assertEqual(len(self.ts.closed(3 * MIN)), 3)

    def test_no_future_candle_leaks(self):
        for now in (MIN, 2 * MIN, 3 * MIN):
            for c in self.ts.closed(now):
                idx = self.ts.candles.index(c)
                self.assertLessEqual(self.ts.close_time(idx), now)

    def test_multi_timeframe(self):
        mtf = MultiTimeframe({"m1": self.ts})
        self.assertEqual(len(mtf.closed("m1", 2 * MIN)), 2)


if __name__ == "__main__":
    unittest.main()
