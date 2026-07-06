"""
First-crossing queries over a price series.

``FirstCross`` answers: what is the first index ``j >= start`` where the series
crosses a threshold (``value <= t`` against lows, ``value >= t`` against highs)?
Built once per series in O(n); each query is O(log n). The detectors use it to
resolve mitigation ("when did price first trade back into this zone?") without
the per-event forward scans that made long-series detection quadratic.
"""

from __future__ import annotations

from typing import Optional


class FirstCross:
    """
    Segment tree over a float series.

    ``find_leq=True``  -> ``first(start, t)`` is the first ``j >= start`` with
    ``values[j] <= t`` (nodes hold subtree minima).
    ``find_leq=False`` -> first ``j >= start`` with ``values[j] >= t`` (maxima).
    Thresholds must be finite (candle prices always are).
    """

    __slots__ = ("_n", "_size", "_tree", "_leq")

    def __init__(self, values: list[float], find_leq: bool):
        n = len(values)
        size = 1
        while size < n:
            size <<= 1
        # padding never satisfies the predicate, so queries can't land on it.
        pad = float("inf") if find_leq else float("-inf")
        tree = [pad] * (2 * size)
        tree[size:size + n] = values
        if find_leq:
            for i in range(size - 1, 0, -1):
                a, b = tree[i + i], tree[i + i + 1]
                tree[i] = a if a <= b else b
        else:
            for i in range(size - 1, 0, -1):
                a, b = tree[i + i], tree[i + i + 1]
                tree[i] = a if a >= b else b
        self._n = n
        self._size = size
        self._tree = tree
        self._leq = find_leq

    def first(self, start: int, threshold: float) -> Optional[int]:
        """First index >= ``start`` whose value crosses ``threshold``, else None."""
        if start >= self._n:
            return None
        if start < 0:
            start = 0
        size, tree, leq = self._size, self._tree, self._leq
        i = size + start
        while True:
            v = tree[i]
            if (v <= threshold) if leq else (v >= threshold):
                # descend to the leftmost qualifying leaf of this subtree.
                while i < size:
                    i += i
                    v = tree[i]
                    if not ((v <= threshold) if leq else (v >= threshold)):
                        i += 1
                return i - size
            # advance to the subtree covering the next indices to the right.
            while i & 1:
                i >>= 1
            if i == 0:
                return None
            i += 1
