"""ICT detector library: pure, parameterized, no-lookahead structure detectors.

Each module exposes ``detect_*`` functions over a list of closed ``Candle``s and
returns ``ICTEvent``s. Every event carries a ``confirm_ts`` — the first time it is
knowable without seeing future candles — so the engine never acts on hindsight.
"""
