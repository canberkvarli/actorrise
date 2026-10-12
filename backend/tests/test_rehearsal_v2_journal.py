"""Append-only events; every number is derived."""
import unittest

from app.models.actor import FilmTvReference, Play, Scene, SceneLine, UserScript
from app.models.organization import Organization
from app.models.rehearsal import RehearsalEvent, RehearsalRun
from app.models.user import User
from app.services.rehearsal import journal
from tests.dbfixture import memory_db, restore

# FilmTvReference is here only because plays.film_tv_reference_id points at it
# and SQLite will not create plays without the target table.
_TABLES = (Organization, User, FilmTvReference, Play, UserScript, Scene, SceneLine, RehearsalRun, RehearsalEvent)


def ev(seq, type, line_index=None, at_ms=0, **payload):
    return {"seq": seq, "type": type, "line_index": line_index, "at_ms": at_ms, "payload": payload}


class Journal(unittest.TestCase):
    def setUp(self):
        self.db, self._saved = memory_db(_TABLES)
        self.user = User(email="a@example.com", supabase_id="s1")
        play = Play(title="P", author="A", source_type="play",
                    genre="drama", category="classical", copyright_status="public_domain")
        self.db.add_all([self.user, play]); self.db.flush()
        self.scene = Scene(play_id=play.id, title="S", character_1_name="A", character_2_name="B", line_count=4, estimated_duration_seconds=0)
        self.db.add(self.scene); self.db.flush()

    def tearDown(self):
        self.db.close(); restore(self._saved)

    def start(self, **kw):
        return journal.create_run(self.db, self.user.id, self.scene.id, character="A", voices={"B": "ash"}, **kw)

    def test_append_is_idempotent(self):
        run = self.start()
        journal.append(self.db, run.id, self.user.id, [ev(0, "started"), ev(1, "line_reached", 0)])
        journal.append(self.db, run.id, self.user.id, [ev(1, "line_reached", 0), ev(2, "line_reached", 1)])
        self.assertEqual(self.db.query(RehearsalEvent).filter_by(run_id=run.id).count(), 3)

    def test_append_refuses_another_users_run(self):
        run = self.start()
        with self.assertRaises(PermissionError):
            journal.append(self.db, run.id, self.user.id + 1, [ev(0, "started")])

    def test_unknown_type_is_dropped_not_fatal(self):
        run = self.start()
        journal.append(self.db, run.id, self.user.id, [ev(0, "started"), ev(1, "dance")])
        self.assertEqual(self.db.query(RehearsalEvent).count(), 1)

    def test_furthest_and_finished(self):
        run = self.start()
        journal.append(self.db, run.id, self.user.id, [ev(0, "started"), ev(1, "line_reached", 0), ev(2, "line_reached", 3)])
        self.assertEqual(journal.furthest_line(self.db, run.id), 3)
        self.assertFalse(journal.is_finished(self.db, run.id))
        journal.append(self.db, run.id, self.user.id, [ev(3, "completed", 3)])
        self.assertEqual(journal.furthest_line(self.db, run.id), 3)
        self.assertTrue(journal.is_finished(self.db, run.id))
        self.assertTrue(journal.user_has_finished_a_scene(self.db, self.user.id))

    def test_resumable_is_an_open_run_past_line_zero(self):
        self.assertIsNone(journal.resumable(self.db, self.user.id, self.scene.id))
        run = self.start()
        journal.append(self.db, run.id, self.user.id, [ev(0, "started"), ev(1, "line_reached", 0)])
        self.assertIsNone(journal.resumable(self.db, self.user.id, self.scene.id))
        journal.append(self.db, run.id, self.user.id, [ev(2, "line_reached", 2)])
        self.assertEqual(journal.resumable(self.db, self.user.id, self.scene.id), {"run_id": run.id, "line_index": 2})
        journal.append(self.db, run.id, self.user.id, [ev(3, "abandoned", 2)])
        self.assertIsNone(journal.resumable(self.db, self.user.id, self.scene.id))

    def test_summary_for_sessions_list(self):
        run = self.start()
        journal.append(self.db, run.id, self.user.id, [ev(0, "started"), ev(1, "line_reached", 0),
                                                     ev(2, "actor_line_read", 0, 900, handover_ms=31), ev(3, "completed", 3, 5000)])
        s = journal.summaries(self.db, self.user.id)[0]
        self.assertEqual((s["run_id"], s["scene_id"], s["finished"], s["furthest_line"], s["duration_ms"]), (run.id, self.scene.id, True, 3, 5000))
        self.assertEqual(s["median_handover_ms"], 31)
