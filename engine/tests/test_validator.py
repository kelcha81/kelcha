import unittest

from ai.validator import validate_code, is_valid

GOOD = """
from strategy import Strategy

class MyStrat(Strategy):
    params = {"rr": 2.0}

    def should_long(self):
        return False
"""


class TestValidator(unittest.TestCase):
    def test_clean_strategy_passes(self):
        self.assertEqual(validate_code(GOOD), [])
        self.assertTrue(is_valid(GOOD))

    def test_rejects_forbidden_import(self):
        errs = validate_code(GOOD + "\nimport os\n")
        self.assertTrue(any("import not allowed" in e and "os" in e for e in errs))

    def test_rejects_open_and_eval(self):
        code = GOOD + "\n    def go_long(self):\n        open('x'); eval('1')\n"
        errs = validate_code(code)
        self.assertTrue(any("open" in e for e in errs))
        self.assertTrue(any("eval" in e for e in errs))

    def test_rejects_dunder_escape(self):
        code = GOOD + "\n    def after(self):\n        ().__class__.__bases__\n"
        self.assertTrue(any("dunder" in e for e in validate_code(code)))

    def test_requires_strategy_subclass(self):
        self.assertIn(
            "no Strategy subclass found (define `class X(Strategy): ...`)",
            validate_code("from strategy import Strategy\nx = 1\n"),
        )

    def test_syntax_error_reported(self):
        self.assertTrue(validate_code("def (:")[0].startswith("syntax error"))


if __name__ == "__main__":
    unittest.main()
