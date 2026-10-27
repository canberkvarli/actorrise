"""The Scene room's shelf, made sense of on the server, a page at a time."""

import asyncio
import unittest
from datetime import datetime, timedelta, timezone

from app.api import scripts as api
from app.models.actor import FilmTvReference, Play, Scene, ScriptTag, ScriptTagVote, UserScript
from app.models.organization import Organization
from app.models.rehearsal import RehearsalRun
from app.models.user import User
from tests.dbfixture import memory_db, restore

_TABLES = (Organization, User, FilmTvReference, Play, UserScript, Scene, ScriptTag, ScriptTagVote, RehearsalRun)
NOW = datetime.now(timezone.utc)


class ShelfPageTestCase(unittest.TestCase):
    def setUp(self):
        self.db, self._saved = memory_db(_TABLES)
        self.actor = User(email="actor@example.com", hashed_password="x")
        self.db.add(self.actor)
        self.db.flush()
        self.play = Play(title="P", author="A", genre="Drama", category="contemporary", copyright_status="user_uploaded")
        self.db.add(self.play)
        self.db.flush()
        old = NOW - timedelta(days=90)
        self.scripts = []
        for i in range(40):
            s = UserScript(
                user_id=self.actor.id, title=f"Play {i:02d}", author="Someone", original_filename=f"p{i}.pdf",
                file_type="pdf", processing_status="completed", characters=[{"name": f"PART{i}"}], num_characters=1,
                num_scenes_extracted=i % 5, is_sample=False, created_at=old - timedelta(days=i),
                genres=["Comedy"] if i % 4 == 0 else ["Drama"],
            )
            self.db.add(s)
            self.scripts.append(s)
        self.db.flush()
        # One run last week, of Play 07's scene "The Kitchen".
        scene = Scene(play_id=self.play.id, user_script_id=self.scripts[7].id, title="The Kitchen",
                      character_1_name="A", character_2_name="B", line_count=2, estimated_duration_seconds=60)
        self.db.add(scene)
        self.db.flush()
        self.db.add(RehearsalRun(user_id=self.actor.id, scene_id=scene.id, character="A", voices={}, started_at=NOW - timedelta(days=3)))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        restore(self._saved)

    def page(self, **kw):
        args = dict(q=None, genre=None, sort="recent", offset=0, limit=30, touched=None)
        args.update(kw)
        return asyncio.run(api.shelf_page(db=self.db, current_user=self.actor, **args))

    def test_working_on_is_whole_and_the_rest_comes_a_page_at_a_time(self):
        first = self.page()
        self.assertTrue(first.grouped)
        self.assertEqual([s.title for s in first.working], ["Play 07"])
        self.assertEqual(first.rest_total, 39)
        self.assertEqual(len(first.rest), 30)
        self.assertEqual(first.next_offset, 30)
        second = self.page(offset=30)
        self.assertEqual(second.working, [])
        self.assertEqual(len(second.rest), 9)
        self.assertIsNone(second.next_offset)
        self.assertEqual(first.genres, ["Drama", "Comedy"])

    def test_a_script_opened_on_the_phone_counts_as_working_on(self):
        p = self.page(touched=str(self.scripts[20].id))
        self.assertEqual({s.title for s in p.working}, {"Play 07", "Play 20"})

    def test_the_rest_sorts_by_title_and_by_scenes(self):
        self.assertEqual(self.page(sort="title").rest[0].title, "Play 00")
        self.assertEqual(self.page(sort="scenes").rest[0].num_scenes_extracted, 4)

    def test_find_looks_inside_and_says_why(self):
        by_scene = self.page(q="kitchen")
        self.assertTrue(by_scene.found)
        self.assertEqual([(s.title, s.why) for s in by_scene.rest], [("Play 07", "a scene: The Kitchen")])
        by_part = self.page(q="part33")
        self.assertEqual([(s.title, s.why) for s in by_part.rest], [("Play 33", "a part: PART33")])
        comedies = self.page(genre="Comedy")
        self.assertEqual(comedies.rest_total, 10)


if __name__ == "__main__":
    unittest.main()
