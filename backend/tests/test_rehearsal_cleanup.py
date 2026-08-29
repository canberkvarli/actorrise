"""Tests for the stuck-session staleness rule.

38 sessions sat in `in_progress` in prod, poisoning the completion math. A
session inactive since the cutoff is abandoned; a recently active one (still
resumable) and an already-finished one are left alone. Tests the pure predicate
(the DB query in find_stale_sessions mirrors it), matching this suite's style of
testing rehearsal logic without a live Postgres.
"""

import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.services.rehearsal_cleanup import (
    STALE_AFTER_HOURS,
    is_session_stale,
    session_duration_seconds,
)

NOW = datetime(2026, 8, 19, 12, 0, 0, tzinfo=timezone.utc)


class IsSessionStaleTests(unittest.TestCase):
    def test_inactive_in_progress_is_stale(self):
        last = NOW - timedelta(hours=STALE_AFTER_HOURS + 1)
        self.assertTrue(is_session_stale("in_progress", last, NOW))

    def test_recent_in_progress_is_resumable(self):
        last = NOW - timedelta(hours=1)
        self.assertFalse(is_session_stale("in_progress", last, NOW))

    def test_exactly_at_cutoff_is_not_stale(self):
        last = NOW - timedelta(hours=STALE_AFTER_HOURS)
        # strictly-before the cutoff is stale; equal is a boundary that stays.
        self.assertFalse(is_session_stale("in_progress", last, NOW))

    def test_missing_activity_is_stale(self):
        self.assertTrue(is_session_stale("in_progress", None, NOW))

    def test_completed_never_stale(self):
        last = NOW - timedelta(days=30)
        self.assertFalse(is_session_stale("completed", last, NOW))

    def test_abandoned_never_stale(self):
        last = NOW - timedelta(days=30)
        self.assertFalse(is_session_stale("abandoned", last, NOW))

    def test_timed_out_never_stale(self):
        # A swept session must not be swept twice, or its completed_at would
        # walk forward every hour.
        last = NOW - timedelta(days=30)
        self.assertFalse(is_session_stale("timed_out", last, NOW))


class SessionDurationTests(unittest.TestCase):
    """Duration on a silent session is start → last known activity.

    The old sweep left this NULL, which quietly biased the average duration:
    it only ever saw sessions people bothered to exit properly. It also stamped
    completed_at with sweep time, producing rows that looked like a month-long
    rehearsal.
    """

    def test_measures_to_last_activity_not_to_now(self):
        started = NOW - timedelta(days=30)
        s = SimpleNamespace(started_at=started)
        self.assertEqual(session_duration_seconds(s, started + timedelta(minutes=4)), 240)

    def test_no_activity_means_zero_not_missing(self):
        # They opened it and never spoke. That is a finding, not a gap.
        s = SimpleNamespace(started_at=NOW - timedelta(days=3))
        self.assertEqual(session_duration_seconds(s, None), 0)

    def test_no_start_time_is_unknowable(self):
        s = SimpleNamespace(started_at=None)
        self.assertIsNone(session_duration_seconds(s, NOW))

    def test_activity_before_start_never_goes_negative(self):
        started = NOW
        s = SimpleNamespace(started_at=started)
        self.assertEqual(session_duration_seconds(s, started - timedelta(minutes=5)), 0)


if __name__ == "__main__":
    unittest.main()
