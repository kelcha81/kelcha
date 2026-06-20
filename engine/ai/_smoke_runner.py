"""
Child-process entry point for sandboxed strategy validation.

Loads a strategy module by path, runs a short backtest over synthetic candles,
and prints a single JSON line with the result. Invoked by ``ai.sandbox`` in a
separate ``python`` process with a wall-clock timeout, so a broken or runaway
strategy can never hang or crash the server.

    python ai/_smoke_runner.py <code_file.py>
"""

import importlib.util
import inspect
import json
import os
import sys

# make the engine modules importable (parent of ai/)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from engine import run_backtest          # noqa: E402
from metrics import compute_stats         # noqa: E402
from models import Candle                 # noqa: E402
from strategy import Strategy             # noqa: E402

MIN15 = 15 * 60_000


def _synthetic(n: int) -> list[Candle]:
    out: list[Candle] = []
    price = 1.1000
    for i in range(n):
        price += 0.0006 if (i // 8) % 2 == 0 else -0.0006
        out.append(Candle(i * MIN15, price, price + 0.0012, price - 0.0012, price + 0.0004, 1.0))
    return out


def _load_strategy_cls(path: str):
    spec = importlib.util.spec_from_file_location("user_smoke", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    for _, obj in inspect.getmembers(mod, inspect.isclass):
        if issubclass(obj, Strategy) and obj is not Strategy and obj.__module__ == mod.__name__:
            return obj
    raise ValueError("no Strategy subclass found")


def main() -> None:
    cls = _load_strategy_cls(sys.argv[1])
    base = _synthetic(250)
    res = run_backtest(cls(), base, {}, contract_size=100000, price_precision=5, warmup=50)
    print(json.dumps({"ok": True, "stats": compute_stats(res.trades, 10000)}))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001 — report any failure as a structured error
        print(json.dumps({"ok": False, "errors": [f"{type(exc).__name__}: {exc}"]}))
