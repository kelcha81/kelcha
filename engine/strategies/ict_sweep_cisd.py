"""
ICT Sweep -> CISD Model (faithful streaming Python port of ICT_Sweep_CISD_Model.pine).

Mechanical 5-stage non-repainting pipeline built for multi-year M5/M15 backtesting:

  1. HTF Directional Bias (Daily + 1H confirmed body-close BOS/MSS on closed bars).
  2. 1H Areas of Interest (1H FVG, contiguous-series 1H OB, 1H DOL Swings) with
     distal-body-close retirement and live intracandle 1H tracking.
  3. Multi-Source Liquidity Sweeps (LTF Swings, 1H DOL Swings, completed NY-time
     Asia/London/NYAM Session pools, HTF C2 Prev Candle H/L, optional PDH/PDL)
     plus multi-timeframe CISD anchor & dynamic deeper-sweep re-anchoring.
  4. Deterministic 0-100% TTrades probability scoring + 14-day ADR exhaustion gate.
  5. Three entry trigger modes (Return to OTE, Return to CISD Break, Return to FVG)
     x two execution modes (Limit at Level, Candle Close), volatility-scaled SL
     buffer (FX ADR floor), and strict 2.0R minimum take-profit target.

All params are numeric so the front-end parameter form and ``optimize.py`` can
drive them directly:
  - entry_mode:        0 = Return to OTE, 1 = Return to CISD Break, 2 = Return to FVG (CISD)
  - exec_type:         0 = Limit at Level, 1 = Candle Close
  - alignment_rule:    0 = Daily + 1H, 1 = 1H Only, 2 = Daily Only, 3 = Bias Off
  - prob_filter_mode:  0 = Require 1H AOI + Min Prob %, 1 = 1H AOI Only, 2 = Min Prob % Only
  - sl_vol_scaling:    0 = Fixed Pips Only, 1 = FX ADR Floor, 2 = All Assets ADR Floor
  - entry_kz_rule:     0 = At CISD or Entry, 1 = At Entry Bar Only, 2 = Ignore KZ
  - cisd_filter_mode:  0 = KZ + HTF Aligned, 1 = Killzone Only, 2 = HTF Aligned Only, 3 = All
  - ote_leg_mode:      0 = First Post-CISD Leg, 1 = Follow Dealing Range
"""

from __future__ import annotations

import math
from collections import deque
from dataclasses import dataclass
from typing import Optional

import sessions
from candles import TF_MINUTES
from models import Candle
from strategy import Strategy


# ---------------------------------------------------------------------------
# Internal streaming state structures
# ---------------------------------------------------------------------------

@dataclass(slots=True)
class _TfCandle:
    o: float
    h: float
    l: float
    c: float
    start_bar: int
    end_bar: int
    h_bar: int
    l_bar: int


@dataclass(slots=True)
class _SwingPoint:
    price: float
    bar_idx: int


@dataclass(slots=True)
class _SessionPool:
    name: str
    hi: Optional[float] = None
    hi_bar: int = -1
    hi_swept: bool = False
    lo: Optional[float] = None
    lo_bar: int = -1
    lo_swept: bool = False
    building: bool = False
    ready: bool = False
    prev_in_sess: bool = False


@dataclass(slots=True)
class _AoiZone:
    top: float
    bottom: float
    start_bar: int
    is_bull: bool
    mitigated: bool = False


@dataclass(slots=True)
class _AoiSwing:
    price: float
    anchor_bar: int
    is_high: bool
    swept: bool = False
    swept_bar: int = -1


@dataclass(slots=True)
class _ActiveSetup:
    active: bool = False
    raid_start_bar: int = -1
    last_extreme_bar: int = -1
    swept_level: float = math.nan
    swept_source: str = ""
    extreme: float = math.nan
    bars_beyond_level: int = 0
    reclaimed_level: bool = False
    cisd_level: Optional[float] = None
    cisd_anchor_bar: int = -1
    cisd_confirmed: bool = False
    cisd_confirm_bar: int = -1
    started_valid: bool = False
    started_in_kz: bool = False
    confirmed_in_kz: bool = False
    prob_score: int = 0
    has_1h_aoi: bool = False
    aoi_in_zone: bool = False
    aoi_summary: str = ""
    setup_passed: bool = False
    opp_dol_target: Optional[float] = None
    leg_origin_price: float = math.nan
    leg_origin_bar: int = -1
    leg_target_price: float = math.nan
    leg_target_bar: int = -1
    leg_confirmed: bool = False
    eq_reached: bool = False
    pending_origin_p: Optional[float] = None
    pending_origin_b: int = -1
    ote_locked: bool = False
    signal_fired: bool = False
    fib050: float = math.nan
    fib062: float = math.nan
    fib079: float = math.nan
    entry_fvg_found: bool = False
    entry_fvg_top: float = math.nan
    entry_fvg_bot: float = math.nan
    entry_fvg_bar: int = -1


@dataclass(slots=True)
class _OrderIntent:
    kind: str       # 'limit' | 'market'
    side: str       # 'long' | 'short'
    price: float
    sl: float
    tp: float
    tags: str
    note: str


class _StructureTracker:
    """Incremental port of Pine's ``calcStructureBias(pivotLen)`` (no lookahead)."""

    __slots__ = ("pivot_len", "candles", "last_ph", "prev_ph", "last_pl", "prev_pl",
                 "ms_bias", "bias")

    def __init__(self, pivot_len: int = 2):
        self.pivot_len = max(1, pivot_len)
        self.candles: deque[Candle] = deque(maxlen=2 * self.pivot_len + 1)
        self.last_ph: Optional[float] = None
        self.prev_ph: Optional[float] = None
        self.last_pl: Optional[float] = None
        self.prev_pl: Optional[float] = None
        self.ms_bias: int = 0
        self.bias: int = 0

    def push(self, c: Candle) -> int:
        self.candles.append(c)
        L = self.pivot_len
        if len(self.candles) == 2 * L + 1:
            p = self.candles[L]
            is_ph = True
            is_pl = True
            for r in range(L + 1, 2 * L + 1):
                cr = self.candles[r]
                if p.high <= cr.high:
                    is_ph = False
                if p.low >= cr.low:
                    is_pl = False
            for l_idx in range(0, L):
                cl = self.candles[l_idx]
                if p.high < cl.high:
                    is_ph = False
                if p.low > cl.low:
                    is_pl = False
            if is_ph:
                self.prev_ph = self.last_ph
                self.last_ph = p.high
            if is_pl:
                self.prev_pl = self.last_pl
                self.last_pl = p.low

        if self.last_ph is not None and c.close > self.last_ph:
            self.ms_bias = 1
        elif self.last_pl is not None and c.close < self.last_pl:
            self.ms_bias = -1
        elif (self.ms_bias == 0 and self.last_ph is not None and self.prev_ph is not None
              and self.last_pl is not None and self.prev_pl is not None):
            if self.last_ph > self.prev_ph and self.last_pl > self.prev_pl:
                self.ms_bias = 1
            elif self.last_ph < self.prev_ph and self.last_pl < self.prev_pl:
                self.ms_bias = -1

        self.bias = self.ms_bias if self.ms_bias != 0 else (1 if c.close >= c.open else -1)
        return self.bias


# ---------------------------------------------------------------------------
# Pure helper functions matching Pine Script sections 2, 5E, 8, 9
# ---------------------------------------------------------------------------

def _update_tf_candles(arr: deque[_TfCandle], bar: Candle, bar_idx: int, is_new: bool) -> None:
    if is_new or not arr:
        arr.appendleft(_TfCandle(bar.open, bar.high, bar.low, bar.close,
                                 bar_idx, bar_idx, bar_idx, bar_idx))
    else:
        cur = arr[0]
        if bar.high > cur.h:
            cur.h = bar.high
            cur.h_bar = bar_idx
        if bar.low < cur.l:
            cur.l = bar.low
            cur.l_bar = bar_idx
        cur.c = bar.close
        cur.end_bar = bar_idx


def _find_bull_cisd_tf(arr: deque[_TfCandle], max_scan: int = 20) -> tuple[Optional[float], int]:
    sz = len(arr)
    if sz == 0:
        return None, -1
    lim = min(max_scan, sz - 1)
    c0 = arr[0]
    start_k = -1
    if c0.c < c0.o:
        start_k = 0
    elif lim >= 1 and arr[1].c < arr[1].o:
        start_k = 1
    elif lim >= 2 and arr[1].c == arr[1].o and arr[2].c < arr[2].o:
        start_k = 2

    if start_k >= 0:
        first_bear_k = start_k
        for k in range(start_k + 1, lim + 1):
            ck = arr[k]
            if ck.l < c0.l:
                break
            if ck.c < ck.o:
                first_bear_k = k
            elif ck.c > ck.o:
                break
        anc_c = arr[first_bear_k]
        return anc_c.o, anc_c.start_bar
    return (c0.h if c0.c > c0.o else c0.o), c0.start_bar


def _find_bear_cisd_tf(arr: deque[_TfCandle], max_scan: int = 20) -> tuple[Optional[float], int]:
    sz = len(arr)
    if sz == 0:
        return None, -1
    lim = min(max_scan, sz - 1)
    c0 = arr[0]
    start_k = -1
    if c0.c > c0.o:
        start_k = 0
    elif lim >= 1 and arr[1].c > arr[1].o:
        start_k = 1
    elif lim >= 2 and arr[1].c == arr[1].o and arr[2].c > arr[2].o:
        start_k = 2

    if start_k >= 0:
        first_bull_k = start_k
        for k in range(start_k + 1, lim + 1):
            ck = arr[k]
            if ck.h > c0.h:
                break
            if ck.c > ck.o:
                first_bull_k = k
            elif ck.c < ck.o:
                break
        anc_c = arr[first_bull_k]
        return anc_c.o, anc_c.start_bar
    return (c0.l if c0.c < c0.o else c0.o), c0.start_bar


def _eval_tf_swings(arr: deque[_TfCandle], p_len: int) -> tuple[bool, float, int, bool, float, int]:
    """Port of ``evalOteSwings`` (strict right, non-strict left)."""
    if len(arr) < 2 * p_len + 1 or p_len < 1:
        return False, math.nan, -1, False, math.nan, -1
    p = arr[p_len]
    is_sh = True
    is_sl = True
    for r in range(0, p_len):
        cr = arr[r]
        if p.h <= cr.h:
            is_sh = False
        if p.l >= cr.l:
            is_sl = False
    for l_idx in range(p_len + 1, 2 * p_len + 1):
        cl = arr[l_idx]
        if p.h < cl.h:
            is_sh = False
        if p.l > cl.l:
            is_sl = False
    return (
        is_sh, p.h if is_sh else math.nan, p.h_bar if is_sh else -1,
        is_sl, p.l if is_sl else math.nan, p.l_bar if is_sl else -1,
    )


def _auto_pip_size(symbol: str, price_precision: int, asset_class: str) -> float:
    """Port of Pine's ``calcAutoPipSize()``."""
    tk = symbol.upper()
    if "XAU" in tk:
        return 0.1
    if "XAG" in tk:
        return 0.01
    if any(k in tk for k in ("NAS", "US100", "SPX", "US500", "US30", "GER", "UK100", "FTSE")):
        return 1.0
    if "JPY" in tk:
        return 0.01
    if asset_class == "index":
        return 1.0
    mintick = 10.0 ** (-price_precision)
    if asset_class == "forex" or price_precision >= 3:
        if mintick < 0.0005:
            return 0.0001
        if mintick < 0.05:
            return 0.01
    return mintick * 10.0


def _is_fx_symbol(symbol: str, asset_class: str) -> bool:
    tk = symbol.upper()
    if "JPY" in tk:
        return True
    if asset_class == "forex":
        return True
    if asset_class in ("index", "metal", "commodity"):
        return False
    if any(k in tk for k in ("XAU", "XAG", "OIL", "NAS", "US100", "SPX", "US500", "US30", "GER", "UK100", "FTSE", "JP225", "EU50", "FRA40", "AUS200", "HK50")):
        return False
    return True


def _auto_c2_tf(base_tf_min: int) -> Optional[str]:
    return {
        1: "m15",
        3: "m30",
        5: "h1",
        15: "h4",
        30: "h4",
        60: "d1",
    }.get(base_tf_min, "h1" if base_tf_min < 60 else "d1")


# ---------------------------------------------------------------------------
# Strategy class
# ---------------------------------------------------------------------------

class IctSweepCisd(Strategy):
    """ICT Sweep -> CISD Model with 1H AOIs, TTrades probability scoring, and 2R tracking."""

    label = "ICT Sweep -> CISD Model"
    description = (
        "Port of ICT_Sweep_CISD_Model.pine: Daily+1H structure bias, 1H AOI engine "
        "(FVG/OB/DOL), multi-source sweeps, M5 CISD, 0-100% TTrades score, ADR gate, "
        "and OTE / CISD Break / CISD FVG 2R entries."
    )

    params = {
        "risk_pct": 0.5,
        "rr": 2.0,
        "entry_mode": 0,            # 0=Return to OTE, 1=Return to CISD Break, 2=Return to FVG (CISD)
        "exec_type": 0,             # 0=Limit at Level, 1=Candle Close
        "fvg_fallback_cisd": 0,
        "ote_swing_tf_min": 5,
        "ote_swing_len": 1,
        "ote_leg_mode": 0,          # 0=First Post-CISD Leg, 1=Follow Dealing Range
        "cisd_tf_min": 5,
        "alignment_rule": 0,        # 0=Daily+1H, 1=1H Only, 2=Daily Only, 3=Off
        "allow_h1_only_arm": 1,
        "htf_swing_len": 2,
        "swing_lookback": 3,
        "aoi_swing_len": 1,
        "aoi_tol_ticks": 20.0,
        "prob_filter_mode": 0,      # 0=1H AOI + Min Prob, 1=1H AOI Only, 2=Min Prob Only
        "min_prob": 70,
        "use_adr_filter": 1,
        "max_adr_pct": 90.0,
        "sl_buffer_pips": 5.0,
        "sl_vol_scaling": 1,        # 0=Fixed Pips, 1=FX ADR Floor, 2=All ADR Floor
        "sl_adr_floor_pct": 5.0,
        "multi_bar_sweep": 1,
        "max_reclaim_bars": 4,
        "max_cisd_wait_bars": 15,
        "use_sweep_htf": 1,
        "use_sweep_session": 1,
        "use_sweep_swings": 1,
        "use_sweep_1h_dol": 1,
        "use_sweep_pdh_pdl": 0,
        "cisd_filter_mode": 0,      # 0=KZ+HTF, 1=KZ Only, 2=HTF Only, 3=All
        "entry_kz_rule": 0,         # 0=At CISD or Entry, 1=At Entry Bar Only, 2=Ignore KZ
        "kz_asia": 0,
        "kz_london": 1,
        "kz_ny_am": 1,
        "kz_ny_lunch": 0,
        "kz_ny_pm": 1,
    }

    @classmethod
    def required_htf(cls, timeframe: str, params: dict) -> list[str]:
        tfs = ["d1", "h1"]
        tf_min = TF_MINUTES.get(timeframe, 5)
        c2 = _auto_c2_tf(tf_min)
        if c2 and c2 not in tfs and c2 != timeframe:
            tfs.append(c2)
        return tfs

    def __init__(self, params: Optional[dict] = None):
        super().__init__(params)
        self._init_done = False

        # Runtime configuration resolved once on first bar
        self._base_tf_min = 5
        self._eff_cisd_min = 5
        self._cisd_tf_ratio = 1
        self._eff_ote_min = 5
        self._ote_tf_ratio = 1
        self._aoi_tf_valid = True
        self._c2_tf: Optional[str] = "h1"
        self._c2_tf_valid = True
        self._mintick = 0.00001
        self._pip_size = 0.0001
        self._aoi_tol = 0.0002
        self._is_fx = True

        # HTF incremental cursors & structure trackers
        self._d1_cursor = 0
        self._h1_cursor = 0
        self._c2_cursor = 0
        self._d1_struct = _StructureTracker(int(self.hp["htf_swing_len"]))
        self._h1_struct = _StructureTracker(int(self.hp["htf_swing_len"]))
        self._d1_ranges: deque[float] = deque(maxlen=14)
        self._adr14: Optional[float] = None
        self._prev_day_high: Optional[float] = None
        self._prev_day_low: Optional[float] = None
        self._pdh_swept = False
        self._pdl_swept = False
        self._cur_trading_day: Optional[int] = None
        self._today_high = math.nan
        self._today_low = math.nan
        self._live_d_open = math.nan
        self._live_d_close = math.nan

        # C2 previous candle pool
        self._c2_prev_h: Optional[float] = None
        self._c2_prev_l: Optional[float] = None
        self._c2_prev_h_swept = False
        self._c2_prev_l_swept = False

        # NY session pools & clock tracking (cached per-day boundaries for O(1) lookup)
        self._asia_pool = _SessionPool("Asia")
        self._london_pool = _SessionPool("London")
        self._nyam_pool = _SessionPool("NY AM")
        self._prev_ny_mins: Optional[int] = None
        self._prev_ny_dom: Optional[int] = None
        self._ny_day_start_ms: int = -1
        self._ny_day_end_ms: int = -1
        self._ny_cached_offset_ms: int = sessions.EST_OFFSET_MS
        self._ny_cached_dom: int = 1
        self._ny_cached_tday: int = -1
        self._ny_tday_end_ms: int = -1

        # LTF swing fractal ring buffer + intact swings
        self._ltf_buf: deque[Candle] = deque(maxlen=2 * max(1, int(self.hp["swing_lookback"])) + 1)
        self._swing_highs: list[_SwingPoint] = []
        self._swing_lows: list[_SwingPoint] = []

        # Live aggregated 1H / CISD / OTE candles
        self._h1_candles: deque[_TfCandle] = deque(maxlen=80)
        self._h1_bucket: Optional[int] = None
        self._h1_prev_closed = True
        self._last_aoi_eval_start = -1
        self._last_aoi_pivot_start = -1
        self._h1_fvgs: list[_AoiZone] = []
        self._h1_obs: list[_AoiZone] = []
        self._h1_swing_highs: list[_AoiSwing] = []
        self._h1_swing_lows: list[_AoiSwing] = []

        self._cisd_candles: deque[_TfCandle] = deque(maxlen=60)
        self._cisd_bucket: Optional[int] = None
        self._cisd_prev_closed = True

        self._ote_candles: deque[_TfCandle] = deque(maxlen=80)
        self._ote_bucket: Optional[int] = None
        self._ote_prev_closed = True
        self._last_ote_pivot_start = -1

        # Active setups (bull & bear)
        self._bull = _ActiveSetup()
        self._bear = _ActiveSetup()

        # Order management & telemetry
        self._desired: Optional[_OrderIntent] = None
        self._pending_sig: Optional[tuple[str, float, float, float]] = None
        self.counters: dict[str, int] = {
            "sweeps_armed": 0,
            "cisd_confirmed": 0,
            "cisd_passed": 0,
            "setups_armed": 0,
            "orders_submitted": 0,
            "trades_opened": 0,
        }

    # --- one-time lazy init when ctx is bound --------------------------------

    def _lazy_init(self) -> None:
        self._init_done = True
        tf_str = (self.ctx.timeframe or "").lower()
        if tf_str in TF_MINUTES:
            self._base_tf_min = TF_MINUTES[tf_str]
        elif len(self.candles) >= 2:
            diff_min = max(1, round((self.candles[-1].timestamp - self.candles[-2].timestamp) / 60_000))
            self._base_tf_min = diff_min
        else:
            self._base_tf_min = 5

        req_cisd = max(1, int(self.hp["cisd_tf_min"]))
        self._eff_cisd_min = max(self._base_tf_min, req_cisd)
        self._cisd_tf_ratio = max(1, round(self._eff_cisd_min / self._base_tf_min))

        req_ote = max(1, int(self.hp["ote_swing_tf_min"]))
        self._eff_ote_min = max(self._base_tf_min, req_ote)
        self._ote_tf_ratio = max(1, round(self._eff_ote_min / self._base_tf_min))

        self._aoi_tf_valid = self._base_tf_min <= 60
        self._c2_tf = _auto_c2_tf(self._base_tf_min)
        c2_min = TF_MINUTES.get(self._c2_tf or "", 60)
        self._c2_tf_valid = self._base_tf_min < c2_min

        prec = int(self.ctx.price_precision)
        self._mintick = 10.0 ** (-prec)
        self._pip_size = _auto_pip_size(self.ctx.symbol, prec, self.ctx.asset_class)
        self._aoi_tol = float(self.hp["aoi_tol_ticks"]) * self._mintick
        self._is_fx = _is_fx_symbol(self.ctx.symbol, self.ctx.asset_class)

        # Replay any base bars skipped during engine warmup into state trackers
        # so 1H AOIs, LTF swings, and session pools are warmed up cleanly.
        if self.index > 0:
            full = self.ctx.full(None)
            start_idx = max(0, self.index - 240)
            for k in range(start_idx, self.index):
                self._ingest_warmup_bar(full[k], k)

    def _fast_ny_clock(self, ts_ms: int) -> tuple[int, int, int]:
        """Fast O(1) equivalent of ``(ny_mins, ny_dom, trading_day_start)``.

        Recomputes DST/calendar fields only when crossing an hour boundary
        (every ~12 M5 bars) instead of allocating ``datetime`` objects per bar.
        """
        if not (self._ny_day_start_ms <= ts_ms < self._ny_day_end_ms):
            offset = sessions.ny_offset_ms(ts_ms)
            w = sessions.ny_wall(ts_ms)
            # Cache for the current UTC hour (DST switches only occur on exact hour boundaries)
            hour_start = (ts_ms // 3_600_000) * 3_600_000
            self._ny_day_start_ms = hour_start
            self._ny_day_end_ms = hour_start + 3_600_000
            self._ny_cached_offset_ms = offset
            self._ny_cached_dom = w.day
            if ts_ms >= self._ny_tday_end_ms or self._ny_cached_tday < 0:
                tday = sessions.trading_day_start(ts_ms)
                self._ny_cached_tday = tday
                # Next trading day starts at least 23 hours later (23h on spring-forward day)
                self._ny_tday_end_ms = tday + 23 * 3_600_000
        local_ms = ts_ms + self._ny_cached_offset_ms
        ny_mins = (local_ms // 60_000) % 1440
        if ts_ms >= self._ny_tday_end_ms:
            tday = sessions.trading_day_start(ts_ms)
            self._ny_cached_tday = tday
            self._ny_tday_end_ms = tday + 23 * 3_600_000
        return ny_mins, self._ny_cached_dom, self._ny_cached_tday

    def _ingest_warmup_bar(self, bar: Candle, bar_idx: int) -> None:
        """Warm up 1H AOIs, LTF swings, CISD/OTE candles, and session pools."""
        self._update_ltf_swings(bar, bar_idx)
        if self._aoi_tf_valid:
            self._step_1h_aoi(bar, bar_idx)
        self._step_cisd_candles(bar, bar_idx)
        self._step_ote_candles(bar, bar_idx)
        ny_mins, ny_dom, tday = self._fast_ny_clock(bar.timestamp)
        self._update_sessions(bar, bar_idx, ny_mins, ny_dom)
        self._update_today_range(bar, tday)

    # --- broker event hooks --------------------------------------------------

    def on_open_position(self, position) -> None:
        self.counters["trades_opened"] += 1
        self._pending_sig = None
        setup = self._bull if position.side == "long" else self._bear
        setup.signal_fired = True
        setup.ote_locked = True
        setup.active = False

    # --- HTF bias, ADR, C2 updates ------------------------------------------

    def _sync_htf(self, bar: Candle, tday: int) -> None:
        # Daily candles (bias + PDH/PDL + 14-day ADR)
        if self.ctx.has_htf("d1"):
            d1_n = self.ctx.htf_closed_count("d1")
            if d1_n > self._d1_cursor:
                d1_full = self.ctx.full("d1")
                while self._d1_cursor < d1_n:
                    dc = d1_full[self._d1_cursor]
                    self._d1_struct.push(dc)
                    self._d1_ranges.append(dc.high - dc.low)
                    self._prev_day_high = dc.high
                    self._prev_day_low = dc.low
                    self._d1_cursor += 1
                if len(self._d1_ranges) >= 14:
                    self._adr14 = sum(self._d1_ranges) / 14.0
                self._pdh_swept = False
                self._pdl_swept = False

        # 1H structure bias from loaded H1 series (exact parity with request.security(..., "60", b[1]))
        if self.ctx.has_htf("h1"):
            h1_n = self.ctx.htf_closed_count("h1")
            if h1_n > self._h1_cursor:
                h1_full = self.ctx.full("h1")
                while self._h1_cursor < h1_n:
                    self._h1_struct.push(h1_full[self._h1_cursor])
                    self._h1_cursor += 1

        # HTF C2 previous candle H/L
        if self._c2_tf_valid and self._c2_tf:
            if self.ctx.has_htf(self._c2_tf):
                c2_n = self.ctx.htf_closed_count(self._c2_tf)
                if c2_n > self._c2_cursor:
                    c2_full = self.ctx.full(self._c2_tf)
                    last_c2 = c2_full[c2_n - 1]
                    self._c2_prev_h = last_c2.high
                    self._c2_prev_l = last_c2.low
                    self._c2_prev_h_swept = False
                    self._c2_prev_l_swept = False
                    self._c2_cursor = c2_n

        self._update_today_range(bar, tday)

    def _update_today_range(self, bar: Candle, tday: int) -> None:
        if self._cur_trading_day is None or tday != self._cur_trading_day:
            # Fallback if d1 wasn't provided in htf_map
            if not self.ctx.has_htf("d1") and self._cur_trading_day is not None and not math.isnan(self._today_high):
                prev_d = Candle(self._cur_trading_day, self._live_d_open, self._today_high,
                                self._today_low, self._live_d_close)
                self._d1_struct.push(prev_d)
                self._d1_ranges.append(prev_d.high - prev_d.low)
                if len(self._d1_ranges) >= 14:
                    self._adr14 = sum(self._d1_ranges) / 14.0
                self._prev_day_high = self._today_high
                self._prev_day_low = self._today_low
                self._pdh_swept = False
                self._pdl_swept = False
            self._cur_trading_day = tday
            self._today_high = bar.high
            self._today_low = bar.low
            self._live_d_open = bar.open
            self._live_d_close = bar.close
        else:
            if bar.high > self._today_high:
                self._today_high = bar.high
            if bar.low < self._today_low:
                self._today_low = bar.low
            self._live_d_close = bar.close

    # --- LTF swings ----------------------------------------------------------

    def _update_ltf_swings(self, bar: Candle, bar_idx: int) -> None:
        self._ltf_buf.append(bar)
        L = max(1, int(self.hp["swing_lookback"]))
        if len(self._ltf_buf) < 2 * L + 1:
            return
        p = self._ltf_buf[L]
        is_ph = True
        is_pl = True
        for r in range(L + 1, 2 * L + 1):
            cr = self._ltf_buf[r]
            if p.high <= cr.high:
                is_ph = False
            if p.low >= cr.low:
                is_pl = False
        for l_idx in range(0, L):
            cl = self._ltf_buf[l_idx]
            if p.high < cl.high:
                is_ph = False
            if p.low > cl.low:
                is_pl = False
        if is_ph:
            self._swing_highs.append(_SwingPoint(p.high, bar_idx - L))
            if len(self._swing_highs) > 10:
                self._swing_highs.pop(0)
        if is_pl:
            self._swing_lows.append(_SwingPoint(p.low, bar_idx - L))
            if len(self._swing_lows) > 10:
                self._swing_lows.pop(0)

    # --- Sessions ------------------------------------------------------------

    def _update_pool(self, p: _SessionPool, in_sess: bool, expire_now: bool,
                     bar: Candle, bar_idx: int) -> None:
        sess_start = in_sess and not p.prev_in_sess
        sess_end = (not in_sess) and p.prev_in_sess
        p.prev_in_sess = in_sess
        if expire_now and not in_sess:
            p.ready = False
            p.building = False
        if sess_start:
            p.hi = bar.high
            p.hi_bar = bar_idx
            p.hi_swept = False
            p.lo = bar.low
            p.lo_bar = bar_idx
            p.lo_swept = False
            p.building = True
            p.ready = False
        elif in_sess and p.building:
            if p.hi is None or bar.high > p.hi:
                p.hi = bar.high
                p.hi_bar = bar_idx
            if p.lo is None or bar.low < p.lo:
                p.lo = bar.low
                p.lo_bar = bar_idx
        elif sess_end and p.building:
            p.building = False
            p.ready = p.hi is not None and p.lo is not None

    def _update_sessions(self, bar: Candle, bar_idx: int, ny_mins: int, ny_dom: int) -> tuple[bool, bool, bool, bool, bool]:
        in_asia = ny_mins >= 1200
        in_london = 120 <= ny_mins < 300
        in_nyam = 420 <= ny_mins < 600
        in_nylunch = 720 <= ny_mins < 780
        in_nypm = 810 <= ny_mins < 960

        prev_mins = self._prev_ny_mins if self._prev_ny_mins is not None else 0
        prev_dom = self._prev_ny_dom if self._prev_ny_dom is not None else ny_dom
        is_1800_reset = ny_mins >= 1080 and prev_mins < 1080
        ny_day_reset = is_1800_reset or (ny_dom != prev_dom and ny_mins < 720 and not in_asia)

        self._update_pool(self._asia_pool, in_asia, is_1800_reset, bar, bar_idx)
        self._update_pool(self._london_pool, in_london, is_1800_reset or ny_day_reset, bar, bar_idx)
        self._update_pool(self._nyam_pool, in_nyam, is_1800_reset or ny_day_reset, bar, bar_idx)

        self._prev_ny_mins = ny_mins
        self._prev_ny_dom = ny_dom
        return in_asia, in_london, in_nyam, in_nylunch, in_nypm

    # --- 1H AOI Engine (FVG, OB, DOL Swings) ---------------------------------

    def _process_closed_1h_aoi(self) -> None:
        arr = self._h1_candles
        if not arr:
            return
        c0 = arr[0]

        # Fallback H1 bias tracker when h1 isn't provided in htf_map
        if not self.ctx.has_htf("h1"):
            self._h1_struct.push(Candle(c0.start_bar, c0.o, c0.h, c0.l, c0.c))

        # 1) Retire 1H FVGs & OBs ONLY on closed 1H body close beyond distal edge
        for f in self._h1_fvgs:
            if not f.mitigated:
                if (f.is_bull and c0.c < f.bottom) or (not f.is_bull and c0.c > f.top):
                    f.mitigated = True
        for o in self._h1_obs:
            if not o.mitigated:
                if (o.is_bull and c0.c < o.bottom) or (not o.is_bull and c0.c > o.top):
                    o.mitigated = True

        # 2) Detect new 1H FVGs (IRL)
        if len(arr) >= 3:
            c1 = arr[1]
            c2 = arr[2]
            if c0.l > c2.h and c1.c > c1.o:
                self._h1_fvgs.append(_AoiZone(c0.l, c2.h, c1.start_bar, True, False))
                if len(self._h1_fvgs) > 10:
                    self._h1_fvgs.pop(0)
            if c0.h < c2.l and c1.c < c1.o:
                self._h1_fvgs.append(_AoiZone(c2.l, c0.h, c1.start_bar, False, False))
                if len(self._h1_fvgs) > 10:
                    self._h1_fvgs.pop(0)

        # 3) Detect new 1H Order Blocks (full contiguous opposing delivery series up to 4 bars)
        if len(arr) >= 2:
            c1 = arr[1]
            if c1.c < c1.o and c0.c > c0.o and c0.c > c1.h:
                ob_top = c1.o
                ob_bot = c1.l
                ob_start = c1.start_bar
                scan_lim = min(4, len(arr) - 1)
                for k in range(2, scan_lim + 1):
                    ck = arr[k]
                    if ck.c < ck.o:
                        ob_top = ck.o
                        ob_bot = min(ob_bot, ck.l)
                        ob_start = ck.start_bar
                    else:
                        break
                if ob_top > ob_bot:
                    self._h1_obs.append(_AoiZone(ob_top, ob_bot, ob_start, True, False))
                    if len(self._h1_obs) > 10:
                        self._h1_obs.pop(0)
            if c1.c > c1.o and c0.c < c0.o and c0.c < c1.l:
                ob_bot = c1.o
                ob_top = c1.h
                ob_start = c1.start_bar
                scan_lim = min(4, len(arr) - 1)
                for k in range(2, scan_lim + 1):
                    ck = arr[k]
                    if ck.c > ck.o:
                        ob_bot = ck.o
                        ob_top = max(ob_top, ck.h)
                        ob_start = ck.start_bar
                    else:
                        break
                if ob_top > ob_bot:
                    self._h1_obs.append(_AoiZone(ob_top, ob_bot, ob_start, False, False))
                    if len(self._h1_obs) > 10:
                        self._h1_obs.pop(0)

    def _eval_and_push_1h_swings(self) -> None:
        aoi_len = max(1, int(self.hp["aoi_swing_len"]))
        if len(self._h1_candles) < 2 * aoi_len + 1:
            return
        cand = self._h1_candles[aoi_len]
        if cand.start_bar == self._last_aoi_pivot_start:
            return
        self._last_aoi_pivot_start = cand.start_bar
        has_sh, sh_p, sh_b, has_sl, sl_p, sl_b = _eval_tf_swings(self._h1_candles, aoi_len)
        if has_sh:
            self._h1_swing_highs.append(_AoiSwing(sh_p, sh_b, True))
            if len(self._h1_swing_highs) > 12:
                self._h1_swing_highs.pop(0)
        if has_sl:
            self._h1_swing_lows.append(_AoiSwing(sl_p, sl_b, False))
            if len(self._h1_swing_lows) > 12:
                self._h1_swing_lows.pop(0)

    def _step_1h_aoi(self, bar: Candle, bar_idx: int) -> None:
        bucket = bar.timestamp // 3_600_000
        next_bucket = (bar.timestamp + self._base_tf_min * 60_000) // 3_600_000
        is_new = (self._base_tf_min == 60) or (self._h1_bucket is None) or (bucket != self._h1_bucket)
        is_close = (self._base_tf_min == 60) or (next_bucket != bucket)
        gap_close = is_new and self._h1_bucket is not None and not self._h1_prev_closed

        if gap_close and self._h1_candles:
            g0 = self._h1_candles[0]
            if g0.start_bar != self._last_aoi_eval_start:
                self._last_aoi_eval_start = g0.start_bar
                self._process_closed_1h_aoi()
            self._eval_and_push_1h_swings()

        # Fallback C2 H1 pool when h1 not in htf_map
        if is_new and self._c2_tf == "h1" and not self.ctx.has_htf("h1") and self._h1_candles:
            prev_h1 = self._h1_candles[0]
            self._c2_prev_h = prev_h1.h
            self._c2_prev_l = prev_h1.l
            self._c2_prev_h_swept = False
            self._c2_prev_l_swept = False

        _update_tf_candles(self._h1_candles, bar, bar_idx, is_new)
        self._h1_bucket = bucket
        self._h1_prev_closed = is_close

        if is_close and self._h1_candles:
            c0 = self._h1_candles[0]
            if c0.start_bar != self._last_aoi_eval_start:
                self._last_aoi_eval_start = c0.start_bar
                self._process_closed_1h_aoi()
            self._eval_and_push_1h_swings()

    def _step_cisd_candles(self, bar: Candle, bar_idx: int) -> tuple[bool, bool]:
        step_ms = self._eff_cisd_min * 60_000
        bucket = bar.timestamp // step_ms
        next_bucket = (bar.timestamp + self._base_tf_min * 60_000) // step_ms
        is_new = (self._eff_cisd_min == self._base_tf_min) or (self._cisd_bucket is None) or (bucket != self._cisd_bucket)
        is_close = (self._eff_cisd_min == self._base_tf_min) or (next_bucket != bucket)
        gap_close = is_new and self._cisd_bucket is not None and not self._cisd_prev_closed

        _update_tf_candles(self._cisd_candles, bar, bar_idx, is_new)
        self._cisd_bucket = bucket
        self._cisd_prev_closed = is_close
        return is_close, gap_close

    def _step_ote_candles(self, bar: Candle, bar_idx: int) -> tuple[bool, float, int, bool, float, int]:
        step_ms = self._eff_ote_min * 60_000
        bucket = bar.timestamp // step_ms
        next_bucket = (bar.timestamp + self._base_tf_min * 60_000) // step_ms
        is_new = (self._eff_ote_min == self._base_tf_min) or (self._ote_bucket is None) or (bucket != self._ote_bucket)
        is_close = (self._eff_ote_min == self._base_tf_min) or (next_bucket != bucket)
        gap_close = is_new and self._ote_bucket is not None and not self._ote_prev_closed

        ote_len = max(1, int(self.hp["ote_swing_len"]))
        has_sh = has_sl = False
        sh_p = sl_p = math.nan
        sh_b = sl_b = -1

        if gap_close and len(self._ote_candles) >= 2 * ote_len + 1:
            cand_gap = self._ote_candles[ote_len]
            if cand_gap.start_bar != self._last_ote_pivot_start:
                self._last_ote_pivot_start = cand_gap.start_bar
                has_sh, sh_p, sh_b, has_sl, sl_p, sl_b = _eval_tf_swings(self._ote_candles, ote_len)

        _update_tf_candles(self._ote_candles, bar, bar_idx, is_new)
        self._ote_bucket = bucket
        self._ote_prev_closed = is_close

        if is_close and len(self._ote_candles) >= 2 * ote_len + 1:
            cand_now = self._ote_candles[ote_len]
            if cand_now.start_bar != self._last_ote_pivot_start:
                self._last_ote_pivot_start = cand_now.start_bar
                n_sh, n_sh_p, n_sh_b, n_sl, n_sl_p, n_sl_b = _eval_tf_swings(self._ote_candles, ote_len)
                if n_sh:
                    has_sh, sh_p, sh_b = True, n_sh_p, n_sh_b
                if n_sl:
                    has_sl, sl_p, sl_b = True, n_sl_p, n_sl_b

        return has_sh, sh_p, sh_b, has_sl, sl_p, sl_b

    # --- Probability Scorer (exact port of evalSetupProb) --------------------

    def _eval_setup_prob(self, s: _ActiveSetup, is_bull: bool, conf_price: float, conf_bar: int,
                         bull_bias_ok: bool, bear_bias_ok: bool, in_kz: bool,
                         eff_sl_buf: float, today_range: float, adr_used_pct: float
                         ) -> tuple[int, bool, bool, str, Optional[float], bool]:
        cisd_lvl = s.cisd_level if s.cisd_level is not None else conf_price
        z_low = s.extreme if is_bull else min(cisd_lvl, conf_price)
        z_high = max(cisd_lvl, conf_price) if is_bull else s.extreme
        tol = self._aoi_tol

        in_fvg = around_fvg = in_ob = around_ob = in_sw = around_sw = False
        blocked_by_opp = False
        opp_target: Optional[float] = None

        if self._aoi_tf_valid:
            for f in self._h1_fvgs:
                if not f.mitigated:
                    if f.is_bull == is_bull:
                        if z_low <= f.top and z_high >= f.bottom:
                            in_fvg = True
                        elif z_low <= (f.top + tol) and z_high >= (f.bottom - tol):
                            around_fvg = True
                    else:
                        if (f.bottom - tol) <= conf_price <= (f.top + tol):
                            blocked_by_opp = True

            for o in self._h1_obs:
                if not o.mitigated:
                    if o.is_bull == is_bull:
                        if z_low <= o.top and z_high >= o.bottom:
                            in_ob = True
                        elif z_low <= (o.top + tol) and z_high >= (o.bottom - tol):
                            around_ob = True
                    else:
                        if (o.bottom - tol) <= conf_price <= (o.top + tol):
                            blocked_by_opp = True

            same_sw = self._h1_swing_lows if is_bull else self._h1_swing_highs
            for sw in same_sw:
                swept_in_setup = (sw.swept and sw.swept_bar >= (s.raid_start_bar - self._cisd_tf_ratio)
                                  and sw.swept_bar <= conf_bar)
                in_range = (not sw.swept) and z_low <= sw.price <= z_high
                if swept_in_setup or in_range:
                    in_sw = True
                elif (not sw.swept) and z_low <= (sw.price + tol) and z_high >= (sw.price - tol):
                    around_sw = True

            opp_sw = self._h1_swing_highs if is_bull else self._h1_swing_lows
            for sw in opp_sw:
                if not sw.swept:
                    if is_bull and sw.price > conf_price:
                        if opp_target is None or sw.price < opp_target:
                            opp_target = sw.price
                    elif (not is_bull) and sw.price < conf_price:
                        if opp_target is None or sw.price > opp_target:
                            opp_target = sw.price

        hit_fvg = in_fvg or around_fvg
        hit_ob = in_ob or around_ob
        hit_sw = in_sw or around_sw
        has_aoi = hit_fvg or hit_ob or hit_sw
        any_in = in_fvg or in_ob or in_sw
        aoi_count = int(hit_fvg) + int(hit_ob) + int(hit_sw)

        tag_body = ""
        if hit_fvg:
            tag_body = "1H FVG"
        if hit_sw:
            tag_body = "1H SW" if not tag_body else f"{tag_body}+SW"
        if hit_ob:
            tag_body = "1H OB" if not tag_body else f"{tag_body}+OB"
        aoi_summary = "No 1H AOI" if not has_aoi else (tag_body if any_in else f"~{tag_body}")

        # 1) 1H AOI Quality (max 30)
        has_fvg_or_ob = hit_fvg or hit_ob
        if in_fvg or in_ob:
            aoi_score = 25
        elif has_fvg_or_ob or in_sw:
            aoi_score = 15
        elif around_sw:
            aoi_score = 10
        else:
            aoi_score = 0
        if aoi_count >= 2:
            aoi_score += 5

        # 2) 1H C2/C3 closure or intracandle wick-reclaim support (max 15)
        h1_closure_ok = False
        if self._aoi_tf_valid and len(self._h1_candles) >= 3:
            hc0 = self._h1_candles[0]
            hc1 = self._h1_candles[1]
            hc2 = self._h1_candles[2]
            if is_bull:
                c2_rev = hc1.l < hc2.l and hc1.c > hc2.l
                c3_cont = hc1.c > hc1.o and hc1.c > max(hc2.o, hc2.c)
                ic_rev = hc0.l < hc1.l and conf_price > hc1.l
                h1_closure_ok = c2_rev or c3_cont or ic_rev
            else:
                c2_rev = hc1.h > hc2.h and hc1.c < hc2.h
                c3_cont = hc1.c < hc1.o and hc1.c < min(hc2.o, hc2.c)
                ic_rev = hc0.h > hc1.h and conf_price < hc1.h
                h1_closure_ok = c2_rev or c3_cont or ic_rev
        closure_score = 15 if h1_closure_ok else 0

        # 3) HTF Structure Alignment (max 15)
        htf_score = 15 if (bull_bias_ok if is_bull else bear_bias_ok) else 0

        # 4) Killzone Timing (max 15)
        kz_score = 15 if (in_kz or s.started_in_kz) else 0

        # 5) 2R Room-to-Run Check (max 15)
        target_rr = float(self.hp["rr"])
        est_sl = (s.extreme - eff_sl_buf) if is_bull else (s.extreme + eff_sl_buf)
        est_risk = max(self._mintick * 5.0, (conf_price - est_sl) if is_bull else (est_sl - conf_price))
        est_tp2r = (conf_price + target_rr * est_risk) if is_bull else (conf_price - target_rr * est_risk)
        opp_in_2r = False
        if self._aoi_tf_valid:
            for f in self._h1_fvgs:
                if not f.mitigated and f.is_bull != is_bull:
                    if is_bull and conf_price < f.bottom < est_tp2r:
                        opp_in_2r = True
                    elif (not is_bull) and est_tp2r < f.top < conf_price:
                        opp_in_2r = True
            for o in self._h1_obs:
                if not o.mitigated and o.is_bull != is_bull:
                    if is_bull and conf_price < o.bottom < est_tp2r:
                        opp_in_2r = True
                    elif (not is_bull) and est_tp2r < o.top < conf_price:
                        opp_in_2r = True

        has_dol_room = (not opp_in_2r and not blocked_by_opp and opp_target is not None
                        and abs(opp_target - conf_price) >= 1.5 * est_risk)
        dol_score = 15 if has_dol_room else (5 if (not opp_in_2r and not blocked_by_opp) else 0)

        # 6) CISD Displacement Speed (max 10)
        cisd_bars = max(1, math.ceil((conf_bar - s.last_extreme_bar + 1) / float(self._cisd_tf_ratio)))
        spd_score = 10 if cisd_bars <= 3 else (5 if cisd_bars <= 6 else 0)

        # 7) ADR Exhaustion Check (-25 penalty + hard block on late continuations)
        use_adr = bool(int(self.hp["use_adr_filter"]))
        max_adr = float(self.hp["max_adr_pct"])
        at_bull_ext = today_range > 0 and ((conf_price - self._today_low) / today_range) >= 0.70
        at_bear_ext = today_range > 0 and ((self._today_high - conf_price) / today_range) >= 0.70
        adr_exhausted = use_adr and adr_used_pct >= max_adr and (at_bull_ext if is_bull else at_bear_ext)
        adr_penalty = 25 if adr_exhausted else 0
        if adr_exhausted:
            aoi_summary = f"{aoi_summary} · ADR!"

        total_prob = max(0, min(100, aoi_score + closure_score + htf_score + kz_score + dol_score + spd_score - adr_penalty))
        return total_prob, has_aoi, any_in, aoi_summary, opp_target, adr_exhausted

    def _check_prob_gate(self, prob: int, has_aoi: bool, adr_exh: bool, bias_aligned: bool) -> bool:
        use_adr = bool(int(self.hp["use_adr_filter"]))
        if use_adr and adr_exh:
            return False
        mode = int(self.hp["prob_filter_mode"])
        min_p = int(self.hp["min_prob"])
        if mode == 1:
            base_pass = has_aoi
        elif mode == 2:
            base_pass = prob >= min_p
        else:
            base_pass = has_aoi and prob >= min_p
        return bias_aligned and base_pass

    # --- CISD Displacement FVG Scanner & Swing Leg Helpers -------------------

    def _find_cisd_fvg(self, from_bar: int, up_to_bar: int, is_bull: bool) -> tuple[bool, float, float, int]:
        full = self.ctx.full(None)
        bar_idx = self.index
        start_off = max(0, bar_idx - up_to_bar)
        end_off = min(90, max(start_off, bar_idx - from_bar))
        for off in range(start_off, end_off + 1):
            i0 = bar_idx - off
            if i0 >= 2 and off + 2 <= 95:
                c0 = full[i0]
                c1 = full[i0 - 1]
                c2 = full[i0 - 2]
                if is_bull and c0.low > c2.high and c1.close > c1.open:
                    return True, c0.low, c2.high, i0
                if (not is_bull) and c0.high < c2.low and c1.close < c1.open:
                    return True, c2.low, c0.high, i0

        if len(self._cisd_candles) >= 3:
            lim = min(6, len(self._cisd_candles) - 3)
            for k in range(0, lim + 1):
                c0 = self._cisd_candles[k]
                c1 = self._cisd_candles[k + 1]
                c2 = self._cisd_candles[k + 2]
                if c0.end_bar >= from_bar and c0.start_bar <= up_to_bar:
                    if is_bull and c0.l > c2.h and c1.c > c1.o:
                        return True, c0.l, c2.h, c0.end_bar
                    if (not is_bull) and c0.h < c2.l and c1.c < c1.o:
                        return True, c2.l, c0.h, c0.end_bar
        return False, math.nan, math.nan, -1

    def _highest_between(self, from_b: int, to_b: int) -> tuple[float, int]:
        full = self.ctx.full(None)
        lo_i = max(0, min(self.index, from_b))
        hi_i = max(lo_i, min(self.index, to_b))
        best_p = full[lo_i].high
        best_b = lo_i
        for k in range(lo_i + 1, hi_i + 1):
            if full[k].high > best_p:
                best_p = full[k].high
                best_b = k
        return best_p, best_b

    def _lowest_between(self, from_b: int, to_b: int) -> tuple[float, int]:
        full = self.ctx.full(None)
        lo_i = max(0, min(self.index, from_b))
        hi_i = max(lo_i, min(self.index, to_b))
        best_p = full[lo_i].low
        best_b = lo_i
        for k in range(lo_i + 1, hi_i + 1):
            if full[k].low < best_p:
                best_p = full[k].low
                best_b = k
        return best_p, best_b

    def _kz_gate_ok(self, s: _ActiveSetup, in_kz: bool) -> bool:
        rule = int(self.hp["entry_kz_rule"])
        if rule == 1:
            return in_kz
        if rule == 2:
            return True
        return in_kz or s.confirmed_in_kz or s.started_in_kz

    # --- Per-bar main state machine ------------------------------------------

    def before(self) -> None:
        if not self._init_done:
            self._lazy_init()

        bar = self.candle
        bar_idx = self.index
        self._desired = None

        # 1. NY clock, Killzones, Session Pools
        ny_mins, ny_dom, tday = self._fast_ny_clock(bar.timestamp)

        # 2. Sync HTF structures, ADR, C2, and today's range
        self._sync_htf(bar, tday)

        in_asia, in_london, in_nyam, in_nylunch, in_nypm = self._update_sessions(bar, bar_idx, ny_mins, ny_dom)
        in_kz = (
            (bool(int(self.hp["kz_london"])) and in_london)
            or (bool(int(self.hp["kz_ny_am"])) and in_nyam)
            or (bool(int(self.hp["kz_ny_lunch"])) and in_nylunch)
            or (bool(int(self.hp["kz_ny_pm"])) and in_nypm)
            or (bool(int(self.hp["kz_asia"])) and in_asia)
        )

        # 3. HTF Bias & Alignment
        d_bias = self._d1_struct.bias
        h1_bias = self._h1_struct.bias
        align_rule = int(self.hp["alignment_rule"])
        if align_rule == 0:
            bull_bias_ok = d_bias == 1 and h1_bias == 1
            bear_bias_ok = d_bias == -1 and h1_bias == -1
        elif align_rule == 1:
            bull_bias_ok = h1_bias == 1
            bear_bias_ok = h1_bias == -1
        elif align_rule == 2:
            bull_bias_ok = d_bias == 1
            bear_bias_ok = d_bias == -1
        else:
            bull_bias_ok = True
            bear_bias_ok = True

        allow_h1_arm = bool(int(self.hp["allow_h1_only_arm"]))
        bull_arm_bias_ok = bull_bias_ok or (allow_h1_arm and align_rule == 0 and h1_bias == 1)
        bear_arm_bias_ok = bear_bias_ok or (allow_h1_arm and align_rule == 0 and h1_bias == -1)

        # 4. Effective SL buffer & ADR usage
        today_range = self._today_high - self._today_low if not math.isnan(self._today_high) else 0.0
        adr_used_pct = (today_range / self._adr14 * 100.0) if (self._adr14 and self._adr14 > 0) else 0.0
        sl_buf_price = float(self.hp["sl_buffer_pips"]) * self._pip_size
        vol_mode = int(self.hp["sl_vol_scaling"])
        apply_adr_floor = (vol_mode == 2) or (vol_mode == 1 and self._is_fx)
        if apply_adr_floor and self._adr14 and self._adr14 > 0:
            eff_sl_buf = max(sl_buf_price, self._adr14 * (float(self.hp["sl_adr_floor_pct"]) * 0.01))
        else:
            eff_sl_buf = sl_buf_price

        # 5. Update LTF swings & 1H AOI engine
        self._update_ltf_swings(bar, bar_idx)
        if self._aoi_tf_valid:
            self._step_1h_aoi(bar, bar_idx)

        # Track live sweeps of 1H DOL Swings
        h1_dol_bull_swept = False
        h1_dol_bull_lvl = math.nan
        h1_dol_bear_swept = False
        h1_dol_bear_lvl = math.nan
        if self._aoi_tf_valid:
            for sw in reversed(self._h1_swing_lows):
                if not sw.swept and bar.low < sw.price:
                    sw.swept = True
                    sw.swept_bar = bar_idx
                    h1_dol_bull_swept = True
                    h1_dol_bull_lvl = sw.price
            for sw in reversed(self._h1_swing_highs):
                if not sw.swept and bar.high > sw.price:
                    sw.swept = True
                    sw.swept_bar = bar_idx
                    h1_dol_bear_swept = True
                    h1_dol_bear_lvl = sw.price

        # 6. Multi-source Sweep Detection (exact priority order from Pine Section 6 & 7)
        bull_raid = False
        bull_raid_lvl = math.nan
        bull_raid_name = ""
        bear_raid = False
        bear_raid_lvl = math.nan
        bear_raid_name = ""

        # 6.1 LTF Swings (always consume breached swings)
        use_sw = bool(int(self.hp["use_sweep_swings"]))
        if self._swing_lows:
            for i in range(len(self._swing_lows) - 1, -1, -1):
                sw = self._swing_lows[i]
                if bar.low < sw.price:
                    self._swing_lows.pop(i)
                    if use_sw:
                        bull_raid = True
                        bull_raid_lvl = sw.price
                        bull_raid_name = "Swing SSL"
        if self._swing_highs:
            for i in range(len(self._swing_highs) - 1, -1, -1):
                sw = self._swing_highs[i]
                if bar.high > sw.price:
                    self._swing_highs.pop(i)
                    if use_sw:
                        bear_raid = True
                        bear_raid_lvl = sw.price
                        bear_raid_name = "Swing BSL"

        # 6.1B 1H DOL Swings
        if int(self.hp["use_sweep_1h_dol"]):
            if h1_dol_bull_swept:
                bull_raid, bull_raid_lvl, bull_raid_name = True, h1_dol_bull_lvl, "1H SSL"
            if h1_dol_bear_swept:
                bear_raid, bear_raid_lvl, bear_raid_name = True, h1_dol_bear_lvl, "1H BSL"

        # 6.2 Completed Session Pools
        use_sess = bool(int(self.hp["use_sweep_session"]))
        for pool, label in ((self._asia_pool, "Asia"), (self._london_pool, "London"), (self._nyam_pool, "NYAM")):
            if pool.ready and not pool.building:
                if not pool.lo_swept and pool.lo is not None and bar.low < pool.lo:
                    pool.lo_swept = True
                    if use_sess:
                        bull_raid, bull_raid_lvl, bull_raid_name = True, pool.lo, f"{label} SSL"
                if not pool.hi_swept and pool.hi is not None and bar.high > pool.hi:
                    pool.hi_swept = True
                    if use_sess:
                        bear_raid, bear_raid_lvl, bear_raid_name = True, pool.hi, f"{label} BSL"

        # 6.3 HTF C2 Prev Candle H/L
        use_htf_c2 = bool(int(self.hp["use_sweep_htf"]))
        if self._c2_tf_valid and self._c2_prev_l is not None and not self._c2_prev_l_swept and bar.low < self._c2_prev_l:
            self._c2_prev_l_swept = True
            if use_htf_c2:
                bull_raid, bull_raid_lvl, bull_raid_name = True, self._c2_prev_l, f"{(self._c2_tf or 'h1').upper()} C2 SSL"
        if self._c2_tf_valid and self._c2_prev_h is not None and not self._c2_prev_h_swept and bar.high > self._c2_prev_h:
            self._c2_prev_h_swept = True
            if use_htf_c2:
                bear_raid, bear_raid_lvl, bear_raid_name = True, self._c2_prev_h, f"{(self._c2_tf or 'h1').upper()} C2 BSL"

        # 6.4 PDH / PDL
        use_pd = bool(int(self.hp["use_sweep_pdh_pdl"]))
        if self._prev_day_low is not None and not self._pdl_swept and bar.low < self._prev_day_low:
            self._pdl_swept = True
            if use_pd:
                bull_raid, bull_raid_lvl, bull_raid_name = True, self._prev_day_low, "PDL"
        if self._prev_day_high is not None and not self._pdh_swept and bar.high > self._prev_day_high:
            self._pdh_swept = True
            if use_pd:
                bear_raid, bear_raid_lvl, bear_raid_name = True, self._prev_day_high, "PDH"

        # 7. Step CISD candles & arm/maintain pending CISDs
        is_cisd_close, gap_cisd_close = self._step_cisd_candles(bar, bar_idx)

        filt_mode = int(self.hp["cisd_filter_mode"])
        if filt_mode == 1:
            bull_filter_pass = in_kz
            bear_filter_pass = in_kz
        elif filt_mode == 2:
            bull_filter_pass = bull_arm_bias_ok
            bear_filter_pass = bear_arm_bias_ok
        elif filt_mode == 3:
            bull_filter_pass = True
            bear_filter_pass = True
        else:
            bull_filter_pass = in_kz and bull_arm_bias_ok
            bear_filter_pass = in_kz and bear_arm_bias_ok

        multi_bar = bool(int(self.hp["multi_bar_sweep"]))
        new_bull_arm = False
        new_bear_arm = False

        if bull_raid and bull_filter_pass and (multi_bar or bar.close > bull_raid_lvl):
            if not self._bull.active or self._bull.cisd_confirmed:
                lvl, anc = _find_bull_cisd_tf(self._cisd_candles, 20)
                self._bull = _ActiveSetup(
                    active=True,
                    raid_start_bar=bar_idx,
                    last_extreme_bar=bar_idx,
                    swept_level=bull_raid_lvl,
                    swept_source=bull_raid_name,
                    extreme=bar.low,
                    reclaimed_level=bar.close > bull_raid_lvl,
                    bars_beyond_level=1 if (is_cisd_close and bar.close <= bull_raid_lvl) else 0,
                    cisd_level=lvl,
                    cisd_anchor_bar=anc,
                    started_valid=True,
                    started_in_kz=in_kz,
                )
                new_bull_arm = True
                self.counters["sweeps_armed"] += 1
            else:
                self._bull.swept_source = bull_raid_name

        if bear_raid and bear_filter_pass and (multi_bar or bar.close < bear_raid_lvl):
            if not self._bear.active or self._bear.cisd_confirmed:
                lvl, anc = _find_bear_cisd_tf(self._cisd_candles, 20)
                self._bear = _ActiveSetup(
                    active=True,
                    raid_start_bar=bar_idx,
                    last_extreme_bar=bar_idx,
                    swept_level=bear_raid_lvl,
                    swept_source=bear_raid_name,
                    extreme=bar.high,
                    reclaimed_level=bar.close < bear_raid_lvl,
                    bars_beyond_level=1 if (is_cisd_close and bar.close >= bear_raid_lvl) else 0,
                    cisd_level=lvl,
                    cisd_anchor_bar=anc,
                    started_valid=True,
                    started_in_kz=in_kz,
                )
                new_bear_arm = True
                self.counters["sweeps_armed"] += 1
            else:
                self._bear.swept_source = bear_raid_name

        max_reclaim = int(self.hp["max_reclaim_bars"])
        max_wait_chart = int(self.hp["max_cisd_wait_bars"]) * self._cisd_tf_ratio

        # Maintain pending bull CISD
        if self._bull.active and not self._bull.cisd_confirmed and not new_bull_arm:
            if not multi_bar:
                if bar.low < self._bull.extreme or (bar_idx - self._bull.last_extreme_bar) > max_wait_chart:
                    self._bull.active = False
            else:
                if is_cisd_close:
                    if bar.close > self._bull.swept_level:
                        self._bull.reclaimed_level = True
                        self._bull.bars_beyond_level = 0
                    else:
                        self._bull.bars_beyond_level += 1
                if bar.low <= self._bull.extreme:
                    self._bull.extreme = bar.low
                    self._bull.last_extreme_bar = bar_idx
                    lvl, anc = _find_bull_cisd_tf(self._cisd_candles, 20)
                    if lvl is not None:
                        self._bull.cisd_level = lvl
                        self._bull.cisd_anchor_bar = anc
                if self._bull.bars_beyond_level > max_reclaim or (bar_idx - self._bull.last_extreme_bar) > max_wait_chart:
                    self._bull.active = False

        # Maintain pending bear CISD
        if self._bear.active and not self._bear.cisd_confirmed and not new_bear_arm:
            if not multi_bar:
                if bar.high > self._bear.extreme or (bar_idx - self._bear.last_extreme_bar) > max_wait_chart:
                    self._bear.active = False
            else:
                if is_cisd_close:
                    if bar.close < self._bear.swept_level:
                        self._bear.reclaimed_level = True
                        self._bear.bars_beyond_level = 0
                    else:
                        self._bear.bars_beyond_level += 1
                if bar.high >= self._bear.extreme:
                    self._bear.extreme = bar.high
                    self._bear.last_extreme_bar = bar_idx
                    lvl, anc = _find_bear_cisd_tf(self._cisd_candles, 20)
                    if lvl is not None:
                        self._bear.cisd_level = lvl
                        self._bear.cisd_anchor_bar = anc
                if self._bear.bars_beyond_level > max_reclaim or (bar_idx - self._bear.last_extreme_bar) > max_wait_chart:
                    self._bear.active = False

        # 8. Check CISD confirmation on CISD TF close
        grace_bars = 6 * self._cisd_tf_ratio
        entry_mode = int(self.hp["entry_mode"])

        bull_confirm_gate = bull_filter_pass or (
            self._bull.started_valid and bull_arm_bias_ok and (bar_idx - self._bull.raid_start_bar) <= grace_bars
        )
        if self._bull.active and not self._bull.cisd_confirmed and self._bull.cisd_level is not None:
            closed_now = is_cisd_close and bar.close > self._bull.cisd_level
            closed_gap = (gap_cisd_close and len(self._cisd_candles) > 1
                          and self._cisd_candles[1].c > self._bull.cisd_level
                          and self._bull.raid_start_bar < bar_idx)
            if (closed_now or closed_gap) and bull_confirm_gate:
                c_bar = self._cisd_candles[1].end_bar if closed_gap else bar_idx
                c_price = self._cisd_candles[1].c if closed_gap else bar.close
                prob, has_aoi, any_in, aoi_raw, opp_targ, adr_exh = self._eval_setup_prob(
                    self._bull, True, c_price, c_bar, bull_bias_ok, bear_bias_ok, in_kz,
                    eff_sl_buf, today_range, adr_used_pct,
                )
                aoi_sum = aoi_raw if bull_bias_ok else f"{aoi_raw} · !=D"
                passed = self._check_prob_gate(prob, has_aoi, adr_exh, bull_bias_ok)
                self._bull.cisd_confirmed = True
                self._bull.cisd_confirm_bar = c_bar
                self._bull.confirmed_in_kz = in_kz
                self._bull.prob_score = prob
                self._bull.has_1h_aoi = has_aoi
                self._bull.aoi_in_zone = any_in
                self._bull.aoi_summary = aoi_sum
                self._bull.setup_passed = passed
                self._bull.opp_dol_target = opp_targ
                self._bull.leg_origin_price = self._bull.extreme
                self._bull.leg_origin_bar = self._bull.last_extreme_bar
                self.counters["cisd_confirmed"] += 1
                if passed:
                    self.counters["cisd_passed"] += 1
                    if entry_mode == 2:
                        f_ok, f_top, f_bot, f_bar = self._find_cisd_fvg(self._bull.last_extreme_bar, c_bar, True)
                        self._bull.entry_fvg_found = f_ok
                        self._bull.entry_fvg_top = f_top
                        self._bull.entry_fvg_bot = f_bot
                        self._bull.entry_fvg_bar = f_bar
                        if f_ok:
                            self.counters["setups_armed"] += 1
                else:
                    self._bull.active = False

        bear_confirm_gate = bear_filter_pass or (
            self._bear.started_valid and bear_arm_bias_ok and (bar_idx - self._bear.raid_start_bar) <= grace_bars
        )
        if self._bear.active and not self._bear.cisd_confirmed and self._bear.cisd_level is not None:
            closed_now = is_cisd_close and bar.close < self._bear.cisd_level
            closed_gap = (gap_cisd_close and len(self._cisd_candles) > 1
                          and self._cisd_candles[1].c < self._bear.cisd_level
                          and self._bear.raid_start_bar < bar_idx)
            if (closed_now or closed_gap) and bear_confirm_gate:
                c_bar = self._cisd_candles[1].end_bar if closed_gap else bar_idx
                c_price = self._cisd_candles[1].c if closed_gap else bar.close
                prob, has_aoi, any_in, aoi_raw, opp_targ, adr_exh = self._eval_setup_prob(
                    self._bear, False, c_price, c_bar, bull_bias_ok, bear_bias_ok, in_kz,
                    eff_sl_buf, today_range, adr_used_pct,
                )
                aoi_sum = aoi_raw if bear_bias_ok else f"{aoi_raw} · !=D"
                passed = self._check_prob_gate(prob, has_aoi, adr_exh, bear_bias_ok)
                self._bear.cisd_confirmed = True
                self._bear.cisd_confirm_bar = c_bar
                self._bear.confirmed_in_kz = in_kz
                self._bear.prob_score = prob
                self._bear.has_1h_aoi = has_aoi
                self._bear.aoi_in_zone = any_in
                self._bear.aoi_summary = aoi_sum
                self._bear.setup_passed = passed
                self._bear.opp_dol_target = opp_targ
                self._bear.leg_origin_price = self._bear.extreme
                self._bear.leg_origin_bar = self._bear.last_extreme_bar
                self.counters["cisd_confirmed"] += 1
                if passed:
                    self.counters["cisd_passed"] += 1
                    if entry_mode == 2:
                        f_ok, f_top, f_bot, f_bar = self._find_cisd_fvg(self._bear.last_extreme_bar, c_bar, False)
                        self._bear.entry_fvg_found = f_ok
                        self._bear.entry_fvg_top = f_top
                        self._bear.entry_fvg_bot = f_bot
                        self._bear.entry_fvg_bar = f_bar
                        if f_ok:
                            self.counters["setups_armed"] += 1
                else:
                    self._bear.active = False

        # 9. Step OTE Swing Leg tracker & evaluate entry triggers
        has_ote_sh, ote_sh_p, ote_sh_b, has_ote_sl, ote_sl_p, ote_sl_b = self._step_ote_candles(bar, bar_idx)

        bull_intent = self._process_post_cisd(
            self._bull, True, bar, bar_idx, eff_sl_buf, in_kz, bull_bias_ok,
            has_ote_sh, ote_sh_p, ote_sh_b, has_ote_sl, ote_sl_p, ote_sl_b,
        )
        bear_intent = self._process_post_cisd(
            self._bear, False, bar, bar_idx, eff_sl_buf, in_kz, bear_bias_ok,
            has_ote_sh, ote_sh_p, ote_sh_b, has_ote_sl, ote_sl_p, ote_sl_b,
        )

        self._desired = bull_intent or bear_intent

        # Keep pending broker limit orders synchronized with live setup state
        if self.has_pending and not self.has_position:
            if self._desired is None or self._desired.kind != "limit":
                self.cancel()
                self._pending_sig = None
            else:
                sig = (self._desired.side, self._desired.price, self._desired.sl, self._desired.tp)
                if self._pending_sig != sig:
                    self.cancel()
                    self._pending_sig = None

    def _process_post_cisd(
        self, s: _ActiveSetup, is_bull: bool, bar: Candle, bar_idx: int,
        eff_sl_buf: float, in_kz: bool, bias_ok: bool,
        has_ote_sh: bool, ote_sh_p: float, ote_sh_b: int,
        has_ote_sl: bool, ote_sl_p: float, ote_sl_b: int,
    ) -> Optional[_OrderIntent]:
        if not (s.active and s.cisd_confirmed and s.setup_passed):
            return None

        entry_mode = int(self.hp["entry_mode"])
        is_limit = int(self.hp["exec_type"]) == 0
        fvg_fallback = bool(int(self.hp["fvg_fallback_cisd"]))
        ote_follow = int(self.hp["ote_leg_mode"]) == 1
        target_rr = float(self.hp["rr"])
        max_ote_life = max(48, self._ote_tf_ratio * 24)

        buf_sl = (s.extreme - eff_sl_buf) if is_bull else (s.extreme + eff_sl_buf)
        zone_armed = (
            (entry_mode == 0 and s.leg_confirmed and not s.ote_locked)
            or entry_mode == 1
            or (entry_mode == 2 and (s.entry_fvg_found or fvg_fallback))
        )

        # Invalidation before zone arms or expiry
        if not zone_armed and ((is_bull and bar.low < s.leg_origin_price) or (not is_bull and bar.high > s.leg_origin_price)):
            s.active = False
            return None
        if (bar_idx - s.cisd_confirm_bar) > max_ote_life:
            s.ote_locked = True
            s.active = False
            return None

        # Hard stop invalidation on any bar while waiting for fill/retest
        if (is_bull and bar.low <= buf_sl) or ((not is_bull) and bar.high >= buf_sl):
            s.active = False
            return None

        mode_name = "OTE" if entry_mode == 0 else ("CISD" if entry_mode == 1 else "FVG")
        tags = f"{s.prob_score}% [{s.aoi_summary}] · {s.swept_source} · {mode_name}"
        note = f"CISD={s.cisd_level:.5f} Extreme={s.extreme:.5f} Prob={s.prob_score}%"

        # --- Mode 0: Return to OTE ---
        if entry_mode == 0:
            full = self.ctx.full(None)
            if is_bull:
                if has_ote_sl and not s.leg_confirmed and ote_sl_b >= s.raid_start_bar - self._ote_tf_ratio and ote_sl_p <= s.leg_origin_price:
                    s.leg_origin_price = ote_sl_p
                    s.leg_origin_bar = ote_sl_b
                if has_ote_sl and s.leg_confirmed and not s.ote_locked:
                    if ote_sl_b > s.leg_target_bar and ote_sl_p > s.leg_origin_price and (ote_sl_p <= s.fib050 or s.eq_reached):
                        s.pending_origin_p = ote_sl_p
                        s.pending_origin_b = ote_sl_b
                if has_ote_sh and not s.ote_locked and ote_sh_b >= s.leg_origin_bar and s.cisd_level is not None and ote_sh_p > s.cisd_level:
                    if not s.leg_confirmed:
                        s.leg_target_price = ote_sh_p
                        s.leg_target_bar = ote_sh_b
                        s.leg_confirmed = True
                        s.eq_reached = False
                        s.pending_origin_p = None
                        rng = s.leg_target_price - s.leg_origin_price
                        s.fib050 = s.leg_target_price - rng * 0.50
                        s.fib062 = s.leg_target_price - rng * 0.62
                        s.fib079 = s.leg_target_price - rng * 0.79
                        self.counters["setups_armed"] += 1
                        lag = bar_idx - ote_sh_b
                        for m in range(0, min(95, lag)):
                            if full[bar_idx - m].low <= s.fib050:
                                s.eq_reached = True
                                break
                    elif ote_sh_p > s.leg_target_price:
                        if not s.eq_reached:
                            s.leg_target_price = ote_sh_p
                            s.leg_target_bar = ote_sh_b
                            rng = s.leg_target_price - s.leg_origin_price
                            s.fib050 = s.leg_target_price - rng * 0.50
                            s.fib062 = s.leg_target_price - rng * 0.62
                            s.fib079 = s.leg_target_price - rng * 0.79
                        elif not ote_follow:
                            s.ote_locked = True
                            s.active = False
                            return None
                        else:
                            if s.pending_origin_p is None:
                                lp, lb = self._lowest_between(s.leg_target_bar, ote_sh_b)
                                s.leg_origin_price, s.leg_origin_bar = lp, lb
                            else:
                                s.leg_origin_price, s.leg_origin_bar = s.pending_origin_p, s.pending_origin_b
                            s.leg_target_price = ote_sh_p
                            s.leg_target_bar = ote_sh_b
                            s.eq_reached = False
                            s.pending_origin_p = None
                            rng = s.leg_target_price - s.leg_origin_price
                            s.fib050 = s.leg_target_price - rng * 0.50
                            s.fib062 = s.leg_target_price - rng * 0.62
                            s.fib079 = s.leg_target_price - rng * 0.79
            else:
                if has_ote_sh and not s.leg_confirmed and ote_sh_b >= s.raid_start_bar - self._ote_tf_ratio and ote_sh_p >= s.leg_origin_price:
                    s.leg_origin_price = ote_sh_p
                    s.leg_origin_bar = ote_sh_b
                if has_ote_sh and s.leg_confirmed and not s.ote_locked:
                    if ote_sh_b > s.leg_target_bar and ote_sh_p < s.leg_origin_price and (ote_sh_p >= s.fib050 or s.eq_reached):
                        s.pending_origin_p = ote_sh_p
                        s.pending_origin_b = ote_sh_b
                if has_ote_sl and not s.ote_locked and ote_sl_b >= s.leg_origin_bar and s.cisd_level is not None and ote_sl_p < s.cisd_level:
                    if not s.leg_confirmed:
                        s.leg_target_price = ote_sl_p
                        s.leg_target_bar = ote_sl_b
                        s.leg_confirmed = True
                        s.eq_reached = False
                        s.pending_origin_p = None
                        rng = s.leg_origin_price - s.leg_target_price
                        s.fib050 = s.leg_target_price + rng * 0.50
                        s.fib062 = s.leg_target_price + rng * 0.62
                        s.fib079 = s.leg_target_price + rng * 0.79
                        self.counters["setups_armed"] += 1
                        lag = bar_idx - ote_sl_b
                        for m in range(0, min(95, lag)):
                            if full[bar_idx - m].high >= s.fib050:
                                s.eq_reached = True
                                break
                    elif ote_sl_p < s.leg_target_price:
                        if not s.eq_reached:
                            s.leg_target_price = ote_sl_p
                            s.leg_target_bar = ote_sl_b
                            rng = s.leg_origin_price - s.leg_target_price
                            s.fib050 = s.leg_target_price + rng * 0.50
                            s.fib062 = s.leg_target_price + rng * 0.62
                            s.fib079 = s.leg_target_price + rng * 0.79
                        elif not ote_follow:
                            s.ote_locked = True
                            s.active = False
                            return None
                        else:
                            if s.pending_origin_p is None:
                                hp, hb = self._highest_between(s.leg_target_bar, ote_sl_b)
                                s.leg_origin_price, s.leg_origin_bar = hp, hb
                            else:
                                s.leg_origin_price, s.leg_origin_bar = s.pending_origin_p, s.pending_origin_b
                            s.leg_target_price = ote_sl_p
                            s.leg_target_bar = ote_sl_b
                            s.eq_reached = False
                            s.pending_origin_p = None
                            rng = s.leg_origin_price - s.leg_target_price
                            s.fib050 = s.leg_target_price + rng * 0.50
                            s.fib062 = s.leg_target_price + rng * 0.62
                            s.fib079 = s.leg_target_price + rng * 0.79

            if not (s.active and s.leg_confirmed and not s.ote_locked):
                return None

            if bar_idx > s.leg_target_bar:
                if (is_bull and bar.low <= s.fib050) or ((not is_bull) and bar.high >= s.fib050):
                    s.eq_reached = True

            if not (self._kz_gate_ok(s, in_kz) and bias_ok and not s.signal_fired):
                return None

            if is_limit:
                if self.has_position:
                    if bar_idx > s.cisd_confirm_bar and bar_idx > s.leg_target_bar:
                        if (is_bull and bar.low <= s.fib062) or ((not is_bull) and bar.high >= s.fib062):
                            s.ote_locked = True
                            s.active = False
                    return None
                if (is_bull and s.fib062 > buf_sl) or ((not is_bull) and buf_sl > s.fib062):
                    risk = (s.fib062 - buf_sl) if is_bull else (buf_sl - s.fib062)
                    tp = (s.fib062 + target_rr * risk) if is_bull else (s.fib062 - target_rr * risk)
                    return _OrderIntent("limit", "long" if is_bull else "short", s.fib062, buf_sl, tp, tags, note)
                return None
            else:
                in_ote = (bar_idx > s.cisd_confirm_bar and bar_idx > s.leg_target_bar
                          and ((is_bull and bar.low <= s.fib062) or ((not is_bull) and bar.high >= s.fib062)))
                hold_ok = (bar.low > buf_sl and bar.close > s.fib079) if is_bull else (bar.high < buf_sl and bar.close < s.fib079)
                if in_ote and hold_ok:
                    risk = (bar.close - buf_sl) if is_bull else (buf_sl - bar.close)
                    if risk > 0:
                        tp = (bar.close + target_rr * risk) if is_bull else (bar.close - target_rr * risk)
                        s.signal_fired = True
                        s.ote_locked = True
                        s.active = False
                        return _OrderIntent("market", "long" if is_bull else "short", bar.close, buf_sl, tp, tags, note)
                return None

        # --- Mode 1: Return to CISD Break ---
        if entry_mode == 1:
            if s.cisd_level is None:
                return None
            if bar_idx == s.cisd_confirm_bar:
                self.counters["setups_armed"] += 1
            if not (self._kz_gate_ok(s, in_kz) and bias_ok and not s.signal_fired):
                return None
            lvl = s.cisd_level
            if is_limit:
                risk = (lvl - buf_sl) if is_bull else (buf_sl - lvl)
                if risk > 0:
                    tp = (lvl + target_rr * risk) if is_bull else (lvl - target_rr * risk)
                    return _OrderIntent("limit", "long" if is_bull else "short", lvl, buf_sl, tp, tags, note)
                return None
            else:
                in_bar = bar_idx > s.cisd_confirm_bar and ((is_bull and bar.low <= lvl) or ((not is_bull) and bar.high >= lvl))
                hold_ok = (bar.low > buf_sl and bar.close > s.extreme) if is_bull else (bar.high < buf_sl and bar.close < s.extreme)
                if in_bar and hold_ok:
                    risk = (bar.close - buf_sl) if is_bull else (buf_sl - bar.close)
                    if risk > 0:
                        tp = (bar.close + target_rr * risk) if is_bull else (bar.close - target_rr * risk)
                        s.signal_fired = True
                        s.active = False
                        return _OrderIntent("market", "long" if is_bull else "short", bar.close, buf_sl, tp, tags, note)
                return None

        # --- Mode 2: Return to FVG (CISD) ---
        if not s.entry_fvg_found and bar_idx <= s.cisd_confirm_bar + 2:
            f_ok, f_top, f_bot, f_bar = self._find_cisd_fvg(s.last_extreme_bar, bar_idx, is_bull)
            if f_ok:
                s.entry_fvg_found = True
                s.entry_fvg_top = f_top
                s.entry_fvg_bot = f_bot
                s.entry_fvg_bar = f_bar
                self.counters["setups_armed"] += 1

        if s.entry_fvg_found:
            if not (self._kz_gate_ok(s, in_kz) and bias_ok and not s.signal_fired):
                return None
            lvl = s.entry_fvg_top if is_bull else s.entry_fvg_bot
            if is_limit:
                risk = (lvl - buf_sl) if is_bull else (buf_sl - lvl)
                if risk > 0:
                    tp = (lvl + target_rr * risk) if is_bull else (lvl - target_rr * risk)
                    return _OrderIntent("limit", "long" if is_bull else "short", lvl, buf_sl, tp, tags, note)
                return None
            else:
                in_bar = bar_idx > s.entry_fvg_bar and ((is_bull and bar.low <= lvl) or ((not is_bull) and bar.high >= lvl))
                hold_ok = (bar.low > buf_sl and bar.close > s.extreme) if is_bull else (bar.high < buf_sl and bar.close < s.extreme)
                if in_bar and hold_ok:
                    risk = (bar.close - buf_sl) if is_bull else (buf_sl - bar.close)
                    if risk > 0:
                        tp = (bar.close + target_rr * risk) if is_bull else (bar.close - target_rr * risk)
                        s.signal_fired = True
                        s.active = False
                        return _OrderIntent("market", "long" if is_bull else "short", bar.close, buf_sl, tp, tags, note)
                return None
        elif bar_idx > s.cisd_confirm_bar + 2:
            if fvg_fallback and s.cisd_level is not None:
                if not (self._kz_gate_ok(s, in_kz) and bias_ok and not s.signal_fired):
                    return None
                lvl = s.cisd_level
                if is_limit:
                    risk = (lvl - buf_sl) if is_bull else (buf_sl - lvl)
                    if risk > 0:
                        tp = (lvl + target_rr * risk) if is_bull else (lvl - target_rr * risk)
                        return _OrderIntent("limit", "long" if is_bull else "short", lvl, buf_sl, tp, tags, note)
                else:
                    in_bar = (is_bull and bar.low <= lvl) or ((not is_bull) and bar.high >= lvl)
                    hold_ok = (bar.low > buf_sl and bar.close > s.extreme) if is_bull else (bar.high < buf_sl and bar.close < s.extreme)
                    if in_bar and hold_ok:
                        risk = (bar.close - buf_sl) if is_bull else (buf_sl - bar.close)
                        if risk > 0:
                            tp = (bar.close + target_rr * risk) if is_bull else (bar.close - target_rr * risk)
                            s.signal_fired = True
                            s.active = False
                            return _OrderIntent("market", "long" if is_bull else "short", bar.close, buf_sl, tp, tags, note)
            else:
                s.active = False
        return None

    # --- Strategy entry hooks ------------------------------------------------

    def should_long(self) -> bool:
        return self._desired is not None and self._desired.side == "long"

    def should_short(self) -> bool:
        return self._desired is not None and self._desired.side == "short"

    def go_long(self) -> None:
        intent = self._desired
        if intent is None or intent.side != "long":
            return
        qty = self.position_size(float(self.hp["risk_pct"]), intent.price, intent.sl)
        if qty <= 0:
            return
        self.counters["orders_submitted"] += 1
        if intent.kind == "limit":
            self.buy_limit(qty, intent.price, sl=intent.sl, tp=intent.tp, note=intent.note, tags=intent.tags)
            self._pending_sig = (intent.side, intent.price, intent.sl, intent.tp)
        else:
            self.buy_market(qty, sl=intent.sl, tp=intent.tp, note=intent.note, tags=intent.tags)

    def go_short(self) -> None:
        intent = self._desired
        if intent is None or intent.side != "short":
            return
        qty = self.position_size(float(self.hp["risk_pct"]), intent.price, intent.sl)
        if qty <= 0:
            return
        self.counters["orders_submitted"] += 1
        if intent.kind == "limit":
            self.sell_limit(qty, intent.price, sl=intent.sl, tp=intent.tp, note=intent.note, tags=intent.tags)
            self._pending_sig = (intent.side, intent.price, intent.sl, intent.tp)
        else:
            self.sell_market(qty, sl=intent.sl, tp=intent.tp, note=intent.note, tags=intent.tags)
