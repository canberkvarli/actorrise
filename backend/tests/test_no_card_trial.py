"""The Plus trial without a card, behind a switch (2026-11-16).

Off: checkout collects a card for the trial, as before. On: Stripe is told to
collect one only if required, which a $0 trial never is, and the trial still
ends with missing_payment_method "cancel", so a trial nobody adds a card to
just stops. /me says whether the switch is on (for the walls) and whether a
running trial still needs a card (for the reminder).
"""

import asyncio
import unittest
from types import SimpleNamespace
from unittest import mock

from app.api import subscriptions
from app.models.billing import UserSubscription
from tests.test_trial_length import Fixture


class NoCardTrialTests(Fixture):
    def setUp(self):
        super().setUp()
        subscriptions._CARD_CACHE.clear()

    def _switch(self, on: bool):
        patcher = mock.patch.object(subscriptions, "no_card_trial_on", return_value=on)
        patcher.start()
        self.addCleanup(patcher.stop)

    def _checkout(self):
        request = subscriptions.CreateCheckoutSessionRequest(
            tier_id=self.plus.id, billing_period="monthly",
            success_url="https://actorrise.com/billing/success",
            cancel_url="https://actorrise.com/pricing", trial=True,
        )
        with mock.patch.object(
            subscriptions.stripe.Customer, "create", return_value=SimpleNamespace(id="cus_1")
        ), mock.patch.object(
            subscriptions.stripe.checkout.Session, "create",
            return_value=SimpleNamespace(url="https://checkout.stripe.test/x"),
        ) as create:
            asyncio.run(subscriptions.create_checkout_session(request, current_user=self.user, db=self.db))
        return create.call_args.kwargs

    def _me(self):
        return asyncio.run(subscriptions.get_my_subscription(current_user=self.user, db=self.db))

    def test_off_by_default_keeps_the_card(self):
        # No settings row (this fixture has no app_settings table): the read
        # fails closed and the card is kept.
        sent = self._checkout()
        self.assertEqual(sent["payment_method_collection"], "always")
        self.assertNotIn("No card needed", sent["custom_text"]["submit"]["message"])
        self.assertFalse(self._me().no_card_trial)

    def test_on_asks_for_no_card_and_says_so(self):
        self._switch(True)
        sent = self._checkout()
        self.assertEqual(sent["payment_method_collection"], "if_required")
        self.assertIn("No card needed", sent["custom_text"]["submit"]["message"])
        # A card-less trial still ends on its own rather than invoicing nobody.
        self.assertEqual(
            sent["subscription_data"]["trial_settings"]["end_behavior"]["missing_payment_method"], "cancel"
        )
        self.assertTrue(self._me().no_card_trial)

    def _trialing(self, cancel=False):
        self.db.add(UserSubscription(
            user_id=self.user.id, tier_id=self.plus.id, status="trialing",
            billing_period="monthly", stripe_customer_id="cus_1",
            stripe_subscription_id="sub_1", cancel_at_period_end=cancel,
        ))
        self.db.commit()

    def _stripe_sub(self, sub_pm=None, customer_pm=None):
        return {"default_payment_method": sub_pm,
                "customer": {"invoice_settings": {"default_payment_method": customer_pm}}}

    def test_a_trial_without_a_card_needs_one(self):
        self._trialing()
        with mock.patch.object(subscriptions.stripe.Subscription, "retrieve", return_value=self._stripe_sub()):
            self.assertTrue(self._me().card_needed)

    def test_a_card_on_the_customer_is_enough(self):
        self._trialing()
        with mock.patch.object(subscriptions.stripe.Subscription, "retrieve",
                               return_value=self._stripe_sub(customer_pm="pm_1")):
            self.assertFalse(self._me().card_needed)

    def test_someone_who_cancelled_is_not_reminded(self):
        self._trialing(cancel=True)
        with mock.patch.object(subscriptions.stripe.Subscription, "retrieve", return_value=self._stripe_sub()):
            self.assertFalse(self._me().card_needed)

    def test_a_stripe_error_does_not_nag(self):
        self._trialing()
        with mock.patch.object(subscriptions.stripe.Subscription, "retrieve", side_effect=RuntimeError("down")):
            self.assertFalse(self._me().card_needed)

    def test_the_answer_is_cached(self):
        self._trialing()
        with mock.patch.object(subscriptions.stripe.Subscription, "retrieve",
                               return_value=self._stripe_sub()) as retrieve:
            self._me(); self._me()
        self.assertEqual(retrieve.call_count, 1)


if __name__ == "__main__":
    unittest.main()
