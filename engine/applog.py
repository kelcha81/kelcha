"""
Durable logging for the engine.

Writes a rotating ``logs/engine.log`` (+ console) for requests, backtests, AI
events, and errors, and appends a one-line-per-run ``logs/backtests.jsonl`` so
runs can be reviewed/compared after the fact instead of relying on the terminal.

Stdlib only. Level via ``ICT_LOG_LEVEL`` (default INFO).
"""

from __future__ import annotations

import json
import logging
import os
from logging.handlers import RotatingFileHandler

_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_DIR = os.path.join(_DIR, "logs")
os.makedirs(LOG_DIR, exist_ok=True)

_BACKTESTS = os.path.join(LOG_DIR, "backtests.jsonl")


def _make_logger() -> logging.Logger:
    logger = logging.getLogger("ict")
    if logger.handlers:  # already configured
        return logger
    logger.setLevel(os.environ.get("ICT_LOG_LEVEL", "INFO").upper())
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
    fh = RotatingFileHandler(os.path.join(LOG_DIR, "engine.log"), maxBytes=2_000_000, backupCount=5, encoding="utf-8")
    ch = logging.StreamHandler()
    fh.setFormatter(fmt)
    ch.setFormatter(fmt)
    logger.addHandler(fh)
    logger.addHandler(ch)
    logger.propagate = False
    return logger


log = _make_logger()


def log_backtest(record: dict) -> None:
    """Append one backtest-run summary to logs/backtests.jsonl (review history)."""
    try:
        with open(_BACKTESTS, "a", encoding="utf-8") as f:
            f.write(json.dumps(record) + "\n")
    except OSError as exc:  # noqa: BLE001 — logging must never break a request
        log.warning("could not write backtest history: %s", exc)
