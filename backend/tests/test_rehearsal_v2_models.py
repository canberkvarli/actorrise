"""The v2 rehearsal tables stand up in the test database."""
import unittest

from app.models.actor import FilmTvReference, Play, Scene, SceneLine, UserScript
from app.models.organization import Organization
from app.models.rehearsal import PartnerAudio, RehearsalEvent, RehearsalRun
from app.models.user import User
from tests.dbfixture import memory_db, restore

# FilmTvReference is here only because plays.film_tv_reference_id points at it
# and the fixture turns SQLite's foreign-key check on.
_TABLES = (Organization, User, FilmTvReference, Play, UserScript, Scene, SceneLine, RehearsalRun, RehearsalEvent, PartnerAudio)


class Models(unittest.TestCase):
    def setUp(self):
        self.db, self._saved = memory_db(_TABLES)

    def tearDown(self):
        self.db.close()
        restore(self._saved)

    def test_event_seq_is_unique_per_run(self):
        user = User(email="a@example.com", supabase_id="s1")
        play = Play(title="P", author="A", source_type="play",
                    genre="drama", category="classical", copyright_status="public_domain")
        self.db.add_all([user, play]); self.db.flush()
        scene = Scene(play_id=play.id, title="S", character_1_name="A", character_2_name="B", line_count=0, estimated_duration_seconds=0)
        self.db.add(scene); self.db.flush()
        run = RehearsalRun(user_id=user.id, scene_id=scene.id, character="A", voices={}, is_guided=False)
        self.db.add(run); self.db.flush()
        self.db.add(RehearsalEvent(run_id=run.id, seq=0, type="started", line_index=None, at_ms=0, payload={}))
        self.db.flush()
        self.db.add(RehearsalEvent(run_id=run.id, seq=0, type="started", line_index=None, at_ms=0, payload={}))
        with self.assertRaises(Exception):
            self.db.flush()
