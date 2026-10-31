"""A week, or two for an actor who has finished a scene."""

import asyncio
import unittest
from types import SimpleNamespace
from unittest import mock

from app.api import subscriptions
from app.models.actor import (
    ActorProfile,
    FilmTvReference,
    Play,
    RehearsalLineDelivery,
    RehearsalSession,
    Scene,
    SceneLine,
    UserScript,
)
from app.models.billing import PricingTier, UsageMetrics, UserSubscription
from app.models.organization import Organization
from app.models.rehearsal import RehearsalEvent, RehearsalRun
from app.models.user import User
from app.models.user_event import UserEvent
from app.services import events, trial_length
from scripts.seed_sample_script import seed_late
from tests.dbfixture import memory_db, restore

_TABLES = (
    Organization, User, ActorProfile, FilmTvReference, Play, UserScript, Scene, SceneLine,
    RehearsalSession, RehearsalLineDelivery, UsageMetrics, UserEvent, PricingTier,
    UserSubscription, RehearsalRun, RehearsalEvent,
)


class Fixture(unittest.TestCase):
    def setUp(self):
        self.db, self._saved = memory_db(_TABLES)
        self.user = User(email="actor@example.com", supabase_id="s1")
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
        seed_late(self.db)
        self.db.commit()
        self.scene = self.db.query(Scene).one()

    def tearDown(self):
        self.db.close()
        restore(self._saved)

    def _session(self, user, status):
        self.db.add(
            RehearsalSession(
                user_id=user.id,
                scene_id=self.scene.id,
                user_character="ALEX",
                ai_character="RILEY",
                status=status,
            )
        )
        self.db.commit()


class TrialLengthTests(Fixture):
    def test_default_is_a_week(self):
        self.assertEqual(trial_length.trial_days_for(self.db, self.user.id), 7)
        self.assertFalse(trial_length.has_finished_a_scene(self.db, self.user.id))

    def test_a_finished_scene_earns_the_second(self):
        self._session(self.user, "completed")
        self.assertEqual(trial_length.trial_days_for(self.db, self.user.id), 14)
        self.assertTrue(trial_length.has_finished_a_scene(self.db, self.user.id))

    def _alex_line_indexes(self) -> list[int]:
        # A journal line_index is the position in the ordered scene, see
        # services/rehearsal/contract.lines_for.
        rows = self.db.query(SceneLine).filter(SceneLine.scene_id == self.scene.id).order_by(SceneLine.line_order).all()
        return [i for i, r in enumerate(rows) if r.character_name == "ALEX"]

    def test_a_completed_v2_run_earns_the_long_trial(self):
        from app.services.rehearsal import journal
        own = self._alex_line_indexes()
        self.assertEqual(len(own), 3)
        run = journal.create_run(self.db, self.user.id, self.scene.id, "ALEX", {})
        reads = [{"seq": i, "type": "actor_line_read", "line_index": idx, "at_ms": i, "payload": {}} for i, idx in enumerate(own)]
        journal.append(self.db, run.id, self.user.id, reads + [
            {"seq": len(own), "type": "completed", "line_index": 5, "at_ms": 9, "payload": {}},
        ])
        self.assertEqual(trial_length.trial_days_for(self.db, self.user.id), trial_length.EARNED_TRIAL_DAYS)
        self.assertTrue(trial_length.has_finished_a_scene(self.db, self.user.id))

    def test_a_forged_completed_event_alone_does_not(self):
        # The journal is client-written. `completed` without the reads to back
        # it is one POST, and one POST must not buy a week.
        from app.services.rehearsal import journal
        run = journal.create_run(self.db, self.user.id, self.scene.id, "ALEX", {})
        journal.append(self.db, run.id, self.user.id, [
            {"seq": 0, "type": "completed", "line_index": 5, "at_ms": 1, "payload": {}},
        ])
        self.assertEqual(trial_length.trial_days_for(self.db, self.user.id), trial_length.BASE_TRIAL_DAYS)

    def test_a_v2_run_left_early_does_not(self):
        from app.services.rehearsal import journal
        run = journal.create_run(self.db, self.user.id, self.scene.id, "ALEX", {})
        journal.append(self.db, run.id, self.user.id, [
            {"seq": 0, "type": "started", "line_index": None, "at_ms": 0, "payload": {}},
            {"seq": 1, "type": "line_reached", "line_index": 2, "at_ms": 10, "payload": {}},
        ])
        self.assertEqual(trial_length.trial_days_for(self.db, self.user.id), trial_length.BASE_TRIAL_DAYS)

    def test_a_scene_left_early_does_not(self):
        for status in ("in_progress", "abandoned", "timed_out"):
            self._session(self.user, status)
        self.assertEqual(trial_length.trial_days_for(self.db, self.user.id), 7)

    def test_someone_elses_scene_does_not(self):
        other = User(email="other@example.com", supabase_id="s2")
        self.db.add(other)
        self.db.commit()
        self._session(other, "completed")
        self.assertEqual(trial_length.trial_days_for(self.db, self.user.id), 7)

    def test_the_browser_cannot_claim_it(self):
        # guided_scene_finished arrives over POST /api/events, which any
        # signed-in client can call with any accepted name. It is telemetry.
        # If it ever granted the second week, posting it would be the exploit.
        self.assertIn("guided_scene_finished", events.CLIENT_EVENT_NAMES)
        self.db.add(
            UserEvent(user_id=self.user.id, event_name="guided_scene_finished", properties={})
        )
        self.db.commit()
        self.assertEqual(trial_length.trial_days_for(self.db, self.user.id), 7)

    def test_a_failed_lookup_gives_the_week(self):
        broken = mock.Mock()
        broken.query.side_effect = RuntimeError("db gone")
        self.assertEqual(trial_length.trial_days_for(broken, self.user.id), 7)
        broken.rollback.assert_called_once()

    def test_the_two_lengths(self):
        self.assertEqual(trial_length.BASE_TRIAL_DAYS, 7)
        self.assertEqual(trial_length.EARNED_TRIAL_DAYS, 14)


class CheckoutAndMeTests(Fixture):
    """The length reaches Stripe and the client from the one place that decides it."""

    def _checkout(self, **overrides):
        fields = {
            "tier_id": self.plus.id,
            "billing_period": "monthly",
            "success_url": "https://actorrise.com/billing/success",
            "cancel_url": "https://actorrise.com/pricing",
            "trial": True,
            **overrides,
        }
        request = subscriptions.CreateCheckoutSessionRequest(**fields)
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
        self._session(self.user, "completed")
        sent = self._checkout()
        self.assertEqual(sent["subscription_data"]["trial_period_days"], 14)
        self.assertEqual(sent["metadata"]["trial_days"], "14")
        self.assertEqual(sent["metadata"]["trial_earned"], "1")

    def test_the_request_cannot_name_a_length(self):
        # The model takes `trial`, a yes or no. A length sent alongside it is
        # not a field and must not reach Stripe.
        sent = self._checkout(trial_days=90, trial_period_days=90)
        self.assertEqual(sent["subscription_data"]["trial_period_days"], 7)

    def test_a_yearly_trial_rolls_into_yearly(self):
        sent = self._checkout(billing_period="annual")
        self.assertEqual(sent["line_items"][0]["price"], "price_year")
        self.assertEqual(sent["metadata"]["billing_period"], "annual")
        self.assertEqual(sent["subscription_data"]["trial_period_days"], 7)
        self.assertEqual(sent["payment_method_collection"], "always")

    def test_a_monthly_trial_stays_monthly(self):
        sent = self._checkout(billing_period="monthly")
        self.assertEqual(sent["line_items"][0]["price"], "price_month")
        self.assertEqual(sent["metadata"]["billing_period"], "monthly")
        self.assertEqual(sent["subscription_data"]["trial_period_days"], 7)

    def test_a_yearly_trial_needs_the_yearly_price(self):
        self.plus.stripe_annual_price_id = None
        self.db.commit()
        with self.assertRaises(subscriptions.HTTPException) as ctx:
            self._checkout(billing_period="annual")
        self.assertEqual(ctx.exception.status_code, 400)

    def test_a_paid_checkout_carries_no_trial(self):
        sent = self._checkout(trial=False, billing_period="annual")
        self.assertNotIn("trial_period_days", sent["subscription_data"])
        self.assertEqual(sent["metadata"]["trial_days"], "0")
        self.assertEqual(sent["metadata"]["trial_earned"], "0")

    def test_me_reports_what_checkout_would_run(self):
        me = asyncio.run(subscriptions.get_my_subscription(current_user=self.user, db=self.db))
        self.assertEqual((me.trial_days, me.trial_earned), (7, False))
        self._session(self.user, "completed")
        me = asyncio.run(subscriptions.get_my_subscription(current_user=self.user, db=self.db))
        self.assertEqual((me.trial_days, me.trial_earned), (14, True))


if __name__ == "__main__":
    unittest.main()
