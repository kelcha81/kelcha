"""
Claude client for strategy authoring.

The Anthropic SDK is imported lazily so the rest of the engine runs (and the
non-AI endpoints work) even when ``anthropic`` isn't installed. AI features are
"available" only when the SDK is present AND ``ANTHROPIC_API_KEY`` is set.

Model is selectable: ``list_models()`` returns the live catalogue from the Models
API so new models (Fable 5, future releases) appear without a code change; the
default is ``claude-opus-4-8``. Requests use adaptive thinking + streaming and are
capability-aware (effort is only sent to models that support it).
"""

from __future__ import annotations

import os
from typing import Iterator, Optional

try:
    import anthropic
    _HAVE_SDK = True
except ImportError:  # SDK optional — engine still runs without it
    anthropic = None  # type: ignore[assignment]
    _HAVE_SDK = False

DEFAULT_MODEL = "claude-opus-4-8"

# shown when the Models API can't be reached / no key
FALLBACK_MODELS = [
    {"id": "claude-opus-4-8", "display_name": "Claude Opus 4.8"},
    {"id": "claude-sonnet-4-6", "display_name": "Claude Sonnet 4.6"},
    {"id": "claude-haiku-4-5", "display_name": "Claude Haiku 4.5"},
]


def ai_available() -> bool:
    return _HAVE_SDK and bool(os.environ.get("ANTHROPIC_API_KEY"))


def _client():
    return anthropic.Anthropic()


def list_models() -> list[dict]:
    """Live model catalogue (id + display_name); curated fallback on any failure."""
    if not ai_available():
        return FALLBACK_MODELS
    try:
        models = [
            {"id": m.id, "display_name": getattr(m, "display_name", m.id)}
            for m in _client().models.list()
        ]
        return models or FALLBACK_MODELS
    except Exception:  # noqa: BLE001
        return FALLBACK_MODELS


def _supports_effort(client, model: str) -> bool:
    try:
        caps = client.models.retrieve(model).capabilities
        return bool(caps["effort"]["high"]["supported"])
    except Exception:  # noqa: BLE001 — assume yes; the 400 fallback covers mistakes
        return True


def generate(description: str, base_code: Optional[str] = None,
             model: Optional[str] = None, name: Optional[str] = None) -> Iterator[str]:
    """Stream the generated strategy module as text chunks."""
    if not ai_available():
        raise RuntimeError("AI unavailable: install `anthropic` and set ANTHROPIC_API_KEY")

    from ai.prompt import SYSTEM_PROMPT, build_user_message

    client = _client()
    model = model or DEFAULT_MODEL
    kwargs = {
        "model": model,
        "max_tokens": 16000,
        "system": [{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
        "messages": [{"role": "user", "content": build_user_message(description, base_code, name)}],
        "thinking": {"type": "adaptive"},
    }
    if _supports_effort(client, model):
        kwargs["output_config"] = {"effort": "high"}

    try:
        with client.messages.stream(**kwargs) as stream:
            yield from stream.text_stream
    except anthropic.BadRequestError:  # type: ignore[union-attr]
        # some models reject optional params — strip and retry once
        kwargs.pop("output_config", None)
        kwargs.pop("thinking", None)
        with client.messages.stream(**kwargs) as stream:
            yield from stream.text_stream
