"""A teacher's class link grants the student month, and only when it should."""

import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

from app.models.billing import AdminAuditLog, PricingTier, UserSubscription
from app.models.class_link import ClassLink, ClassLinkJoin
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
            [Organization, User, PricingTier, UserSubscription, AdminAuditLog, ClassLink, ClassLinkJoin]
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
        self.mailed, self.events = [], []
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

    def test_the_teacher_opening_their_own_link_changes_nothing(self):
        r = class_links.join(self.db, self.link, self.teacher)
        self.assertEqual(r.outcome, "own_link")
        self.assertEqual(self.db.query(ClassLinkJoin).count(), 0)

    def test_find_link_rejects_junk_codes(self):
        self.assertIsNone(class_links.find_link(self.db, "../etc"))
        self.assertIsNotNone(class_links.find_link(self.db, "NMU-Teach"))


if __name__ == "__main__":
    unittest.main()
