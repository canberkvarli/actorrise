"""Deleting sides takes them off the shelf for thirty days, not for good.

An actor who swipes the wrong row loses every scene in it, and their runs. So
a delete moves the script to Recently deleted, still whole, restorable from
there; after thirty days, or a second delete from there, it is gone.
"""

import asyncio
import unittest
from datetime import datetime, timedelta, timezone

from app.api import scripts as api
from app.models.actor import FilmTvReference, Play, Scene, ScriptTag, ScriptTagVote, UserScript
from app.models.organization import Organization
from app.models.user import User
from tests.dbfixture import memory_db, restore

_TABLES = (Organization, User, FilmTvReference, Play, UserScript, Scene, ScriptTag, ScriptTagVote)


class RecentlyDeletedTestCase(unittest.TestCase):
    def setUp(self):
        self.db, self._saved = memory_db(_TABLES)
        self.actor = User(email="actor@example.com", hashed_password="x")
        self.db.add(self.actor)
        self.db.flush()
        self.script = UserScript(
            user_id=self.actor.id, title="Hamlet", author="Someone", original_filename="h.pdf",
            file_type="pdf", processing_status="completed", num_scenes_extracted=2,
            characters=[], num_characters=0, is_sample=False,
            created_at=datetime(2026, 9, 1, tzinfo=timezone.utc),
        )
        self.db.add(self.script)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        restore(self._saved)

    def shelf(self):
        return [s.id for s in api.shelf_scripts_query(self.db, self.actor.id).all()]

    def run_(self, coro):
        return asyncio.run(coro)

    def test_delete_moves_it_off_the_shelf_and_restore_brings_it_back(self):
        self.run_(api.delete_script(self.script.id, False, self.db, self.actor))
        self.assertEqual(self.shelf(), [])
        gone = self.run_(api.list_deleted_scripts(self.db, self.actor))
        self.assertEqual([s.id for s in gone], [self.script.id])
        back = self.run_(api.restore_script(self.script.id, self.db, self.actor))
        self.assertEqual(back.processing_status, "completed")
        self.assertEqual(self.shelf(), [self.script.id])

    def test_deleting_from_recently_deleted_is_for_good(self):
        sid = self.script.id
        self.run_(api.delete_script(sid, False, self.db, self.actor))
        self.run_(api.delete_script(sid, False, self.db, self.actor))
        self.assertIsNone(self.db.get(UserScript, sid))

    def test_thirty_days_on_it_is_gone(self):
        sid = self.script.id
        self.run_(api.delete_script(sid, False, self.db, self.actor))
        self.script.updated_at = datetime.now(timezone.utc) - timedelta(days=31)
        self.db.commit()
        api._purge_deleted(self.db, self.actor.id)
        self.assertIsNone(self.db.get(UserScript, sid))


if __name__ == "__main__":
    unittest.main()
