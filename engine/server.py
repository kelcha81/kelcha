"""
ICT engine HTTP backend — drop-in replacement for strategy-backend/server.py.

Same JSON contract the front-end already speaks (src/lib/strategyApi.ts), so
``forex-replay-app`` works unchanged; the response is *extended* with ICT
``annotations`` and the request may add multi-timeframe context + an account.

    python server.py            # serves on http://localhost:8000

Endpoints:
    GET  /strategies               -> { name: { label, params, description } }
    POST /backtest {symbol, timeframe, strategy, params, htf?, from?, to?, warmup?, account?}
                                   -> { stats, trades, equity, annotations }
    GET  /capabilities             -> { ai: bool }
    GET  /models                   -> { models: [{id, display_name}] }
    GET  /strategy/<name>/code     -> { code, builtin }
    POST /strategy/validate {code} -> { ok, errors?, stats? }
    POST /strategy/save {name,code}-> { ok, name? , errors? }
    POST /strategy/generate {description, base_code?, model?, name?}
                                   -> text/event-stream of { text } chunks

Backtests are pure stdlib; AI authoring needs `anthropic` + ANTHROPIC_API_KEY.
"""

from __future__ import annotations

import json
import math
import os
import re
import shutil
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import auth
import calibrate
import optimize
import strategies
from ai.client import ai_available, generate, list_models
from ai.sandbox import smoke_test
from annotations import build_annotations
from applog import log, log_backtest
from candles import load_manifest, load_series
from engine import run_backtest
from labels import has_labels, load_labels
from metrics import compute_stats, equity_curve
from models import Account

# Local dev binds 127.0.0.1:8000. On Cloud Run the platform injects PORT
# (usually 8080) and the container must listen on 0.0.0.0 / all interfaces.
PORT = int(os.environ.get("PORT", "8000"))
HOST = os.environ.get("ICT_HOST", "0.0.0.0" if os.environ.get("PORT") else "127.0.0.1")


def _load_dotenv() -> None:
    """Load ict-engine/.env (KEY=VALUE lines) so ANTHROPIC_API_KEY can live in a
    file instead of the shell. Existing environment values win; stdlib only."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if not os.path.isfile(path):
        return
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))


_load_dotenv()

# contract size per asset (units per 1.0 lot) — mirrors symbols.ts.
INDEX_SYMBOLS = {"us30", "nas100", "us500", "ger40"}


def _contract_size(symbol: str) -> float:
    return 1.0 if symbol in INDEX_SYMBOLS else 100000.0


def run(req: dict) -> dict:
    symbol = req["symbol"]
    timeframe = req.get("timeframe", "h1")
    name = req["strategy"]
    params = {**strategies.default_params(name), **(req.get("params") or {})}

    manifest = load_manifest(symbol)
    price_precision = int(manifest.get("pricePrecision", 5))
    contract_size = _contract_size(symbol)

    frm, to = req.get("from"), req.get("to")
    base = load_series(symbol, timeframe, from_ts=frm, to_ts=to)

    # higher-timeframe context: requested list, else the strategy's bias tf.
    htf_list = req.get("htf") or [params.get("bias_tf", "h4")]
    htf_map = {}
    for tf in htf_list:
        if tf and tf != timeframe:
            htf_map[tf] = load_series(symbol, tf, from_ts=frm, to_ts=to)

    acc_in = req.get("account") or {}
    account = Account(
        balance=float(acc_in.get("balance", 10000)),
        spread=float(acc_in.get("spread", 0)),
        commission=float(acc_in.get("commission", 0)),
    )

    t0 = time.time()
    strat = strategies.build(name, params)
    result = run_backtest(strat, base, htf_map, m1=None, account=account,
                          contract_size=contract_size, price_precision=price_precision,
                          warmup=int(req.get("warmup", 50)))

    stats = compute_stats(result.trades, account.balance)
    equity = [{"timestamp": p["t"], "equity": p["equity"]} for p in equity_curve(result.trades, account.balance)]
    annotations = build_annotations(base, params)
    elapsed_ms = round((time.time() - t0) * 1000)

    pf = stats["profitFactor"]
    log_backtest({
        "ts": int(time.time() * 1000),
        "symbol": symbol, "timeframe": timeframe, "strategy": name,
        "params": req.get("params") or {}, "from": frm, "to": to, "candles": len(base),
        "trades": stats["trades"], "totalPnl": round(stats["totalPnl"], 2),
        "winRate": round(stats["winRate"], 4),
        "profitFactor": pf if math.isfinite(pf) else None,
        "elapsedMs": elapsed_ms,
    })
    log.info("backtest %s %s %s -> %d trades, pnl %.2f (%dms)",
             symbol, timeframe, name, stats["trades"], stats["totalPnl"], elapsed_ms)

    return {
        "stats": stats,
        "trades": [t.to_dict() for t in result.trades],
        "equity": equity,
        "annotations": annotations,
    }


# --- AI strategy save --------------------------------------------------------

def _slug(name: str) -> str:
    s = re.sub(r"[^a-z0-9_]+", "_", (name or "").strip().lower()).strip("_")
    if not s:
        s = "strategy"
    if s[0].isdigit():
        s = "s_" + s
    return s[:48]


def save_strategy(name: str, code: str) -> dict:
    res = smoke_test(code)
    if not res.get("ok"):
        return {"ok": False, "errors": res.get("errors", ["validation failed"])}
    slug = _slug(name)
    os.makedirs(strategies.USER_DIR, exist_ok=True)
    path = os.path.join(strategies.USER_DIR, f"{slug}.py")
    if os.path.exists(path):
        shutil.copy2(path, f"{path}.{int(time.time())}.bak")  # keep a backup on overwrite
    with open(path, "w", encoding="utf-8") as f:
        f.write(code)
    return {"ok": True, "name": slug, "stats": res.get("stats")}


# --- research: optimize + calibrate ------------------------------------------

def run_optimize(req: dict) -> dict:
    name = req["strategy"]
    symbol = req["symbol"]
    timeframe = req.get("timeframe", "h1")
    prec = int(load_manifest(symbol).get("pricePrecision", 5))
    res = optimize.search(
        name, symbol, timeframe=timeframe, n_trials=int(req.get("trials", 30)),
        metric=req.get("metric", "avgR"), min_trades=int(req.get("min_trades", 5)),
        price_precision=prec, contract_size=_contract_size(symbol),
        warmup=int(req.get("warmup", 50)), from_ts=req.get("from"), to_ts=req.get("to"),
    )
    log.info("optimize %s %s -> %s=%.4f (%d trials, %s)",
             symbol, name, res["metric"], res["value"], res["trials"], res["backend"])
    return res


def run_calibrate(req: dict) -> dict:
    symbol = req["symbol"]
    timeframe = req.get("timeframe", "h1")
    if not has_labels(symbol):
        return {"ok": False, "error": f"No labels for {symbol}. Export tagged trades to engine/labels/{symbol}.json."}
    candles = load_series(symbol, timeframe, from_ts=req.get("from"), to_ts=req.get("to"))
    trades = load_labels(symbol)
    best, rows = calibrate.sweep(candles, trades,
                                 max_lag_bars=int(req.get("max_lag_bars", 10)),
                                 penalty=float(req.get("penalty", 0.5)))
    log.info("calibrate %s: %d labels -> %s", symbol, len(trades), best)
    return {"ok": True, "best": best, "rows": rows[:8], "labels": len(trades)}


# --- HTTP --------------------------------------------------------------------

class Handler(BaseHTTPRequestHandler):
    def _send(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self._cors()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def _body(self) -> dict:
        length = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(length) or b"{}")

    def _gate(self):
        """When auth is enabled: require a valid Firebase ID token, and the
        `ictTraining` module for AI/calibration routes. Returns (code, payload)
        to reject, or None to proceed."""
        self.claims = {}
        if not auth.required():
            return None
        claims = auth.verify(self.headers)
        if claims is None:
            return (401, {"error": "unauthorized"})
        if auth.is_training_route(self.path) and not auth.has_module(claims, "ictTraining"):
            return (403, {"error": "module 'ictTraining' is not enabled for this account"})
        self.claims = claims
        return None

    def do_OPTIONS(self):
        # Preflight: reply with CORS headers and NO body. A 204 with a body is a
        # protocol error that Cloud Run's HTTP/2 frontend rejects with a 502,
        # which strips the CORS headers and breaks every browser preflight.
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        gate = self._gate()
        if gate:
            self._send(*gate)
            return
        path = self.path.rstrip("/")
        try:
            if path == "/strategies":
                self._send(200, strategies.info())
            elif path == "/capabilities":
                self._send(200, {"ai": ai_available()})
            elif path == "/models":
                self._send(200, {"models": list_models()})
            elif path.startswith("/strategy/") and path.endswith("/code"):
                name = path[len("/strategy/"):-len("/code")]
                src = strategies.source(name)
                self._send(200 if src else 404, src or {"error": "not found"})
            else:
                self._send(404, {"error": "not found"})
        except Exception as exc:  # noqa: BLE001
            log.exception("GET %s failed", path)
            self._send(400, {"error": str(exc)})

    def do_POST(self):
        gate = self._gate()
        if gate:
            self._send(*gate)
            return
        path = self.path.rstrip("/")
        try:
            if path == "/backtest":
                self._send(200, run(self._body()))
            elif path == "/optimize":
                self._send(200, run_optimize(self._body()))
            elif path == "/calibrate":
                self._send(200, run_calibrate(self._body()))
            elif path == "/strategy/validate":
                res = smoke_test(self._body().get("code", ""))
                log.info("strategy validate: ok=%s", res.get("ok"))
                self._send(200, res)
            elif path == "/strategy/save":
                req = self._body()
                res = save_strategy(req.get("name", ""), req.get("code", ""))
                log.info("strategy save %r: %s", req.get("name", ""), res.get("name") or res.get("errors"))
                self._send(200, res)
            elif path == "/strategy/generate":
                self._generate(self._body())
            else:
                self._send(404, {"error": "not found"})
        except Exception as exc:  # noqa: BLE001
            log.exception("POST %s failed", path)
            self._send(400, {"error": str(exc)})

    def _generate(self, req: dict):
        """Stream generated strategy code as Server-Sent Events."""
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self._cors()
        self.end_headers()
        log.info("strategy generate: model=%s name=%r (%d chars prompt)",
                 req.get("model") or "default", req.get("name"), len(req.get("description", "")))
        try:
            for chunk in generate(req.get("description", ""), req.get("base_code"),
                                  req.get("model"), req.get("name")):
                self.wfile.write(f"data: {json.dumps({'text': chunk})}\n\n".encode("utf-8"))
                self.wfile.flush()
            self.wfile.write(b"event: done\ndata: {}\n\n")
            log.info("strategy generate: done")
        except Exception as exc:  # noqa: BLE001
            log.exception("strategy generate failed")
            self.wfile.write(f"event: error\ndata: {json.dumps({'error': str(exc)})}\n\n".encode("utf-8"))
        self.wfile.flush()

    def log_message(self, fmt, *args):  # route access logs to the file logger
        log.info("%s %s", self.address_string(), fmt % args)


def main():
    log.info("ICT engine starting on http://%s:%d", HOST, PORT)
    log.info("strategies: %s", ", ".join(strategies.names()))
    log.info("AI authoring: %s", "on" if ai_available() else "off (set ANTHROPIC_API_KEY + pip install anthropic)")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
