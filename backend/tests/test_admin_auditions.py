import unittest
from datetime import datetime, timedelta, timezone

from app.api.admin.auditions import auditions_panel
from app.models.audition import Audition, AuditionEvent, AuditionPiece, AuditionReminderSend
from app.models.actor import UserScript
from app.models.billing import UsageMetrics
from app.models.organization import Organization
from app.models.user import User
from app.models.user_event import UserEvent
from tests.dbfixture import memory_db, restore


class AdminAuditionsPanelTests(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db([Organization, User, UserScript, Audition, AuditionPiece, AuditionEvent,
                                         AuditionReminderSend, UsageMetrics, UserEvent])

    def tearDown(self):
        self.db.close()
        restore(self.saved)

    def test_counts_exclude_staff_and_prep_before_date(self):
        now = datetime.now(timezone.utc)
        u = User(email="a@gmail.com", hashed_password="x", created_at=now - timedelta(days=30))
        staff = User(email="s@actorrise.com", hashed_password="x", created_at=now - timedelta(days=30))
        self.db.add_all([u, staff])
        self.db.flush()
        past = Audition(user_id=u.id, project="Hamlet", starts_at=now - timedelta(days=2), source="parse")
        self.db.add_all([past, Audition(user_id=staff.id, project="X", starts_at=now, source="manual")])
        self.db.flush()
        self.db.add_all([
            UserEvent(user_id=u.id, event_name="audition_prep_started", properties={"audition_id": past.id},
                      created_at=now - timedelta(days=3)),
            UserEvent(user_id=u.id, event_name="audition_reminder_sent", properties={"moment": "eve"}),
            UserEvent(user_id=u.id, event_name="audition_parse_requested", properties={}),
        ])
        self.db.commit()
        out = auditions_panel(None, self.db)
        self.assertEqual(out["auditions"], 1)
        self.assertEqual(out["users_with_auditions"], 1)
        self.assertEqual(out["prep_before_date"], {"past": 1, "prepped": 1})
        self.assertEqual(out["reminders"]["sent"], {"eve": 1})
        self.assertEqual(out["parse"]["requested"], 1)
        self.assertEqual(len(out["created_by_week"]), 1)

    def _u(self, email, days=60):
        u = User(email=email, hashed_password="x", created_at=datetime.now(timezone.utc) - timedelta(days=days))
        self.db.add(u)
        self.db.flush()
        return u

    def test_edge_cases(self):
        now = datetime.now(timezone.utc)
        u, other, staff = self._u("a@gmail.com"), self._u("b@gmail.com"), self._u("s@actorrise.com")
        gone = Audition(user_id=u.id, project="Gone", starts_at=now - timedelta(days=1), deleted_at=now)
        late = Audition(user_id=u.id, project="Late", starts_at=now - timedelta(days=2))
        self.db.add_all([gone, late])
        self.db.flush()
        self.db.add_all([
            UserEvent(user_id=u.id, event_name="audition_prep_started", properties={"audition_id": late.id},
                      created_at=now - timedelta(days=1)),  # after the date
            UserEvent(user_id=u.id, event_name="audition_prep_started", properties={"audition_id": "oops"}),
            UserEvent(user_id=u.id, event_name="audition_prep_started", properties={"audition_id": {"x": 1}}),
            UserEvent(user_id=other.id, event_name="audition_prep_started", properties={"audition_id": late.id},
                      created_at=now - timedelta(days=5)),  # not the owner
            UserEvent(user_id=staff.id, event_name="audition_reminder_sent", properties={"moment": "prep"}),
        ])
        self.db.commit()
        out = auditions_panel(None, self.db)
        self.assertEqual(out["auditions"], 1)
        self.assertEqual(out["prep_before_date"], {"past": 1, "prepped": 0})
        self.assertEqual(out["reminders"]["sent"], {})

    def test_reminder_loop_counts_prep_after_reminder(self):
        now = datetime.now(timezone.utc)
        u = self._u("a@gmail.com")
        a = Audition(user_id=u.id, project="P", starts_at=now + timedelta(days=3))
        self.db.add(a)
        self.db.flush()
        self.db.add_all([
            UserEvent(user_id=u.id, event_name="audition_reminder_sent",
                      properties={"audition_id": a.id, "moment": "prep"}, created_at=now - timedelta(hours=5)),
            UserEvent(user_id=u.id, event_name="audition_prep_started", properties={"audition_id": a.id},
                      created_at=now - timedelta(hours=1)),
        ])
        self.db.commit()
        r = auditions_panel(None, self.db)["reminders"]
        self.assertEqual((r["auditions"], r["prepped_after"]), (1, 1))

    def test_habit_counts_tracker_only_after_first_audition(self):
        from datetime import date
        from app.services import engagement
        now = datetime.now(timezone.utc)
        w1 = engagement.week_start(date.today()) - timedelta(days=21)
        u, v = self._u("a@gmail.com"), self._u("b@gmail.com")
        # u creates their first audition in week 3, so is "other" in weeks 1 and 2.
        self.db.add(Audition(user_id=u.id, project="P", created_at=now - timedelta(days=7)))
        for uid in (u.id, v.id):
            for k in range(4):
                self.db.add(UsageMetrics(user_id=uid, date=w1 + timedelta(days=7 * k)))
        self.db.commit()
        habit = {h["week_start"]: h for h in auditions_panel(None, self.db)["habit"]}
        self.assertEqual(habit[w1.isoformat()]["tracker_active"], 0)
        self.assertEqual(habit[w1.isoformat()]["other_active"], 2)
        self.assertEqual(habit[(w1 + timedelta(days=14)).isoformat()]["tracker_active"], 1)
