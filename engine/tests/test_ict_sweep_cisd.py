import json
import os
import tempfile
import unittest
from collections import deque
from datetime import datetime, timezone

import seriescache
import server
import strategies
from engine import run_backtest
from models import Account, Candle
from strategies.ict_sweep_cisd import (
    IctSweepCisd,
    _StructureTracker,
    _TfCandle,
    _auto_pip_size,
    _eval_tf_swings,
    _find_bear_cisd_tf,
    _find_bull_cisd_tf,
)
from strategy import Strategy
from tests.helpers import MIN, mk


def _utc_ms(y: int, mo: int, d: int, h: int, m: int = 0) -> int:
    return int(datetime(y, mo, d, h, m, tzinfo=timezone.utc).timestamp() * 1000)


class TestCisdComponents(unittest.TestCase):
    def test_registry_and_required_htf(self):
        reg = strategies.registry()
        self.assertIn("ict_sweep_cisd", reg)
        info = strategies.info()["ict_sweep_cisd"]
        for k, v in info["params"].items():
            self.assertIsInstance(v, (int, float), f"param {k} should be numeric for UI/optimize")
        self.assertEqual(strategies.required_htf("ict_sweep_cisd", "m5"), ["d1", "h1"])
        self.assertEqual(strategies.required_htf("ict_sweep_cisd", "m15"), ["d1", "h1", "h4"])

    def test_auto_pip_size(self):
        self.assertAlmostEqual(_auto_pip_size("eurusd", 5, "forex"), 0.0001)
        self.assertAlmostEqual(_auto_pip_size("gbpjpy", 3, "forex"), 0.01)
        self.assertAlmostEqual(_auto_pip_size("xauusd", 2, "metal"), 0.1)
        self.assertAlmostEqual(_auto_pip_size("nas100", 1, "index"), 1.0)
        self.assertAlmostEqual(_auto_pip_size("ftse100", 1, "index"), 1.0)

    def test_structure_tracker_bos_and_mss(self):
        tr = _StructureTracker(pivot_len=1)
        # Build swing high at 105 (idx 1), swing low at 95 (idx 4), then close > 105 -> bull, then < 95 -> bear
        bars = [
            mk(0, 100, 102, 99, 101),
            mk(1, 101, 105, 100, 104),   # SH = 105 (confirmed at idx 2)
            mk(2, 104, 103, 98, 99),
            mk(3, 99, 100, 96, 97),
            mk(4, 97, 98, 95, 96),       # SL = 95 (confirmed at idx 5)
            mk(5, 96, 101, 96, 100),
            mk(6, 100, 107, 100, 106),   # close 106 > 105 -> bull (+1)
            mk(7, 106, 106, 94, 94.5),   # close 94.5 < 95 -> bear (-1)
        ]
        biases = [tr.push(b) for b in bars]
        self.assertEqual(biases[6], 1)
        self.assertEqual(biases[7], -1)

    def test_bull_cisd_contiguous_delivery_and_doji_bridge(self):
        # arr[0] is newest: down, doji, down, up -> should anchor at index 2 (oldest contiguous down candle)
        arr = deque([
            _TfCandle(1.1010, 1.1012, 1.0990, 1.0995, 13, 13, 13, 13),  # c0: bear, low 1.0990
            _TfCandle(1.1010, 1.1015, 1.1005, 1.1010, 12, 12, 12, 12),  # c1: doji (c == o)
            _TfCandle(1.1025, 1.1028, 1.1008, 1.1010, 11, 11, 11, 11),  # c2: bear -> anchor!
            _TfCandle(1.1000, 1.1026, 1.0998, 1.1025, 10, 10, 10, 10),  # c3: bull -> stop
        ])
        lvl, anc = _find_bull_cisd_tf(arr, 20)
        self.assertAlmostEqual(lvl, 1.1025)
        self.assertEqual(anc, 11)

    def test_bear_cisd_stops_if_earlier_candle_made_higher_high(self):
        arr = deque([
            _TfCandle(1.1010, 1.1020, 1.1005, 1.1018, 21, 21, 21, 21),  # c0: bull, h=1.1020
            _TfCandle(1.1000, 1.1025, 1.0998, 1.1010, 20, 20, 20, 20),  # c1: h=1.1025 > c0.h -> stop!
        ])
        lvl, anc = _find_bear_cisd_tf(arr, 20)
        self.assertAlmostEqual(lvl, 1.1010)
        self.assertEqual(anc, 21)

    def test_eval_tf_swings_strict_right_nonstrict_left(self):
        arr = deque([
            _TfCandle(100, 103, 99, 100, 2, 2, 2, 2),   # right (r=0): h=103 < 105
            _TfCandle(100, 105, 99, 102, 1, 1, 1, 1),   # center (p=1): h=105
            _TfCandle(100, 105, 98, 100, 0, 0, 0, 0),   # left (l=2): equal h=105 allowed
        ])
        has_sh, sh_p, sh_b, has_sl, _, _ = _eval_tf_swings(arr, 1)
        self.assertTrue(has_sh)
        self.assertAlmostEqual(sh_p, 105.0)
        self.assertEqual(sh_b, 1)
        self.assertFalse(has_sl)


class TestM1LimitFillOrdering(unittest.TestCase):
    """Verify pending limit orders cannot close on an M1 bar BEFORE they fill."""

    def test_limit_order_ignores_pre_fill_tp_touch_in_m1_subpath(self):
        class _PlaceLimit(Strategy):
            def should_long(self) -> bool:
                return self.index == 0

            def go_long(self):
                self.buy_limit(1.0, price=99.0, sl=97.0, tp=103.0)

        base = [
            mk(0 * 5 * MIN, 100.0, 101.0, 99.5, 100.0),   # bar 0: submits buy_limit @ 99, sl 97, tp 103
            mk(1 * 5 * MIN, 100.0, 104.0, 98.5, 99.2),    # bar 1: spikes to 104 FIRST, then dips to 98.5 (fills!)
            mk(2 * 5 * MIN, 99.2, 99.5, 96.5, 97.0),      # bar 2: hits SL 97
        ]
        m1 = [
            # minute 0: touches TP 104 BEFORE limit 99 is ever touched!
            mk(1 * 5 * MIN + 0 * MIN, 100.0, 104.0, 99.8, 101.0),
            # minute 1: drops to 98.5 -> fills buy_limit at 99.0 (does NOT hit SL 97 or TP 103)
            mk(1 * 5 * MIN + 1 * MIN, 101.0, 101.0, 98.5, 99.2),
            # bar 2 minute 0: drops to SL 97
            mk(2 * 5 * MIN + 0 * MIN, 99.2, 99.3, 96.5, 97.0),
        ]
        res = run_backtest(_PlaceLimit(), base, {}, m1=m1, contract_size=1.0, warmup=0)
        self.assertEqual(len(res.trades), 1)
        t = res.trades[0]
        # Must NOT have falsely closed at TP 103 on minute 0! Must fill at 99 on min 1 and lose at SL 97 on bar 2.
        self.assertAlmostEqual(t.entryPrice, 99.0)
        self.assertEqual(t.entryTime, 1 * 5 * MIN + 1 * MIN)
        self.assertEqual(t.reason, "sl")
        self.assertAlmostEqual(t.exitPrice, 97.0)


class TestEndToEndCisdPipeline(unittest.TestCase):
    """Build a realistic synthetic M5 + H1 + D1 bullish setup and test all 3 entry modes."""

    def _build_bullish_fixture(self, d1_range: float = 0.0200, spike_high: float = 1.1120):
        # 2024-01-16 is a Tuesday in EST (UTC-5). London KZ = 02:00-05:00 ET = 07:00-10:00 UTC.
        # 1) Daily candles (16 days up-trending -> bull bias + d1_range ADR)
        d1 = []
        base_d = _utc_ms(2024, 1, 1, 22, 0)
        px = 1.0800
        for i in range(16):
            o = px
            h = px + d1_range * 0.75
            l = px - d1_range * 0.25
            c = px + 0.0050
            d1.append(mk(base_d + i * 86_400_000, o, h, l, c))
            px = c

        # 2) H1 candles up-trending prior to 07:00 UTC on 2024-01-16 -> bull 1H bias
        h1 = []
        start_h1 = _utc_ms(2024, 1, 15, 0, 0)
        hpx = 1.0950
        for i in range(31):  # up to 2024-01-16 06:00 UTC
            o = hpx
            h = hpx + 0.0015
            l = hpx - 0.0008
            c = hpx + 0.0006
            h1.append(mk(start_h1 + i * 3_600_000, o, h, l, c))
            hpx = c

        m5 = []

        def add_hour_m5(hour_utc: int, bars_spec: list[tuple[float, float, float, float]]):
            t0 = _utc_ms(2024, 1, 16, hour_utc, 0)
            for idx, (o, h, l, c) in enumerate(bars_spec):
                m5.append(mk(t0 + idx * 5 * MIN, o, h, l, c))

        # 02:00 UTC (21:00 ET - Asia session) -> builds Asia range [1.1000, 1.1050]
        add_hour_m5(2, [
            (1.1010, 1.1020, 1.1005, 1.1015),
            (1.1015, 1.1050, 1.1012, 1.1040),
            (1.1040, 1.1045, 1.1000, 1.1010),
        ] + [(1.1010, 1.1020, 1.1005, 1.1012)] * 9)

        # 03:00 UTC (22:00 ET - Asia): H1 high=1.1015, low=1.1002, close=1.1012
        add_hour_m5(3, [(1.1010, 1.1015, 1.1002, 1.1012)] * 12)

        # 04:00 UTC (23:00 ET - Asia): Strong bull H1 candle -> 1.1012 to 1.1035
        add_hour_m5(4, [
            (1.1012, 1.1020, 1.1010, 1.1018),
            (1.1018, 1.1028, 1.1016, 1.1025),
            (1.1025, 1.1038, 1.1024, 1.1035),
        ] + [(1.1034, 1.1038, 1.1028, 1.1035)] * 9)

        # 05:00 UTC (00:00 ET - Asia ends, ready=True with lo=1.1000):
        # H1 low=1.1026 > 03:00 H1 high=1.1015 -> creates 1H Bull FVG [1.1015, 1.1026]!
        # Also spikes to spike_high so 05:00 forms a 1H Swing High (BSL target)!
        mid_hi = min(1.1095, spike_high)
        mid_open = min(1.1090, spike_high - 0.0005)
        add_hour_m5(5, [
            (1.1035, spike_high, 1.1026, mid_open),
        ] + [(mid_open, mid_hi, 1.1040, min(1.1050, mid_hi))] * 11)

        # 06:00 UTC (01:00 ET): pulls back above 1H FVG (low=1.1028) and closes slightly bullish (not doji!)
        add_hour_m5(6, [
            (min(1.1050, mid_hi), min(1.1055, spike_high), 1.1035, 1.1040),
            (1.1040, 1.1042, 1.1028, 1.1032),
        ] + [(1.1031, 1.1038, 1.1028, 1.1033)] * 10)

        # 07:00 UTC (02:00 ET -> LONDON KILLZONE!):
        # Bar 0 (07:00): Down delivery candle sweeping low into 1H Bull FVG [1.1015, 1.1026]:
        #   o=1.1033, h=1.1034, l=1.1018, c=1.1020 -> arms bull sweep (extreme=1.1018, cisd_level=1.1033)
        # Bar 1 (07:05): Bullish displacement closing above 1.1033 -> +CISD confirmed!
        # Bar 2 (07:10): Continuation making impulse high 1.1056 (leaves M5 bull FVG [1.1034, 1.1040])
        # Bar 3 (07:15): Pullback bar (high 1.1050 < 1.1056 -> confirms OTE SH @ 1.1056; 0.62 = 1.103244)
        # Bar 4 (07:20): Retraces to 1.1030 (taps 0.62 OTE, CISD 1.1033, FVG 1.1040) and closes 1.1038 (> 0.79)
        # Bar 5..6: Rallies to 1.1110 -> hits strict 2.0R TP!
        add_hour_m5(7, [
            (1.1033, 1.1034, 1.1018, 1.1020),   # 0: sweep into 1H FVG
            (1.1020, 1.1045, 1.1020, 1.1042),   # 1: +CISD confirm (close 1.1042 > 1.1033)
            (1.1042, 1.1056, 1.1040, 1.1052),   # 2: impulse high 1.1056 + M5 bull FVG [1.1034, 1.1040]
            (1.1052, 1.1050, 1.1038, 1.1042),   # 3: confirms OTE SH @ 1.1056
            (1.1042, 1.1044, 1.1030, 1.1038),   # 4: taps OTE 0.62 & CISD & FVG, closes 1.1038
            (1.1038, 1.1070, 1.1036, 1.1068),   # 5: rally
            (1.1068, 1.1110, 1.1065, 1.1105),   # 6: hits 2R TP!
            (1.1105, 1.1112, 1.1095, 1.1100),
            (1.1100, 1.1105, 1.1090, 1.1095),
            (1.1095, 1.1100, 1.1088, 1.1092),
            (1.1092, 1.1096, 1.1085, 1.1090),
            (1.1090, 1.1094, 1.1084, 1.1088),
        ])
        return m5, h1, d1

    def test_return_to_ote_limit_hits_2r_tp(self):
        m5, h1, d1 = self._build_bullish_fixture()
        strat = IctSweepCisd({"entry_mode": 0, "exec_type": 0})
        res = run_backtest(strat, m5, {"h1": h1, "d1": d1}, contract_size=100000.0,
                           price_precision=5, warmup=10, symbol="eurusd", timeframe="m5",
                           asset_class="forex", account=Account(balance=10000.0))
        self.assertGreaterEqual(strat.counters["cisd_passed"], 1)
        self.assertEqual(len(res.trades), 1)
        t = res.trades[0]
        self.assertEqual(t.side, "long")
        self.assertEqual(t.reason, "tp")
        self.assertGreater(t.pnl, 0.0)
        # Strict 2R ratio
        self.assertAlmostEqual(t.pnl / t.risk, 2.0, places=2)
        self.assertIn("1H FVG", t.tags or "")

    def test_return_to_ote_candle_close_hits_2r_tp(self):
        m5, h1, d1 = self._build_bullish_fixture()
        strat = IctSweepCisd({"entry_mode": 0, "exec_type": 1})
        res = run_backtest(strat, m5, {"h1": h1, "d1": d1}, contract_size=100000.0,
                           price_precision=5, warmup=10, symbol="eurusd", timeframe="m5",
                           asset_class="forex", account=Account(balance=10000.0))
        self.assertEqual(len(res.trades), 1)
        self.assertEqual(res.trades[0].reason, "tp")

    def test_return_to_cisd_break_and_fvg_modes(self):
        m5, h1, d1 = self._build_bullish_fixture()
        for mode in (1, 2):
            strat = IctSweepCisd({"entry_mode": mode, "exec_type": 0})
            res = run_backtest(strat, m5, {"h1": h1, "d1": d1}, contract_size=100000.0,
                               price_precision=5, warmup=10, symbol="eurusd", timeframe="m5",
                               asset_class="forex", account=Account(balance=10000.0))
            self.assertEqual(len(res.trades), 1, f"expected 1 trade for entry_mode={mode}")
            self.assertEqual(res.trades[0].reason, "tp", f"expected TP win for entry_mode={mode}")

    def test_1h_fvg_not_retired_on_wick_only_body_close(self):
        m5, h1, d1 = self._build_bullish_fixture()
        strat = IctSweepCisd({"entry_mode": 0, "exec_type": 0})
        run_backtest(strat, m5, {"h1": h1, "d1": d1}, contract_size=100000.0,
                     price_precision=5, warmup=10, symbol="eurusd", timeframe="m5")
        # 1H FVG [1.1015, 1.1026] was tapped by 07:00 bar (low 1.1018) and closed at 1.1088 -> must stay unmitigated!
        active_bull_fvgs = [f for f in strat._h1_fvgs if f.is_bull and not f.mitigated]
        self.assertGreaterEqual(len(active_bull_fvgs), 1)

    def test_adr_exhaustion_blocks_late_continuation(self):
        # Keep today's high near 1.1050 so CISD confirm @ 1.1042 is in the top 30% of today's range
        # while ADR is tiny (0.0020 -> adr_used_pct > 200% >= max_adr_pct)
        m5, h1, d1 = self._build_bullish_fixture(d1_range=0.0020, spike_high=1.1050)
        strat = IctSweepCisd({"entry_mode": 0, "exec_type": 0, "use_adr_filter": 1, "max_adr_pct": 90.0})
        res = run_backtest(strat, m5, {"h1": h1, "d1": d1}, contract_size=100000.0,
                           price_precision=5, warmup=10, symbol="eurusd", timeframe="m5")
        self.assertEqual(strat.counters["cisd_passed"], 0)
        self.assertEqual(len(res.trades), 0)

    def test_server_integration_auto_loads_multi_htf(self):
        m5, h1, d1 = self._build_bullish_fixture()
        tmp = tempfile.mkdtemp()
        sym_dir = os.path.join(tmp, "eurusd")
        os.makedirs(sym_dir)
        with open(os.path.join(sym_dir, "manifest.json"), "w") as f:
            json.dump({
                "symbol": "eurusd",
                "pricePrecision": 5,
                "instrument": {"symbol": "eurusd", "assetClass": "forex", "contractSize": 100000},
                "timeframes": {"m5": {"file": "m5.json"}, "h1": {"file": "h1.json"}, "d1": {"file": "d1.json"}},
            }, f)

        def dump_bars(path, bars):
            with open(path, "w") as fh:
                json.dump([{"timestamp": b.timestamp, "open": b.open, "high": b.high,
                            "low": b.low, "close": b.close, "volume": 1} for b in bars], fh)

        dump_bars(os.path.join(sym_dir, "m5.json"), m5)
        dump_bars(os.path.join(sym_dir, "h1.json"), h1)
        dump_bars(os.path.join(sym_dir, "d1.json"), d1)

        old = os.environ.get("ICT_DATA_DIR")
        os.environ["ICT_DATA_DIR"] = tmp
        seriescache.clear()
        try:
            out = server.run({
                "symbol": "eurusd",
                "timeframe": "m5",
                "strategy": "ict_sweep_cisd",
                "warmup": 10,
                "fills": "bar",
            })
            self.assertEqual(out["stats"]["trades"], 1)
            self.assertGreater(out["stats"]["totalPnl"], 0.0)
        finally:
            if old is None:
                os.environ.pop("ICT_DATA_DIR", None)
            else:
                os.environ["ICT_DATA_DIR"] = old
            seriescache.clear()


if __name__ == "__main__":
    unittest.main()
