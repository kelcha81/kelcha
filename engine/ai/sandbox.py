"""
Run AI-authored strategy code safely: validate (AST allowlist) then execute a
short backtest in a child process with a wall-clock timeout. Returns the same
shape the front-end consumes: ``{ok, errors?, stats?}``.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile

from ai.validator import validate_code

_HERE = os.path.dirname(os.path.abspath(__file__))
_ENGINE = os.path.dirname(_HERE)
_RUNNER = os.path.join(_HERE, "_smoke_runner.py")


def smoke_test(code: str, timeout: float = 20.0) -> dict:
    """Validate then smoke-run ``code``; never executes anything that fails validation."""
    errors = validate_code(code)
    if errors:
        return {"ok": False, "errors": errors}

    fd, path = tempfile.mkstemp(suffix=".py", dir=_HERE)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(code)
        try:
            proc = subprocess.run(
                [sys.executable, _RUNNER, path],
                cwd=_ENGINE, capture_output=True, text=True, timeout=timeout,
            )
        except subprocess.TimeoutExpired:
            return {"ok": False, "errors": [f"strategy timed out after {timeout:.0f}s"]}
    finally:
        try:
            os.remove(path)
        except OSError:
            pass

    lines = (proc.stdout or "").strip().splitlines()
    if not lines:
        return {"ok": False, "errors": [(proc.stderr or "no output").strip()]}
    try:
        return json.loads(lines[-1])
    except json.JSONDecodeError:
        return {"ok": False, "errors": [(proc.stderr or lines[-1]).strip()]}
