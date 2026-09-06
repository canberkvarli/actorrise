"""Trial outcomes in user_events: one trial_ended per subscription, labelled."""

import unittest
from unittest import mock

from app.models.organization import Organization
from app.models.user import User
from app.models.user_event import UserEvent
from app.services import events
from tests.dbfixture import memory_db, restore


class OutcomeTests(unittest.TestCase):
    def test_labels(self):
        self.assertEqual(events.trial_outcome("active"), "converted")
        self.assertEqual(events.trial_outcome("canceled"), "cancelled")
        self.assertEqual(events.trial_outcome("past_due"), "past_due")
        self.assertEqual(events.trial_outcome(""), "unknown")


class RecordTrialEndedTests(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db([Organization, User, UserEvent])
        self.user = User(email="a@b.c", supabase_id="s1")
        self.db.add(self.user)
        self.db.commit()
        self.patcher = mock.patch.object(events, "SessionLocal", lambda: _NoClose(self.db))
        self.patcher.start()

    def tearDown(self):
        self.patcher.stop()
        restore(self.saved)

    def test_one_per_subscription(self):
        # invoice.paid and subscription.updated both report the same trial end.
        self.assertTrue(events.record_trial_ended(self.db, self.user.id, "sub_1", "converted"))
        self.assertFalse(events.record_trial_ended(self.db, self.user.id, "sub_1", "converted"))
        rows = self.db.query(UserEvent).filter(UserEvent.event_name == "trial_ended").all()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].properties["outcome"], "converted")
        self.assertEqual(rows[0].properties["subscription_id"], "sub_1")

    def test_different_subscriptions_both_count(self):
        events.record_trial_ended(self.db, self.user.id, "sub_1", "cancelled", days_into_trial=3)
        events.record_trial_ended(self.db, self.user.id, "sub_2", "converted")
        self.assertEqual(self.db.query(UserEvent).count(), 2)

    def test_conversion_rate_is_a_query(self):
        events.record_trial_ended(self.db, self.user.id, "sub_1", "converted")
        events.record_user_event(self.user.id, "trial_converted", {"subscription_id": "sub_1"})
        events.record_trial_ended(self.db, self.user.id, "sub_2", "cancelled")
        ended = self.db.query(UserEvent).filter(UserEvent.event_name == "trial_ended").count()
        converted = self.db.query(UserEvent).filter(UserEvent.event_name == "trial_converted").count()
        self.assertEqual((ended, converted), (2, 1))


class _NoClose:
    def __init__(self, db):
        self._db = db

    def __getattr__(self, name):
        return getattr(self._db, name)

    def close(self):
        pass


if __name__ == "__main__":
    unittest.main()
