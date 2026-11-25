"""The actor's UI language, for words the server writes to them.

Most of the UI is translated in the browser, but a gate's message (the Plus
wall, a usage limit) is written here and shown as sent. The request's language
is the one library_language already reads from `X-ActorRise-Locale`: the
Turkish UI sends "tr", everything else (no header, the iOS app, schedulers) is
English.
"""
from __future__ import annotations

from app.services.library_language import TURKISH_LANGUAGES, current_languages


def is_turkish() -> bool:
    return current_languages() == TURKISH_LANGUAGES


def say(en: str, tr: str) -> str:
    """The sentence in the request's UI language."""
    return tr if is_turkish() else en
