import unittest

from ai.sandbox import smoke_test

GOOD = """
from strategy import Strategy

class MyStrat(Strategy):
    params = {"rr": 2.0}

    def should_long(self):
        return False
"""

BAD_IMPORT = GOOD + "\nimport os\n"

RUNTIME_ERROR = """
from strategy import Strategy

class Boom(Strategy):
    params = {}

    def should_long(self):
        return 1 / 0
"""


class TestSandbox(unittest.TestCase):
    def test_good_strategy_runs(self):
        res = smoke_test(GOOD)
        self.assertTrue(res["ok"], res)
        self.assertIn("stats", res)
        self.assertEqual(res["stats"]["trades"], 0)

    def test_validation_blocks_before_execution(self):
        res = smoke_test(BAD_IMPORT)
        self.assertFalse(res["ok"])
        self.assertTrue(any("os" in e for e in res["errors"]))

    def test_runtime_error_is_caught(self):
        res = smoke_test(RUNTIME_ERROR)
        self.assertFalse(res["ok"])
        self.assertTrue(any("ZeroDivision" in e for e in res["errors"]), res)


if __name__ == "__main__":
    unittest.main()
