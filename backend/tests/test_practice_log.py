"""The check-in's log: tonight's work on the phone's own date, newest first, a mistake removable, nobody else's to touch."""

import asyncio
import unittest
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace

from fastapi import HTTPException

from app.api import practice as api
from app.models.organization import Organization
from app.models.practice import PracticeEntry
from app.models.user import User
from tests.dbfixture import memory_db, restore


def req(tz=None):
    return SimpleNamespace(headers={"x-timezone": tz} if tz else {})


class PracticeLog(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db([Organization, User, PracticeEntry])
        now = datetime.now(timezone.utc)
        self.me = User(email="me@x.com", supabase_id="me", created_at=now)
        self.other = User(email="o@x.com", supabase_id="o", created_at=now)
        self.db.add_all([self.me, self.other])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        restore(self.saved)

    def test_add_and_list_newest_first(self):
        old = PracticeEntry(user_id=self.me.id, day=date.today() - timedelta(days=3), kind="class")
        self.db.add(old)
        self.db.commit()
        made = asyncio.run(api.add_entry(api.EntryIn(kind="scene", note="  the garden, twice  "), req(), db=self.db, current_user=self.me))
        self.assertEqual(made.note, "the garden, twice")
        out = asyncio.run(api.list_entries(req(), days=62, db=self.db, current_user=self.me))
        self.assertEqual([e.kind for e in out], ["scene", "class"])

    def test_the_day_is_the_phones(self):
        made = asyncio.run(api.add_entry(api.EntryIn(kind="speech"), req("Pacific/Kiritimati"), db=self.db, current_user=self.me))
        from app.services.tonight import local_today
        self.assertEqual(made.day, local_today("Pacific/Kiritimati").isoformat())

    def test_old_nights_fall_out_of_the_window(self):
        self.db.add(PracticeEntry(user_id=self.me.id, day=date.today() - timedelta(days=90), kind="class"))
        self.db.commit()
        self.assertEqual(asyncio.run(api.list_entries(req(), days=62, db=self.db, current_user=self.me)), [])

    def test_only_your_own(self):
        made = asyncio.run(api.add_entry(api.EntryIn(kind="audition"), req(), db=self.db, current_user=self.me))
        self.assertEqual(asyncio.run(api.list_entries(req(), days=62, db=self.db, current_user=self.other)), [])
        with self.assertRaises(HTTPException):
            asyncio.run(api.delete_entry(made.id, db=self.db, current_user=self.other))
        asyncio.run(api.delete_entry(made.id, db=self.db, current_user=self.me))
        self.assertEqual(self.db.query(PracticeEntry).count(), 0)


if __name__ == "__main__":
    unittest.main()
