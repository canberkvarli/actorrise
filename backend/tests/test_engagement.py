import unittest
from datetime import date, datetime, timezone

from app.models.billing import UsageMetrics
from app.models.organization import Organization
from app.models.user import User
from app.models.user_event import UserEvent
from app.services import engagement
from app.services.admin_filters import real_user_ids_query
from tests.dbfixture import memory_db, restore


class EngagedWeeksTests(unittest.TestCase):
    def test_returning_means_seen_in_an_earlier_week(self):
        rows = [
            (1, date(2026, 9, 28)), (1, date(2026, 10, 6)),  # week 1, back week 2
            (2, date(2026, 10, 5)),  # new in week 2
            (3, date(2026, 9, 29)), (3, date(2026, 9, 30)),  # week 1 only
        ]
        weeks = engagement.weekly(rows)
        self.assertEqual(weeks[date(2026, 9, 28)], {"active": 2, "returning": 0})
        self.assertEqual(weeks[date(2026, 10, 5)], {"active": 2, "returning": 1})

    def test_engaged_names_exclude_passive_ones(self):
        self.assertIn("audition_created", engagement.ENGAGED_EVENTS)
        self.assertNotIn("audition_reminder_sent", engagement.ENGAGED_EVENTS)
        self.assertNotIn("email_sent", engagement.ENGAGED_EVENTS)


class ActivityRowsTests(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db([Organization, User, UsageMetrics, UserEvent])

    def tearDown(self):
        self.db.close()
        restore(self.saved)

    def _user(self, email, signup, **kw):
        u = User(email=email, hashed_password="x", created_at=datetime(*signup, 12, tzinfo=timezone.utc), **kw)
        self.db.add(u)
        self.db.flush()
        return u.id

    def test_signup_day_staff_and_passive_events_do_not_count(self):
        real = self._user("a@gmail.com", (2026, 9, 28))
        staff = self._user("b@actorrise.com", (2026, 9, 1))
        self.db.add_all([
            UsageMetrics(user_id=real, date=date(2026, 9, 28)),  # signup day
            UsageMetrics(user_id=real, date=date(2026, 9, 29)),
            UserEvent(user_id=real, event_name="audition_created", created_at=datetime(2026, 10, 6, 9, tzinfo=timezone.utc)),
            UserEvent(user_id=real, event_name="email_sent", created_at=datetime(2026, 10, 7, 9, tzinfo=timezone.utc)),
            UserEvent(user_id=real, event_name="audition_created", created_at=datetime(2026, 9, 28, 20, tzinfo=timezone.utc)),
            UsageMetrics(user_id=staff, date=date(2026, 10, 1)),
        ])
        self.db.commit()
        rows = engagement.activity_rows(self.db, real_user_ids_query(self.db))
        self.assertEqual(sorted(rows), [(real, date(2026, 9, 29)), (real, date(2026, 10, 6))])


if __name__ == "__main__":
    unittest.main()
