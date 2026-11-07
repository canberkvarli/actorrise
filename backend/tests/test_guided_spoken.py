"""Finished means spoken: a guided run skipped through on a dead mic reaches
the end and is not a finish. The guided report counts people, by scene and part."""

import unittest
from datetime import datetime, timedelta, timezone

import app.models  # noqa: F401  every mapper the relationships name

from app.api.admin import sessions as api
from app.models.actor import FilmTvReference, Play, RehearsalSession, Scene, SceneLine, UserScript
from app.models.organization import Organization
from app.models.rehearsal import RehearsalEvent, RehearsalRun
from app.models.user import User
from app.services.rehearsal import guided_report, spoken
from tests.dbfixture import memory_db, restore

HEARD = {"ended_by": "last_word", "score": 1.0, "matched": [0, 1], "deaf": False}
SKIPPED = {"ended_by": "skipped", "score": 0, "matched": [], "deaf": False}
DEAF = {"ended_by": "skipped", "score": 0, "matched": [], "deaf": True}


class HeardTests(unittest.TestCase):
    def test_one_read(self):
        self.assertTrue(spoken.heard(HEARD))
        self.assertTrue(spoken.heard({"ended_by": "quiet", "score": 0.67}))
        self.assertFalse(spoken.heard(SKIPPED))
        self.assertFalse(spoken.heard(DEAF))
        # A partly said line the actor then skipped is not heard: the rule is the line, not words.
        self.assertFalse(spoken.heard({"ended_by": "skipped", "score": 0.5}))
        self.assertFalse(spoken.heard({"ended_by": "quiet", "score": 0}))
        self.assertFalse(spoken.heard({"ended_by": "quiet", "score": True}))
        self.assertFalse(spoken.heard({"ended_by": "quiet", "score": "1"}))
        self.assertFalse(spoken.heard(None))

    def test_half_the_lines(self):
        own = {1, 3, 5, 7}
        self.assertTrue(spoken.spoken([(1, HEARD), (3, HEARD), (5, SKIPPED), (7, SKIPPED)], own))
        self.assertFalse(spoken.spoken([(1, HEARD), (3, SKIPPED), (5, SKIPPED), (7, SKIPPED)], own))
        # The same line heard twice is one line.
        self.assertFalse(spoken.spoken([(1, HEARD), (1, HEARD), (3, SKIPPED)], own))
        # A heard read on a partner's line says nothing.
        self.assertFalse(spoken.spoken([(1, HEARD), (2, HEARD)], own))
        self.assertFalse(spoken.spoken([(1, HEARD)], set()))


class GuidedTests(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db(
            [Organization, User, FilmTvReference, Play, UserScript, Scene, SceneLine, RehearsalSession, RehearsalRun, RehearsalEvent]
        )
        now = datetime.now(timezone.utc)
        self.people = [User(email=f"actor{i}@gmail.com", hashed_password="x", created_at=now) for i in range(4)]
        self.staff = User(email="t@actorrise.com", hashed_password="x", exclude_from_stats=True, created_at=now)
        self.db.add_all([*self.people, self.staff])
        play = Play(title="First scenes", author="C", genre="drama", category="contemporary", copyright_status="original")
        self.db.add(play)
        self.db.flush()
        script = UserScript(user_id=self.staff.id, title="A confession", author="C", original_filename="c.txt",
                            file_type="txt", is_guided=True)
        self.db.add(script)
        self.db.flush()
        self.scene = Scene(play_id=play.id, user_script_id=script.id, title="A confession", is_library=False,
                           character_1_name="MARA", character_2_name="DEV", line_count=4, estimated_duration_seconds=30)
        self.db.add(self.scene)
        self.db.flush()
        # MARA speaks first: MARA has 0 and 2, DEV has 1 and 3.
        for i, who in enumerate(["MARA", "DEV", "MARA", "DEV"]):
            self.db.add(SceneLine(scene_id=self.scene.id, character_name=who, text=f"line {i}", line_order=i, word_count=2))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        restore(self.saved)

    def _run(self, user, part, events, guided=True):
        run = RehearsalRun(user_id=user.id, scene_id=self.scene.id, character=part, voices={},
                           is_guided=guided, started_at=datetime.now(timezone.utc))
        self.db.add(run)
        self.db.flush()
        for seq, (kind, line, payload) in enumerate(events):
            self.db.add(RehearsalEvent(run_id=run.id, seq=seq, type=kind, line_index=line, at_ms=seq * 1000, payload=payload))
        self.db.commit()
        return run

    def _spoken_mara(self, user):
        return self._run(user, "MARA", [("started", None, {}), ("actor_line_read", 0, HEARD),
                                        ("actor_line_read", 2, HEARD), ("completed", 3, {})])

    def _skipped_dev(self, user):
        return self._run(user, "DEV", [("started", None, {}), ("actor_line_read", 1, SKIPPED),
                                       ("actor_line_read", 3, SKIPPED), ("completed", 3, {})])

    def test_outcomes_tell_reached_the_end_from_finished(self):
        good, bad = self._spoken_mara(self.people[0]), self._skipped_dev(self.people[1])
        o = spoken.outcomes(self.db, [good, bad])
        self.assertEqual((o[good.id]["reached_end"], o[good.id]["spoken"], o[good.id]["heard"]), (True, True, 2))
        self.assertEqual((o[bad.id]["reached_end"], o[bad.id]["spoken"], o[bad.id]["heard"]), (True, False, 0))

    def test_breakdown_counts_people_by_part_and_leaves_staff_out(self):
        self._spoken_mara(self.people[0])
        self._spoken_mara(self.people[0])  # the same person twice is one person
        self._skipped_dev(self.people[1])
        # Stopped on a dead mic, tried again, got through spoken.
        self._run(self.people[2], "DEV", [("started", None, {}), ("actor_line_read", 1, SKIPPED),
                                          ("paused", 3, {"reason": "deaf", "missed": 1, "deaf": False}),
                                          ("resumed", 3, {"reason": "try_again"}),
                                          ("actor_line_read", 3, HEARD), ("completed", 3, {})])
        self._run(self.people[3], "DEV", [])  # opened, never started
        self._spoken_mara(self.staff)
        rows = guided_report.breakdown(self.db, datetime.now(timezone.utc) - timedelta(days=1))
        by = {(r["scene"], r["part"]): r for r in rows}
        self.assertEqual([(r["scene"], r["part"]) for r in rows],
                         [("confession", None), ("confession", "DEV"), ("confession", "MARA")])
        self.assertEqual({k: by[("confession", "MARA")][k] for k in guided_report.COUNTS},
                         {"opened": 1, "started": 1, "reached_end": 1, "finished": 1, "dead_mic": 0})
        self.assertEqual({k: by[("confession", "DEV")][k] for k in guided_report.COUNTS},
                         {"opened": 3, "started": 2, "reached_end": 2, "finished": 1, "dead_mic": 1})
        self.assertEqual(by[("confession", None)]["finished"], 2)
        table = guided_report.as_table(rows)
        self.assertIn("| confession | all | 4 | 3 | 3 | 2 | 1 |", table)

    def test_admin_analytics_rate_is_spoken_finishes(self):
        self._spoken_mara(self.people[0])
        self._skipped_dev(self.people[1])
        f = api.get_session_analytics(None, None, self.db, None)["funnel"]
        self.assertEqual((f["completed"], f["spoken"], f["ended"]), (2, 1, 2))
        self.assertEqual(f["completion_rate"], 50.0)
        page = api.get_rehearsal_sessions(1, 25, None, None, None, None, self.db, None)
        self.assertEqual(sorted(s["spoken"] for s in page["sessions"]), [False, True])
        self.assertEqual(page["summary"]["spoken"], 1)
        rows = api.get_guided_breakdown(None, None, self.db, None)["rows"]
        self.assertEqual(rows[0]["finished"], 1)
