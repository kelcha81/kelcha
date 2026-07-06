import json
import os
import tempfile
import unittest

import seriescache
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
        seriescache.clear()

    def tearDown(self):
        if self._old is None:
            os.environ.pop("ICT_DATA_DIR", None)
        else:
            os.environ["ICT_DATA_DIR"] = self._old
        seriescache.clear()

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
        # fixture has no M1 data -> fills settle at bar granularity, and say so
        self.assertEqual(out["settlement"], "bar")
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

    def _count_fvg_calls(self, fn):
        """Run ``fn`` counting real FVG detector invocations from both the
        strategy pass and the annotations pass."""
        import annotations as annotations_mod
        import strategy as strategy_mod
        from ict.fvg import detect_fvgs as real
        calls = {"n": 0}

        def counting(*args, **kwargs):
            calls["n"] += 1
            return real(*args, **kwargs)

        strategy_mod.detect_fvgs = counting
        annotations_mod.detect_fvgs = counting
        try:
            fn()
        finally:
            strategy_mod.detect_fvgs = real
            annotations_mod.detect_fvgs = real
        return calls["n"]

    def test_detector_pass_shared_and_cached_across_requests(self):
        req = {"symbol": "testsym", "timeframe": "h1", "strategy": "killzone_fvg_ob",
               "htf": ["h4"], "warmup": 10}
        # one request = at most one FVG pass, shared by strategy + annotations.
        self.assertEqual(self._count_fvg_calls(lambda: server.run(req)), 1)
        # an identical request re-uses the cross-request detector cache.
        self.assertEqual(self._count_fvg_calls(lambda: server.run(req)), 0)


class TestContractSizesMirrorSymbolsTs(unittest.TestCase):
    """server._contract_size must track web/src/lib/symbols.ts — a symbol added
    there without updating the mirror gets 100k contract size and wildly wrong
    P&L (this bit ftse100/xauusd in the 11-symbol expansion)."""

    def test_contract_sizes(self):
        from ict.util import pip_size
        self.assertEqual(server._contract_size("eurusd"), 100000.0)   # forex
        self.assertEqual(server._contract_size("us30"), 1.0)          # index
        self.assertEqual(server._contract_size("ftse100"), 1.0)       # index (added 2026-07)
        self.assertEqual(server._contract_size("xauusd"), 100.0)      # gold, 100 oz/lot
        # pip scale parity with the front-end (move * 10^(prec-1)):
        self.assertAlmostEqual(pip_size(5), 0.0001)  # eurusd
        self.assertAlmostEqual(pip_size(3), 0.01)    # gbpjpy
        self.assertAlmostEqual(pip_size(2), 0.1)     # xauusd
        self.assertAlmostEqual(pip_size(1), 1.0)     # indices


class TestServerM1Settlement(unittest.TestCase):
    """When packaged M1 exists, /backtest walks it for fills and reports so."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        sym_dir = os.path.join(self.tmp, "testsym")
        os.makedirs(os.path.join(sym_dir, "m1"))
        with open(os.path.join(sym_dir, "manifest.json"), "w") as f:
            json.dump({"symbol": "testsym", "pricePrecision": 5,
                       "timeframes": {"h1": {"file": "h1.json"}, "h4": {"file": "h4.json"},
                                      "m1": {"chunks": ["m1/1970-01.json"]}}}, f)
        with open(os.path.join(sym_dir, "h1.json"), "w") as f:
            json.dump(_candles(200, HOUR), f)
        with open(os.path.join(sym_dir, "h4.json"), "w") as f:
            json.dump(_candles(60, 4 * HOUR), f)
        with open(os.path.join(sym_dir, "m1", "1970-01.json"), "w") as f:
            json.dump(_candles(600, 60_000), f)
        self._old = os.environ.get("ICT_DATA_DIR")
        os.environ["ICT_DATA_DIR"] = self.tmp
        seriescache.clear()

    def tearDown(self):
        if self._old is None:
            os.environ.pop("ICT_DATA_DIR", None)
        else:
            os.environ["ICT_DATA_DIR"] = self._old
        seriescache.clear()

    def test_settlement_reported_as_m1(self):
        req = {"symbol": "testsym", "timeframe": "h1", "strategy": "killzone_fvg_ob",
               "htf": [], "warmup": 10}
        out = server.run(req)
        self.assertEqual(out["settlement"], "m1")

    def test_fills_bar_opts_out(self):
        req = {"symbol": "testsym", "timeframe": "h1", "strategy": "killzone_fvg_ob",
               "htf": [], "warmup": 10, "fills": "bar"}
        out = server.run(req)
        self.assertEqual(out["settlement"], "bar")


if __name__ == "__main__":
    unittest.main()
