"""
Strategy registry for the server's /strategies + /backtest endpoints.

Discovers strategies dynamically so AI-authored / saved strategies appear without
a server restart: every ``strategies/*.py`` and ``strategies/user/*.py`` that
defines a ``Strategy`` subclass with a ``params`` dict is registered under its
file stem. ``user/`` strategies are editable via the API; built-ins are read-only.
"""

from __future__ import annotations

import importlib.util
import inspect
import os
from typing import Optional

from strategy import Strategy

_DIR = os.path.dirname(os.path.abspath(__file__))
USER_DIR = os.path.join(_DIR, "user")


def _load_module(path: str, modname: str):
    spec = importlib.util.spec_from_file_location(modname, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


def _strategy_in(mod) -> Optional[type]:
    for _, obj in inspect.getmembers(mod, inspect.isclass):
        if issubclass(obj, Strategy) and obj is not Strategy and obj.__module__ == mod.__name__:
            return obj
    return None


def _scan(dir_path: str, prefix: str, builtin: bool) -> dict:
    out: dict[str, dict] = {}
    if not os.path.isdir(dir_path):
        return out
    for fn in sorted(os.listdir(dir_path)):
        if not fn.endswith(".py") or fn == "__init__.py" or fn.startswith("_"):
            continue
        stem = fn[:-3]
        try:
            cls = _strategy_in(_load_module(os.path.join(dir_path, fn), f"{prefix}{stem}"))
        except Exception:  # noqa: BLE001 — a broken file shouldn't break the whole registry
            continue
        if cls is None:
            continue
        doc = (cls.__doc__ or "").strip().split("\n")[0]
        out[stem] = {
            "cls": cls,
            "label": getattr(cls, "label", None) or stem.replace("_", " ").title(),
            "description": getattr(cls, "description", None) or doc,
            "builtin": builtin,
            "path": os.path.join(dir_path, fn),
        }
    return out


def registry() -> dict[str, dict]:
    """Fresh discovery each call so newly saved strategies are picked up live."""
    entries = _scan(_DIR, "builtin_", builtin=True)
    entries.update(_scan(USER_DIR, "user_", builtin=False))  # user can shadow built-ins
    return entries


def names() -> list[str]:
    return list(registry())


def build(name: str, params: Optional[dict] = None) -> Strategy:
    return registry()[name]["cls"](params)


def default_params(name: str) -> dict:
    return dict(registry()[name]["cls"].params)


def info() -> dict:
    """Shape expected by the front-end's getStrategies()."""
    return {
        name: {"label": e["label"], "params": dict(e["cls"].params), "description": e["description"]}
        for name, e in registry().items()
    }


def source(name: str) -> Optional[dict]:
    """Current source for review/edit: ``{code, builtin}`` or None."""
    e = registry().get(name)
    if e is None:
        return None
    with open(e["path"], "r", encoding="utf-8") as f:
        return {"code": f.read(), "builtin": e["builtin"]}
