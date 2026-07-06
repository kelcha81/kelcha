import json
import os
import tempfile
import unittest

import seriescache
from candles import load_series
from seriescache import load_series_cached

HOUR = 3_600_000
MIN = 60_000
JAN_2024 = 1_704_067_200_000  # 2024-01-01T00:00Z
FEB_2024 = 1_706_745_600_000  # 2024-02-01T00:00Z


def _rows(n, step, start=0):
    rows = []
    price = 1.1000
    for i in range(n):
        price += 0.0006 if (i // 8) % 2 == 0 else -0.0006
        rows.append({"timestamp": start + i * step, "open": price, "high": price + 0.0012,
                     "low": price - 0.0012, "close": price + 0.0005, "volume": 1})
    return rows


class TestSeriesCache(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.sym_dir = os.path.join(self.tmp, "testsym")
        os.makedirs(os.path.join(self.sym_dir, "m1"))
        with open(os.path.join(self.sym_dir, "manifest.json"), "w") as f:
            json.dump({"symbol": "testsym", "pricePrecision": 5,
                       "timeframes": {"h1": {"file": "h1.json"},
                                      "m1": {"chunks": ["m1/2024-01.json", "m1/2024-02.json"]}}}, f)
        with open(os.path.join(self.sym_dir, "h1.json"), "w") as f:
            json.dump(_rows(200, HOUR), f)
        with open(os.path.join(self.sym_dir, "m1", "2024-01.json"), "w") as f:
            json.dump(_rows(100, MIN, start=JAN_2024), f)
        with open(os.path.join(self.sym_dir, "m1", "2024-02.json"), "w") as f:
            json.dump(_rows(100, MIN, start=FEB_2024), f)
        self._old = os.environ.get("ICT_DATA_DIR")
        os.environ["ICT_DATA_DIR"] = self.tmp
        seriescache.clear()

    def tearDown(self):
        if self._old is None:
            os.environ.pop("ICT_DATA_DIR", None)
        else:
            os.environ["ICT_DATA_DIR"] = self._old
        seriescache.clear()

    def _shape(self, candles):
        return [(c.timestamp, c.open, c.high, c.low, c.close) for c in candles]

    def test_parity_with_uncached_loader(self):
        cases = [
            ("h1", None, None),
            ("h1", 5 * HOUR, 50 * HOUR),
            ("m1", None, None),
            ("m1", FEB_2024, FEB_2024 + 30 * MIN),   # only the Feb chunk overlaps
            ("m1", JAN_2024 + 90 * MIN, FEB_2024 + 9 * MIN),  # spans both chunks
        ]
        for tf, frm, to in cases:
            cached, _key = load_series_cached("testsym", tf, from_ts=frm, to_ts=to)
            plain = load_series("testsym", tf, from_ts=frm, to_ts=to)
            self.assertTrue(plain, f"{tf} {frm} {to} fixture is empty")
            self.assertEqual(self._shape(cached), self._shape(plain), f"{tf} {frm} {to}")

    def test_repeat_load_hits_cache(self):
        s1, k1 = load_series_cached("testsym", "h1")
        s2, k2 = load_series_cached("testsym", "h1")
        self.assertIs(s1, s2)
        self.assertEqual(k1, k2)

    def test_rewrite_invalidates(self):
        _s1, k1 = load_series_cached("testsym", "h1")
        with open(os.path.join(self.sym_dir, "h1.json"), "w") as f:
            json.dump(_rows(250, HOUR), f)
        s2, k2 = load_series_cached("testsym", "h1")
        self.assertEqual(len(s2), 250)
        self.assertNotEqual(k1, k2)

    def test_detector_cache_keys_off_series_identity(self):
        _s, key = load_series_cached("testsym", "h1")
        cache = seriescache.RouteDetectorCache({None: key})
        sentinel = ["events"]
        cache[("fvg", None, (("atr_period", 14),))] = sentinel
        self.assertIs(cache.get(("fvg", None, (("atr_period", 14),))), sentinel)
        # a second request on the same data sees the entry...
        cache2 = seriescache.RouteDetectorCache({None: key})
        self.assertIs(cache2.get(("fvg", None, (("atr_period", 14),))), sentinel)
        # ...but different params or an unknown timeframe do not.
        self.assertIsNone(cache2.get(("fvg", None, (("atr_period", 20),))))
        self.assertIsNone(cache2.get(("fvg", "h4", (("atr_period", 14),))))


if __name__ == "__main__":
    unittest.main()
