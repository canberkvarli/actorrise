"""The admin regenerate endpoint: one cached partner line thrown away and made again."""
import unittest
from unittest import mock

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.admin import sessions as admin_sessions
from app.api.admin.stats import require_moderator
from app.api.auth import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.models.actor import FilmTvReference, Play, Scene, SceneLine, UserScript
from app.models.organization import Organization
from app.models.rehearsal import PartnerAudio
from app.models.user import User
from app.services.rehearsal import partner_audio
from tests.dbfixture import memory_db, restore

_TABLES = (Organization, User, FilmTvReference, Play, UserScript, Scene, SceneLine, PartnerAudio)


class Regenerate(unittest.TestCase):
    def setUp(self):
        self._throwaway, self._saved = memory_db(_TABLES)  # strips the Postgres column types
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        event.listens_for(self.engine, "connect")(lambda conn, _record: conn.execute("PRAGMA foreign_keys=ON"))
        for model in _TABLES:
            model.__table__.create(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.admin = User(email="admin@example.com", supabase_id="s1", is_moderator=True)
        play = Play(title="P", author="A", source_type="play",
                    genre="drama", category="classical", copyright_status="public_domain")
        self.db.add_all([self.admin, play]); self.db.flush()
        self.scene = Scene(play_id=play.id, title="S", is_library=True, character_1_name="ANNA", character_2_name="BEN",
                           character_1_gender="female", character_2_gender="male", line_count=2, estimated_duration_seconds=10)
        self.db.add(self.scene); self.db.flush()
        self.db.add_all([
            SceneLine(scene_id=self.scene.id, line_order=0, character_name="BEN", text="Where were you?", word_count=3),
            SceneLine(scene_id=self.scene.id, line_order=1, character_name="ANNA", text="Out.", word_count=1),
        ])
        self.db.commit()

        app = FastAPI()
        app.include_router(admin_sessions.router)
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[require_moderator] = lambda: self.admin
        self.app = app
        self.client = TestClient(app)

        def forget(db, key):
            row = db.get(PartnerAudio, key)
            if row is not None:
                db.delete(row); db.commit()

        self.patches = [
            mock.patch.object(admin_sessions, "schedule_synthesis"),
            mock.patch.object(partner_audio, "delete_row", side_effect=forget),
        ]
        for p in self.patches: p.start()

    def tearDown(self):
        for p in self.patches: p.stop()
        self.db.close(); self._throwaway.close(); self.engine.dispose(); restore(self._saved)

    def _post(self, **overrides):
        body = {"scene_id": self.scene.id, "line_index": 0, "voice": "ash", **overrides}
        return self.client.post("/api/admin/rehearsal/audio/regenerate", json=body)

    def test_regenerate_drops_the_row_and_queues_it_again(self):
        key = partner_audio.ensure(self.db, settings.partner_tts_vendor, "ash", None, "Where were you?")
        row = self.db.get(PartnerAudio, key); row.status = "ready"; row.storage_path = "ab/x.mp3"; self.db.commit()

        r = self._post()
        self.assertEqual(r.status_code, 202, r.text)
        self.assertEqual(r.json(), {"key": key})
        partner_audio.delete_row.assert_called_once_with(self.db, key)
        admin_sessions.schedule_synthesis.assert_called_once_with([key], {key: ("Where were you?", None)})
        fresh = self.db.get(PartnerAudio, key)
        self.assertEqual((fresh.status, fresh.storage_path), ("pending", None))

    def test_a_failed_line_is_regenerated_too(self):
        key = partner_audio.ensure(self.db, settings.partner_tts_vendor, "ash", None, "Where were you?")
        row = self.db.get(PartnerAudio, key); row.status = "failed"; row.error = "boom"; self.db.commit()
        self.assertEqual(self._post().status_code, 202)
        fresh = self.db.get(PartnerAudio, key)
        self.assertEqual((fresh.status, fresh.error), ("pending", None))
        admin_sessions.schedule_synthesis.assert_called_once()

    def test_a_line_never_cached_is_simply_made(self):
        r = self._post()
        self.assertEqual(r.status_code, 202, r.text)
        key = r.json()["key"]
        self.assertEqual(self.db.get(PartnerAudio, key).status, "pending")
        admin_sessions.schedule_synthesis.assert_called_once_with([key], {key: ("Where were you?", None)})

    def test_unknown_scene_line_or_voice(self):
        self.assertEqual(self._post(scene_id=self.scene.id + 99).status_code, 404)
        self.assertEqual(self._post(line_index=2).status_code, 404)
        self.assertEqual(self._post(line_index=-1).status_code, 404)
        self.assertEqual(self._post(voice="nobody").status_code, 422)
        admin_sessions.schedule_synthesis.assert_not_called()
        partner_audio.delete_row.assert_not_called()

    def test_only_a_moderator_may_call_it(self):
        actor = User(email="actor@example.com", supabase_id="s2", is_moderator=False)
        self.db.add(actor); self.db.commit()
        del self.app.dependency_overrides[require_moderator]
        self.app.dependency_overrides[get_current_user] = lambda: actor
        self.assertEqual(self._post().status_code, 403)
        admin_sessions.schedule_synthesis.assert_not_called()


if __name__ == "__main__":
    unittest.main()
