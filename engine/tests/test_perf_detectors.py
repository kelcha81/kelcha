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


# ---------------------------------------------------------------------------
# The detectors' first-crossing scans were rewritten from per-event forward
# loops (quadratic on long series) to FirstCross queries. The reference
# implementations below are the original algorithms, kept verbatim so the fast
# paths must reproduce them event-for-event on arbitrary series.
# ---------------------------------------------------------------------------
import random  # noqa: E402
import time  # noqa: E402

from ict.liquidity import liquidity_sweeps  # noqa: E402
from ict.orderblock import detect_order_blocks  # noqa: E402
from ict.structure import find_swings  # noqa: E402
from ict.util import atr  # noqa: E402
from models import ICTEvent  # noqa: E402


def _naive_mitigation(candles, start, direction, top, bottom):
    for j in range(start, len(candles)):
        c = candles[j]
        if direction == "bull" and c.low <= top:
            return c.timestamp
        if direction == "bear" and c.high >= bottom:
            return c.timestamp
    return None


def _naive_fvgs(candles, min_gap=0.0, atr_period=14, min_gap_atr=0.0):
    n = len(candles)
    if n < 3:
        return []
    a = atr(candles, atr_period) if min_gap_atr > 0 else None
    out = []
    for i in range(1, n - 1):
        prev, mid, nxt = candles[i - 1], candles[i], candles[i + 1]
        floor = min_gap
        if a is not None:
            floor = max(floor, min_gap_atr * a[i])
        direction = top = bottom = None
        if prev.high < nxt.low and (nxt.low - prev.high) >= floor:
            direction, bottom, top = "bull", prev.high, nxt.low
        elif prev.low > nxt.high and (prev.low - nxt.high) >= floor:
            direction, bottom, top = "bear", nxt.high, prev.low
        if direction is None:
            continue
        mitigated_at = _naive_mitigation(candles, i + 2, direction, top, bottom)
        out.append(ICTEvent(
            type="fvg", direction=direction,
            t_start=mid.timestamp, t_end=mitigated_at,
            top=top, bottom=bottom, strength=(top - bottom),
            confirm_ts=nxt.timestamp, mitigated_at=mitigated_at,
            meta={"midTs": mid.timestamp},
        ))
    return out


def _naive_last_opposite(candles, i, want_down):
    for j in range(i - 1, -1, -1):
        c = candles[j]
        if want_down and c.close < c.open:
            return j
        if not want_down and c.close > c.open:
            return j
    return None


def _naive_order_blocks(candles, atr_period=14, displacement_atr=1.5, body_only=False):
    n = len(candles)
    if n < 2:
        return []
    a = atr(candles, atr_period)
    out = []
    for i in range(1, n):
        c = candles[i]
        if a[i] <= 0:
            continue
        move = c.close - c.open
        if abs(move) / a[i] < displacement_atr:
            continue
        up = move > 0
        j = _naive_last_opposite(candles, i, want_down=up)
        if j is None:
            continue
        ob = candles[j]
        top = ob.body_top if body_only else ob.high
        bottom = ob.body_bottom if body_only else ob.low
        direction = "bull" if up else "bear"
        mitigated_at = _naive_mitigation(candles, i + 1, direction, top, bottom)
        out.append(ICTEvent(
            type="order_block", direction=direction,
            t_start=ob.timestamp, t_end=mitigated_at, top=top, bottom=bottom,
            strength=abs(move) / a[i], confirm_ts=c.timestamp, mitigated_at=mitigated_at,
            meta={"originTs": ob.timestamp, "displacementTs": c.timestamp},
        ))
    return out


def _naive_sweeps(candles, lookback=2):
    sw = find_swings(candles, lookback)
    si = 0
    highs, lows, out = [], [], []
    for c in candles:
        while si < len(sw) and sw[si].confirm_ts <= c.timestamp:
            (highs if sw[si].kind == "high" else lows).append(sw[si])
            si += 1
        ref_high = max((s for s in highs), key=lambda s: s.timestamp, default=None)
        if ref_high is not None and c.high > ref_high.price and c.close < ref_high.price:
            out.append(ICTEvent(
                type="liquidity_sweep", direction="bear", t_start=c.timestamp,
                price=ref_high.price, confirm_ts=c.timestamp,
                meta={"side": "buy", "sweptTs": ref_high.timestamp},
            ))
            highs = [s for s in highs if s.price > c.high]
        ref_low = max((s for s in lows), key=lambda s: s.timestamp, default=None)
        if ref_low is not None and c.low < ref_low.price and c.close > ref_low.price:
            out.append(ICTEvent(
                type="liquidity_sweep", direction="bull", t_start=c.timestamp,
                price=ref_low.price, confirm_ts=c.timestamp,
                meta={"side": "sell", "sweptTs": ref_low.timestamp},
            ))
            lows = [s for s in lows if s.price < c.low]
    return out


def _naive_breaks(candles, lookback=2):
    sw = find_swings(candles, lookback)
    si = 0
    active_highs, active_lows = [], []
    trend = 0
    events = []
    for c in candles:
        while si < len(sw) and sw[si].confirm_ts <= c.timestamp:
            (active_highs if sw[si].kind == "high" else active_lows).append(sw[si])
            si += 1
        ref_high = max((s for s in active_highs), key=lambda s: s.timestamp, default=None)
        if ref_high is not None and c.close > ref_high.price:
            kind = "mss" if trend == -1 else "bos"
            events.append(ICTEvent(
                type=kind, direction="bull", t_start=c.timestamp, price=ref_high.price,
                confirm_ts=c.timestamp,
                meta={"brokenSwingTs": ref_high.timestamp, "trendBefore": trend},
            ))
            trend = 1
            active_highs = [s for s in active_highs if s.price > c.close]
            continue
        ref_low = max((s for s in active_lows), key=lambda s: s.timestamp, default=None)
        if ref_low is not None and c.close < ref_low.price:
            kind = "mss" if trend == 1 else "bos"
            events.append(ICTEvent(
                type=kind, direction="bear", t_start=c.timestamp, price=ref_low.price,
                confirm_ts=c.timestamp,
                meta={"brokenSwingTs": ref_low.timestamp, "trendBefore": trend},
            ))
            trend = -1
            active_lows = [s for s in active_lows if s.price < c.close]
    return events


def _walk(seed, n, vol=1.0, spike_every=0.12, spike_mult=5.0):
    """Random-walk candles with occasional displacement spikes (creates gaps)."""
    rng = random.Random(seed)
    out = []
    price = 100.0
    for i in range(n):
        o = price
        body = (rng.random() - 0.5) * 2 * vol
        if rng.random() < spike_every:
            body *= spike_mult
        c = o + body
        h = max(o, c) + rng.random() * vol * 0.3
        low = min(o, c) - rng.random() * vol * 0.3
        out.append(mk(i * MIN, o, h, low, c))
        price = c
    return out


class TestScanRewriteEquivalence(unittest.TestCase):
    """Fast detector scans must match the original algorithms exactly."""

    def setUp(self):
        self.regimes = [_walk(7, 800), _walk(41, 800, vol=0.4, spike_every=0.25),
                        _walk(99, 500, vol=2.0)]

    def test_fvg_equivalence(self):
        total = 0
        for candles in self.regimes:
            for kw in ({}, {"min_gap_atr": 0.5}, {"min_gap": 0.8}):
                expected = _naive_fvgs(candles, **kw)
                self.assertEqual(detect_fvgs(candles, **kw), expected)
                total += len(expected)
        self.assertGreater(total, 10, "fixtures produced too few FVGs to be meaningful")

    def test_order_block_equivalence(self):
        total = 0
        for candles in self.regimes:
            for kw in ({"displacement_atr": 1.2}, {"displacement_atr": 1.8, "body_only": True}):
                expected = _naive_order_blocks(candles, **kw)
                self.assertEqual(detect_order_blocks(candles, **kw), expected)
                total += len(expected)
        self.assertGreater(total, 10, "fixtures produced too few OBs to be meaningful")

    def test_sweep_and_break_equivalence(self):
        total = 0
        for candles in self.regimes:
            for lookback in (1, 2):
                sweeps = _naive_sweeps(candles, lookback)
                self.assertEqual(liquidity_sweeps(candles, lookback), sweeps)
                breaks = _naive_breaks(candles, lookback)
                self.assertEqual(structure_breaks(candles, lookback), breaks)
                total += len(sweeps) + len(breaks)
        self.assertGreater(total, 10, "fixtures produced too few events to be meaningful")


class TestDetectorScanBudget(unittest.TestCase):
    """
    Worst-case series that made the old scans quadratic (events that never
    mitigate, swings that never break) must now complete comfortably fast.
    The old implementations take minutes on these fixtures; the budget is
    generous so slow CI boxes don't flake.
    """

    BUDGET_S = 6.0

    def test_worst_case_series_within_budget(self):
        # Rising series: every triple forms a never-mitigated bull FVG; every
        # bar is an up-close displacement whose OB origin (bar 0) never re-taps.
        n = 20_000
        rising = [mk(0, 2.0, 2.2, 0.8, 1.0)]  # down close -> OB origin exists
        for i in range(1, n):
            o = float(i)
            rising.append(mk(i * MIN, o, o + 1.0, o - 0.2, o + 0.9))

        # Contracting zigzag: swing highs/lows accumulate and are never broken
        # or swept, so the active-swing lists grow to ~n/3 entries.
        zig = []
        t = 0
        for k in range(10_000):
            peak = 200.0 - k * 1e-3
            trough = 100.0 + k * 1e-3
            zig.append(mk(t * MIN, 150.0, peak, 149.0, 151.0)); t += 1
            zig.append(mk(t * MIN, 151.0, 152.0, trough, 150.0)); t += 1
            zig.append(mk(t * MIN, 150.0, 151.0, 149.5, 150.5)); t += 1

        started = time.perf_counter()
        fvgs = detect_fvgs(rising)
        obs = detect_order_blocks(rising, displacement_atr=0.0)
        sweeps = liquidity_sweeps(zig, lookback=1)
        breaks = structure_breaks(zig, lookback=1)
        elapsed = time.perf_counter() - started

        self.assertGreater(len(fvgs), n - 10)
        self.assertGreater(len(obs), n - 10)
        self.assertTrue(all(e.mitigated_at is None for e in fvgs))
        self.assertEqual(sweeps, [])
        self.assertEqual(breaks, [])
        self.assertLess(elapsed, self.BUDGET_S,
                        f"worst-case detector pass took {elapsed:.2f}s")


if __name__ == "__main__":
    unittest.main()
