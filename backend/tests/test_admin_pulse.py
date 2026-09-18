"""The admin pulse: unseen counts per surface, and the seen stamp behind them."""

import unittest
from datetime import datetime, timedelta, timezone

from app.models.admin_seen import AdminSeen, last_seen_at, mark_seen
from app.models.organization import Organization
from app.models.user import User
from tests.dbfixture import memory_db, restore


class MarkSeenTests(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db([Organization, User, AdminSeen])
        self.admin = User(email="mod@actorrise.com", hashed_password="x")
        self.db.add(self.admin)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        restore(self.saved)

    def test_no_row_returns_the_fallback(self):
        fallback = datetime(2020, 1, 1, tzinfo=timezone.utc)
        self.assertEqual(
            last_seen_at(self.db, self.admin.id, "requests", fallback), fallback
        )

    def test_mark_then_read_round_trips(self):
        stamped = mark_seen(self.db, self.admin.id, "requests")
        fallback = datetime(2020, 1, 1, tzinfo=timezone.utc)
        self.assertEqual(
            last_seen_at(self.db, self.admin.id, "requests", fallback), stamped
        )

    def test_marking_twice_updates_rather_than_duplicates(self):
        first = mark_seen(self.db, self.admin.id, "requests")
        second = mark_seen(self.db, self.admin.id, "requests")
        self.assertGreaterEqual(second, first)
        self.assertEqual(self.db.query(AdminSeen).count(), 1)

    def test_surfaces_are_independent(self):
        mark_seen(self.db, self.admin.id, "requests")
        fallback = datetime(2020, 1, 1, tzinfo=timezone.utc)
        self.assertEqual(
            last_seen_at(self.db, self.admin.id, "searches", fallback), fallback
        )


if __name__ == "__main__":
    unittest.main()
