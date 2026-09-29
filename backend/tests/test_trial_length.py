"""A week, or two for an actor who has finished a scene."""

import asyncio
import unittest
from types import SimpleNamespace
from unittest import mock

from app.api import subscriptions
from app.models.billing import PricingTier, UserSubscription
from app.models.organization import Organization
from app.models.user import User
from app.models.user_event import UserEvent
from app.services import trial_length
from tests.dbfixture import memory_db, restore


class TrialLengthTests(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db([Organization, User, UserEvent])
        self.user = User(email="a@b.c", supabase_id="s1")
        self.db.add(self.user)
        self.db.commit()
        # rehearsal_sessions hangs off scenes and user_scripts, which carry
        # Postgres-only columns; that lookup is patched, the event one is real.
        self.patcher = mock.patch.object(trial_length, "_completed_a_session", lambda db, uid: False)
        self.patcher.start()

    def tearDown(self):
        self.patcher.stop()
        restore(self.saved)

    def _event(self, user_id, name):
        self.db.add(UserEvent(user_id=user_id, event_name=name, properties={}))
        self.db.commit()

    def test_default_is_a_week(self):
        self.assertEqual(trial_length.trial_days_for(self.db, self.user.id), 7)
        self.assertFalse(trial_length.has_finished_a_scene(self.db, self.user.id))

    def test_the_guided_scene_earns_the_second(self):
        self._event(self.user.id, "guided_scene_finished")
        self.assertEqual(trial_length.trial_days_for(self.db, self.user.id), 14)
        self.assertTrue(trial_length.has_finished_a_scene(self.db, self.user.id))

    def test_starting_is_not_finishing(self):
        self._event(self.user.id, "guided_scene_started")
        self.assertEqual(trial_length.trial_days_for(self.db, self.user.id), 7)

    def test_any_completed_session_counts(self):
        with mock.patch.object(trial_length, "_completed_a_session", lambda db, uid: True):
            self.assertEqual(trial_length.trial_days_for(self.db, self.user.id), 14)

    def test_someone_elses_scene_does_not(self):
        other = User(email="o@b.c", supabase_id="s2")
        self.db.add(other)
        self.db.commit()
        self._event(other.id, "guided_scene_finished")
        self.assertEqual(trial_length.trial_days_for(self.db, self.user.id), 7)

    def test_a_failed_lookup_gives_the_week(self):
        def boom(db, uid):
            raise RuntimeError("db gone")

        with mock.patch.object(trial_length, "_completed_a_session", boom):
            self.assertEqual(trial_length.trial_days_for(self.db, self.user.id), 7)

    def test_the_two_lengths(self):
        self.assertEqual(trial_length.BASE_TRIAL_DAYS, 7)
        self.assertEqual(trial_length.EARNED_TRIAL_DAYS, 14)


class CheckoutAndMeTests(unittest.TestCase):
    """The length reaches Stripe and the client from the one place that decides it."""

    def setUp(self):
        self.db, self.saved = memory_db(
            [Organization, User, UserEvent, PricingTier, UserSubscription]
        )
        self.user = User(email="a@b.c", supabase_id="s1")
        self.plus = PricingTier(
            name="plus",
            display_name="Plus",
            monthly_price_cents=1200,
            annual_price_cents=9900,
            stripe_monthly_price_id="price_month",
            stripe_annual_price_id="price_year",
            features={},
            is_active=True,
        )
        self.db.add_all([self.user, self.plus])
        self.db.commit()
        self.patcher = mock.patch.object(trial_length, "_completed_a_session", lambda db, uid: False)
        self.patcher.start()

    def tearDown(self):
        self.patcher.stop()
        restore(self.saved)

    def _finish_the_scene(self):
        self.db.add(UserEvent(user_id=self.user.id, event_name="guided_scene_finished", properties={}))
        self.db.commit()

    def _checkout(self, **overrides):
        request = subscriptions.CreateCheckoutSessionRequest(
            tier_id=self.plus.id,
            billing_period="monthly",
            success_url="https://actorrise.com/billing/success",
            cancel_url="https://actorrise.com/pricing",
            trial=True,
            **overrides,
        )
        with mock.patch.object(
            subscriptions.stripe.Customer, "create", return_value=SimpleNamespace(id="cus_1")
        ), mock.patch.object(
            subscriptions.stripe.checkout.Session,
            "create",
            return_value=SimpleNamespace(url="https://checkout.stripe.test/x"),
        ) as create:
            asyncio.run(
                subscriptions.create_checkout_session(request, current_user=self.user, db=self.db)
            )
        return create.call_args.kwargs

    def test_checkout_runs_a_week(self):
        sent = self._checkout()
        self.assertEqual(sent["subscription_data"]["trial_period_days"], 7)
        self.assertEqual(sent["metadata"]["trial_days"], "7")
        self.assertEqual(sent["metadata"]["trial_earned"], "0")

    def test_checkout_runs_two_for_a_finished_scene(self):
        self._finish_the_scene()
        sent = self._checkout()
        self.assertEqual(sent["subscription_data"]["trial_period_days"], 14)
        self.assertEqual(sent["metadata"]["trial_days"], "14")
        self.assertEqual(sent["metadata"]["trial_earned"], "1")

    def test_a_paid_checkout_carries_no_trial(self):
        request = subscriptions.CreateCheckoutSessionRequest(
            tier_id=self.plus.id,
            billing_period="annual",
            success_url="https://actorrise.com/billing/success",
            cancel_url="https://actorrise.com/pricing",
            trial=False,
        )
        with mock.patch.object(
            subscriptions.stripe.Customer, "create", return_value=SimpleNamespace(id="cus_1")
        ), mock.patch.object(
            subscriptions.stripe.checkout.Session,
            "create",
            return_value=SimpleNamespace(url="https://checkout.stripe.test/x"),
        ) as create:
            asyncio.run(
                subscriptions.create_checkout_session(request, current_user=self.user, db=self.db)
            )
        sent = create.call_args.kwargs
        self.assertNotIn("trial_period_days", sent["subscription_data"])
        self.assertEqual(sent["metadata"]["trial_days"], "0")
        self.assertEqual(sent["metadata"]["trial_earned"], "0")

    def test_me_reports_what_checkout_would_run(self):
        me = asyncio.run(subscriptions.get_my_subscription(current_user=self.user, db=self.db))
        self.assertEqual((me.trial_days, me.trial_earned), (7, False))
        self._finish_the_scene()
        me = asyncio.run(subscriptions.get_my_subscription(current_user=self.user, db=self.db))
        self.assertEqual((me.trial_days, me.trial_earned), (14, True))


if __name__ == "__main__":
    unittest.main()
