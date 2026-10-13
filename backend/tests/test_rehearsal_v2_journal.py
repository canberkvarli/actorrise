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
        # line_order is deliberately not 0..3: a journal line_index is the
        # position in the ordered list (contract.lines_for), never line_order.
        self.db.add_all([
            SceneLine(scene_id=self.scene.id, line_order=10, character_name="A", text="One.", word_count=1),
            SceneLine(scene_id=self.scene.id, line_order=20, character_name="B", text="Two.", word_count=1),
            SceneLine(scene_id=self.scene.id, line_order=30, character_name=" a ", text="Three.", word_count=1),
            SceneLine(scene_id=self.scene.id, line_order=40, character_name="B", text="Four.", word_count=1),
        ])
        self.db.commit()

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

    def test_malformed_events_are_dropped_not_fatal(self):
        run = self.start()
        journal.append(self.db, run.id, self.user.id, ["x", {"seq": 1, "type": "started", "at_ms": "abc"},
                                                     {"seq": 2, "type": "started", "at_ms": 5}])
        self.assertEqual(self.db.query(RehearsalEvent).count(), 1)

    def test_furthest_and_finished(self):
        run = self.start()
        journal.append(self.db, run.id, self.user.id, [ev(0, "started"), ev(1, "line_reached", 0), ev(2, "line_reached", 3)])
        self.assertEqual(journal.furthest_line(self.db, run.id), 3)
        self.assertFalse(journal.is_finished(self.db, run.id))
        journal.append(self.db, run.id, self.user.id, [ev(3, "completed", 3)])
        self.assertEqual(journal.furthest_line(self.db, run.id), 3)
        self.assertTrue(journal.is_finished(self.db, run.id))
        # Finished drives resume and the list; it is not what earns anything.
        self.assertFalse(journal.is_fully_read(self.db, run.id))
        self.assertFalse(journal.user_has_finished_a_scene(self.db, self.user.id))

    def test_fully_read_needs_a_read_of_every_actor_line_and_completed(self):
        # The client writes the journal, so one forged `completed` must earn
        # nothing. The actor's lines here are positions 0 and 2.
        run = self.start()
        journal.append(self.db, run.id, self.user.id, [ev(0, "started"), ev(1, "actor_line_read", 0), ev(2, "completed", 3)])
        self.assertTrue(journal.is_finished(self.db, run.id))
        self.assertFalse(journal.is_fully_read(self.db, run.id))
        self.assertFalse(journal.user_has_finished_a_scene(self.db, self.user.id))
        journal.append(self.db, run.id, self.user.id, [ev(3, "actor_line_read", 2)])
        self.assertTrue(journal.is_fully_read(self.db, run.id))
        self.assertTrue(journal.user_has_finished_a_scene(self.db, self.user.id))

    def test_reading_every_line_without_completing_is_not_finished(self):
        run = self.start()
        journal.append(self.db, run.id, self.user.id, [ev(0, "actor_line_read", 0), ev(1, "actor_line_read", 2)])
        self.assertFalse(journal.is_fully_read(self.db, run.id))
        self.assertFalse(journal.user_has_finished_a_scene(self.db, self.user.id))

    def test_reading_the_partners_lines_does_not_count(self):
        # Partner positions are 1 and 3; claiming those read says nothing.
        run = self.start()
        journal.append(self.db, run.id, self.user.id, [ev(0, "actor_line_read", 1), ev(1, "actor_line_read", 3),
                                                     ev(2, "actor_line_read", 0), ev(3, "completed", 3)])
        self.assertFalse(journal.is_fully_read(self.db, run.id))

    def test_a_scene_with_no_lines_for_the_part_is_never_fully_read(self):
        run = journal.create_run(self.db, self.user.id, self.scene.id, character="NOBODY", voices={})
        journal.append(self.db, run.id, self.user.id, [ev(0, "completed", 3)])
        self.assertFalse(journal.is_fully_read(self.db, run.id))
        self.assertFalse(journal.user_has_finished_a_scene(self.db, self.user.id))

    def test_resumable_is_an_open_run_past_line_zero(self):
        self.assertIsNone(journal.resumable(self.db, self.user.id, self.scene.id))
        run = self.start()
        journal.append(self.db, run.id, self.user.id, [ev(0, "started"), ev(1, "line_reached", 0)])
        self.assertIsNone(journal.resumable(self.db, self.user.id, self.scene.id))
        journal.append(self.db, run.id, self.user.id, [ev(2, "line_reached", 2)])
        self.assertEqual(journal.resumable(self.db, self.user.id, self.scene.id), {"run_id": run.id, "line_index": 2})
        journal.append(self.db, run.id, self.user.id, [ev(3, "abandoned", 2)])
        self.assertIsNone(journal.resumable(self.db, self.user.id, self.scene.id))

    def test_latest_resumable_is_the_newest_open_run_across_scenes(self):
        self.assertIsNone(journal.latest_resumable(self.db, self.user.id))
        other = Scene(play_id=self.scene.play_id, title="T", character_1_name="A", character_2_name="B", line_count=4, estimated_duration_seconds=0)
        self.db.add(other); self.db.commit()
        first = self.start()
        journal.append(self.db, first.id, self.user.id, [ev(0, "line_reached", 2)])
        second = journal.create_run(self.db, self.user.id, other.id, character="A", voices={})
        journal.append(self.db, second.id, self.user.id, [ev(0, "line_reached", 1)])
        self.assertEqual(journal.latest_resumable(self.db, self.user.id),
                         {"scene_id": other.id, "run_id": second.id, "line_index": 1})
        # Closing the newest one hands the question to the next scene back.
        journal.append(self.db, second.id, self.user.id, [ev(1, "completed", 3)])
        self.assertEqual(journal.latest_resumable(self.db, self.user.id),
                         {"scene_id": self.scene.id, "run_id": first.id, "line_index": 2})
        journal.append(self.db, first.id, self.user.id, [ev(1, "abandoned", 2)])
        self.assertIsNone(journal.latest_resumable(self.db, self.user.id))

    def test_summary_for_sessions_list(self):
        run = self.start()
        journal.append(self.db, run.id, self.user.id, [ev(0, "started"), ev(1, "line_reached", 0),
                                                     ev(2, "actor_line_read", 0, 900, handover_ms=31), ev(3, "completed", 3, 5000)])
        s = journal.summaries(self.db, self.user.id)[0]
        self.assertEqual((s["run_id"], s["scene_id"], s["finished"], s["furthest_line"], s["duration_ms"]), (run.id, self.scene.id, True, 3, 5000))
        self.assertEqual(s["median_handover_ms"], 31)

    def test_stats_are_aggregates_over_every_run(self):
        first, second = self.start(), self.start()
        journal.append(self.db, first.id, self.user.id, [ev(0, "started"), ev(1, "actor_line_read", 0, 900),
                                                       ev(2, "actor_line_read", 2, 1800), ev(3, "completed", 3, 5000)])
        journal.append(self.db, second.id, self.user.id, [ev(0, "started"), ev(1, "actor_line_read", 0, 700)])
        self.assertEqual(journal.stats(self.db, self.user.id), {"runs": 2, "finished": 1, "lines_read": 3, "scenes": 1})
