import json
import os
import tempfile
import unittest

import server

HOUR = 3_600_000


def _candles(n, step):
    rows = []
    price = 1.1000
    for i in range(n):
        price += 0.0006 if (i // 8) % 2 == 0 else -0.0006
        rows.append({"timestamp": i * step, "open": price, "high": price + 0.0012,
                     "low": price - 0.0012, "close": price + 0.0005, "volume": 1})
    return rows


class TestServerRun(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        sym_dir = os.path.join(self.tmp, "testsym")
        os.makedirs(sym_dir)
        with open(os.path.join(sym_dir, "manifest.json"), "w") as f:
            json.dump({"symbol": "testsym", "pricePrecision": 5,
                       "timeframes": {"h1": {"file": "h1.json"}, "h4": {"file": "h4.json"}}}, f)
        with open(os.path.join(sym_dir, "h1.json"), "w") as f:
            json.dump(_candles(200, HOUR), f)
        with open(os.path.join(sym_dir, "h4.json"), "w") as f:
            json.dump(_candles(60, 4 * HOUR), f)
        self._old = os.environ.get("ICT_DATA_DIR")
        os.environ["ICT_DATA_DIR"] = self.tmp

    def tearDown(self):
        if self._old is None:
            os.environ.pop("ICT_DATA_DIR", None)
        else:
            os.environ["ICT_DATA_DIR"] = self._old

    def test_backtest_contract(self):
        out = server.run({
            "symbol": "testsym", "timeframe": "h1", "strategy": "killzone_fvg_ob",
            "htf": ["h4"], "warmup": 10, "account": {"balance": 5000},
        })
        self.assertIn("stats", out)
        self.assertIn("trades", out)
        self.assertIn("equity", out)
        self.assertIn("annotations", out)
        self.assertIsInstance(out["trades"], list)
        # equity uses the front-end's {timestamp, equity} keys
        self.assertEqual(set(out["equity"][0]), {"timestamp", "equity"})
        self.assertEqual(out["equity"][0]["equity"], 5000)
        # annotations are detector events ready for the chart
        self.assertTrue(out["annotations"])
        self.assertIn("type", out["annotations"][0])
        self.assertIn("tStart", out["annotations"][0])

    def test_optimize_contract(self):
        out = server.run_optimize({
            "symbol": "testsym", "timeframe": "h1", "strategy": "killzone_fvg_ob",
            "trials": 3, "min_trades": 0, "metric": "expectancy", "warmup": 10,
        })
        self.assertIn("params", out)
        self.assertIn("value", out)
        self.assertIn(out["backend"], ("optuna", "random"))
        self.assertEqual(out["trials"], 3)

    def test_calibrate_without_labels(self):
        out = server.run_calibrate({"symbol": "testsym", "timeframe": "h1"})
        self.assertFalse(out["ok"])
        self.assertIn("labels", out["error"].lower())


if __name__ == "__main__":
    unittest.main()
