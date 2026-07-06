"""
Cross-request caches for the HTTP server.

Parsed candle series and detector outputs are cached in-process so repeated
/backtest and /optimize calls during iterative tuning skip disk I/O and
re-detection. Every cache key embeds a fingerprint of the underlying packaged
files (path + mtime + size), so repackaging a symbol changes the fingerprint
and stale entries simply stop being referenced and age out of the LRUs.

Caveat: cached detector events are shared across requests, so strategies must
treat ICTEvent objects as read-only (the built-in API already does — see
``Strategy._detect``'s use of ``dataclasses.replace``).
"""

from __future__ import annotations

import bisect
import json
import os
import threading
from collections import OrderedDict
from typing import Any, Hashable, Optional

from candles import _month_overlaps, data_dir
from models import Candle, candles_from_json


class LRU:
    """Thread-safe LRU map (ThreadingHTTPServer handles requests concurrently)."""

    def __init__(self, maxsize: int):
        self._d: OrderedDict = OrderedDict()
        self._max = maxsize
        self._lock = threading.Lock()
        self.hits = 0
        self.misses = 0

    def get(self, key: Hashable) -> Optional[Any]:
        with self._lock:
            v = self._d.get(key)
            if v is None:
                self.misses += 1
                return None
            self._d.move_to_end(key)
            self.hits += 1
            return v

    def put(self, key: Hashable, value: Any) -> None:
        with self._lock:
            self._d[key] = value
            self._d.move_to_end(key)
            while len(self._d) > self._max:
                self._d.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._d.clear()
            self.hits = self.misses = 0


_FILES = LRU(32)      # path -> (fingerprint, candles, opens)
_MANIFESTS = LRU(32)  # path -> (fingerprint, dict)
_RANGES = LRU(32)     # series key -> clipped candles
_DETECTED = LRU(256)  # (series key, detector, params) -> events


def clear() -> None:
    """Drop all cached state (tests / manual reload)."""
    for c in (_FILES, _MANIFESTS, _RANGES, _DETECTED):
        c.clear()


def _fingerprint(path: str) -> tuple:
    st = os.stat(path)
    return (path, st.st_mtime_ns, st.st_size)


def _file_series(path: str) -> tuple[list[Candle], list[int], tuple]:
    fp = _fingerprint(path)
    hit = _FILES.get(path)
    if hit is not None and hit[0] == fp:
        return hit[1], hit[2], fp
    with open(path, "r", encoding="utf-8") as f:
        candles = candles_from_json(json.load(f))
    opens = [c.timestamp for c in candles]
    _FILES.put(path, (fp, candles, opens))
    return candles, opens, fp


def _manifest(sym_dir: str) -> tuple[dict, tuple]:
    path = os.path.join(sym_dir, "manifest.json")
    fp = _fingerprint(path)
    hit = _MANIFESTS.get(path)
    if hit is not None and hit[0] == fp:
        return hit[1], fp
    with open(path, "r", encoding="utf-8") as f:
        manifest = json.load(f)
    _MANIFESTS.put(path, (fp, manifest))
    return manifest, fp


def _clip_indexed(candles: list[Candle], opens: list[int],
                  from_ts: Optional[int], to_ts: Optional[int]) -> list[Candle]:
    lo = 0 if from_ts is None else bisect.bisect_left(opens, from_ts)
    hi = len(candles) if to_ts is None else bisect.bisect_right(opens, to_ts)
    if lo == 0 and hi == len(candles):
        return candles  # share the cached list; callers treat series as read-only
    return candles[lo:hi]


def load_series_cached(symbol: str, timeframe: str,
                       from_ts: Optional[int] = None, to_ts: Optional[int] = None,
                       base: Optional[str] = None) -> tuple[list[Candle], tuple]:
    """
    Cached equivalent of ``candles.load_series``.

    Returns ``(candles, series_key)`` where ``series_key`` is a stable, hashable
    identity for exactly this data (symbol, timeframe, range, file fingerprints)
    — the anchor for the detector cache.
    """
    base_dir = base or data_dir()
    sym_dir = os.path.join(base_dir, symbol)

    if timeframe != "m1":
        path = os.path.join(sym_dir, f"{timeframe}.json")
        candles, opens, fp = _file_series(path)
        key = ("series", symbol, timeframe, from_ts, to_ts, fp)
        hit = _RANGES.get(key)
        if hit is not None:
            return hit, key
        out = _clip_indexed(candles, opens, from_ts, to_ts)
        _RANGES.put(key, out)
        return out, key

    manifest, mfp = _manifest(sym_dir)
    chunks: list[str] = manifest["timeframes"]["m1"]["chunks"]
    parts: list[list[Candle]] = []
    fps: list[tuple] = [mfp]
    for rel in chunks:
        if from_ts is not None or to_ts is not None:
            ym = os.path.splitext(os.path.basename(rel))[0]
            if not _month_overlaps(ym, from_ts, to_ts):
                continue
        candles, _opens, fp = _file_series(os.path.join(sym_dir, rel))
        parts.append(candles)
        fps.append(fp)
    key = ("series", symbol, "m1", from_ts, to_ts, tuple(fps))
    hit = _RANGES.get(key)
    if hit is not None:
        return hit, key
    out: list[Candle] = []
    for candles in parts:
        out.extend(candles)
    out.sort(key=lambda c: c.timestamp)
    out = _clip_indexed(out, [c.timestamp for c in out], from_ts, to_ts)
    _RANGES.put(key, out)
    return out, key


class RouteDetectorCache:
    """
    dict-like detector cache for one request, backed by the global LRU.

    ``Strategy._detect`` and ``build_annotations`` key entries as
    ``(name, timeframe, params-tuple)`` with ``timeframe=None`` for the base
    series. Each loaded timeframe maps to its stable series key, so results
    survive across requests on the same data and are shared between the
    strategy pass and the annotations pass. Timeframes without a known series
    key fall back to a per-request dict (behaves like the plain-dict default).
    """

    def __init__(self, series_keys: dict[Optional[str], Hashable]):
        self._series_keys = series_keys
        self._local: dict = {}

    def get(self, key):
        name, timeframe, params = key
        sk = self._series_keys.get(timeframe)
        if sk is None:
            return self._local.get(key)
        return _DETECTED.get((sk, name, params))

    def __setitem__(self, key, events) -> None:
        name, timeframe, params = key
        sk = self._series_keys.get(timeframe)
        if sk is None:
            self._local[key] = events
        else:
            _DETECTED.put((sk, name, params), events)
