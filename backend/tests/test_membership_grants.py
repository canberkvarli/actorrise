"""Tests for comped membership grants and self-expiring access.

Covers:
- UserSubscription.is_active expiry semantics for comp grants vs real Stripe subs
- Validation for the admin grant/revoke request models
"""

import unittest
from datetime import datetime, timedelta, timezone

from pydantic import ValidationError

from app.api.admin.users import AdminGrantRequest, AdminGrantRevokeRequest
from app.models.billing import UserSubscription


def _sub(**kwargs) -> UserSubscription:
    """Build an in-memory UserSubscription (no DB session needed)."""
    return UserSubscription(user_id=1, tier_id=3, **kwargs)


class IsActiveExpiryTests(unittest.TestCase):
    def test_active_no_expiry_is_active(self):
        sub = _sub(status="active", trial_end=None, stripe_subscription_id=None)
        self.assertTrue(sub.is_active)

    def test_canceled_is_not_active(self):
        sub = _sub(status="canceled", trial_end=None, stripe_subscription_id=None)
        self.assertFalse(sub.is_active)

    def test_comp_with_future_expiry_is_active(self):
        future = datetime.now(timezone.utc) + timedelta(days=10)
        sub = _sub(status="trialing", trial_end=future, stripe_subscription_id=None)
        self.assertTrue(sub.is_active)

    def test_comp_with_past_expiry_is_not_active(self):
        past = datetime.now(timezone.utc) - timedelta(days=1)
        sub = _sub(status="trialing", trial_end=past, stripe_subscription_id=None)
        self.assertFalse(sub.is_active)

    def test_comp_with_naive_past_expiry_is_not_active(self):
        # trial_end may come back from the DB as a naive datetime.
        past_naive = datetime.utcnow() - timedelta(days=1)
        sub = _sub(status="trialing", trial_end=past_naive, stripe_subscription_id=None)
        self.assertFalse(sub.is_active)

    def test_real_stripe_trial_ignores_local_expiry(self):
        # A real Stripe trial carries a stripe_subscription_id; Stripe owns its
        # lifecycle, so a past local trial_end must NOT cut it off early.
        past = datetime.now(timezone.utc) - timedelta(days=1)
        sub = _sub(status="trialing", trial_end=past, stripe_subscription_id="sub_123")
        self.assertTrue(sub.is_active)

    def test_permanent_comp_is_active(self):
        sub = _sub(status="active", trial_end=None, stripe_subscription_id=None)
        self.assertTrue(sub.is_active)


class GrantRequestValidationTests(unittest.TestCase):
    def test_grant_note_is_required(self):
        with self.assertRaises(ValidationError):
            AdminGrantRequest(tier_id=3)

    def test_permanent_grant_is_valid(self):
        req = AdminGrantRequest(tier_id=3, note="Founding actor comp")
        self.assertIsNone(req.duration_days)

    def test_timed_grant_is_valid(self):
        req = AdminGrantRequest(tier_id=3, duration_days=30, note="Liana 30-day trial")
        self.assertEqual(req.duration_days, 30)

    def test_revoke_note_is_required(self):
        with self.assertRaises(ValidationError):
            AdminGrantRevokeRequest(note="")


if __name__ == "__main__":
    unittest.main()
