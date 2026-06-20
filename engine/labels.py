"""
Load human-tagged trades exported from the replay app.

The replay app's ``exportTradesJSON`` writes a JSON array of its ``Trade`` shape
(camelCase). Drop those files in ``ict-engine/labels/<symbol>.json`` (the dir is
gitignored). These are the ground truth the calibration step tunes detectors
against — the bridge from discretionary to coded.
"""

from __future__ import annotations

import json
import os
from typing import Optional

from models import Trade

_DEFAULT_LABELS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "labels")


def labels_dir() -> str:
    return os.environ.get("ICT_LABELS_DIR", _DEFAULT_LABELS_DIR)


def trade_from_dict(d: dict) -> Trade:
    return Trade(
        id=str(d.get("id", "")),
        side=d["side"],
        size=float(d.get("size", 1)),
        contractSize=float(d.get("contractSize", 100000)),
        entryPrice=float(d["entryPrice"]),
        entryTime=int(d["entryTime"]),
        exitPrice=float(d.get("exitPrice", d["entryPrice"])),
        exitTime=int(d.get("exitTime", d["entryTime"])),
        pnl=float(d.get("pnl", 0.0)),
        reason=d.get("reason", "manual"),
        risk=(float(d["risk"]) if d.get("risk") is not None else None),
        note=d.get("note"),
        tags=d.get("tags"),
    )


def load_labels(symbol: str, base: Optional[str] = None) -> list[Trade]:
    path = os.path.join(base or labels_dir(), f"{symbol}.json")
    with open(path, "r", encoding="utf-8") as f:
        rows = json.load(f)
    trades = [trade_from_dict(r) for r in rows]
    trades.sort(key=lambda t: t.entryTime)
    return trades


def has_labels(symbol: str, base: Optional[str] = None) -> bool:
    return os.path.isfile(os.path.join(base or labels_dir(), f"{symbol}.json"))
