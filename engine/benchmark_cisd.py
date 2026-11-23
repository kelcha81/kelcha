"""
Multi-symbol, multi-year CLI benchmark for the ICT Sweep -> CISD Model.

Usage:
    python benchmark_cisd.py --data-dir C:/path/to/candles-data --tf m5
    python benchmark_cisd.py --data-dir C:/path/to/candles-data --tf m5 --modes 0:0,0:1,1:1,2:0
    python benchmark_cisd.py --data-dir C:/path/to/candles-data --tf m5 --days 47 --by-year
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from typing import Optional

from candles import load_manifest, load_series
from engine import run_backtest
from metrics import compute_stats
from models import Account
from server import _asset_class, _contract_size
from strategies.ict_sweep_cisd import IctSweepCisd

MODE_LABELS = {
    (0, 0): "OTE (Limit)",
    (0, 1): "OTE (Close)",
    (1, 0): "CISD Break (Limit)",
    (1, 1): "CISD Break (Close)",
    (2, 0): "CISD FVG (Limit)",
    (2, 1): "CISD FVG (Close)",
}


def _discover_symbols(data_dir: str) -> list[str]:
    out = []
    for entry in sorted(os.listdir(data_dir)):
        if entry.startswith("_") or entry.startswith("."):
            continue
        p = os.path.join(data_dir, entry, "manifest.json")
        if os.path.isfile(p):
            out.append(entry)
    return out


def _trade_r(t) -> float:
    if t.risk and t.risk > 0:
        return t.pnl / t.risk
    return 0.0


def _load_symbol_bundle(
    symbol: str,
    timeframe: str,
    data_dir: str,
    from_ts: Optional[int] = None,
    to_ts: Optional[int] = None,
) -> dict:
    manifest = load_manifest(symbol, base=data_dir)
    prec = int(manifest.get("pricePrecision", 5))
    cs = _contract_size(symbol, manifest)
    ac = _asset_class(symbol, manifest)

    base = load_series(symbol, timeframe, base=data_dir, from_ts=from_ts, to_ts=to_ts)
    htf_tfs = IctSweepCisd.required_htf(timeframe, IctSweepCisd.params)
    htf_map = {}
    for tf in htf_tfs:
        if tf != timeframe:
            htf_from = max(0, from_ts - 60 * 86_400_000) if from_ts is not None else None
            try:
                htf_map[tf] = load_series(symbol, tf, base=data_dir, from_ts=htf_from, to_ts=to_ts)
            except FileNotFoundError:
                pass
    return {
        "symbol": symbol,
        "manifest": manifest,
        "prec": prec,
        "cs": cs,
        "ac": ac,
        "base": base,
        "htf_map": htf_map,
    }


def run_symbol(
    symbol: str,
    timeframe: str,
    data_dir: str,
    params: dict,
    from_ts: Optional[int] = None,
    to_ts: Optional[int] = None,
    warmup: int = 240,
    spread: float = 0.0,
    bundle: Optional[dict] = None,
) -> dict:
    b = bundle or _load_symbol_bundle(symbol, timeframe, data_dir, from_ts=from_ts, to_ts=to_ts)
    base = b["base"]
    htf_map = b["htf_map"]

    t0 = time.perf_counter()
    strat = IctSweepCisd(params)
    account = Account(balance=10_000.0, spread=spread, commission=0.0)
    res = run_backtest(
        strat, base, htf_map, m1=None, account=account,
        contract_size=b["cs"], price_precision=b["prec"],
        warmup=min(warmup, max(0, len(base) - 1)),
        symbol=symbol, timeframe=timeframe, asset_class=b["ac"],
    )
    elapsed = time.perf_counter() - t0

    # Exclude forced EOD open trade from win/loss stats to match TradingView closed-trade tracking
    closed = [t for t in res.trades if t.reason != "eod"]
    stats = compute_stats(closed, account.balance)
    wins = sum(1 for t in closed if t.pnl > 0)
    losses = sum(1 for t in closed if t.pnl <= 0)
    net_r = sum(_trade_r(t) for t in closed)

    by_year: dict[int, dict] = defaultdict(lambda: {"wins": 0, "losses": 0, "net_r": 0.0})
    for t in closed:
        yr = datetime.fromtimestamp(t.entryTime / 1000.0, tz=timezone.utc).year
        if t.pnl > 0:
            by_year[yr]["wins"] += 1
        else:
            by_year[yr]["losses"] += 1
        by_year[yr]["net_r"] += _trade_r(t)

    date_min = datetime.fromtimestamp(base[0].timestamp / 1000.0, tz=timezone.utc).strftime("%Y-%m-%d") if base else "-"
    date_max = datetime.fromtimestamp(base[-1].timestamp / 1000.0, tz=timezone.utc).strftime("%Y-%m-%d") if base else "-"

    return {
        "symbol": symbol,
        "bars": len(base),
        "range": f"{date_min}..{date_max}",
        "elapsed_s": elapsed,
        "counters": dict(strat.counters),
        "trades": len(closed),
        "wins": wins,
        "losses": losses,
        "win_rate": stats["winRate"] * 100.0,
        "net_r": net_r,
        "avg_r": stats["avgR"],
        "pf": stats["profitFactor"],
        "max_dd_pct": (stats["maxDrawdown"] / account.balance) * 100.0,
        "by_year": dict(sorted(by_year.items())),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Benchmark ICT Sweep -> CISD Model across multi-year GCP candles")
    ap.add_argument("--data-dir", default=os.environ.get("ICT_DATA_DIR", ""), help="Path to packaged candles directory")
    ap.add_argument("--tf", default="m5", help="Execution timeframe (default: m5)")
    ap.add_argument("--symbols", default="", help="Comma-separated symbol list (default: all in data-dir)")
    ap.add_argument("--modes", default="0:0,0:1,1:1,2:0", help="Comma-separated entry_mode:exec_type pairs")
    ap.add_argument("--min-prob", type=int, default=70)
    ap.add_argument("--rr", type=float, default=2.0)
    ap.add_argument("--sl-pips", type=float, default=5.0)
    ap.add_argument("--days", type=int, default=0, help="If >0, restrict to last N days of each symbol's data")
    ap.add_argument("--by-year", action="store_true", help="Print year-by-year breakdown for first mode")
    ap.add_argument("--json-out", default="", help="Optional path to save full JSON summary")
    args = ap.parse_args()

    if not args.data_dir or not os.path.isdir(args.data_dir):
        print(f"ERROR: invalid --data-dir {args.data_dir!r}", file=sys.stderr)
        return 1

    symbols = [s.strip().lower() for s in args.symbols.split(",") if s.strip()] if args.symbols else _discover_symbols(args.data_dir)
    mode_pairs = []
    for tok in args.modes.split(","):
        em, ex = tok.strip().split(":")
        mode_pairs.append((int(em), int(ex)))

    # Pre-load each symbol once so multi-mode sweeps skip repeated JSON I/O
    bundles: dict[str, dict] = {}
    for sym in symbols:
        manifest = load_manifest(sym, base=args.data_dir)
        from_ts = None
        if args.days > 0 and manifest.get("dataMax"):
            from_ts = int(manifest["dataMax"]) - args.days * 86_400_000
        bundles[sym] = _load_symbol_bundle(sym, args.tf, args.data_dir, from_ts=from_ts)

    all_results = {}
    for m_idx, (em, ex) in enumerate(mode_pairs):
        mode_name = MODE_LABELS.get((em, ex), f"mode={em},exec={ex}")
        print(f"\n=== {mode_name} | TF={args.tf.upper()} | MinProb={args.min_prob}% | SL+{args.sl_pips}p | RR={args.rr}R ===", flush=True)
        print(f"{'Symbol':<9} {'Bars':>7} {'CISD+':>6} {'Trades':>6} {'W/L':>9} {'Win%':>6} {'Net R':>8} {'Avg R':>7} {'PF':>6} {'Time':>6}", flush=True)
        print("-" * 82, flush=True)

        rows = []
        tot_w = tot_l = tot_cisd = 0
        tot_r = 0.0
        agg_year: dict[int, dict] = defaultdict(lambda: {"wins": 0, "losses": 0, "net_r": 0.0})

        for sym in symbols:
            params = {
                "entry_mode": em,
                "exec_type": ex,
                "min_prob": args.min_prob,
                "rr": args.rr,
                "sl_buffer_pips": args.sl_pips,
            }
            r = run_symbol(sym, args.tf, args.data_dir, params, bundle=bundles[sym])
            rows.append(r)
            tot_w += r["wins"]
            tot_l += r["losses"]
            tot_r += r["net_r"]
            tot_cisd += r["counters"]["cisd_passed"]
            for yr, yv in r["by_year"].items():
                agg_year[yr]["wins"] += yv["wins"]
                agg_year[yr]["losses"] += yv["losses"]
                agg_year[yr]["net_r"] += yv["net_r"]

            pf_s = f"{r['pf']:.2f}" if r["pf"] < 999 else "inf"
            wl_s = f"{r['wins']}W/{r['losses']}L"
            print(
                f"{sym.upper():<9} {r['bars']:>7d} {r['counters']['cisd_passed']:>6d} "
                f"{r['trades']:>6d} {wl_s:>9} {r['win_rate']:>5.1f}% {r['net_r']:>+8.1f} "
                f"{r['avg_r']:>+7.2f} {pf_s:>6} {r['elapsed_s']:>5.1f}s",
                flush=True,
            )

        tot_tr = tot_w + tot_l
        tot_wr = (tot_w / tot_tr * 100.0) if tot_tr else 0.0
        tot_avg = (tot_r / tot_tr) if tot_tr else 0.0
        print("-" * 82, flush=True)
        print(
            f"{'TOTAL':<9} {'':>7} {tot_cisd:>6d} {tot_tr:>6d} "
            f"{f'{tot_w}W/{tot_l}L':>9} {tot_wr:>5.1f}% {tot_r:>+8.1f} {tot_avg:>+7.2f}",
            flush=True,
        )

        if args.by_year and m_idx == 0:
            print("\nYear-by-Year Aggregate:", flush=True)
            for yr in sorted(agg_year):
                yv = agg_year[yr]
                n = yv["wins"] + yv["losses"]
                wr = (yv["wins"] / n * 100.0) if n else 0.0
                avg = (yv["net_r"] / n) if n else 0.0
                print(f"  {yr}: {n:>4d} trades ({yv['wins']}W/{yv['losses']}L) | WR={wr:5.1f}% | Net={yv['net_r']:+7.1f}R | Avg={avg:+.2f}R", flush=True)

        all_results[mode_name] = {
            "total_trades": tot_tr,
            "wins": tot_w,
            "losses": tot_l,
            "win_rate": round(tot_wr, 2),
            "net_r": round(tot_r, 2),
            "avg_r": round(tot_avg, 3),
            "by_year": {str(k): v for k, v in sorted(agg_year.items())},
            "symbols": rows,
        }

    if args.json_out:
        with open(args.json_out, "w", encoding="utf-8") as f:
            json.dump(all_results, f, indent=2)
        print(f"\nSaved JSON summary -> {args.json_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
