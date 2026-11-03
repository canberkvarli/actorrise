"""Which library language a request is served (CAN-19, widened 2026-11-03).

One rule for everything an actor browses: monologues, ScenePartner's library
and sample scenes, the Green Room community library and the community shelf.

  - The Turkish UI sees Turkish only. Canberk, 2026-11-03: "no Turkish actor
    can do English pieces; they have to change the UI first." A Turkish actor
    who wants English pieces switches the UI to English.
  - Everything else sees English only: the English UI, the iOS app, crawlers,
    emails, push, schedulers, anything with no request at all.

The request's language comes from `X-ActorRise-Locale` (lib/api.ts sends "tr"
from the Turkish UI, and nothing otherwise), set once per request by
LibraryLanguageMiddleware. Code that lists library material calls the clauses
here with no argument and gets the request's language; code that must stay
English whatever the request (SEO pages, the content-request matcher) passes
DEFAULT_LANGUAGES explicitly.

What is the actor's own is never filtered: their uploads, their saves, their
class's shelf, a piece or scene opened by its link.

A play's language is plays.language; NULL is English (every NULL row today).
An upload's play is marked when it is created, from its text (see
mark_upload_language, wired as a Play before_insert hook in models/actor.py).
"""
from __future__ import annotations

from contextvars import ContextVar
from typing import Optional, Sequence

from sqlalchemy import func, select

DEFAULT_LANGUAGES: tuple = ("en",)
TURKISH_LANGUAGES: tuple = ("tr",)

_REQUEST_LANGUAGES: ContextVar[Optional[tuple]] = ContextVar("library_languages", default=None)


def languages_for_locale(locale: Optional[str]) -> tuple:
    """"tr" → Turkish only; anything else, a missing header included → English."""
    return TURKISH_LANGUAGES if (locale or "").strip().lower() == "tr" else DEFAULT_LANGUAGES


def current_languages() -> tuple:
    """The languages this request may be served. English outside a request."""
    return _REQUEST_LANGUAGES.get() or DEFAULT_LANGUAGES


def resolve(languages: Optional[Sequence[str]] = None) -> tuple:
    """An explicit choice wins; otherwise the request's."""
    return tuple(languages) if languages else current_languages()


def set_request_languages(languages: Optional[tuple]):
    """For tests and the middleware. Returns the token to reset with."""
    return _REQUEST_LANGUAGES.set(languages)


def reset_request_languages(token) -> None:
    _REQUEST_LANGUAGES.reset(token)


class LibraryLanguageMiddleware:
    """Sets the request's library language from X-ActorRise-Locale.

    Pure ASGI rather than BaseHTTPMiddleware, so the value is set in the same
    context the endpoint runs in (sync endpoints run in a worker thread that
    copies it) and is reset when the request is over.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            return await self.app(scope, receive, send)
        locale = None
        for name, value in scope.get("headers") or ():
            if name == b"x-actorrise-locale":
                locale = value.decode("latin-1")
                break
        token = _REQUEST_LANGUAGES.set(languages_for_locale(locale))
        try:
            await self.app(scope, receive, send)
        finally:
            _REQUEST_LANGUAGES.reset(token)


# ── SQL ─────────────────────────────────────────────────────────────────────

def foreign_plays(languages: Optional[Sequence[str]] = None):
    """Ids of plays NOT in the request's languages (NULL counts as English)."""
    from app.models.actor import Play

    return select(Play.id).where(func.coalesce(Play.language, "en").notin_(resolve(languages)))


def play_id_clause(play_id_column, languages: Optional[Sequence[str]] = None):
    """Rows whose play is in the request's languages. No play is English, as a
    NULL plays.language is."""
    from sqlalchemy import false

    known = ~play_id_column.in_(foreign_plays(languages)) & play_id_column.isnot(None)
    return (known | play_id_column.is_(None)) if "en" in resolve(languages) else (known | false())


def script_clause(languages: Optional[Sequence[str]] = None):
    """User scripts whose scenes are in the request's languages: none of the
    script's scenes sits on a play in another language. A script with no
    scenes yet has nothing to show anyway."""
    from app.models.actor import Scene, UserScript

    foreign = select(Scene.user_script_id).where(
        Scene.user_script_id.isnot(None), Scene.play_id.in_(foreign_plays(languages)))
    return ~UserScript.id.in_(foreign)


def shows(language: Optional[str], languages: Optional[Sequence[str]] = None) -> bool:
    """Row-level twin: does a play in `language` show to this request?"""
    return (language or "en") in resolve(languages)


# ── uploads ─────────────────────────────────────────────────────────────────

def mark_upload_language(play) -> None:
    """Mark a new play's language from its own text when nobody said.

    Only ever marks Turkish: an unmarked play is English already, so English
    rows are written exactly as before. Uses the app's one detector
    (services/rehearsal/language.detect), strict enough that English never
    flips.
    """
    from app.services.rehearsal.language import detect

    if (getattr(play, "language", None) or "en") != "en":
        return
    text = getattr(play, "full_text", None) or ""
    if text and detect(text[:20000]) == "tr":
        play.language = "tr"
