"""A purchase made as the app's guest follows the actor into their real account.

2026-11-17: a subscriber paid as the anonymous guest, signed in with Apple,
got a new account, and the app asked him to pay again.
"""

import asyncio
import json
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

from app.api import webhooks
from app.models.billing import GuestMerge, PricingTier, UserSubscription
from app.models.organization import Organization
from app.models.user import User
from app.services.guest_purchase import claim_guest, follow_merge
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


class GuestPurchaseTest(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db([Organization, User, PricingTier, UserSubscription, GuestMerge])
        self.free = PricingTier(name="free", display_name="Free", monthly_price_cents=0, features={})
        self.plus = PricingTier(name="plus", display_name="Plus", monthly_price_cents=1200, features={})
        self.guest = User(email="anon+sb-guest@anon.actorrise.com", supabase_id="sb-guest")
        self.owner = User(email="x@privaterelay.appleid.com", supabase_id="sb-owner")
        self.db.add_all([self.free, self.plus, self.guest, self.owner])
        self.db.commit()
        self.patches = [
            mock.patch.object(webhooks, "revenuecat_webhook_auth", None),
            mock.patch.object(webhooks.threading, "Thread", _NoThread),
            mock.patch("app.services.events.record_user_event", lambda *a, **kw: True),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        self.db.close()
        restore(self.saved)

    def _send(self, event_type, app_user_id="sb-guest", **extra):
        event = {"type": event_type, "app_user_id": app_user_id, "product_id": "ghostlight.premium.monthly.v2", **extra}
        return asyncio.run(webhooks.revenuecat_webhook(_Req({"event": event}), db=self.db))

    def _sub(self, user):
        self.db.expire_all()
        return self.db.query(UserSubscription).filter(UserSubscription.user_id == user.id).first()

    def _exp_ms(self, days):
        return int((datetime.now(timezone.utc) + timedelta(days=days)).timestamp() * 1000)

    def test_guest_purchase_moves_to_the_account_at_sign_in(self):
        self._send("INITIAL_PURCHASE", expiration_at_ms=self._exp_ms(30))
        self.assertTrue(claim_guest(self.guest, self.owner, self.db))
        sub = self._sub(self.owner)
        self.assertEqual((sub.tier_id, sub.status, sub.source, sub.billing_period), (self.plus.id, "active", "revenuecat", "monthly"))
        self.assertIsNone(self._sub(self.guest))

    def test_owner_with_a_free_row_takes_the_guest_purchase(self):
        self.db.add(UserSubscription(user_id=self.owner.id, tier_id=self.free.id, status="active"))
        self.db.commit()
        self._send("INITIAL_PURCHASE", expiration_at_ms=self._exp_ms(30))
        self.assertTrue(claim_guest(self.guest, self.owner, self.db))
        self.assertEqual(self._sub(self.owner).tier_id, self.plus.id)
        guest_row = self._sub(self.guest)
        self.assertEqual((guest_row.tier_id, guest_row.status), (self.free.id, "expired"))

    def test_renewal_for_the_guest_lands_on_the_account(self):
        self._send("INITIAL_PURCHASE", expiration_at_ms=self._exp_ms(30))
        claim_guest(self.guest, self.owner, self.db)
        new_end = self._exp_ms(60)
        self._send("RENEWAL", expiration_at_ms=new_end)
        sub = self._sub(self.owner)
        self.assertEqual(sub.tier_id, self.plus.id)
        self.assertEqual(int(sub.current_period_end.replace(tzinfo=timezone.utc).timestamp()), new_end // 1000)
        self.assertIsNone(self._sub(self.guest))

    def test_purchase_webhook_after_sign_in_still_lands_on_the_account(self):
        # Signed in seconds after paying: the merge is recorded before the row exists.
        self.assertFalse(claim_guest(self.guest, self.owner, self.db))
        self._send("INITIAL_PURCHASE", expiration_at_ms=self._exp_ms(30))
        self.assertEqual(self._sub(self.owner).tier_id, self.plus.id)
        self.assertIsNone(self._sub(self.guest))

    def test_expiration_for_the_guest_ends_the_accounts_app_row(self):
        self._send("INITIAL_PURCHASE", expiration_at_ms=self._exp_ms(30))
        claim_guest(self.guest, self.owner, self.db)
        self._send("EXPIRATION")
        sub = self._sub(self.owner)
        self.assertEqual((sub.tier_id, sub.status), (self.free.id, "expired"))

    def test_account_already_paying_on_the_web_is_not_touched(self):
        self.db.add(UserSubscription(user_id=self.owner.id, tier_id=self.plus.id, status="active", source="stripe", stripe_subscription_id="sub_1"))
        self.db.commit()
        self._send("INITIAL_PURCHASE", expiration_at_ms=self._exp_ms(30))
        self.assertFalse(claim_guest(self.guest, self.owner, self.db))
        sub = self._sub(self.owner)
        self.assertEqual((sub.source, sub.stripe_subscription_id), ("stripe", "sub_1"))

    def test_only_a_guest_can_be_claimed(self):
        other = User(email="real@b.com", supabase_id="sb-real")
        self.db.add(other)
        self.db.commit()
        self.assertFalse(claim_guest(other, self.owner, self.db))
        self.assertIs(follow_merge(other, self.db), other)

    def test_transfer_moves_the_row(self):
        self._send("INITIAL_PURCHASE", expiration_at_ms=self._exp_ms(30))
        out = asyncio.run(webhooks.revenuecat_webhook(
            _Req({"event": {"type": "TRANSFER", "transferred_from": ["sb-guest"], "transferred_to": ["sb-owner"]}}),
            db=self.db,
        ))
        self.assertEqual(out["message"], "transferred")
        self.assertEqual(self._sub(self.owner).tier_id, self.plus.id)
        # Later events carry the new id and land there directly.
        self._send("RENEWAL", app_user_id="sb-owner", expiration_at_ms=self._exp_ms(60))
        self.assertEqual(self._sub(self.owner).tier_id, self.plus.id)


if __name__ == "__main__":
    unittest.main()
