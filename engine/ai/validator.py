"""
Static safety gate for AI-authored strategy code.

Generated code eventually runs on this host, and the author is an LLM (less
trusted than hand-written plugins), so we reject anything outside a narrow
allowlist *before* execution: imports limited to the strategy API + safe stdlib,
no filesystem/network/process access, no ``eval``/``exec``/``__import__``, and no
dunder-attribute escapes (the usual ``().__class__.__subclasses__`` sandbox break).

This is a gate, not a sandbox — ``ai.sandbox`` still runs validated code in a
separate process with a timeout.
"""

from __future__ import annotations

import ast

# import roots a strategy legitimately needs
ALLOWED_IMPORT_ROOTS = {
    "__future__", "strategy", "models", "ict", "sessions",
    "math", "statistics", "typing", "dataclasses",
}

# builtins that enable code execution / IO / introspection escapes
FORBIDDEN_NAMES = {
    "eval", "exec", "compile", "__import__", "open", "input", "globals", "locals",
    "vars", "getattr", "setattr", "delattr", "memoryview", "breakpoint", "help",
}


def validate_code(code: str) -> list[str]:
    """Return a list of safety errors (empty = safe to execute)."""
    try:
        tree = ast.parse(code)
    except SyntaxError as exc:
        return [f"syntax error: {exc.msg} (line {exc.lineno})"]

    errors: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                root = alias.name.split(".")[0]
                if root not in ALLOWED_IMPORT_ROOTS:
                    errors.append(f"import not allowed: {alias.name}")
        elif isinstance(node, ast.ImportFrom):
            root = (node.module or "").split(".")[0]
            if node.level or root not in ALLOWED_IMPORT_ROOTS:
                errors.append(f"import not allowed: from {node.module or '.'}")
        elif isinstance(node, ast.Name) and node.id in FORBIDDEN_NAMES:
            errors.append(f"use of '{node.id}' is not allowed")
        elif isinstance(node, ast.Attribute) and node.attr.startswith("__") and node.attr.endswith("__"):
            errors.append(f"dunder attribute access not allowed: .{node.attr}")

    if not _defines_strategy_subclass(tree):
        errors.append("no Strategy subclass found (define `class X(Strategy): ...`)")

    # de-dupe, keep order
    seen: set[str] = set()
    return [e for e in errors if not (e in seen or seen.add(e))]


def is_valid(code: str) -> bool:
    return not validate_code(code)


def _defines_strategy_subclass(tree: ast.Module) -> bool:
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            for base in node.bases:
                if isinstance(base, ast.Name) and base.id == "Strategy":
                    return True
                if isinstance(base, ast.Attribute) and base.attr == "Strategy":
                    return True
    return False
