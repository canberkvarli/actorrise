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

    def test_every_do_not_contact_row_blocks(self):
        # No exceptions. There was one, for the email that asked why a trial
        # had lapsed, and it went when that email did.
        for i, reason in enumerate(("paid_subscriber", "OPT-OUT: replied unsubscribe", None)):
            email = f"blocked{i}@x.com"
            self._event(self._user(email), "checkout_started", 3)
            self.db.add(EmailDoNotContact(email=email.upper(), reason=reason))
            self.db.commit()
        self.assertEqual(self._emails("checkout_abandoned"), [])

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
        self.assertEqual([s["touch"] for s in stats], ["checkout_abandoned", "paywall_seen_no_trial"])
        self.assertEqual([s["eligible"] for s in stats], [1, 0])
        self.assertEqual(self.sent, [])
        self.assertEqual(self.db.query(LifecycleEmailSend).count(), 0)

    def test_someone_an_earlier_touch_took_is_skipped(self):
        # The two touches that are left cannot both be owed to one person: a
        # checkout after a wall cancels the wall's email. `skip` is kept for
        # the day a third touch makes that possible again.
        u = self._user("walled@x.com")
        self._event(u, "paywall_hit", 30, gate="monologue_read", kind="wall")
        taken = {u.id}
        stats = triggered.run_touch("paywall_seen_no_trial", send=True, now=NOW, skip=taken)
        self.assertEqual((stats["eligible"], stats["sent"]), (0, 0))
        self.assertEqual(self.sent, [])

    def test_nothing_is_about_a_trial_ending(self):
        # Canberk, 2026-09-29: no email before a trial charges and none after
        # one lapses. A trial ending, either way, sends nothing from here.
        self.assertEqual(set(triggered.TRIGGERS), {"checkout_abandoned", "paywall_seen_no_trial"})
        u = self._user("trial@x.com")
        self._event(u, "trial_ended", 30, subscription_id="sub_1", outcome="cancelled")
        self._event(u, "trial_started", 200, subscription_id="sub_1", trial_days=7)
        triggered.run_all(send=True, now=NOW)
        self.assertEqual(self.sent, [])

    def test_a_send_is_claimed_recorded_and_carries_the_way_out(self):
        u = self._user("due@x.com")
        self._event(u, "checkout_started", 3)
        triggered.run_all(send=True, now=NOW)
        (mail,) = self.sent
        self.assertEqual(mail["subject"], "did something go wrong?")
        self.assertEqual(mail["unsubscribe_url"], "https://u/due@x.com")
        self.assertIn("hey maya,", mail["plain_text"])
        self.assertIn("a week free", mail["plain_text"])
        self.assertTrue(mail["plain_text"].rstrip().endswith("\ncanberk"))
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
        self.assertEqual(stats[0]["failed"], 1)
        self.assertEqual(self.recorded, [])
        triggered.run_all(send=True, now=NOW)
        self.assertEqual(self.sent, [])


class CopyTests(unittest.TestCase):
    """Every file in backend/emails/lifecycle, held to the voice rules."""

    def test_every_touch_has_copy(self):
        for touch in triggered.TRIGGERS:
            subject, body = triggered.load_copy(touch)
            self.assertTrue(subject, touch)
            self.assertTrue(body, touch)

    def test_every_copy_file_has_a_touch(self):
        # A file with no touch is an email somebody believes is being sent.
        files = {p.stem for p in triggered.COPY_DIR.glob("*.txt")}
        self.assertEqual(files, set(triggered.TRIGGERS))

    def test_voice(self):
        for touch in triggered.TRIGGERS:
            subject, body = triggered.load_copy(touch)
            text = f"{subject}\n{body}"
            self.assertIsNone(re.search(r"[‒–—―]| - ", text), touch)
            self.assertIsNone(re.search(r"\b(we|our|us)\b", text, re.I), touch)
            self.assertLessEqual(len(subject), 50, touch)
            self.assertEqual(body.count("{link}"), 1, touch)
            # The letter ends on the name. Canberk, 2026-09-29: no reply line
            # under the signature on these. The way out is the unsubscribe
            # link base_personal prints, and the List-Unsubscribe header.
            self.assertTrue(body.rstrip().endswith("\ncanberk"), touch)
            self.assertIsNone(re.search(r"unsubscribe", body, re.I), touch)

    def test_nothing_is_left_unfilled(self):
        for touch in triggered.TRIGGERS:
            subject, html, plain = triggered.render(
                {"touch": touch, "user_name": "Maya Lopez", "link": "https://actorrise.com/x",
                 "span": "two weeks"},
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
