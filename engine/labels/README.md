# labels/

Ground-truth trades for calibration. Export your tagged trades from the replay
app (Performance report → Export JSON) and drop them here as `<symbol>.json`,
e.g. `eurusd.json`. They are the human entries `calibrate.py` tunes the detectors
against.

`<symbol>.json` and the generated `<symbol>.calibrated.json` / `<symbol>.optimized.json`
are gitignored — they're personal data and reproducible outputs. This README is
the only tracked file in the folder.
