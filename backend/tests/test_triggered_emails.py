"""Triggered emails: who gets one, when, and what stops it.

Same shape as test_lifecycle_emails: the window, exclusion, cap and claim logic
run against a real in-memory database; only the paid lookup is patched, because
pricing_tiers carries Postgres-only columns these tests have no use for.
"""

import re
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

from app.models.billing import PricingTier, UserSubscription
from app.models.email_do_not_contact import EmailDoNotContact
from app.models.lifecycle_email import LifecycleEmailSend
from app.models.organization import Organization
from app.models.user import User
from app.models.user_event import UserEvent
from app.services.email import lifecycle, triggered
from tests.dbfixture import memory_db, restore

# The real clock, as in test_lifecycle_emails: a claim row stamps itself with
# the real now, and the rules that read it back need the two to agree.
NOW = datetime.now(timezone.utc)


def _ago(hours: float) -> datetime:
    return NOW - timedelta(hours=hours)


class Fixture(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db(
            [Organization, User, UserEvent, EmailDoNotContact, LifecycleEmailSend,
             PricingTier, UserSubscription]
        )
        self.patches = [
            mock.patch.object(lifecycle, "_paid_user_ids", lambda db: set()),
            mock.patch.object(triggered, "trial_span_for", lambda db, uid: "a week"),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        self.db.close()
        restore(self.saved)

    def _user(self, email, opt_in=True, **kw):
        u = User(email=email, supabase_id=email, marketing_opt_in=opt_in, name="Maya Lopez", **kw)
        self.db.add(u)
        self.db.commit()
        return u

    def _event(self, user, name, hours_ago, **props):
        self.db.add(
            UserEvent(user_id=user.id, event_name=name, properties=props, created_at=_ago(hours_ago))
        )
        self.db.commit()

    def _sent(self, user, touch, hours_ago):
        self.db.add(
            LifecycleEmailSend(user_id=user.id, touch=touch, anchor="none", sent_at=_ago(hours_ago))
        )
        self.db.commit()

    def _emails(self, touch):
        return [p["email"] for p in triggered.select_candidates(self.db, touch, now=NOW)]


class CheckoutAbandoned(Fixture):
    def test_it_waits_two_hours(self):
        for email, hours in (("fresh@x.com", 1), ("due@x.com", 3), ("stale@x.com", 30)):
            self._event(self._user(email), "checkout_started", hours, tier="plus", trial=True)
        self.assertEqual(self._emails("checkout_abandoned"), ["due@x.com"])

    def test_a_finished_checkout_cancels_it(self):
        u = self._user("done@x.com")
        self._event(u, "checkout_started", 3)
        self._event(u, "checkout_completed", 2.5, subscription_id="sub_1")
        self.assertEqual(self._emails("checkout_abandoned"), [])

    def test_an_older_finished_checkout_does_not(self):
        # Finished one last month, walked away from one today.
        u = self._user("again@x.com")
        self._event(u, "checkout_completed", 700, subscription_id="sub_0")
        self._event(u, "checkout_started", 3)
        self.assertEqual(self._emails("checkout_abandoned"), ["again@x.com"])

    def test_two_starts_are_one_person(self):
        u = self._user("twice@x.com")
        self._event(u, "checkout_started", 5)
        self._event(u, "checkout_started", 3)
        self.assertEqual(self._emails("checkout_abandoned"), ["twice@x.com"])

    def test_the_link_goes_back_to_the_checkout_and_is_counted(self):
        self._event(self._user("due@x.com"), "checkout_started", 3)
        (person,) = triggered.select_candidates(self.db, "checkout_abandoned", now=NOW)
        self.assertEqual(person["link"], "https://actorrise.com/trial?e=checkout_abandoned")
        self.assertEqual(person["span"], "a week")


class TrialEndedNoPay(Fixture):
    def test_a_trial_that_did_not_convert(self):
        u = self._user("left@x.com")
        self._event(u, "trial_ended", 30, subscription_id="sub_1", outcome="cancelled")
        self.assertEqual(self._emails("trial_ended_no_pay"), ["left@x.com"])

    def test_a_converted_trial_gets_nothing(self):
        u = self._user("stayed@x.com")
        self._event(u, "trial_ended", 30, subscription_id="sub_1", outcome="converted")
        self.assertEqual(self._emails("trial_ended_no_pay"), [])

    def test_it_waits_a_day(self):
        u = self._user("soon@x.com")
        self._event(u, "trial_ended", 5, subscription_id="sub_1", outcome="cancelled")
        self.assertEqual(self._emails("trial_ended_no_pay"), [])

    def test_the_systems_own_dnc_row_does_not_block_it(self):
        # Checkout adds every trial to the list as paid_subscriber. Without the
        # exception nobody could ever receive this email.
        u = self._user("left@x.com")
        self._event(u, "trial_ended", 30, subscription_id="sub_1", outcome="cancelled")
        self.db.add(EmailDoNotContact(email="left@x.com", reason="paid_subscriber"))
        self.db.commit()
        self.assertEqual(self._emails("trial_ended_no_pay"), ["left@x.com"])

    def test_a_persons_own_opt_out_always_does(self):
        u = self._user("left@x.com")
        self._event(u, "trial_ended", 30, subscription_id="sub_1", outcome="cancelled")
        self.db.add(EmailDoNotContact(email="LEFT@x.com", reason="OPT-OUT: replied unsubscribe"))
        self.db.commit()
        self.assertEqual(self._emails("trial_ended_no_pay"), [])

    def test_a_row_with_no_reason_blocks(self):
        u = self._user("left@x.com")
        self._event(u, "trial_ended", 30, subscription_id="sub_1", outcome="cancelled")
        self.db.add(EmailDoNotContact(email="left@x.com", reason=None))
        self.db.commit()
        self.assertEqual(self._emails("trial_ended_no_pay"), [])

    def test_paying_now_gets_nothing(self):
        u = self._user("back@x.com")
        self._event(u, "trial_ended", 30, subscription_id="sub_1", outcome="cancelled")
        with mock.patch.object(lifecycle, "_paid_user_ids", lambda db: {u.id}):
            self.assertEqual(self._emails("trial_ended_no_pay"), [])


class PaywallSeenNoTrial(Fixture):
    def test_a_wall(self):
        u = self._user("walled@x.com")
        self._event(u, "paywall_hit", 30, gate="monologue_read", kind="wall")
        self.assertEqual(self._emails("paywall_seen_no_trial"), ["walled@x.com"])

    def test_the_older_name_counts(self):
        u = self._user("walled@x.com")
        self._event(u, "upgrade_modal_viewed", 30, feature="monologue_read")
        self.assertEqual(self._emails("paywall_seen_no_trial"), ["walled@x.com"])

    def test_an_ask_is_not_a_wall(self):
        # The email says "you ran into the free limit". Someone shown an ask
        # after a good scene ran into nothing.
        u = self._user("asked@x.com")
        self._event(u, "paywall_hit", 30, gate="third_save", kind="ask")
        self._event(u, "trial_offer_shown", 30, trigger="third_save")
        self.assertEqual(self._emails("paywall_seen_no_trial"), [])

    def test_a_checkout_since_cancels_it(self):
        u = self._user("went@x.com")
        self._event(u, "paywall_hit", 30, gate="monologue_read", kind="wall")
        self._event(u, "checkout_started", 29)
        self.assertEqual(self._emails("paywall_seen_no_trial"), [])

    def test_someone_who_cannot_take_the_trial_is_not_offered_it(self):
        # The trial is for first-time Plus members; checkout refuses anyone who
        # has held a Stripe subscription.
        u = self._user("former@x.com")
        self._event(u, "paywall_hit", 30, gate="monologue_read", kind="wall")
        tier = PricingTier(name="free", display_name="Free", monthly_price_cents=0, features={})
        self.db.add(tier)
        self.db.commit()
        self.db.add(
            UserSubscription(
                user_id=u.id, tier_id=tier.id, status="canceled",
                stripe_subscription_id="sub_old", source="stripe",
            )
        )
        self.db.commit()
        self.assertEqual(self._emails("paywall_seen_no_trial"), [])


class TrialEnding(Fixture):
    """The notice that a card is about to be charged."""

    def setUp(self):
        super().setUp()
        self.plus = PricingTier(
            name="plus", display_name="Plus", monthly_price_cents=1200,
            annual_price_cents=9900, features={},
        )
        self.db.add(self.plus)
        self.db.commit()

    def _trial(self, user, ends_in_hours, *, stripe="sub_1", period="monthly", cancelled=False,
               status="trialing"):
        self.db.add(
            UserSubscription(
                user_id=user.id, tier_id=self.plus.id, status=status, billing_period=period,
                stripe_subscription_id=stripe, cancel_at_period_end=cancelled,
                trial_end=NOW + timedelta(hours=ends_in_hours), source="stripe" if stripe else "manual",
            )
        )
        self.db.commit()

    def test_it_goes_one_to_three_days_before_the_charge(self):
        for email, hours in (("today@x.com", 10), ("due@x.com", 40), ("later@x.com", 100)):
            self._trial(self._user(email), hours, stripe=f"sub_{hours}")
        self.assertEqual(self._emails("trial_ending"), ["due@x.com"])

    def test_it_says_what_and_when(self):
        self._trial(self._user("due@x.com"), 40)
        (p,) = triggered.select_candidates(self.db, "trial_ending", now=NOW)
        ends = NOW + timedelta(hours=40)
        self.assertEqual(p["amount"], "$12")
        self.assertEqual(p["every"], "month")
        self.assertEqual(p["date"], f"{ends:%A, %B} {ends.day}".lower())
        self.assertEqual(p["link"], "https://actorrise.com/billing?e=trial_ending")
        subject, html, plain = triggered.render(p, None)
        self.assertEqual(subject, f"your trial ends {p['date']}")
        self.assertIn(f"your card is charged $12 that day, and every month after", plain)
        self.assertIn("cancel before then and you won't be charged", plain)
        self.assertNotRegex(plain + subject + html, r"\{[a-z_]+\}")

    def test_a_yearly_trial_names_the_yearly_price(self):
        self._trial(self._user("year@x.com"), 40, period="annual")
        (p,) = triggered.select_candidates(self.db, "trial_ending", now=NOW)
        self.assertEqual((p["amount"], p["every"]), ("$99", "year"))

    def test_a_comp_is_never_told_it_will_be_charged(self):
        # 34 of 39 trialing rows on 2026-09-29: granted by hand, no Stripe
        # subscription, nothing will ever charge them.
        self._trial(self._user("teacher@x.com"), 40, stripe=None)
        self.assertEqual(self._emails("trial_ending"), [])

    def test_already_cancelled_gets_nothing(self):
        self._trial(self._user("gone@x.com"), 40, cancelled=True)
        self.assertEqual(self._emails("trial_ending"), [])

    def test_only_a_trial(self):
        self._trial(self._user("paying@x.com"), 40, status="active")
        self.assertEqual(self._emails("trial_ending"), [])

    def test_it_is_owed_whether_or_not_they_take_marketing(self):
        self._trial(self._user("quiet@x.com", opt_in=False), 40)
        self.assertEqual(self._emails("trial_ending"), ["quiet@x.com"])

    def test_the_cap_cannot_swallow_it(self):
        u = self._user("busy@x.com")
        self._trial(u, 40)
        self._sent(u, "day3", 60)
        self._sent(u, "day10", 20)
        self.assertEqual(self._emails("trial_ending"), ["busy@x.com"])

    def test_being_on_a_trial_does_not_disqualify_the_trial_notice(self):
        u = self._user("trialing@x.com")
        self._trial(u, 40)
        self.db.add(EmailDoNotContact(email="trialing@x.com", reason="paid_subscriber"))
        self.db.commit()
        with mock.patch.object(lifecycle, "_paid_user_ids", lambda db: {u.id}):
            self.assertEqual(self._emails("trial_ending"), ["trialing@x.com"])

    def test_someone_who_said_stop_is_still_left_alone(self):
        self._trial(self._user("stop@x.com"), 40)
        self.db.add(EmailDoNotContact(email="stop@x.com", reason="OPT-OUT: replied unsubscribe"))
        self.db.commit()
        self.assertEqual(self._emails("trial_ending"), [])

    def test_staff_and_unreachable_addresses(self):
        for i, (email, kw) in enumerate((
            ("staff@x.com", {"exclude_from_stats": True}),
            ("ghost@anon.actorrise.com", {}),
            ("hide@privaterelay.appleid.com", {}),
        )):
            self._trial(self._user(email, **kw), 40, stripe=f"sub_s{i}")
        self.assertEqual(self._emails("trial_ending"), [])

    def test_once(self):
        u = self._user("once@x.com")
        self._trial(u, 40)
        self._sent(u, "trial_ending", 5)
        self.assertEqual(self._emails("trial_ending"), [])

    def test_it_goes_first(self):
        self.assertEqual(triggered.PRIORITY[0], "trial_ending")


class SharedRules(Fixture):
    def test_opted_out_staff_and_unreachable_are_skipped(self):
        for email, kw in (
            ("ok@x.com", {}),
            ("out@x.com", {"opt_in": False}),
            ("staff@x.com", {"exclude_from_stats": True}),
            ("ghost@anon.actorrise.com", {}),
            ("me@actorrise.com", {}),
            ("hide@privaterelay.appleid.com", {}),
        ):
            self._event(self._user(email, **kw), "checkout_started", 3)
        self.assertEqual(self._emails("checkout_abandoned"), ["ok@x.com"])

    def test_the_dnc_exception_belongs_to_one_touch(self):
        # paid_subscriber passes for the trial question and nowhere else.
        for touch, event, hours, props in (
            ("checkout_abandoned", "checkout_started", 3, {}),
            ("paywall_seen_no_trial", "paywall_hit", 30, {"kind": "wall"}),
        ):
            email = f"{touch}@x.com"
            self._event(self._user(email), event, hours, **props)
            self.db.add(EmailDoNotContact(email=email, reason="paid_subscriber"))
            self.db.commit()
            self.assertEqual(self._emails(touch), [], touch)

    def test_a_touch_is_sent_once(self):
        u = self._user("once@x.com")
        self._event(u, "checkout_started", 3)
        self._sent(u, "checkout_abandoned", 400)
        self.assertEqual(self._emails("checkout_abandoned"), [])

    def test_the_weekly_cap_counts_day3_and_day10(self):
        u = self._user("full@x.com")
        self._event(u, "checkout_started", 3)
        self._sent(u, "day3", 150)
        self.assertEqual(self._emails("checkout_abandoned"), ["full@x.com"])
        # Outside the two-day gap, inside the week: only the cap can refuse it.
        self._sent(u, "day10", 60)
        self.assertEqual(self._emails("checkout_abandoned"), [])

    def test_nothing_within_two_days_of_the_last_email(self):
        u = self._user("recent@x.com")
        self._event(u, "checkout_started", 3)
        self._sent(u, "day3", 30)
        self.assertEqual(self._emails("checkout_abandoned"), [])

    def test_the_cap_forgets_after_a_week(self):
        u = self._user("rested@x.com")
        self._event(u, "checkout_started", 3)
        self._sent(u, "day3", 24 * 8)
        self._sent(u, "day10", 24 * 9)
        self.assertEqual(self._emails("checkout_abandoned"), ["rested@x.com"])

    def test_an_event_with_no_user_is_nobody(self):
        self.db.add(UserEvent(user_id=None, event_name="checkout_started", created_at=_ago(3)))
        self.db.commit()
        self.assertEqual(self._emails("checkout_abandoned"), [])

    def test_unknown_touch(self):
        with self.assertRaises(ValueError):
            triggered.select_candidates(self.db, "day3", now=NOW)


class RunAll(Fixture):
    def setUp(self):
        super().setUp()
        self.sent = []

        class FakeClient:
            def send_email(inner, **kw):  # noqa: N805
                self.sent.append(kw)
                return {"id": "x"}

        self.recorded = []
        more = [
            mock.patch.object(triggered, "SessionLocal", lambda: _NoClose(self.db)),
            mock.patch.object(triggered, "ResendEmailClient", FakeClient),
            mock.patch.object(triggered, "build_unsubscribe_url", lambda email: f"https://u/{email}"),
            mock.patch.object(
                triggered, "record_user_event",
                lambda uid, name, props=None: self.recorded.append((uid, name, props)),
            ),
        ]
        for p in more:
            p.start()
        self.patches += more

    def test_preview_sends_and_claims_nothing(self):
        self._event(self._user("due@x.com"), "checkout_started", 3)
        stats = triggered.run_all(send=False, now=NOW)
        self.assertEqual([s["eligible"] for s in stats], [0, 1, 0, 0])
        self.assertEqual(self.sent, [])
        self.assertEqual(self.db.query(LifecycleEmailSend).count(), 0)

    def _due_for_two(self):
        # A trial that lapsed yesterday, and a checkout walked away from today.
        u = self._user("both@x.com")
        self._event(u, "trial_ended", 30, subscription_id="sub_1", outcome="cancelled")
        self._event(u, "checkout_started", 3)
        return u

    def test_the_preview_shows_each_person_once(self):
        self._due_for_two()
        stats = triggered.run_all(send=False, now=NOW)
        self.assertEqual([s["eligible"] for s in stats], [0, 1, 0, 0])

    def test_one_person_gets_the_highest_priority_touch_only(self):
        self._due_for_two()
        triggered.run_all(send=True, now=NOW)
        self.assertEqual([m["subject"] for m in self.sent], ["did something go wrong?"])
        touches = [r.touch for r in self.db.query(LifecycleEmailSend).all()]
        self.assertEqual(touches, ["checkout_abandoned"])

    def test_the_second_does_not_follow_an_hour_later(self):
        self._due_for_two()
        triggered.run_all(send=True, now=NOW)
        triggered.run_all(send=True, now=NOW + timedelta(hours=1))
        self.assertEqual(len(self.sent), 1)

    def test_a_send_is_claimed_recorded_and_carries_the_way_out(self):
        u = self._user("due@x.com")
        self._event(u, "checkout_started", 3)
        triggered.run_all(send=True, now=NOW)
        (mail,) = self.sent
        self.assertEqual(mail["subject"], "did something go wrong?")
        self.assertEqual(mail["unsubscribe_url"], "https://u/due@x.com")
        self.assertIn("hey maya,", mail["plain_text"])
        self.assertIn("a week free", mail["plain_text"])
        self.assertIn("reply unsubscribe", mail["plain_text"])
        self.assertIn("e=checkout_abandoned", mail["html"])
        self.assertEqual(self.recorded, [(u.id, "email_sent", {"touch": "checkout_abandoned"})])
        row = self.db.query(LifecycleEmailSend).one()
        self.assertEqual((row.user_id, row.touch, row.anchor), (u.id, "checkout_abandoned", "checkout"))

    def test_running_twice_sends_once(self):
        self._event(self._user("due@x.com"), "checkout_started", 3)
        triggered.run_all(send=True, now=NOW)
        triggered.run_all(send=True, now=NOW)
        self.assertEqual(len(self.sent), 1)

    def test_a_failed_send_is_counted_and_not_retried(self):
        # Under-sending on error is deliberate, as in lifecycle.py: the claim
        # stands, so a provider outage cannot turn into a second email later.
        self._event(self._user("due@x.com"), "checkout_started", 3)

        class Broken:
            def send_email(inner, **kw):  # noqa: N805
                raise RuntimeError("resend is down")

        with mock.patch.object(triggered, "ResendEmailClient", Broken):
            stats = triggered.run_all(send=True, now=NOW)
        self.assertEqual(stats[1]["failed"], 1)
        self.assertEqual(self.recorded, [])
        triggered.run_all(send=True, now=NOW)
        self.assertEqual(self.sent, [])


class CopyTests(unittest.TestCase):
    """Every file in backend/emails/lifecycle, held to the voice rules."""

    OPT_OUT = "reply unsubscribe and i'll take you off the list, no hard feelings."

    def test_every_touch_has_copy(self):
        for touch in triggered.TRIGGERS:
            subject, body = triggered.load_copy(touch)
            self.assertTrue(subject, touch)
            self.assertTrue(body, touch)

    def test_voice(self):
        for touch in triggered.TRIGGERS:
            subject, body = triggered.load_copy(touch)
            text = f"{subject}\n{body}"
            self.assertIsNone(re.search(r"[‒–—―]| - ", text), touch)
            self.assertIsNone(re.search(r"\b(we|our|us)\b", text, re.I), touch)
            self.assertLessEqual(len(subject), 50, touch)
            self.assertEqual(body.count("{link}"), 1, touch)
            self.assertIn(self.OPT_OUT, body, touch)
            self.assertRegex(body, r"\ncanberk\n", touch)

    def test_nothing_is_left_unfilled(self):
        for touch in triggered.TRIGGERS:
            subject, html, plain = triggered.render(
                {"touch": touch, "user_name": "Maya Lopez", "link": "https://actorrise.com/x",
                 "span": "two weeks", "date": "thursday, october 1", "amount": "$12",
                 "every": "month"},
                "https://actorrise.com/unsubscribe?t=1",
            )
            for out in (subject, html, plain):
                self.assertNotRegex(out, r"\{[a-z_]+\}", touch)
            self.assertIn("https://actorrise.com/x", plain)
            self.assertIn('href="https://actorrise.com/x"', html)
            self.assertIn("https://actorrise.com/unsubscribe?t=1", html)

    def test_no_name_is_just_hey(self):
        _, html, plain = triggered.render(
            {"touch": "checkout_abandoned", "user_name": None, "link": "https://a/x", "span": "a week"},
            None,
        )
        self.assertTrue(plain.startswith("hey,\n"))
        self.assertNotIn("hey ,", html)

    def test_a_name_cannot_inject_markup(self):
        _, html, _ = triggered.render(
            {"touch": "checkout_abandoned", "user_name": "<b>Eve</b>", "link": "https://a/x",
             "span": "a week"},
            None,
        )
        self.assertNotIn("<b>", html)


class _NoClose:
    def __init__(self, db):
        self._db = db

    def __getattr__(self, name):
        return getattr(self._db, name)

    def close(self):
        pass


if __name__ == "__main__":
    unittest.main()
