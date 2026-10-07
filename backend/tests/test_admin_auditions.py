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
