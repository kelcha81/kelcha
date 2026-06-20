import unittest

from ict.orderblock import detect_order_blocks
from ict.displacement import detect_displacement
from tests.helpers import mk, MIN, find


class TestOrderBlock(unittest.TestCase):
    def setUp(self):
        self.candles = [
            mk(0 * MIN, 10, 10.5, 9.5, 10.0),
            mk(1 * MIN, 10, 10.5, 9.5, 10.0),
            mk(2 * MIN, 10, 10.5, 9.5, 9.8),    # last down candle -> OB origin
            mk(3 * MIN, 9.8, 16, 9.7, 15.8),    # big up displacement
            mk(4 * MIN, 15, 15, 10, 12),        # returns to tap the OB
        ]

    def test_bullish_ob_from_displacement(self):
        obs = find(detect_order_blocks(self.candles, atr_period=3, displacement_atr=1.5), direction="bull")
        self.assertEqual(len(obs), 1)
        e = obs[0]
        self.assertAlmostEqual(e.top, 10.5)   # origin candle high
        self.assertAlmostEqual(e.bottom, 9.5)  # origin candle low
        self.assertEqual(e.t_start, 2 * MIN)
        self.assertEqual(e.confirm_ts, 3 * MIN)
        self.assertEqual(e.mitigated_at, 4 * MIN)

    def test_displacement_detected(self):
        disp = find(detect_displacement(self.candles, atr_period=3, threshold_atr=1.5), direction="bull")
        self.assertTrue(disp)
        self.assertEqual(disp[0].t_start, 3 * MIN)


if __name__ == "__main__":
    unittest.main()
