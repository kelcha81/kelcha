"""
Candle loading + multi-timeframe access.

Reads the *same* packaged JSON the front-end serves
(``forex-replay-app/public/data/<symbol>/``): a ``manifest.json`` plus whole
aggregate series (``h1.json`` ...) and monthly M1 chunks (``m1/<YYYY-MM>.json``).

The key engine primitive is no-lookahead multi-timeframe access: at a given
``now`` the engine must only see candles that have actually *closed*. A candle's
close time is the next candle's open time (forex sessions are irregular, so we do
not assume a fixed duration except for the final, still-forming bar).
"""

from __future__ import annotations

import bisect
import json
import os
from typing import Iterable, Optional

from models import Candle, candles_from_json

# minutes per fixed timeframe; calendar TFs (w1/mo1) use a generous fallback.
TF_MINUTES: dict[str, int] = {
    "m1": 1, "m5": 5, "m15": 15, "h1": 60, "h4": 240, "d1": 1440,
    "w1": 1440 * 7, "mo1": 1440 * 31,
}

# default location of the packaged data, relative to this file.
_DEFAULT_DATA_DIR = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web", "public", "data")
)


def data_dir() -> str:
    return os.environ.get("ICT_DATA_DIR", _DEFAULT_DATA_DIR)


def load_manifest(symbol: str, base: Optional[str] = None) -> dict:
    path = os.path.join(base or data_dir(), symbol, "manifest.json")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_series(symbol: str, timeframe: str, base: Optional[str] = None,
                from_ts: Optional[int] = None, to_ts: Optional[int] = None) -> list[Candle]:
    """
    Load a symbol's candles for one timeframe.

    Aggregates (m5..mo1) are single files. M1 is assembled from the monthly
    chunks listed in the manifest, optionally limited to [from_ts, to_ts] so we
    don't read years of minute data when only a window is needed.
    """
    base = base or data_dir()
    sym_dir = os.path.join(base, symbol)

    if timeframe != "m1":
        with open(os.path.join(sym_dir, f"{timeframe}.json"), "r", encoding="utf-8") as f:
            candles = candles_from_json(json.load(f))
        return _clip(candles, from_ts, to_ts)

    manifest = load_manifest(symbol, base)
    chunks: list[str] = manifest["timeframes"]["m1"]["chunks"]
    out: list[Candle] = []
    for rel in chunks:
        # chunk file names are 'm1/YYYY-MM.json'; skip ones fully outside range.
        if from_ts is not None or to_ts is not None:
            ym = os.path.splitext(os.path.basename(rel))[0]
            if not _month_overlaps(ym, from_ts, to_ts):
                continue
        with open(os.path.join(sym_dir, rel), "r", encoding="utf-8") as f:
            out.extend(candles_from_json(json.load(f)))
    out.sort(key=lambda c: c.timestamp)
    return _clip(out, from_ts, to_ts)


def _month_overlaps(ym: str, from_ts: Optional[int], to_ts: Optional[int]) -> bool:
    from datetime import datetime, timezone
    y, m = (int(x) for x in ym.split("-"))
    start = int(datetime(y, m, 1, tzinfo=timezone.utc).timestamp() * 1000)
    end = int(datetime(y + (m == 12), (m % 12) + 1, 1, tzinfo=timezone.utc).timestamp() * 1000)
    if to_ts is not None and start > to_ts:
        return False
    if from_ts is not None and end <= from_ts:
        return False
    return True


def _clip(candles: list[Candle], from_ts: Optional[int], to_ts: Optional[int]) -> list[Candle]:
    if from_ts is None and to_ts is None:
        return candles
    lo = 0 if from_ts is None else bisect.bisect_left([c.timestamp for c in candles], from_ts)
    hi = len(candles) if to_ts is None else bisect.bisect_right([c.timestamp for c in candles], to_ts)
    return candles[lo:hi]


class TimeframeSeries:
    """
    One timeframe's candles with no-lookahead access.

    ``closed(now)`` returns the candles that have fully closed at ``now``; the
    bar currently forming is excluded. Close time = next bar's open; the last bar
    falls back to its nominal duration.
    """

    def __init__(self, timeframe: str, candles: list[Candle]):
        self.timeframe = timeframe
        self.candles = candles
        self._opens = [c.timestamp for c in candles]
        nominal = TF_MINUTES.get(timeframe, 1) * 60_000
        self._close_times = [
            (candles[i + 1].timestamp if i + 1 < len(candles) else candles[i].timestamp + nominal)
            for i in range(len(candles))
        ]

    def __len__(self) -> int:
        return len(self.candles)

    def closed_count(self, now: int) -> int:
        """How many candles have closed at or before ``now``."""
        return bisect.bisect_right(self._close_times, now)

    def closed(self, now: int) -> list[Candle]:
        return self.candles[: self.closed_count(now)]

    def last_closed(self, now: int) -> Optional[Candle]:
        n = self.closed_count(now)
        return self.candles[n - 1] if n else None

    def close_time(self, i: int) -> int:
        return self._close_times[i]


class MultiTimeframe:
    """A bundle of timeframes for one symbol, queried at a common ``now``."""

    def __init__(self, series: dict[str, TimeframeSeries]):
        self.series = series

    @classmethod
    def load(cls, symbol: str, timeframes: Iterable[str], base: Optional[str] = None,
             from_ts: Optional[int] = None, to_ts: Optional[int] = None) -> "MultiTimeframe":
        return cls({
            tf: TimeframeSeries(tf, load_series(symbol, tf, base, from_ts, to_ts))
            for tf in timeframes
        })

    def closed(self, timeframe: str, now: int) -> list[Candle]:
        return self.series[timeframe].closed(now)
