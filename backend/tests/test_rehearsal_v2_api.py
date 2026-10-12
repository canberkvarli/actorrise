"""The v2 endpoints, end to end against the in-memory database."""
import unittest
from unittest import mock

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api import rehearsal as api
from app.api.auth import get_current_user
from app.core.database import get_db
from app.middleware.burst_limiter import BurstLimiter
from app.models.actor import FilmTvReference, Play, Scene, SceneLine, UserScript
from app.models.organization import Organization
from app.models.rehearsal import PartnerAudio, RehearsalEvent, RehearsalRun
from app.models.user import User
from app.services.rehearsal import partner_audio
from tests.dbfixture import memory_db, restore

# FilmTvReference is here only because plays.film_tv_reference_id points at it
# and SQLite will not create plays without the target table.
_TABLES = (Organization, User, FilmTvReference, Play, UserScript, Scene, SceneLine, RehearsalRun, RehearsalEvent, PartnerAudio)


class Api(unittest.TestCase):
    def setUp(self):
        _, self._saved = memory_db(_TABLES)  # strips the Postgres column types
        # TestClient serves from another thread, so the in-memory DB must be
        # shareable (same recipe as tests/test_auditions_api.py).
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        event.listens_for(engine, "connect")(lambda conn, _record: conn.execute("PRAGMA foreign_keys=ON"))
        for model in _TABLES:
            model.__table__.create(engine)
        self.db = sessionmaker(bind=engine)()
        self.user = User(email="a@example.com", supabase_id="s1")
        play = Play(title="P", author="A", source_type="play",
                    genre="drama", category="classical", copyright_status="public_domain")
        self.db.add_all([self.user, play]); self.db.flush()
        self.scene = Scene(play_id=play.id, title="S", is_library=True, character_1_name="ANNA", character_2_name="BEN",
                           character_1_gender="female", character_2_gender="male", line_count=2, estimated_duration_seconds=10)
        self.db.add(self.scene); self.db.flush()
        self.db.add_all([
            SceneLine(scene_id=self.scene.id, line_order=0, character_name="BEN", text="Where were you?", word_count=3),
            SceneLine(scene_id=self.scene.id, line_order=1, character_name="ANNA", text="Out.", word_count=1),
        ])
        self.db.commit()

        app = FastAPI()
        app.include_router(api.router)
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: self.user
        # require_scene_partner is a factory; the router depends on the gate it
        # built once, so that is the object to override.
        app.dependency_overrides[api.SCENE_PARTNER_GATE] = lambda: True
        self.client = TestClient(app)
        self.patches = [
            mock.patch.object(api, "assert_can_rehearse"),
            mock.patch.object(api, "schedule_synthesis"),
            mock.patch.object(partner_audio, "signed_url", side_effect=lambda p: f"https://signed/{p}"),
        ]
        for p in self.patches: p.start()

    def tearDown(self):
        for p in self.patches: p.stop()
        self.db.close(); restore(self._saved)

    def test_scene_payload_has_contract_lines_voices_and_audio_slots(self):
        r = self.client.get(f"/api/rehearsal/scenes/{self.scene.id}")
        self.assertEqual(r.status_code, 200, r.text)
        body = r.json()
        self.assertEqual([l["character"] for l in body["lines"]], ["BEN", "ANNA"])
        self.assertEqual(body["characters"], ["BEN", "ANNA"])
        self.assertEqual(len(body["voices"]), 4)
        self.assertEqual(body["defaults"]["ANNA"]["BEN"], next(v["id"] for v in body["voices"] if v["gender"] == "male"))
        self.assertEqual(body["audio"]["0"], {"key": mock.ANY, "url": None})
        self.assertIsNone(body["resume"])

    def test_audio_endpoint_202_then_200(self):
        key = partner_audio.ensure(self.db, "openai", "ash", None, "Where were you?")
        self.db.commit()
        self.assertEqual(self.client.get(f"/api/rehearsal/audio/{key}").status_code, 202)
        row = self.db.get(PartnerAudio, key); row.status = "ready"; row.storage_path = "ab/x.mp3"; self.db.commit()
        r = self.client.get(f"/api/rehearsal/audio/{key}")
        self.assertEqual((r.status_code, r.json()["url"]), (200, "https://signed/ab/x.mp3"))
        self.assertEqual(self.client.get("/api/rehearsal/audio/" + "0" * 64).status_code, 404)

    def test_run_then_events_then_resume(self):
        r = self.client.post("/api/rehearsal/runs", json={"scene_id": self.scene.id, "character": "ANNA", "voices": {"BEN": "ash"}})
        self.assertEqual(r.status_code, 200, r.text)
        run_id = r.json()["run_id"]
        evs = [{"seq": 0, "type": "started", "line_index": None, "at_ms": 0, "payload": {}},
               {"seq": 1, "type": "line_reached", "line_index": 1, "at_ms": 10, "payload": {}}]
        self.assertEqual(self.client.post(f"/api/rehearsal/runs/{run_id}/events", json={"events": evs}).status_code, 204)
        # sendBeacon sends text/plain
        self.assertEqual(self.client.post(f"/api/rehearsal/runs/{run_id}/events", content='{"events": []}',
                                          headers={"content-type": "text/plain"}).status_code, 204)
        body = self.client.get(f"/api/rehearsal/scenes/{self.scene.id}").json()
        self.assertEqual(body["resume"], {"run_id": run_id, "line_index": 1})

    def test_bad_character_is_422(self):
        r = self.client.post("/api/rehearsal/runs", json={"scene_id": self.scene.id, "character": "NOBODY", "voices": {}})
        self.assertEqual(r.status_code, 422)
