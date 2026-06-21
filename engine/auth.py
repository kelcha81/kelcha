"""Firebase ID-token verification + per-account module entitlement checks.

Auth is OFF unless ICT_REQUIRE_AUTH is truthy, so local dev needs no tokens.
On Cloud Run it is enabled via env and tokens are verified with firebase-admin
(installed in the engine image; ADC supplies credentials, FIREBASE_PROJECT_ID
the audience).
"""
from __future__ import annotations

import os

_REQUIRE = os.environ.get("ICT_REQUIRE_AUTH", "").strip().lower() in ("1", "true", "yes", "on")
_PROJECT = os.environ.get("FIREBASE_PROJECT_ID") or os.environ.get("GOOGLE_CLOUD_PROJECT")

# The whole engine (backtest + strategy list + AI authoring + calibration) is the
# `ictTraining` feature, so every route requires the module.
_TRAINING_PREFIXES = (
    "/strategies",
    "/strategy",
    "/backtest",
    "/calibrate",
    "/optimize",
    "/models",
    "/capabilities",
)

_admin_auth = None
_init_failed = False


def _admin():
    global _admin_auth, _init_failed
    if _admin_auth is None and not _init_failed:
        try:
            import firebase_admin
            from firebase_admin import auth as admin_auth
            if not firebase_admin._apps:
                firebase_admin.initialize_app(options={"projectId": _PROJECT} if _PROJECT else None)
            _admin_auth = admin_auth
        except Exception:  # noqa: BLE001 — firebase-admin absent locally
            _init_failed = True
    return _admin_auth


def required() -> bool:
    return _REQUIRE


def is_training_route(path: str) -> bool:
    p = path.rstrip("/")
    return any(p == pre or p.startswith(pre + "/") for pre in _TRAINING_PREFIXES)


def verify(headers) -> dict | None:
    """Return the decoded token's claims, or None when missing/invalid."""
    authz = headers.get("Authorization", "")
    if not authz.startswith("Bearer "):
        return None
    admin = _admin()
    if admin is None:
        return None
    try:
        return admin.verify_id_token(authz[7:].strip())
    except Exception:  # noqa: BLE001
        return None


def has_module(claims: dict, name: str) -> bool:
    mods = claims.get("modules") if claims else None
    return bool(isinstance(mods, dict) and mods.get(name))
