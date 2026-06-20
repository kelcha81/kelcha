import unittest

from ict.zones import fib_levels, premium_discount, equilibrium, ote_zone, in_ote


class TestZones(unittest.TestCase):
    def test_fib_levels(self):
        f = fib_levels(0, 100)
        self.assertAlmostEqual(f[0.0], 100)
        self.assertAlmostEqual(f[1.0], 0)
        self.assertAlmostEqual(f[0.5], 50)
        self.assertAlmostEqual(f[0.618], 38.2)

    def test_premium_discount(self):
        self.assertEqual(equilibrium(100, 0), 50)
        self.assertEqual(premium_discount(75, 100, 0), "premium")
        self.assertEqual(premium_discount(25, 100, 0), "discount")
        self.assertEqual(premium_discount(50, 100, 0), "equilibrium")

    def test_ote_zone_bullish_leg(self):
        top, bottom = ote_zone(0, 100)  # low->high leg
        self.assertAlmostEqual(top, 38)
        self.assertAlmostEqual(bottom, 21)
        self.assertTrue(in_ote(30, 0, 100))
        self.assertFalse(in_ote(50, 0, 100))

    def test_ote_zone_bearish_leg(self):
        # high->low leg: OTE band sits in the upper (premium) area
        top, bottom = ote_zone(100, 0)
        self.assertAlmostEqual(top, 79)
        self.assertAlmostEqual(bottom, 62)


if __name__ == "__main__":
    unittest.main()
