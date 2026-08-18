"""Tests for the stuck-session staleness rule.

38 sessions sat in `in_progress` in prod, poisoning the completion math. A
session inactive since the cutoff is abandoned; a recently active one (still
resumable) and an already-finished one are left alone. Tests the pure predicate
(the DB query in find_stale_sessions mirrors it), matching this suite's style of
testing rehearsal logic without a live Postgres.
"""

import unittest
from datetime import datetime, timedelta, timezone

from app.services.rehearsal_cleanup import STALE_AFTER_HOURS, is_session_stale

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


if __name__ == "__main__":
    unittest.main()
