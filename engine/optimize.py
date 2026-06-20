"""
Hyper-parameter search over strategy + detector params, maximizing a backtest
metric. Uses optuna when installed, else a stdlib random search — same result
shape either way, so it runs with zero deps and scales up when you `pip install
optuna`.

    python optimize.py eurusd --strategy killzone_fvg_ob --metric avgR --trials 60

Default metric is ``avgR`` (average R-multiple) — size-independent, so the search
optimizes setup quality rather than position sizing. A minimum-trades guard
rejects degenerate "one lucky trade" configs.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import random
from typing import Optional

import strategies
from candles import load_series
from engine import run_backtest
from metrics import compute_stats
from models import Account

# strategy name -> search space. tuple=(low,high[, 'int']) float/int range; list=categorical.
SPACES: dict[str, dict] = {
    "killzone_fvg_ob": {
        "rr": (1.0, 4.0),
        "fvg_min_atr": (0.0, 1.5),
        "sl_buffer_pips": (0.0, 6.0),
        "swing_lookback": [2, 3, 5],
    },
}


def space_for(name: str) -> dict:
    if name in SPACES:
        return SPACES[name]
    # generic fallback: +/-50% around each numeric default
    space: dict = {}
    for k, v in strategies.default_params(name).items():
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            lo, hi = (v * 0.5, v * 1.5) if v else (0.0, 1.0)
            space[k] = (lo, hi, "int") if isinstance(v, int) else (lo, hi)
    return space


def _metric_value(stats: dict, metric: str) -> float:
    v = stats.get(metric)
    if v is None:
        return -1e9
    if metric == "maxDrawdown":
        return -float(v)
    if not math.isfinite(v):
        return 1e6  # e.g. infinite profit factor (no losers)
    return float(v)


def make_objective(name: str, symbol: str, timeframe: str, htf: list[str],
                   account: Account, contract_size: float, price_precision: int,
                   warmup: int, metric: str, min_trades: int,
                   from_ts: Optional[int] = None, to_ts: Optional[int] = None):
    base = load_series(symbol, timeframe, from_ts=from_ts, to_ts=to_ts)
    htf_map = {tf: load_series(symbol, tf, from_ts=from_ts, to_ts=to_ts) for tf in htf if tf and tf != timeframe}

    def objective(sampled: dict) -> float:
        params = {**strategies.default_params(name), **sampled}
        try:
            res = run_backtest(strategies.build(name, params), base, htf_map, m1=None,
                               account=account, contract_size=contract_size,
                               price_precision=price_precision, warmup=warmup)
        except Exception:  # noqa: BLE001 — a bad param combo must not abort the search
            return -1e9
        stats = compute_stats(res.trades, account.balance)
        if stats["trades"] < min_trades:
            return -1e9
        return _metric_value(stats, metric)

    return objective


def _sample(space: dict, rng: random.Random) -> dict:
    out = {}
    for k, spec in space.items():
        if isinstance(spec, list):
            out[k] = rng.choice(spec)
        elif len(spec) == 3 and spec[2] == "int":
            out[k] = rng.randint(int(spec[0]), int(spec[1]))
        else:
            out[k] = round(rng.uniform(spec[0], spec[1]), 4)
    return out


def search(name: str, symbol: str, timeframe: str = "h1", n_trials: int = 50,
           space: Optional[dict] = None, htf: Optional[list[str]] = None,
           account: Optional[Account] = None, contract_size: float = 100000.0,
           price_precision: int = 5, warmup: int = 50, metric: str = "avgR",
           min_trades: int = 10, seed: int = 0,
           from_ts: Optional[int] = None, to_ts: Optional[int] = None) -> dict:
    space = space or space_for(name)
    account = account or Account()
    htf = htf if htf is not None else [strategies.default_params(name).get("bias_tf", "h4")]
    objective = make_objective(name, symbol, timeframe, htf, account, contract_size,
                               price_precision, warmup, metric, min_trades, from_ts, to_ts)

    try:
        import optuna  # type: ignore

        optuna.logging.set_verbosity(optuna.logging.WARNING)

        def opt_obj(trial):
            sampled = {}
            for k, spec in space.items():
                if isinstance(spec, list):
                    sampled[k] = trial.suggest_categorical(k, spec)
                elif len(spec) == 3 and spec[2] == "int":
                    sampled[k] = trial.suggest_int(k, int(spec[0]), int(spec[1]))
                else:
                    sampled[k] = trial.suggest_float(k, spec[0], spec[1])
            return objective(sampled)

        study = optuna.create_study(direction="maximize",
                                    sampler=optuna.samplers.TPESampler(seed=seed))
        study.optimize(opt_obj, n_trials=n_trials)
        return {"backend": "optuna", "metric": metric, "value": study.best_value,
                "params": study.best_params, "trials": n_trials}
    except ImportError:
        rng = random.Random(seed)
        best_val, best_params = -math.inf, {}
        for _ in range(n_trials):
            sampled = _sample(space, rng)
            val = objective(sampled)
            if val > best_val:
                best_val, best_params = val, sampled
        return {"backend": "random", "metric": metric, "value": best_val,
                "params": best_params, "trials": n_trials}


# --- CLI ---------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description="Optimize strategy/detector params over a backtest metric")
    ap.add_argument("symbol")
    ap.add_argument("--strategy", default=(strategies.names()[0] if strategies.names() else "killzone_fvg_ob"))
    ap.add_argument("--timeframe", default="h1")
    ap.add_argument("--metric", default="avgR")
    ap.add_argument("--trials", type=int, default=50)
    ap.add_argument("--min-trades", type=int, default=10)
    ap.add_argument("--warmup", type=int, default=50)
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()

    from labels import labels_dir

    result = search(args.strategy, args.symbol, timeframe=args.timeframe, n_trials=args.trials,
                    metric=args.metric, min_trades=args.min_trades, warmup=args.warmup, seed=args.seed)
    print(f"[{result['backend']}] best {args.metric} = {result['value']:.4f} over {result['trials']} trials")
    print(f"params -> {result['params']}")

    os.makedirs(labels_dir(), exist_ok=True)
    out_path = os.path.join(labels_dir(), f"{args.symbol}.optimized.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"symbol": args.symbol, "strategy": args.strategy, **result}, f, indent=2)
    print(f"written -> {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
