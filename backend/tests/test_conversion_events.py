"""The money path in user_events: its names, and one row per subscription."""

import unittest
from unittest import mock

from app.models.organization import Organization
from app.models.user import User
from app.models.user_event import UserEvent
from app.services import events
from tests.dbfixture import memory_db, restore


class VocabularyTests(unittest.TestCase):
    def test_server_names(self):
        for name in ("trial_started", "checkout_completed", "email_sent"):
            self.assertIn(name, events.SERVER_EVENT_NAMES, name)
            self.assertNotIn(name, events.CLIENT_EVENT_NAMES, name)

    def test_client_names(self):
        for name in ("paywall_hit", "paywall_dismissed", "paywall_cta_clicked", "email_clicked"):
            self.assertIn(name, events.CLIENT_EVENT_NAMES, name)

    def test_names_fit_the_column(self):
        for name in events.EVENT_NAMES:
            self.assertLessEqual(len(name), 48, name)


class SubscriptionEventTests(unittest.TestCase):
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

    def test_a_retried_webhook_writes_one_row(self):
        first = events.record_subscription_event(
            self.db, self.user.id, "trial_started", "sub_1", trial_days=7, earned=False
        )
        again = events.record_subscription_event(
            self.db, self.user.id, "trial_started", "sub_1", trial_days=7, earned=False
        )
        self.assertTrue(first)
        self.assertFalse(again)
        row = self.db.query(UserEvent).one()
        self.assertEqual(row.properties["trial_days"], 7)
        self.assertEqual(row.properties["subscription_id"], "sub_1")

    def test_names_do_not_block_each_other(self):
        events.record_subscription_event(self.db, self.user.id, "checkout_completed", "sub_1")
        events.record_subscription_event(self.db, self.user.id, "trial_started", "sub_1")
        self.assertEqual(self.db.query(UserEvent).count(), 2)

    def test_trial_ended_still_dedupes(self):
        self.assertTrue(events.record_trial_ended(self.db, self.user.id, "sub_1", "converted"))
        self.assertFalse(events.record_trial_ended(self.db, self.user.id, "sub_1", "converted"))


class TrialDaysOfTests(unittest.TestCase):
    def test_metadata_wins(self):
        from app.api import webhooks

        with mock.patch.object(webhooks.stripe.Subscription, "retrieve") as retrieve:
            self.assertEqual(webhooks._trial_days_of({"trial_days": "7"}, "sub_1"), 7)
            retrieve.assert_not_called()

    def test_payment_link_reads_stripe(self):
        from app.api import webhooks

        fake = {"trial_start": 1_000_000, "trial_end": 1_000_000 + 14 * 86400}
        with mock.patch.object(webhooks.stripe.Subscription, "retrieve", return_value=fake):
            self.assertEqual(webhooks._trial_days_of({}, "sub_1"), 14)

    def test_no_trial(self):
        from app.api import webhooks

        with mock.patch.object(webhooks.stripe.Subscription, "retrieve", return_value={}):
            self.assertEqual(webhooks._trial_days_of({}, "sub_1"), 0)

    def test_stripe_down_is_no_trial(self):
        from app.api import webhooks

        with mock.patch.object(
            webhooks.stripe.Subscription, "retrieve", side_effect=RuntimeError("stripe down")
        ):
            self.assertEqual(webhooks._trial_days_of({}, "sub_1"), 0)


class _NoClose:
    def __init__(self, db):
        self._db = db

    def __getattr__(self, name):
        return getattr(self._db, name)

    def close(self):
        pass


if __name__ == "__main__":
    unittest.main()
