"""Cancelling during a Stripe trial tells the founder at once, not when it runs out."""

import unittest
from unittest import mock

from app.api import webhooks
from app.models.billing import PricingTier, UserSubscription
from app.models.organization import Organization
from app.models.user import User
from app.models.user_event import UserEvent
from tests.dbfixture import memory_db, restore


class _SyncThread:
    """Runs the thread's target inline so the test can see what was sent."""

    def __init__(self, target, kwargs, daemon=None):
        self.target, self.kwargs = target, kwargs

    def start(self):
        self.target(**self.kwargs)


class TrialCancelNotice(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db([Organization, User, UserEvent, PricingTier, UserSubscription])
        user = User(email="maya@example.com", supabase_id="maya", name="Maya Lopez")
        plus = PricingTier(name="plus", display_name="Plus", monthly_price_cents=1200, features={})
        self.db.add_all([user, plus])
        self.db.commit()
        self.db.add(UserSubscription(user_id=user.id, tier_id=plus.id, stripe_subscription_id="sub_1", status="trialing"))
        self.db.commit()
        self.sent = []
        self.patches = [
            mock.patch.object(webhooks.threading, "Thread", _SyncThread),
            mock.patch(
                "app.services.email.notifications.send_trial_ended_notification",
                lambda **kw: self.sent.append(kw),
            ),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        self.db.close()
        restore(self.saved)

    def _update(self, sub, prev):
        webhooks.handle_subscription_updated({"id": "sub_1", **sub}, self.db, prev)

    def test_cancel_at_period_end_during_trial_notifies(self):
        self._update({"status": "trialing", "cancel_at_period_end": True}, {"cancel_at_period_end": False})
        self.assertEqual([s["outcome"] for s in self.sent], ["trial_cancel_requested"])
        self.assertEqual(self.sent[0]["user_email"], "maya@example.com")

    def test_cancel_at_set_during_trial_notifies(self):
        self._update({"status": "trialing", "cancel_at": 1792000000}, {"cancel_at": None})
        self.assertEqual([s["outcome"] for s in self.sent], ["trial_cancel_requested"])

    def test_unrelated_trial_update_is_silent(self):
        self._update({"status": "trialing", "cancel_at_period_end": False}, {"metadata": {}})
        self.assertEqual(self.sent, [])

    def test_resuming_a_cancelled_trial_is_silent(self):
        self._update({"status": "trialing", "cancel_at_period_end": False}, {"cancel_at_period_end": True})
        self.assertEqual(self.sent, [])


if __name__ == "__main__":
    unittest.main()
