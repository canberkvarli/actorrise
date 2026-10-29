"""A teacher's class link grants the student month, and only when it should."""

import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

from app.models.billing import AdminAuditLog, PricingTier, UserSubscription
from app.models.class_link import ClassLink, ClassLinkInvite, ClassLinkJoin
from app.models.organization import Organization
from app.models.user import User
from app.services import class_links
from tests.dbfixture import memory_db, restore


class _SyncThread:
    def __init__(self, target, kwargs, daemon=None):
        self.target, self.kwargs = target, kwargs

    def start(self):
        self.target(**self.kwargs)


class ClassLinkJoinTest(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db(
            [Organization, User, PricingTier, UserSubscription, AdminAuditLog, ClassLink, ClassLinkJoin, ClassLinkInvite]
        )
        org = Organization(name="Northern Michigan University", kind="school", created_at=datetime.now(timezone.utc))
        self.db.add(org)
        self.db.commit()
        self.admin = User(email="canberk@actorrise.com", supabase_id="admin")
        self.teacher = User(email="teach@nmu.edu", supabase_id="t", organization_id=org.id)
        self.free = PricingTier(name="free", display_name="Free", monthly_price_cents=0, features={})
        self.plus = PricingTier(name="plus", display_name="Plus", monthly_price_cents=1200, features={})
        self.db.add_all([self.admin, self.teacher, self.free, self.plus])
        self.db.commit()
        self.link = ClassLink(
            code="nmu-teach", teacher_user_id=self.teacher.id, organization_id=org.id,
            teacher_label="Teach", school_label="NMU", days=30, max_uses=2,
        )
        self.db.add(self.link)
        self.db.commit()
        self.mailed, self.events, self.full_alerts = [], [], []
        self.patches = [
            mock.patch("app.api.admin.users.threading.Thread", _SyncThread),
            mock.patch(
                "app.services.email.notifications.send_membership_granted_email",
                lambda **kw: self.mailed.append(kw["user_email"]),
            ),
            # Never let a test write an event to the real database.
            mock.patch(
                "app.services.events.record_user_event",
                lambda uid, name, props=None: self.events.append((uid, name, props)),
            ),
            mock.patch(
                "app.services.class_links._tell_founder_full",
                lambda link: self.full_alerts.append(link.code),
            ),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        self.db.close()
        restore(self.saved)

    def _student(self, email, sub=None):
        user = User(email=email, supabase_id=email)
        self.db.add(user)
        self.db.commit()
        if sub:
            self.db.add(UserSubscription(user_id=user.id, **sub))
            self.db.commit()
        return user

    def _sub(self, user):
        self.db.expire_all()
        return self.db.query(UserSubscription).filter(UserSubscription.user_id == user.id).first()

    def test_free_student_is_granted_the_month_and_tied_to_the_school(self):
        s = self._student("a@nmu.edu")
        r = class_links.join(self.db, self.link, s)
        self.assertEqual(r.outcome, "granted")
        sub = self._sub(s)
        self.assertEqual(sub.tier_id, self.plus.id)
        self.assertTrue(sub.is_active)
        self.assertGreater(class_links._aware(sub.trial_end), datetime.now(timezone.utc) + timedelta(days=29))
        self.db.refresh(s)
        self.assertEqual(s.account_type, "student")
        self.assertEqual(s.organization_id, self.link.organization_id)
        self.assertEqual(self.mailed, ["a@nmu.edu"])
        self.assertEqual(self.events[0][1], "class_link_joined")

    def test_second_join_is_a_no_op(self):
        s = self._student("a@nmu.edu")
        class_links.join(self.db, self.link, s)
        r = class_links.join(self.db, self.link, s)
        self.assertEqual(r.outcome, "joined")
        self.assertEqual(self.mailed, ["a@nmu.edu"])
        self.assertEqual(self.db.query(ClassLinkJoin).count(), 1)

    def test_a_stripe_payer_is_left_alone(self):
        s = self._student("pay@nmu.edu", dict(
            tier_id=self.plus.id, status="active", stripe_subscription_id="sub_1", source="stripe",
        ))
        r = class_links.join(self.db, self.link, s)
        self.assertEqual(r.outcome, "paying")
        self.assertEqual(self._sub(s).stripe_subscription_id, "sub_1")
        self.assertEqual(self.mailed, [])

    def test_an_app_payer_is_left_alone(self):
        s = self._student("app@nmu.edu", dict(tier_id=self.plus.id, status="active", source="revenuecat"))
        self.assertEqual(class_links.join(self.db, self.link, s).outcome, "paying")

    def test_a_longer_comp_is_never_shortened(self):
        later = datetime.now(timezone.utc) + timedelta(days=90)
        s = self._student("long@nmu.edu", dict(
            tier_id=self.plus.id, status="trialing", source="manual", trial_end=later,
        ))
        r = class_links.join(self.db, self.link, s)
        self.assertEqual(r.outcome, "already")
        self.assertGreater(class_links._aware(self._sub(s).trial_end), datetime.now(timezone.utc) + timedelta(days=89))

    def test_a_shorter_comp_is_extended(self):
        soon = datetime.now(timezone.utc) + timedelta(days=3)
        s = self._student("short@nmu.edu", dict(
            tier_id=self.plus.id, status="trialing", source="manual", trial_end=soon,
        ))
        self.assertEqual(class_links.join(self.db, self.link, s).outcome, "granted")

    def test_the_cap_stops_grants(self):
        for e in ("1@nmu.edu", "2@nmu.edu"):
            self.assertEqual(class_links.join(self.db, self.link, self._student(e)).outcome, "granted")
        third = self._student("3@nmu.edu")
        self.assertEqual(class_links.join(self.db, self.link, third).outcome, "full")
        self.assertIsNone(self._sub(third))

    def test_the_first_student_turned_away_emails_canberk_once(self):
        for e in ("1@nmu.edu", "2@nmu.edu"):
            class_links.join(self.db, self.link, self._student(e))
        self.assertEqual(self.full_alerts, [])
        class_links.join(self.db, self.link, self._student("3@nmu.edu"))
        class_links.join(self.db, self.link, self._student("4@nmu.edu"))
        self.assertEqual(self.full_alerts, ["nmu-teach"])

    def test_the_teacher_opening_their_own_link_changes_nothing(self):
        r = class_links.join(self.db, self.link, self.teacher)
        self.assertEqual(r.outcome, "own_link")
        self.assertEqual(self.db.query(ClassLinkJoin).count(), 0)

    def test_find_link_rejects_junk_codes(self):
        self.assertIsNone(class_links.find_link(self.db, "../etc"))
        self.assertIsNotNone(class_links.find_link(self.db, "NMU-Teach"))

    def test_an_invited_address_is_granted_when_its_account_appears(self):
        out = class_links.invite(self.db, self.link, ["New@NMU.edu", "new@nmu.edu"])
        self.assertEqual(out, {"new@nmu.edu": "invited"})
        self.assertEqual(self.mailed, [])
        s = self._student("new@nmu.edu")
        results = class_links.claim_invites(self.db, s)
        self.assertEqual([r.outcome for r in results], ["granted"])
        self.assertTrue(self._sub(s).is_active)
        self.assertEqual(class_links.claim_invites(self.db, s), [])  # claimed once

    def test_inviting_an_existing_account_grants_now(self):
        s = self._student("have@nmu.edu")
        self.assertEqual(class_links.invite(self.db, self.link, ["have@nmu.edu"]), {"have@nmu.edu": "granted"})
        self.assertEqual(self.db.query(ClassLinkInvite).count(), 0)

    def test_a_switched_off_link_does_not_claim(self):
        class_links.invite(self.db, self.link, ["late@nmu.edu"])
        self.link.active = False
        self.db.commit()
        s = self._student("late@nmu.edu")
        self.assertEqual(class_links.claim_invites(self.db, s), [])
        self.assertIsNone(self._sub(s))

    def test_a_code_carried_in_the_signup_joins_the_class(self):
        """Gilroy, 2026-10-22: two students signed up in another browser than
        the one that opened the link, so the code held there never arrived."""
        s = self._student("far@nmu.edu")
        r = class_links.claim_signup_code(self.db, s, "NMU-Teach")
        self.assertEqual(r.outcome, "granted")
        self.assertTrue(self._sub(s).is_active)

    def test_a_signup_code_that_is_junk_off_or_missing_does_nothing(self):
        s = self._student("junk@nmu.edu")
        for code in (None, "", 42, "../etc", "no-such-class"):
            self.assertIsNone(class_links.claim_signup_code(self.db, s, code))
        self.link.active = False
        self.db.commit()
        self.assertIsNone(class_links.claim_signup_code(self.db, s, "nmu-teach"))
        self.assertIsNone(self._sub(s))

    def test_a_school_address_joins_its_teachers_class_without_the_link(self):
        """Gilroy, 2026-10-26: 4 of 14 signed up with Google on a machine that
        never opened the link, so neither the browser nor the signup held a code."""
        s = self._student("kid@nmu.edu")
        r = class_links.claim_school_domain(self.db, s, "google")
        self.assertEqual(r.outcome, "granted")
        self.assertTrue(self._sub(s).is_active)
        sub = self._student("kid2@students.nmu.edu")
        self.assertEqual(class_links.claim_school_domain(self.db, sub, "google").outcome, "granted")

    def test_no_domain_match_for_mail_providers_or_other_schools(self):
        gmail_teacher = User(email="coach@gmail.com", supabase_id="g")
        self.db.add(gmail_teacher)
        self.db.commit()
        self.db.add(ClassLink(code="coach-g", teacher_user_id=gmail_teacher.id, teacher_label="Coach", days=30, max_uses=60))
        self.db.commit()
        isp_teacher = User(email="coach@comcast.net", supabase_id="c")
        self.db.add(isp_teacher)
        self.db.commit()
        self.db.add(ClassLink(code="coach-c", teacher_user_id=isp_teacher.id, teacher_label="Coach", days=30, max_uses=60))
        self.db.commit()
        for email in ("someone@gmail.com", "someone@comcast.net", "kid@othernmu.edu", "kid@nmu.edu.evil.com"):
            s = self._student(email)
            self.assertIsNone(class_links.claim_school_domain(self.db, s, "google"), email)
            self.assertIsNone(self._sub(s), email)

    def test_domain_match_only_trusts_a_google_signup(self):
        """An email signup has not proven the address is theirs."""
        for provider in ("email", None, "apple"):
            s = self._student(f"{provider}@nmu.edu")
            self.assertIsNone(class_links.claim_school_domain(self.db, s, provider))
            self.assertIsNone(self._sub(s))

    def test_a_district_domain_counts_as_a_school(self):
        gilroy = User(email="teach@gilroyunified.org", supabase_id="gu")
        self.db.add(gilroy)
        self.db.commit()
        self.db.add(ClassLink(code="gilroy-t", teacher_user_id=gilroy.id, teacher_label="T", days=30, max_uses=60))
        self.db.commit()
        s = self._student("794387@gilroyunified.org")
        self.assertEqual(class_links.claim_school_domain(self.db, s, "google").outcome, "granted")

    def test_domain_match_skips_a_switched_off_link_and_anyone_already_in_a_class(self):
        s = self._student("in@nmu.edu")
        class_links.claim_signup_code(self.db, s, "nmu-teach")
        self.assertIsNone(class_links.claim_school_domain(self.db, s, "google"))
        self.link.active = False
        self.db.commit()
        late = self._student("late@nmu.edu")
        self.assertIsNone(class_links.claim_school_domain(self.db, late, "google"))
        self.assertIsNone(self._sub(late))


if __name__ == "__main__":
    unittest.main()


class TeacherMakesOwnLinkTest(unittest.TestCase):
    """A teacher account makes its own link; only a school address gets one that works."""

    def setUp(self):
        self.db, self.saved = memory_db(
            [Organization, User, PricingTier, UserSubscription, AdminAuditLog, ClassLink, ClassLinkJoin, ClassLinkInvite]
        )
        self.told = []
        self.patch = mock.patch(
            "app.services.class_links._tell_founder", lambda link, user: self.told.append(link.code)
        )
        self.patch.start()

    def tearDown(self):
        self.patch.stop()
        self.db.close()
        restore(self.saved)

    def _teacher(self, email, name="Elena Ruiz", org=None):
        user = User(email=email, supabase_id=email, name=name, account_type="educator", organization=org)
        self.db.add(user)
        self.db.commit()
        return user

    def test_school_address_gets_a_working_link_named_for_school_and_teacher(self):
        t = self._teacher("eruiz@lincolnusd.org", org="Lincoln High")
        link = class_links.make_own_link(self.db, t)
        self.assertEqual(link.code, "lincoln-high-elena")
        self.assertTrue(link.active)
        self.assertEqual((link.teacher_label, link.school_label), ("Elena", "Lincoln High"))
        self.assertEqual(link.max_uses, class_links.SCHOOL_MAX_USES)
        self.assertEqual(self.told, ["lincoln-high-elena"])

    def test_college_address_works_too(self):
        self.assertTrue(class_links.make_own_link(self.db, self._teacher("prof@state.edu")).active)

    def test_any_other_address_waits_switched_off(self):
        link = class_links.make_own_link(self.db, self._teacher("drama.teacher@gmail.com"))
        self.assertFalse(link.active)
        self.assertEqual(link.max_uses, class_links.SELF_SERVE_MAX_USES)
        self.assertEqual(self.told, [link.code])

    def test_asking_twice_returns_the_same_link_and_tells_once(self):
        t = self._teacher("eruiz@lincolnusd.org", org="Lincoln High")
        first = class_links.make_own_link(self.db, t)
        again = class_links.make_own_link(self.db, t, school="Somewhere Else")
        self.assertEqual(first.id, again.id)
        self.assertEqual(self.db.query(ClassLink).count(), 1)
        self.assertEqual(len(self.told), 1)

    def test_a_taken_code_gets_a_number(self):
        a = class_links.make_own_link(self.db, self._teacher("a@lincolnusd.org", org="Lincoln High"))
        b = class_links.make_own_link(self.db, self._teacher("b@lincolnusd.org", org="Lincoln High"))
        self.assertEqual((a.code, b.code), ("lincoln-high-elena", "lincoln-high-elena-2"))

    def test_school_typed_on_the_card_wins_over_none(self):
        link = class_links.make_own_link(self.db, self._teacher("x@lincolnusd.org", name=None), school="Gilroy HS")
        self.assertEqual(link.code, "gilroy-hs-x")
        self.assertEqual(link.school_label, "Gilroy HS")

    def test_summary_counts_grants(self):
        t = self._teacher("eruiz@lincolnusd.org")
        link = class_links.make_own_link(self.db, t)
        s = User(email="kid@lincolnusd.org", supabase_id="kid")
        self.db.add(s)
        self.db.commit()
        self.db.add(ClassLinkJoin(class_link_id=link.id, user_id=s.id, outcome="granted"))
        self.db.commit()
        self.assertEqual(class_links.link_summary(self.db, link)["granted"], 1)

    def test_only_teacher_accounts_reach_the_endpoint(self):
        from fastapi import HTTPException

        from app.api.class_links import _teacher

        actor = User(email="a@gmail.com", supabase_id="a", account_type="actor")
        with self.assertRaises(HTTPException) as e:
            _teacher(actor)
        self.assertEqual(e.exception.status_code, 403)


class WelcomeEmailTest(unittest.TestCase):
    """A student who lands in a class on a district address gets no welcome."""

    def test_google_signup_in_a_class_on_a_district_address_gets_none(self):
        from app.api.auth import _should_welcome

        self.assertFalse(_should_welcome("774759@gilroyunified.org", None, True))

    def test_class_code_signup_on_a_district_address_gets_none(self):
        from app.api.auth import _should_welcome

        self.assertFalse(_should_welcome("774759@gilroyunified.org", "gilroy-elizabeth", False))

    def test_a_teacher_on_the_same_district_still_gets_one(self):
        from app.api.auth import _should_welcome

        self.assertTrue(_should_welcome("elizabeth.dirks@gilroyunified.org", None, False))

    def test_an_actor_in_a_class_on_gmail_still_gets_one(self):
        from app.api.auth import _should_welcome

        self.assertTrue(_should_welcome("actor@gmail.com", None, True))


class ClassPlanAndRosterTest(unittest.TestCase):
    """A paid plan carries every student to one date; the teacher sees counts, not searches."""

    def setUp(self):
        from app.models.rehearsal import RehearsalRun
        from app.models.search_log import SearchLog
        from app.models.user_event import UserEvent

        self.SearchLog, self.UserEvent, self.RehearsalRun = SearchLog, UserEvent, RehearsalRun
        self.db, self.saved = memory_db(
            [Organization, User, PricingTier, UserSubscription, AdminAuditLog, ClassLink, ClassLinkJoin,
             ClassLinkInvite, SearchLog, UserEvent, RehearsalRun]
        )
        self.admin = User(email="canberk@actorrise.com", supabase_id="admin")
        self.teacher = User(email="t@lincolnusd.org", supabase_id="t", account_type="educator", name="Elena Ruiz")
        # Free first: a paid tier is any tier id above 1 (UserSubscription.is_paid_tier).
        self.db.add(PricingTier(name="free", display_name="Free", monthly_price_cents=0, features={}))
        self.db.commit()
        self.plus = PricingTier(name="plus", display_name="Plus", monthly_price_cents=1200, features={})
        self.db.add_all([self.admin, self.teacher, self.plus])
        self.db.commit()
        self.link = ClassLink(code="lincoln-elena", teacher_user_id=self.teacher.id, teacher_label="Elena",
                              days=30, max_uses=2)
        self.db.add(self.link)
        self.db.commit()
        self.patches = [
            mock.patch("app.api.admin.users.threading.Thread", _SyncThread),
            mock.patch("app.services.email.notifications.send_membership_granted_email", lambda **kw: None),
            mock.patch("app.services.events.record_user_event", lambda *a, **k: None),
            mock.patch("app.services.class_links._tell_founder_full", lambda link: None),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        self.db.close()
        restore(self.saved)

    def _student(self, email, name=None):
        u = User(email=email, supabase_id=email, name=name)
        self.db.add(u)
        self.db.commit()
        return u

    def _end(self, user):
        sub = self.db.query(UserSubscription).filter(UserSubscription.user_id == user.id).one()
        return class_links._aware(sub.trial_end)

    def test_a_join_on_a_paid_link_runs_to_the_plan_end(self):
        plan_end = datetime.now(timezone.utc) + timedelta(days=200)
        self.link.plan_ends_at = plan_end
        self.db.commit()
        s = self._student("a@lincolnusd.org")
        class_links.join(self.db, self.link, s)
        self.assertLess(abs((self._end(s) - plan_end).total_seconds()), 2 * 86400)

    def test_a_plan_that_has_ended_falls_back_to_the_month(self):
        self.link.plan_ends_at = datetime.now(timezone.utc) - timedelta(days=1)
        self.db.commit()
        s = self._student("a@lincolnusd.org")
        class_links.join(self.db, self.link, s)
        self.assertLess(abs((self._end(s) - (datetime.now(timezone.utc) + timedelta(days=30))).total_seconds()), 2 * 86400)

    def test_applying_a_plan_carries_the_class_and_seats_the_turned_away(self):
        a, b, c = (self._student(f"{x}@lincolnusd.org") for x in "abc")
        for s in (a, b, c):
            class_links.join(self.db, self.link, s)
        self.assertEqual(class_links.join(self.db, self.link, c).outcome, "joined")
        until = datetime.now(timezone.utc) + timedelta(days=300)
        moved = class_links.apply_plan(self.db, self.link, until, max_uses=40)
        self.assertEqual(moved, 3)
        for s in (a, b, c):
            self.assertLess(abs((self._end(s) - until).total_seconds()), 2 * 86400)
        outcomes = {j.outcome for j in self.db.query(ClassLinkJoin).all()}
        self.assertEqual(outcomes, {"granted"})

    def test_the_roster_counts_but_never_shows_what_they_searched(self):
        s = self._student("774759@lincolnusd.org")
        named = self._student("b@lincolnusd.org", name="Maya Ortiz")
        for u in (s, named):
            class_links.join(self.db, self.link, u)
        # rehearsal_runs points at scenes, whose plays table carries vector
        # columns SQLite cannot create; the counts are what is under test.
        from sqlalchemy import text as sql_text

        self.db.execute(sql_text("PRAGMA foreign_keys=OFF"))
        self.db.add_all([
            self.SearchLog(query="a secret search", results_count=3, user_id=s.id, created_at=datetime.now(timezone.utc)),
            self.SearchLog(query="another", results_count=3, user_id=s.id, created_at=datetime.now(timezone.utc)),
            self.UserEvent(user_id=s.id, event_name="monologue_work_started", properties={}, created_at=datetime.now(timezone.utc)),
            self.UserEvent(user_id=s.id, event_name="monologue_work_finished", properties={}, created_at=datetime.now(timezone.utc)),
            self.RehearsalRun(user_id=s.id, scene_id=1, character="A", is_guided=True, started_at=datetime.now(timezone.utc)),
            self.RehearsalRun(user_id=s.id, scene_id=2, character="B", is_guided=False, started_at=datetime.now(timezone.utc)),
        ])
        self.db.commit()
        roster = class_links.class_roster(self.db, self.teacher)
        by_name = {r["name"]: r for r in roster}
        self.assertEqual(set(by_name), {"774759", "Maya Ortiz"})
        row = by_name["774759"]
        self.assertEqual((row["searches"], row["monologues_practised"], row["monologues_finished"], row["scenes_run"]), (2, 1, 1, 1))
        self.assertTrue(row["on_plus"])
        self.assertNotIn("secret", str(roster))

    def test_a_teacher_with_no_link_has_an_empty_class(self):
        other = User(email="o@x.edu", supabase_id="o", account_type="educator")
        self.db.add(other)
        self.db.commit()
        self.assertEqual(class_links.class_roster(self.db, other), [])
