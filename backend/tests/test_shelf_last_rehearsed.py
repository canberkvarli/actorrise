"""The shelf list says when each script was last rehearsed, for the phone's "working on" group."""

import asyncio
import unittest
from datetime import datetime, timezone

from app.api import scripts as api
from app.models.actor import FilmTvReference, Play, Scene, ScriptTag, ScriptTagVote, UserScript
from app.models.organization import Organization
from app.models.rehearsal import RehearsalRun
from app.models.user import User
from tests.dbfixture import memory_db, restore

_TABLES = (Organization, User, FilmTvReference, Play, UserScript, Scene, ScriptTag, ScriptTagVote, RehearsalRun)


class LastRehearsedTestCase(unittest.TestCase):
    def setUp(self):
        self.db, self._saved = memory_db(_TABLES)
        self.actor = User(email="actor@example.com", hashed_password="x")
        self.db.add(self.actor)
        self.db.flush()
        made = datetime(2026, 9, 1, tzinfo=timezone.utc)
        self.run_one, self.never = (
            UserScript(user_id=self.actor.id, title=t, author="A", original_filename=f"{t}.pdf", file_type="pdf",
                       processing_status="completed", characters=[], num_characters=0, is_sample=False, created_at=made)
            for t in ("Ran", "Never")
        )
        self.db.add_all([self.run_one, self.never])
        self.db.flush()
        play = Play(title="P", author="A", genre="Drama", category="contemporary", copyright_status="user_uploaded")
        self.db.add(play)
        self.db.flush()
        scene = Scene(play_id=play.id, user_script_id=self.run_one.id, title="One", character_1_name="A", character_2_name="B", line_count=2, estimated_duration_seconds=60)
        self.db.add(scene)
        self.db.flush()
        self.when = datetime(2026, 10, 20, 20, 0, tzinfo=timezone.utc)
        self.db.add(RehearsalRun(user_id=self.actor.id, scene_id=scene.id, character="A", voices={}, started_at=self.when))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        restore(self._saved)

    def test_each_script_carries_its_last_run(self):
        rows = {r.title: r for r in asyncio.run(api.list_user_scripts(self.db, self.actor))}
        self.assertIsNotNone(rows["Ran"].last_rehearsed_at)
        self.assertIsNone(rows["Never"].last_rehearsed_at)


if __name__ == "__main__":
    unittest.main()
