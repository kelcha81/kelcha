# ict-engine

A "Jesse for Forex/Indices" built around **ICT** (Inner Circle Trader) concepts.
It runs on the same packaged candle data the replay app serves and (eventually)
serves the same `/strategies` + `/backtest` HTTP contract, so `forex-replay-app`
stays the visualization/labeling front-end.

The hard problem ICT poses is that it's *discretionary* — FVGs, order blocks,
liquidity sweeps, structure shifts, killzones, OTE are fuzzy and multi-timeframe.
The approach here is to turn each concept into a **pure, parameterized,
no-lookahead detector** that is unit-tested, chart-renderable, and tunable
against human-tagged trades exported from the replay app.

## Status

- **Phase 0 — scaffold** ✅ `models.py`, `sessions.py`, `candles.py`, `metrics.py`
- **Phase 1 — detectors + tests** ✅ `ict/` (structure, fvg, orderblock,
  liquidity, zones, displacement) with a stdlib test suite
- **Phase 2 — engine** ✅ Jesse-style `Strategy`, `broker`, `engine`, `server`,
  reference strategy (front-end ICT overlays live in `forex-replay-app`).
- **Phase 3 — calibration + optimization** ✅ `labels`, `calibrate`, `optimize`

## Layout

```
models.py      Candle / Trade / Account / ICTEvent + P&L (port of tradingStore.ts)
sessions.py    New-York-time DST, 5pm rollover, killzones (no tz deps)
candles.py     load packaged JSON; no-lookahead multi-timeframe access
metrics.py     stats + equity curve (port of performance.ts)
ict/           detectors: structure, fvg, orderblock, liquidity, zones, displacement
strategy.py    Jesse-shaped Strategy base class (lifecycle hooks + ICT helpers)
broker.py      simulated fills, spread/commission, intra-bar SL/TP (M1-aware)
engine.py      candle-driven loop + routes + no-lookahead HTF context
strategies/    user strategies + registry (reference: killzone_fvg_ob)
annotations.py detector events for the chart, returned by /backtest
server.py      HTTP backend; drop-in replacement for strategy-backend/server.py
labels.py      load human-tagged trades exported from the replay app
calibrate.py   tune detector thresholds to match your human entries (grid search)
optimize.py    search strategy/detector params over a backtest metric (optuna|random)
labels/        drop exported <symbol>.json trade files here (gitignored)
tests/         fixture-based unit tests (stdlib unittest)
run_tests.py   test runner
```

## Backtest server

```powershell
cd ict-engine
python server.py     # http://localhost:8000  (same contract as strategy-backend)
```

Same `/strategies` + `/backtest` JSON the front-end already speaks, extended with
ICT `annotations` and optional `htf` / `account` in the request. Needs packaged
data in `forex-replay-app/public/data/<symbol>/` (or `ICT_DATA_DIR`).

## Calibration & optimization (Phase 3)

Both are headless CLIs that write a small JSON result into `labels/`.

```powershell
# 1) export tagged trades from the replay app -> ict-engine/labels/eurusd.json
# 2) find detector thresholds that best match where you actually entered:
python calibrate.py eurusd --timeframe h1
# 3) search strategy/detector params over a backtest metric (size-independent avgR):
python optimize.py eurusd --strategy killzone_fvg_ob --metric avgR --trials 60
```

`calibrate` scores each human entry against the detector events around it
(coverage) and penalizes event density, so the tightest thresholds that still
capture your trades win — the discretionary→coded bridge. `optimize` uses optuna
when installed, else a stdlib random search (same result shape).

## Run

```powershell
cd ict-engine
python run_tests.py          # 0 deps; pure stdlib
```

Pointing at packaged data: detectors take plain `Candle` lists. `candles.load_series`
reads `forex-replay-app/public/data/<symbol>/` by default, or set `ICT_DATA_DIR`.

## Design rules

- **No lookahead.** Every `ICTEvent` carries `confirm_ts`, the first moment it's
  knowable. `candles.TimeframeSeries.closed(now)` never returns a forming bar.
- **Front-end parity.** `Trade`/`Account` and `metrics.compute_stats` mirror the
  TS so a backtest and a manual replay value identical trades identically.
- **Calibration over guessing.** Detector thresholds are parameters to be tuned
  against the replay app's exported, human-tagged trades (Phase 3).
