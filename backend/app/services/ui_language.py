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


def request_language() -> str:
    """"tr" or "en", this request's UI language."""
    return "tr" if is_turkish() else "en"


def email_language(user) -> str:
    """The language to write to this person in, from users.ui_language."""
    return "tr" if (getattr(user, "ui_language", None) or "").lower() == "tr" else "en"


def record(db, user) -> None:
    """Keep users.ui_language in step with the UI the actor is using. A write
    only when it changes, so GET /api/auth/me stays a read for almost everyone."""
    lang = request_language()
    if getattr(user, "ui_language", None) != lang:
        user.ui_language = lang
        try:
            db.commit()
        except Exception:  # noqa: BLE001 - a language note must never fail /me
            db.rollback()
