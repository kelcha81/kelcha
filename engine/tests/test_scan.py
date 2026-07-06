import random
import unittest

from ict.scan import FirstCross


def _naive_first(values, start, threshold, leq):
    for j in range(max(start, 0), len(values)):
        if (values[j] <= threshold) if leq else (values[j] >= threshold):
            return j
    return None


class TestFirstCross(unittest.TestCase):
    def test_edges(self):
        self.assertIsNone(FirstCross([], find_leq=True).first(0, 100.0))
        t = FirstCross([5.0], find_leq=True)
        self.assertEqual(t.first(0, 5.0), 0)
        self.assertIsNone(t.first(1, 5.0))
        self.assertIsNone(t.first(0, 4.9))
        self.assertEqual(t.first(-3, 5.0), 0)
        t = FirstCross([5.0], find_leq=False)
        self.assertEqual(t.first(0, 5.0), 0)
        self.assertIsNone(t.first(0, 5.1))

    def test_matches_linear_scan_on_random_series(self):
        rng = random.Random(20260706)
        for _trial in range(20):
            n = rng.randrange(1, 200)
            values = [round(rng.uniform(0.0, 100.0), 3) for _ in range(n)]
            for leq in (True, False):
                tree = FirstCross(values, find_leq=leq)
                for _q in range(50):
                    start = rng.randrange(0, n + 2)
                    threshold = round(rng.uniform(-10.0, 110.0), 3)
                    self.assertEqual(
                        tree.first(start, threshold),
                        _naive_first(values, start, threshold, leq),
                        f"n={n} start={start} threshold={threshold} leq={leq}",
                    )


if __name__ == "__main__":
    unittest.main()
