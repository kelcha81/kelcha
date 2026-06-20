import unittest
from datetime import datetime, timezone

from sessions import (is_ny_dst, ny_offset_ms, ny_wall, killzone_at,
                      in_killzone, trading_day_start, EST_OFFSET_MS, EDT_OFFSET_MS)


def utc_ms(y, mo, d, h=0, mi=0):
    return int(datetime(y, mo, d, h, mi, tzinfo=timezone.utc).timestamp() * 1000)


class TestDst(unittest.TestCase):
    def test_summer_is_dst(self):
        ts = utc_ms(2023, 7, 1, 12)
        self.assertTrue(is_ny_dst(ts))
        self.assertEqual(ny_offset_ms(ts), EDT_OFFSET_MS)

    def test_winter_is_not_dst(self):
        ts = utc_ms(2023, 1, 15, 12)
        self.assertFalse(is_ny_dst(ts))
        self.assertEqual(ny_offset_ms(ts), EST_OFFSET_MS)

    def test_dst_boundaries_2023(self):
        # DST: 2023-03-12 07:00 UTC -> 2023-11-05 06:00 UTC
        self.assertFalse(is_ny_dst(utc_ms(2023, 3, 12, 6, 59)))
        self.assertTrue(is_ny_dst(utc_ms(2023, 3, 12, 7, 1)))
        self.assertTrue(is_ny_dst(utc_ms(2023, 11, 5, 5, 59)))
        self.assertFalse(is_ny_dst(utc_ms(2023, 11, 5, 6, 1)))


class TestKillzones(unittest.TestCase):
    def test_ny_am_winter(self):
        # 13:00 UTC in winter = 08:00 EST -> NY AM killzone
        ts = utc_ms(2023, 1, 4, 13)
        self.assertEqual(ny_wall(ts).hour, 8)
        self.assertEqual(killzone_at(ts), "ny_am")
        self.assertTrue(in_killzone(ts, "ny_am"))
        self.assertFalse(in_killzone(ts, "london"))

    def test_london_winter(self):
        # 08:00 UTC winter = 03:00 EST -> London killzone
        ts = utc_ms(2023, 1, 4, 8)
        self.assertEqual(killzone_at(ts), "london")


class TestTradingDay(unittest.TestCase):
    def test_rollover_is_5pm_ny(self):
        ts = utc_ms(2023, 1, 4, 13)  # Wed 08:00 NY
        start = trading_day_start(ts)
        self.assertEqual(ny_wall(start).hour, 17)
        self.assertLess(start, ts)
        self.assertLess(ts - start, 24 * 3600 * 1000)


if __name__ == "__main__":
    unittest.main()
