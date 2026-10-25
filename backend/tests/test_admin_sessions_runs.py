"""/admin/sessions counts ScenePartner v2 runs, not only the retired sessions table."""

import unittest
from datetime import datetime, timedelta, timezone

import app.models  # noqa: F401  every mapper the relationships name

from app.api.admin import sessions as api
from app.models.actor import FilmTvReference, Play, RehearsalSession, Scene, SceneLine, UserScript
from app.models.organization import Organization
from app.models.rehearsal import RehearsalEvent, RehearsalRun
from app.models.user import User
from tests.dbfixture import memory_db, restore


class AdminSessionsRunsTests(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db(
            [Organization, User, FilmTvReference, Play, UserScript, Scene, SceneLine, RehearsalSession, RehearsalRun, RehearsalEvent]
        )
        now = datetime.now(timezone.utc)
        self.actor = User(email="actor@gmail.com", hashed_password="x", created_at=now)
        self.staff = User(email="t@actorrise.com", hashed_password="x", exclude_from_stats=True, created_at=now)
        self.db.add_all([self.actor, self.staff])
        play = Play(title="Late", author="C", genre="drama", category="contemporary", copyright_status="original")
        self.db.add(play)
        self.db.flush()
        self.scene = Scene(play_id=play.id, title="Late", character_1_name="ALEX", character_2_name="SAM", line_count=4, estimated_duration_seconds=30)
        self.db.add(self.scene)
        self.db.flush()
        for i, who in enumerate(["SAM", "ALEX", "SAM", "ALEX"]):
            self.db.add(SceneLine(scene_id=self.scene.id, character_name=who, text=f"line {i}", line_order=i, word_count=2))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        restore(self.saved)

    def _run(self, user, events, started=None):
        run = RehearsalRun(user_id=user.id, scene_id=self.scene.id, character="ALEX",
                           voices={"SAM": "v1"}, started_at=started or datetime.now(timezone.utc))
        self.db.add(run)
        self.db.flush()
        for seq, (kind, line, at) in enumerate(events):
            self.db.add(RehearsalEvent(run_id=run.id, seq=seq, type=kind, line_index=line, at_ms=at))
        self.db.commit()
        return run

    def test_runs_are_counted_with_status_and_progress(self):
        self._run(self.actor, [("started", 0, 0), ("line_reached", 3, 20000), ("completed", 3, 21000)])
        self._run(self.actor, [("started", 0, 0), ("line_reached", 1, 5000), ("abandoned", 1, 6000)])
        self._run(self.actor, [], started=datetime.now(timezone.utc) - timedelta(days=1))
        self._run(self.staff, [("completed", 3, 1000)])

        a = api.get_session_analytics(None, None, self.db, None)
        f = a["funnel"]
        self.assertEqual((f["total"], f["completed"], f["abandoned"], f["timed_out"]), (3, 1, 1, 1))
        self.assertEqual(a["avg_completed_duration_seconds"], 21)
        self.assertEqual(a["by_user"][0]["email"], "actor@gmail.com")

        page = api.get_rehearsal_sessions(1, 25, None, None, None, None, self.db, None)
        self.assertEqual(page["total"], 3)
        newest = page["sessions"][0]
        self.assertLess(newest["id"], 0)
        self.assertEqual(newest["ai_character"], "SAM")
        pcts = sorted(s["completion_percentage"] for s in page["sessions"])
        self.assertEqual(pcts, [0.0, 50.0, 100.0])

    def test_a_run_shows_its_lines(self):
        run = self._run(self.actor, [("partner_line_played", 0, 0), ("actor_line_read", 1, 3000)])
        out = api.get_session_line_deliveries(-run.id, self.db, None)
        self.assertEqual([(l["ai_response"], l["user_input"]) for l in out["lines"]],
                         [("line 0", None), (None, "line 1")])

    def test_staff_stay_out_of_every_number_but_a_search_finds_them(self):
        self._run(self.actor, [("completed", 3, 1000)])
        self._run(self.staff, [("completed", 3, 1000)])
        page = api.get_rehearsal_sessions(1, 25, None, None, None, None, self.db, None)
        self.assertEqual((page["total"], page["summary"]["total_sessions"]), (1, 1))
        self.assertEqual([u["email"] for u in api.get_session_analytics(None, None, self.db, None)["by_user"]],
                         ["actor@gmail.com"])
        found = api.get_rehearsal_sessions(1, 25, None, None, None, "actorrise", self.db, None)
        self.assertEqual([s["user_email"] for s in found["sessions"]], ["t@actorrise.com"])
        self.assertEqual(found["summary"]["total_sessions"], 1)  # the summary never counts staff

    def test_sessions_from_before_the_move_still_count(self):
        self.db.add(RehearsalSession(user_id=self.actor.id, scene_id=self.scene.id, status="completed", user_character="ALEX", ai_character="SAM",
                                     started_at=datetime.now(timezone.utc)))
        self.db.commit()
        self._run(self.actor, [("completed", 3, 1000)])
        self.assertEqual(api.get_session_analytics(None, None, self.db, None)["funnel"]["completed"], 2)


if __name__ == "__main__":
    unittest.main()
