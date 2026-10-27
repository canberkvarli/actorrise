"""Suite-wide guards.

record_user_event opens its own session with app.core.database.SessionLocal,
which is bound to whatever DATABASE_URL .env names: production. Any test that
reached it without patching wrote a real row into prod user_events, attributed
to whichever prod account owns the test user's id (511 fake audition_created
rows on the founder's account in one week, 28 per run).

So by default the logger gets a session factory that refuses, and
record_user_event drops the event the way it drops any failed write. A test
that wants to see events still patches events.SessionLocal (or the call site)
itself; its patch sits on top of this one and is undone before this one is.
"""

import os

import pytest

from app.services import events

# PDFs are read in a child process in production (script_parser). Under pytest,
# app/services is on sys.path and its `email` package shadows the standard
# library inside a spawned child, so the suite reads inline; the child path has
# its own test, run from a clean interpreter.
os.environ.setdefault("PDF_READ_INLINE", "1")


def _no_prod_session():
    raise RuntimeError("tests may not open a production session for user_events")


@pytest.fixture(autouse=True)
def _events_stay_off_prod(monkeypatch):
    monkeypatch.setattr(events, "SessionLocal", _no_prod_session)


def _no_model_call(*args, **kwargs):
    raise RuntimeError("tests may not call the scene-reading model")


@pytest.fixture(autouse=True)
def _scene_reader_stays_offline(monkeypatch):
    """Every upload path now has a model read each scene, and .env holds a real
    key. A test that reaches the reader without mocking it gets the rule
    parser's lines (the reader's own fallback) instead of a network call. A
    test that wants a reading patches scene_reader._call_model on top."""
    from app.services import scene_reader

    monkeypatch.setattr(scene_reader, "_call_model", _no_model_call)


@pytest.fixture(autouse=True)
def _gemini_never_sleeps(monkeypatch):
    """The Gemini rate limiter and its retry waits are real seconds; a test
    that fails a line on purpose would sit through a minute of them."""
    from app.services.rehearsal import synth

    monkeypatch.setattr(synth, "GEMINI_RPM", 10_000)
    monkeypatch.setattr(synth.time, "sleep", lambda _s: None)
