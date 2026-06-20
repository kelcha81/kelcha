import os
import unittest

import strategies
from strategy import Strategy

USER_STRAT = """
from strategy import Strategy

class ZzTest(Strategy):
    params = {"foo": 1}
"""


class TestRegistry(unittest.TestCase):
    def test_builtin_discovered(self):
        reg = strategies.registry()
        self.assertIn("killzone_fvg_ob", reg)
        self.assertIsInstance(strategies.build("killzone_fvg_ob"), Strategy)
        self.assertIn("rr", strategies.default_params("killzone_fvg_ob"))

    def test_info_shape(self):
        info = strategies.info()
        e = info["killzone_fvg_ob"]
        self.assertIn("label", e)
        self.assertIn("params", e)
        self.assertIn("description", e)

    def test_source_of_builtin(self):
        src = strategies.source("killzone_fvg_ob")
        self.assertTrue(src["builtin"])
        self.assertIn("class KillzoneFvgOB", src["code"])

    def test_user_strategy_discovered_live(self):
        os.makedirs(strategies.USER_DIR, exist_ok=True)
        path = os.path.join(strategies.USER_DIR, "zztest.py")
        with open(path, "w", encoding="utf-8") as f:
            f.write(USER_STRAT)
        try:
            reg = strategies.registry()
            self.assertIn("zztest", reg)
            self.assertFalse(reg["zztest"]["builtin"])
            self.assertIsInstance(strategies.build("zztest"), Strategy)
        finally:
            os.remove(path)


if __name__ == "__main__":
    unittest.main()
