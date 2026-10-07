"""Audition tracker: the tables, the service, the prep steps."""

import unittest
from datetime import datetime, timedelta, timezone

from sqlalchemy.exc import IntegrityError

from app.models.audition import Audition, AuditionEvent, AuditionPiece, AuditionReminderSend
from app.models.actor import UserScript
from app.models.organization import Organization
from app.models.user import User
from tests.dbfixture import memory_db, restore

NOW = datetime(2026, 10, 7, 15, 0, tzinfo=timezone.utc)
TABLES = [Organization, User, UserScript, Audition, AuditionPiece, AuditionEvent, AuditionReminderSend]


class TableTests(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db(TABLES)
        self.user = User(email="a@x.com", supabase_id="a")
        self.db.add(self.user)
        self.db.commit()

    def tearDown(self):
        restore(self.saved)

    def test_audition_gets_a_token_and_defaults(self):
        a = Audition(user_id=self.user.id, project="The Glass Menagerie", tz="America/New_York")
        self.db.add(a)
        self.db.commit()
        self.assertTrue(a.outcome_token and len(a.outcome_token) >= 24)
        self.assertTrue(a.reminders_on)
        self.assertEqual(a.kind, "in_person")
        self.assertEqual(a.source, "manual")

    def test_reminder_claim_is_unique_per_moment(self):
        a = Audition(user_id=self.user.id, project="P", tz="UTC")
        self.db.add(a)
        self.db.commit()
        self.db.add(AuditionReminderSend(audition_id=a.id, user_id=self.user.id, moment="eve", local_day="2026-10-08"))
        self.db.commit()
        self.db.add(AuditionReminderSend(audition_id=a.id, user_id=self.user.id, moment="eve", local_day="2026-10-08"))
        with self.assertRaises(IntegrityError):
            self.db.commit()
        self.db.rollback()


if __name__ == "__main__":
    unittest.main()
