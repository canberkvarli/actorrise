"""A bulk email cut off by a restart finishes by itself, and never twice.

A batch sends from a thread in the API process, so every push to backend/ (a
Render redeploy) killed whatever was sending. The Ghost Light launch stopped at
179 of 1,195 on 2026-11-16. Three older batches (March, August) had sat half
sent for months, which is why a restart only finishes today's.
"""

from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.api.admin import emails

NOW = datetime(2026, 11, 16, 13, 0, tzinfo=timezone.utc)


def _row(**kw):
    base = dict(
        id=26, status="processing", created_at=NOW - timedelta(hours=1), scheduled_at=None,
        queued=1016, last_claim=NOW - timedelta(minutes=10), has_text=True,
    )
    base.update(kw)
    return base


class TestWhichBatches:
    def test_todays_cut_off_batch_resumes(self):
        assert emails.batches_to_resume([_row()], NOW) == [26]

    def test_a_months_old_batch_never_resumes_by_itself(self):
        old = _row(id=18, created_at=NOW - timedelta(days=103))
        assert emails.batches_to_resume([old], NOW) == []

    def test_a_batch_with_a_live_worker_is_left_alone(self):
        """The server being replaced may still be sending it."""
        live = _row(last_claim=NOW - timedelta(seconds=5))
        assert emails.batches_to_resume([live], NOW) == []

    def test_a_batch_never_claimed_from_resumes(self):
        """Today's first run claimed nothing, so last_claim is None."""
        assert emails.batches_to_resume([_row(last_claim=None)], NOW) == [26]

    def test_finished_failed_and_empty_batches_are_skipped(self):
        rows = [
            _row(id=1, status="completed"),
            _row(id=2, status="failed"),
            _row(id=3, queued=0),
        ]
        assert emails.batches_to_resume(rows, NOW) == []

    def test_scheduled_and_textless_batches_are_skipped(self):
        rows = [_row(id=4, scheduled_at=NOW + timedelta(days=1)), _row(id=5, has_text=False)]
        assert emails.batches_to_resume(rows, NOW) == []


class _FakeDB:
    def __init__(self, rows):
        self.rows = {r.id: r for r in rows}
        self.commits = 0

    def query(self, _model):
        db = self

        class Q:
            def filter(self, expr):
                wanted = expr.right.value
                return SimpleNamespace(first=lambda: db.rows.get(wanted))

        return Q()

    def commit(self):
        self.commits += 1


class _FakeClient:
    def __init__(self, fail_for=()):
        self.sent: list[str] = []
        self.fail_for = set(fail_for)

    @contextmanager
    def batch_session(self):
        yield

    def send_email(self, to, **_kw):
        if to in self.fail_for:
            raise RuntimeError("smtp dropped")
        self.sent.append(to)
        return {}


@pytest.fixture()
def wired(monkeypatch):
    """The loop with the database claim and the transport stubbed: claims hand
    out each queued row once, as the real UPDATE ... SKIP LOCKED does."""

    def setup(addresses, fail_for=()):
        rows = [SimpleNamespace(id=i, to_email=a, to_name="", status="queued", resend_email_id=None)
                for i, a in enumerate(addresses, start=1)]
        db = _FakeDB(rows)
        client = _FakeClient(fail_for)

        def claim_next(_db, _bid):
            for r in rows:
                if r.status == "queued":
                    r.status = "sending"
                    return r.id
            return None

        monkeypatch.setattr(emails, "_claim_next", claim_next)
        monkeypatch.setattr(emails, "_get_email_client", lambda _via: client)
        monkeypatch.setattr(emails, "_render_template", lambda _t, _v: ("<p>hi</p>", "s", "hi"))
        monkeypatch.setattr(emails, "add_tracking", lambda _id, html, plain_text: (html, plain_text))
        monkeypatch.setattr(emails, "build_unsubscribe_url", lambda _e: "u")
        monkeypatch.setattr(emails.time, "sleep", lambda _s: None)
        return db, rows, client

    return setup


def _run(db):
    b = SimpleNamespace(id=26, errors_json=[])
    emails._send_batch_rows(
        db, b, template_id="custom", subject="s", variables={}, default_name="there", send_via="smtp",
    )
    return b


def test_everyone_queued_gets_exactly_one(wired):
    db, rows, client = wired(["a@x.com", "b@x.com", "c@x.com"])
    _run(db)
    assert client.sent == ["a@x.com", "b@x.com", "c@x.com"]
    assert {r.status for r in rows} == {"sent"}


def test_a_second_run_after_the_first_sends_nobody_again(wired):
    db, rows, client = wired(["a@x.com", "b@x.com"])
    _run(db)
    _run(db)
    assert client.sent == ["a@x.com", "b@x.com"]


def test_rows_already_sent_are_never_taken(wired):
    db, rows, client = wired(["a@x.com", "b@x.com"])
    rows[0].status = "opened"
    _run(db)
    assert client.sent == ["b@x.com"]


def test_a_failure_is_recorded_and_not_retried_in_a_circle(wired):
    db, rows, client = wired(["a@x.com", "bad@x.com", "c@x.com"], fail_for={"bad@x.com"})
    b = _run(db)
    assert client.sent == ["a@x.com", "c@x.com"]
    assert rows[1].status == "failed"
    assert any("bad@x.com" in e for e in b.errors_json)
