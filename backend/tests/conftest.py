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

import pytest

from app.services import events


def _no_prod_session():
    raise RuntimeError("tests may not open a production session for user_events")


@pytest.fixture(autouse=True)
def _events_stay_off_prod(monkeypatch):
    monkeypatch.setattr(events, "SessionLocal", _no_prod_session)
