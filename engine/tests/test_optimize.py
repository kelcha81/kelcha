import json
import os
import tempfile
import unittest

import optimize

HOUR = 3_600_000


def _candles(n, step):
    rows = []
    price = 1.1000
    for i in range(n):
        price += 0.0006 if (i // 8) % 2 == 0 else -0.0006
        rows.append({"timestamp": i * step, "open": price, "high": price + 0.0012,
                     "low": price - 0.0012, "close": price + 0.0005, "volume": 1})
    return rows


class TestSpace(unittest.TestCase):
    def test_known_space(self):
        sp = optimize.space_for("killzone_fvg_ob")
        self.assertIn("rr", sp)

    def test_generic_fallback_uses_param_defaults(self):
        # the fallback should produce a range/categorical entry per numeric default
        sp = optimize.space_for("killzone_fvg_ob")
        self.assertTrue(all(isinstance(v, (tuple, list)) for v in sp.values()))


class TestSearch(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        d = os.path.join(self.tmp, "testsym")
        os.makedirs(d)
        with open(os.path.join(d, "manifest.json"), "w") as f:
            json.dump({"symbol": "testsym", "pricePrecision": 5,
                       "timeframes": {"h1": {"file": "h1.json"}, "h4": {"file": "h4.json"}}}, f)
        with open(os.path.join(d, "h1.json"), "w") as f:
            json.dump(_candles(200, HOUR), f)
        with open(os.path.join(d, "h4.json"), "w") as f:
            json.dump(_candles(60, 4 * HOUR), f)
        self._old = os.environ.get("ICT_DATA_DIR")
        os.environ["ICT_DATA_DIR"] = self.tmp

    def tearDown(self):
        if self._old is None:
            os.environ.pop("ICT_DATA_DIR", None)
        else:
            os.environ["ICT_DATA_DIR"] = self._old

    def test_random_search_runs(self):
        res = optimize.search("killzone_fvg_ob", "testsym", timeframe="h1", n_trials=5,
                              metric="avgR", min_trades=0, warmup=10, seed=1)
        self.assertIn(res["backend"], ("optuna", "random"))
        self.assertEqual(res["trials"], 5)
        self.assertIsInstance(res["value"], float)
        self.assertIn("rr", res["params"])


if __name__ == "__main__":
    unittest.main()
