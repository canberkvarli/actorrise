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


from app.api.admin.pulse import (
    unseen_conversions,
    unseen_bad_searches,
    unseen_requests,
)
from app.models.content_request import ContentRequest
from app.models.search_log import SearchLog
from app.models.user_event import UserEvent


class UnseenCountTests(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db(
            [Organization, User, AdminSeen, ContentRequest, SearchLog, UserEvent]
        )
        self.actor = User(email="actor@gmail.com", hashed_password="x")
        self.staff = User(email="canberkvarli@gmail.com", hashed_password="x")
        self.db.add_all([self.actor, self.staff])
        self.db.commit()
        self.cutoff = datetime(2026, 9, 1, tzinfo=timezone.utc)
        self.before = self.cutoff - timedelta(days=1)
        self.after = self.cutoff + timedelta(days=1)

    def tearDown(self):
        self.db.close()
        restore(self.saved)

    def test_requests_count_by_last_requested_not_first(self):
        """An old title asked for again is news. It must resurface."""
        self.db.add(
            ContentRequest(
                play_title="Heathers",
                request_count=2,
                first_requested_at=self.before,
                last_requested_at=self.after,
            )
        )
        self.db.commit()
        self.assertEqual(unseen_requests(self.db, self.cutoff), 1)

    def test_requests_ignores_untouched_rows(self):
        self.db.add(
            ContentRequest(
                play_title="Witch",
                request_count=1,
                first_requested_at=self.before,
                last_requested_at=self.before,
            )
        )
        self.db.commit()
        self.assertEqual(unseen_requests(self.db, self.cutoff), 0)

    def test_bad_search_counted_once_when_zero_and_weak(self):
        """15 rows in prod are both. Adding zero + weak double-counts them."""
        self.db.add(
            SearchLog(
                query="tech bro",
                results_count=0,
                weak_match=True,
                user_id=self.actor.id,
                created_at=self.after,
            )
        )
        self.db.commit()
        self.assertEqual(unseen_bad_searches(self.db, self.cutoff), 1)

    def test_good_search_is_not_counted(self):
        self.db.add(
            SearchLog(
                query="hamlet",
                results_count=30,
                weak_match=False,
                user_id=self.actor.id,
                created_at=self.after,
            )
        )
        self.db.commit()
        self.assertEqual(unseen_bad_searches(self.db, self.cutoff), 0)

    def test_staff_searches_do_not_badge(self):
        self.db.add(
            SearchLog(
                query="my own test query",
                results_count=0,
                user_id=self.staff.id,
                created_at=self.after,
            )
        )
        self.db.commit()
        self.assertEqual(unseen_bad_searches(self.db, self.cutoff), 0)

    def test_anonymous_searches_do_badge(self):
        """A logged-out actor is a real actor, not a test account."""
        self.db.add(
            SearchLog(
                query="crazy birds",
                results_count=0,
                user_id=None,
                created_at=self.after,
            )
        )
        self.db.commit()
        self.assertEqual(unseen_bad_searches(self.db, self.cutoff), 1)

    def test_conversions_count_trial_converted_only(self):
        self.db.add_all(
            [
                UserEvent(
                    user_id=self.actor.id,
                    event_name="trial_converted",
                    created_at=self.after,
                ),
                UserEvent(
                    user_id=self.actor.id,
                    event_name="trial_started",
                    created_at=self.after,
                ),
            ]
        )
        self.db.commit()
        self.assertEqual(unseen_conversions(self.db, self.cutoff), 1)

    def test_staff_conversions_do_not_badge(self):
        self.db.add(
            UserEvent(
                user_id=self.staff.id,
                event_name="trial_converted",
                created_at=self.after,
            )
        )
        self.db.commit()
        self.assertEqual(unseen_conversions(self.db, self.cutoff), 0)


if __name__ == "__main__":
    unittest.main()
