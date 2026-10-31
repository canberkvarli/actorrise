"""A RevenueCat event never replaces or ends a live web subscription or comp.

One user has one user_subscriptions row. Before 2026-10-31 an app purchase
overwrote a paying Stripe Plus row with the app tier, and the app's EXPIRATION
then set it to free.
"""

import asyncio
import json
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

from app.api import webhooks
from app.models.billing import PricingTier, UserSubscription
from app.models.organization import Organization
from app.models.user import User
from tests.dbfixture import memory_db, restore


class _Req:
    def __init__(self, payload):
        self.headers = {}
        self._body = json.dumps(payload).encode()

    async def body(self):
        return self._body


class _NoThread:
    def __init__(self, *a, **kw):
        pass

    def start(self):
        pass


class RevenueCatWebRowTest(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db([Organization, User, PricingTier, UserSubscription])
        self.free = PricingTier(name="free", display_name="Free", monthly_price_cents=0, features={})
        self.plus = PricingTier(name="plus", display_name="Plus", monthly_price_cents=1200, features={})
        self.app = PricingTier(name="monologues", display_name="Monologues", monthly_price_cents=500, features={})
        self.user = User(email="a@b.com", supabase_id="sb-1")
        self.db.add_all([self.free, self.plus, self.app, self.user])
        self.db.commit()
        self.events = []
        self.patches = [
            mock.patch.object(webhooks, "revenuecat_webhook_auth", None),
            mock.patch.object(webhooks.threading, "Thread", _NoThread),
            mock.patch(
                "app.services.events.record_user_event",
                lambda uid, name, props=None: self.events.append((uid, name, props)),
            ),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        self.db.close()
        restore(self.saved)

    def _row(self, **kw):
        self.db.add(UserSubscription(user_id=self.user.id, **kw))
        self.db.commit()

    def _send(self, event_type, **extra):
        event = {"type": event_type, "app_user_id": "sb-1", "product_id": "monologues_annual", **extra}
        return asyncio.run(webhooks.revenuecat_webhook(_Req({"event": event}), db=self.db))

    def _sub(self):
        self.db.expire_all()
        return self.db.query(UserSubscription).filter(UserSubscription.user_id == self.user.id).one()

    def test_purchase_keeps_live_stripe_plus(self):
        self._row(tier_id=self.plus.id, status="active", source="stripe", stripe_subscription_id="sub_1")
        out = self._send("INITIAL_PURCHASE")
        self.assertEqual(out["message"], "web subscription kept")
        sub = self._sub()
        self.assertEqual((sub.tier_id, sub.source, sub.stripe_subscription_id), (self.plus.id, "stripe", "sub_1"))
        self.assertEqual(self.events[0][1], "app_subscription_event")
        self.assertTrue(self.events[0][2]["web_row_kept"])

    def test_expiration_does_not_free_stripe_plus(self):
        self._row(tier_id=self.plus.id, status="trialing", source="stripe", stripe_subscription_id="sub_1")
        self._send("EXPIRATION")
        sub = self._sub()
        self.assertEqual((sub.tier_id, sub.status), (self.plus.id, "trialing"))

    def test_cancellation_does_not_touch_stripe_plus(self):
        self._row(tier_id=self.plus.id, status="active", source="stripe", stripe_subscription_id="sub_1")
        self._send("CANCELLATION")
        self.assertFalse(self._sub().cancel_at_period_end)

    def test_purchase_keeps_active_manual_comp(self):
        end = datetime.now(timezone.utc) + timedelta(days=20)
        self._row(tier_id=self.plus.id, status="active", source="manual", trial_end=end)
        self._send("INITIAL_PURCHASE")
        sub = self._sub()
        self.assertEqual((sub.tier_id, sub.source), (self.plus.id, "manual"))

    def test_expiration_does_not_end_a_lapsed_comp_either(self):
        end = datetime.now(timezone.utc) - timedelta(days=1)
        self._row(tier_id=self.plus.id, status="active", source="manual", trial_end=end)
        out = self._send("EXPIRATION")
        self.assertEqual(out["message"], "row not owned by revenuecat")
        self.assertEqual(self._sub().status, "active")

    def test_purchase_takes_over_an_ended_comp_and_expiration_revokes_it(self):
        end = datetime.now(timezone.utc) - timedelta(days=1)
        self._row(tier_id=self.plus.id, status="active", source="manual", trial_end=end)
        self._send("INITIAL_PURCHASE")
        sub = self._sub()
        self.assertEqual((sub.tier_id, sub.source), (self.app.id, "revenuecat"))
        self._send("EXPIRATION")
        sub = self._sub()
        self.assertEqual((sub.tier_id, sub.status), (self.free.id, "expired"))

    def test_purchase_takes_over_a_canceled_stripe_row(self):
        self._row(tier_id=self.free.id, status="canceled", source="stripe", stripe_subscription_id="sub_old")
        self._send("INITIAL_PURCHASE")
        sub = self._sub()
        self.assertEqual((sub.tier_id, sub.status, sub.source), (self.app.id, "active", "revenuecat"))
        # The next app event treats it as the app's row, not a live Stripe one.
        self._send("RENEWAL")
        self.assertEqual(self._sub().tier_id, self.app.id)

    def test_app_only_user_gets_granted_and_revoked(self):
        self._send("INITIAL_PURCHASE")
        sub = self._sub()
        self.assertEqual((sub.tier_id, sub.source, sub.billing_period), (self.app.id, "revenuecat", "annual"))
        self._send("EXPIRATION")
        self.assertEqual(self._sub().tier_id, self.free.id)

    def test_legacy_null_source_app_row_still_expires(self):
        self._row(tier_id=self.app.id, status="active", source=None)
        self._send("EXPIRATION")
        self.assertEqual(self._sub().tier_id, self.free.id)


if __name__ == "__main__":
    unittest.main()
