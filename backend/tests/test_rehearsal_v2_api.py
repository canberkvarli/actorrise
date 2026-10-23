"""The v2 endpoints, end to end against the in-memory database."""
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api import rehearsal as api
from app.api.auth import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.models.actor import FilmTvReference, Play, Scene, SceneLine, UserScript
from app.models.organization import Organization
from app.models.rehearsal import PartnerAudio, RehearsalEvent, RehearsalRun
from app.models.user import User
from app.services.rehearsal import delivery, journal, partner_audio
from app.services.rehearsal import voices as voices_mod
from app.services.rehearsal.delivery import LineVoice
from tests.dbfixture import memory_db, restore

# FilmTvReference is here only because plays.film_tv_reference_id points at it
# and SQLite will not create plays without the target table.
# BEN's line as the API voices it in these tests: no reading, no notes.
BEN_LINE = LineVoice(text="Where were you?", character="BEN")

_TABLES = (Organization, User, FilmTvReference, Play, UserScript, Scene, SceneLine, RehearsalRun, RehearsalEvent, PartnerAudio)


class Api(unittest.TestCase):
    def setUp(self):
        self._throwaway, self._saved = memory_db(_TABLES)  # strips the Postgres column types
        # TestClient serves from another thread, so the in-memory DB must be
        # shareable (same recipe as tests/test_auditions_api.py).
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        event.listens_for(self.engine, "connect")(lambda conn, _record: conn.execute("PRAGMA foreign_keys=ON"))
        for model in _TABLES:
            model.__table__.create(self.engine)
        self.db = sessionmaker(bind=self.engine)()
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
        self.app = app
        self.client = TestClient(app)
        self.patches = [
            mock.patch.object(api, "assert_can_rehearse"),
            mock.patch.object(api, "schedule_synthesis"),
            # Pinned to OpenAI's four voices whatever the laptop's .env says
            # (a GEMINI_API_KEY there makes Gemini the default vendor), and no
            # model is ever asked for acting notes.
            mock.patch.object(settings, "partner_tts_vendor", "openai"),
            mock.patch.object(voices_mod, "VOICES", voices_mod._OPENAI),
            mock.patch.object(delivery, "_enrich", return_value=None),
            mock.patch.object(api, "VOICES", voices_mod._OPENAI),
            mock.patch.object(api, "can_direct_partner", return_value=False),
            mock.patch.object(api, "record_user_event"),
            mock.patch.object(partner_audio, "signed_url", side_effect=lambda p: f"https://signed/{p}"),
            mock.patch.object(partner_audio, "signed_urls", side_effect=lambda ps: {p: f"https://signed/{p}" for p in ps}),
        ]
        for p in self.patches: p.start()

    def tearDown(self):
        for p in self.patches: p.stop()
        self.db.close(); self._throwaway.close(); self.engine.dispose(); restore(self._saved)

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

    def test_scene_payload_says_whether_the_actor_may_direct(self):
        body = self.client.get(f"/api/rehearsal/scenes/{self.scene.id}").json()
        self.assertFalse(body["can_direct"])
        self.assertEqual(body["note_max"], 120)
        with mock.patch.object(api, "can_direct_partner", return_value=True):
            self.assertTrue(self.client.get(f"/api/rehearsal/scenes/{self.scene.id}").json()["can_direct"])

    def test_voices_endpoint_gives_the_runs_defaults_without_audio(self):
        r = self.client.get(f"/api/rehearsal/scenes/{self.scene.id}/voices")
        self.assertEqual(r.status_code, 200, r.text)
        body = r.json()
        self.assertEqual(body["defaults"]["ANNA"]["BEN"], next(v["id"] for v in body["voices"] if v["gender"] == "male"))
        self.assertNotIn("audio", body)

    def test_the_preview_starts_voicing_the_usual_part(self):
        """Gemini voices ten lines a minute, so a scene is queued while the
        actor reads the sides, not when they press Rehearse."""
        self.client.get(f"/api/rehearsal/scenes/{self.scene.id}/voices")
        keys = [r.key for r in self.db.query(PartnerAudio).all()]
        self.assertTrue(keys)
        api.schedule_synthesis.assert_called_once()
        self.assertEqual(sorted(api.schedule_synthesis.call_args.args[0]), sorted(keys))

    def _audio(self, **kw):
        body = {"scene_id": self.scene.id, "line_index": 0, "voice": "ash", **kw}
        return self.client.post("/api/rehearsal/audio", json=body)

    def test_a_free_actors_note_is_dropped_on_the_server(self):
        # Under Gemini, where a note would change the key.
        with mock.patch.object(settings, "partner_tts_vendor", "gemini"):
            plain = self._audio().json()["key"]
            self.assertEqual(self._audio(note="make him meaner").json()["key"], plain)
        self.assertEqual(api.schedule_synthesis.call_args.args[1][plain].note, "")

    def test_a_plus_actors_note_is_its_own_line(self):
        with mock.patch.object(api, "can_direct_partner", return_value=True), \
             mock.patch.object(settings, "partner_tts_vendor", "gemini"):
            plain = self._audio().json()["key"]
            noted = self._audio(note="make him meaner").json()["key"]
            again = self._audio(note="  make him   meaner ").json()["key"]
        self.assertNotEqual(noted, plain)
        self.assertEqual(noted, again)  # whitespace is not a different note
        spec = api.schedule_synthesis.call_args.args[1][noted]
        self.assertEqual(spec.note, "make him meaner")

    def test_scene_open_signs_every_ready_line_in_one_call(self):
        # A third line so BEN has two partner lines for ANNA's pick (character
        # 1 is ANNA, so the audio slots are BEN's lines).
        self.db.add(SceneLine(scene_id=self.scene.id, line_order=2, character_name="BEN", text="Out where?", word_count=2))
        self.db.commit()
        body = self.client.get(f"/api/rehearsal/scenes/{self.scene.id}").json()
        keys = {i: body["audio"][i]["key"] for i in ("0", "2")}
        for i, key in keys.items():
            row = self.db.get(PartnerAudio, key); row.status = "ready"; row.storage_path = f"ab/{i}.mp3"
        self.db.commit()
        partner_audio.signed_urls.reset_mock()
        body = self.client.get(f"/api/rehearsal/scenes/{self.scene.id}").json()
        partner_audio.signed_urls.assert_called_once()
        self.assertEqual(sorted(partner_audio.signed_urls.call_args.args[0]), ["ab/0.mp3", "ab/2.mp3"])
        self.assertEqual(body["audio"]["0"], {"key": keys["0"], "url": "https://signed/ab/0.mp3"})
        self.assertEqual(body["audio"]["2"], {"key": keys["2"], "url": "https://signed/ab/2.mp3"})
        self.assertNotIn("1", body["audio"])
        partner_audio.signed_url.assert_not_called()

    def test_audio_endpoint_202_then_200(self):
        key = partner_audio.ensure(self.db, "openai", "ash", BEN_LINE)
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

    def test_client_cannot_declare_a_run_guided(self):
        r = self.client.post("/api/rehearsal/runs", json={"scene_id": self.scene.id, "character": "ANNA", "is_guided": True})
        self.assertEqual(r.status_code, 200, r.text)
        api.assert_can_rehearse.assert_called_once()
        self.assertFalse(self.db.get(RehearsalRun, r.json()["run_id"]).is_guided)

    def test_guided_run_is_the_servers_call_and_skips_the_gate(self):
        def refuse():
            raise HTTPException(status_code=403, detail="metered")
        self.app.dependency_overrides[api.SCENE_PARTNER_GATE] = refuse
        with mock.patch.object(api, "guided_scene", return_value=self.scene):
            r = self.client.post("/api/rehearsal/runs/guided")
        self.assertEqual(r.status_code, 200, r.text)
        body = r.json()
        self.assertEqual((body["scene_id"], body["character"]), (self.scene.id, api.GUIDED_ACTOR))
        self.assertTrue(self.db.get(RehearsalRun, body["run_id"]).is_guided)
        api.assert_can_rehearse.assert_not_called()
        api.record_user_event.assert_called_once_with(self.user.id, "guided_scene_started", {"platform": "web"})
        with mock.patch.object(api, "guided_scene", return_value=None):
            self.assertEqual(self.client.post("/api/rehearsal/runs/guided").status_code, 404)

    def test_guided_run_marks_the_first_rehearsal_seen(self):
        """What the old start-guided route did: the hub stops inviting because
        the server flipped the flag, not because the client remembered to."""
        self.assertFalse(bool(self.user.has_seen_first_rehearsal))
        with mock.patch.object(api, "guided_scene", return_value=self.scene):
            r = self.client.post("/api/rehearsal/runs/guided")
        self.assertEqual(r.status_code, 200, r.text)
        self.db.expire_all()
        self.assertTrue(self.db.get(User, self.user.id).has_seen_first_rehearsal)

    # ── picking a run up ──────────────────────────────────────────────────

    def _open_run(self, user=None, reached: int | None = 1, started_ago: timedelta | None = None) -> int:
        run = journal.create_run(self.db, (user or self.user).id, self.scene.id, "ANNA", {"BEN": "ash"})
        if started_ago is not None:
            run.started_at = datetime.now(timezone.utc) - started_ago
        evs = [{"seq": 0, "type": "started", "line_index": None, "at_ms": 0, "payload": {}}]
        if reached is not None:
            evs.append({"seq": 1, "type": "line_reached", "line_index": reached, "at_ms": 10, "payload": {}})
        journal.append(self.db, run.id, (user or self.user).id, evs)
        self.db.commit()
        return run.id

    def test_resume_hands_back_the_run_as_it_was_opened(self):
        run_id = self._open_run()
        r = self.client.post(f"/api/rehearsal/runs/{run_id}/resume")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json(), {"run_id": run_id, "scene_id": self.scene.id, "character": "ANNA",
                                    "voices": {"BEN": "ash"}, "line_index": 1})
        # No new run was opened and the meter was not consulted.
        self.assertEqual(self.db.query(RehearsalRun).count(), 1)
        api.assert_can_rehearse.assert_not_called()

    def test_resume_does_not_pass_the_scene_partner_gate(self):
        def refuse():
            raise HTTPException(status_code=403, detail="metered")
        self.app.dependency_overrides[api.SCENE_PARTNER_GATE] = refuse
        run_id = self._open_run()
        self.assertEqual(self.client.post(f"/api/rehearsal/runs/{run_id}/resume").status_code, 200)
        # The gate still guards a fresh run.
        r = self.client.post("/api/rehearsal/runs", json={"scene_id": self.scene.id, "character": "ANNA"})
        self.assertEqual(r.status_code, 403)

    def test_resume_is_404_for_another_users_run(self):
        other = User(email="b@example.com", supabase_id="s2")
        self.db.add(other); self.db.commit()
        run_id = self._open_run(user=other)
        self.assertEqual(self.client.post(f"/api/rehearsal/runs/{run_id}/resume").status_code, 404)

    def test_resume_is_404_for_a_closed_run(self):
        run_id = self._open_run()
        journal.append(self.db, run_id, self.user.id,
                       [{"seq": 2, "type": "abandoned", "line_index": 1, "at_ms": 20, "payload": {}}])
        self.db.commit()
        self.assertEqual(self.client.post(f"/api/rehearsal/runs/{run_id}/resume").status_code, 404)
        done = self._open_run()
        journal.append(self.db, done, self.user.id,
                       [{"seq": 2, "type": "completed", "line_index": 1, "at_ms": 20, "payload": {}}])
        self.db.commit()
        self.assertEqual(self.client.post(f"/api/rehearsal/runs/{done}/resume").status_code, 404)

    def test_resume_is_404_outside_the_window_or_for_no_run(self):
        stale = self._open_run(started_ago=journal.RESUME_WINDOW + timedelta(minutes=1))
        self.assertEqual(self.client.post(f"/api/rehearsal/runs/{stale}/resume").status_code, 404)
        self.assertEqual(self.client.post("/api/rehearsal/runs/999999/resume").status_code, 404)

    def test_resume_of_a_run_that_reached_nothing_starts_at_the_top(self):
        run_id = self._open_run(reached=None)
        r = self.client.post(f"/api/rehearsal/runs/{run_id}/resume")
        self.assertEqual((r.status_code, r.json()["line_index"]), (200, 0))

    def _failed(self, age: timedelta) -> str:
        key = partner_audio.ensure(self.db, "openai", "ash", BEN_LINE)
        row = self.db.get(PartnerAudio, key)
        row.status = "failed"; row.error = "boom"; row.claimed_at = datetime.now(timezone.utc) - age
        self.db.commit()
        return key

    def test_failed_audio_is_not_queued_again(self):
        key = self._failed(timedelta(minutes=1))
        body = self.client.get(f"/api/rehearsal/scenes/{self.scene.id}").json()
        self.assertEqual(body["audio"]["0"], {"key": key, "url": None})
        r = self.client.post("/api/rehearsal/audio", json={"scene_id": self.scene.id, "line_index": 0, "voice": "ash"})
        self.assertEqual((r.status_code, r.json()["url"]), (200, None))
        api.schedule_synthesis.assert_not_called()
        self.assertEqual(self.db.get(PartnerAudio, key).status, "failed")

    def _retries(self, age: timedelta) -> None:
        key = self._failed(age)
        body = self.client.get(f"/api/rehearsal/scenes/{self.scene.id}").json()
        self.assertEqual(body["audio"]["0"], {"key": key, "url": None})
        api.schedule_synthesis.assert_called_once_with([key], {key: BEN_LINE})
        api.schedule_synthesis.reset_mock()
        r = self.client.post("/api/rehearsal/audio", json={"scene_id": self.scene.id, "line_index": 0, "voice": "ash"})
        self.assertEqual((r.status_code, r.json()["url"]), (200, None))
        api.schedule_synthesis.assert_called_once_with([key], {key: BEN_LINE})

    def test_failed_audio_is_queued_again_after_ten_minutes(self):
        self._retries(timedelta(minutes=10))

    def test_failed_audio_is_queued_again_after_two_hours(self):
        self._retries(timedelta(hours=2))
