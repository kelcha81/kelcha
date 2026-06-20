import unittest

from engine import run_backtest
from strategy import Strategy
from ict.fvg import detect_fvgs
from tests.helpers import mk, MIN

# A bullish FVG [10, 11] confirmed at 2*MIN, mitigated at 4*MIN, then quiet.
CANDLES = [
    mk(0 * MIN, 5, 10, 4, 9),
    mk(1 * MIN, 9, 15, 9, 14),
    mk(2 * MIN, 14, 16, 11, 15),     # bull FVG [10, 11]
    mk(3 * MIN, 15, 15.5, 14.5, 15),
    mk(4 * MIN, 15, 15, 10.5, 12),   # taps the gap -> mitigated
    mk(5 * MIN, 12, 13, 11.5, 12),
    mk(6 * MIN, 12, 13, 11.5, 12),
]

KW = {"min_gap_atr": 0.0, "atr_period": 14}


def _key(e):
    return (e.type, e.direction, e.top, e.bottom, e.confirm_ts, e.mitigated_at)


class _Recorder(Strategy):
    params = {}

    def before(self):
        self.log.append((self.index, self.time, [_key(e) for e in self.fvgs(**KW)]))


class TestCachedDetectorsEquivalentToRecompute(unittest.TestCase):
    def test_matches_per_bar_recompute_and_no_lookahead(self):
        strat = _Recorder()
        strat.log = []
        run_backtest(strat, CANDLES, {}, contract_size=1, warmup=0)

        self.assertTrue(strat.log)
        for index, now, cached in strat.log:
            # 1) equivalent to detecting over only the bars seen so far
            expected = [_key(e) for e in detect_fvgs(CANDLES[: index + 1], **KW)]
            self.assertEqual(cached, expected, f"bar {index}")
            # 2) no event leaks from the future
            for _type, _dir, _top, _bot, confirm_ts, mitigated_at in cached:
                self.assertLessEqual(confirm_ts, now)
                if mitigated_at is not None:
                    self.assertLessEqual(mitigated_at, now)

    def test_mitigation_revealed_only_after_it_happens(self):
        strat = _Recorder()
        strat.log = []
        run_backtest(strat, CANDLES, {}, contract_size=1, warmup=0)
        by_index = {i: events for i, _now, events in strat.log}

        # bar 3: FVG known (confirmed at 2), not yet mitigated
        e3 = [e for e in by_index[3] if e[1] == "bull"]
        self.assertEqual(len(e3), 1)
        self.assertIsNone(e3[0][5])  # mitigated_at

        # bar 4: same FVG now shows mitigation at 4*MIN
        e4 = [e for e in by_index[4] if e[1] == "bull"]
        self.assertEqual(len(e4), 1)
        self.assertEqual(e4[0][5], 4 * MIN)


from ict.structure import structure_breaks  # noqa: E402

# HTF (h4) zigzag that produces BOS/MSS, placed on a 4*MIN grid.
H4 = [
    mk(0 * 4 * MIN, 10, 10, 5, 7),
    mk(1 * 4 * MIN, 9, 9, 3, 4),
    mk(2 * 4 * MIN, 10, 12, 6, 11),
    mk(3 * 4 * MIN, 8, 8, 5, 6),
    mk(4 * 4 * MIN, 10, 15, 10, 14),
    mk(5 * 4 * MIN, 14, 16, 11, 15),
    mk(6 * 4 * MIN, 13, 13, 9, 12),
    mk(7 * 4 * MIN, 12, 14, 10, 13),
    mk(8 * 4 * MIN, 12, 12, 7, 8),
]
BASE = [mk(i * MIN, 11, 11.2, 10.8, 11) for i in range(40)]


def _brk(e):
    return (e.type, e.direction, e.price, e.t_start, e.confirm_ts)


class _HtfRecorder(Strategy):
    params = {}

    def before(self):
        cached = [_brk(e) for e in self.breaks("h4", lookback=1)]
        manual = [_brk(e) for e in structure_breaks(self.get_candles("h4"), lookback=1)]
        self.log.append((self.index, cached, manual))


class TestHtfDetectorCacheEquivalence(unittest.TestCase):
    def test_cached_htf_breaks_match_per_bar_recompute(self):
        strat = _HtfRecorder()
        strat.log = []
        run_backtest(strat, BASE, {"h4": H4}, contract_size=1, warmup=0)
        self.assertTrue(strat.log)
        saw_break = False
        for index, cached, manual in strat.log:
            self.assertEqual(cached, manual, f"bar {index}")
            saw_break = saw_break or bool(cached)
        self.assertTrue(saw_break, "expected the fixture to produce at least one HTF break")


if __name__ == "__main__":
    unittest.main()
