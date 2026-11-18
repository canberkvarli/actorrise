"""Copy on edit for the samples.

A sample (UserScript.is_sample) is one set of rows every actor sees, so an
edit makes the actor a copy of their own (POST /api/scripts/{id}/make-mine)
and the sample steps off that actor's shelf, for them only.
"""

import asyncio
import unittest

from fastapi import HTTPException

from app.api import scripts as api
from app.models.actor import FilmTvReference, Play, Scene, SceneLine, ScriptTag, ScriptTagVote, UserScript
from app.models.organization import Organization
from app.models.user import User
from app.services import sample_copy
from tests.dbfixture import memory_db, restore

_TABLES = (Organization, User, FilmTvReference, Play, UserScript, Scene, SceneLine, ScriptTag, ScriptTagVote)


def run(coro):
    return asyncio.run(coro)


class MakeMineTestCase(unittest.TestCase):
    def setUp(self):
        self.db, self._saved = memory_db(_TABLES)
        self.actor = User(email="actor@example.com", hashed_password="x")
        self.other = User(email="other@example.com", hashed_password="x")
        self.db.add_all([self.actor, self.other])
        self.db.flush()

        self.play = Play(title="Hamlet", author="Shakespeare", genre="tragedy", category="classical",
                         copyright_status="public_domain", language="en")
        self.db.add(self.play)
        self.db.flush()
        self.sample = UserScript(
            user_id=None, is_sample=True, title="Hamlet", author="Shakespeare",
            original_filename="hamlet.txt", file_type="txt", processing_status="completed",
            characters=[{"name": "HAMLET"}, {"name": "OPHELIA"}], num_characters=2, num_scenes_extracted=2,
        )
        self.db.add(self.sample)
        self.db.flush()
        self.scenes = []
        for n, title in enumerate(("Get thee to a nunnery", "The closet")):
            sc = Scene(play_id=self.play.id, user_script_id=self.sample.id, title=title,
                       character_1_name="HAMLET", character_2_name="OPHELIA", line_count=2,
                       estimated_duration_seconds=60, original_snapshot={"lines": []})
            self.db.add(sc)
            self.db.flush()
            for i, (who, text) in enumerate((("HAMLET", f"Line one of {n}"), ("OPHELIA", f"Line two of {n}"))):
                self.db.add(SceneLine(scene_id=sc.id, line_order=i, character_name=who, text=text,
                                      stage_direction="(aside)" if i else None, word_count=len(text.split())))
            self.scenes.append(sc)
        self.mine = UserScript(
            user_id=self.actor.id, title="My upload", author="Me", original_filename="mine.pdf",
            file_type="pdf", processing_status="completed", characters=[], num_characters=0,
        )
        self.db.add(self.mine)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        restore(self._saved)

    def shelf(self, user):
        return [s.id for s in api.shelf_scripts_query(self.db, user.id).all()]

    def make_mine(self, script_id, user=None):
        return run(api.make_sample_mine(script_id, self.db, user or self.actor))

    def test_the_copy_is_the_actors_own_with_every_scene_and_line(self):
        out = self.make_mine(self.sample.id)
        self.assertTrue(out.created)
        copy = self.db.get(UserScript, out.script.id)
        self.assertEqual(copy.user_id, self.actor.id)
        self.assertFalse(copy.is_sample)
        self.assertFalse(copy.shared_with_community)
        self.assertIsNone(copy.class_share)
        self.assertEqual(copy.title, "Hamlet")
        self.assertEqual(copy.file_type, sample_copy.COPY_FILE_TYPE)
        self.assertEqual(copy.original_filename, f"sample-{self.sample.id}.txt")
        self.assertEqual(sample_copy.sample_id_of(copy), self.sample.id)

        new_scenes = self.db.query(Scene).filter(Scene.user_script_id == copy.id).order_by(Scene.id).all()
        self.assertEqual([s.title for s in new_scenes], ["Get thee to a nunnery", "The closet"])
        self.assertEqual(out.scene_ids, {str(o.id): n.id for o, n in zip(self.scenes, new_scenes)})
        for old, new in zip(self.scenes, new_scenes):
            self.assertNotEqual(old.id, new.id)
            # A play row of its own: renaming it must not rename the sample's.
            self.assertNotEqual(new.play_id, self.play.id)
            self.assertEqual(self.db.get(Play, new.play_id).title, "Hamlet")
            self.assertEqual(self.db.get(Play, new.play_id).language, "en")
            self.assertEqual(new.original_snapshot, {"lines": []})
            old_lines = [(l.line_order, l.character_name, l.text, l.stage_direction) for l in
                         self.db.query(SceneLine).filter(SceneLine.scene_id == old.id).order_by(SceneLine.line_order)]
            new_lines = [(l.line_order, l.character_name, l.text, l.stage_direction) for l in
                         self.db.query(SceneLine).filter(SceneLine.scene_id == new.id).order_by(SceneLine.line_order)]
            self.assertEqual(old_lines, new_lines)
            self.assertEqual(len(new_lines), 2)
        # Both new scenes share one copied play, as the sample's did.
        self.assertEqual(len({s.play_id for s in new_scenes}), 1)

    def test_twice_is_once(self):
        first = self.make_mine(self.sample.id)
        second = self.make_mine(self.sample.id)
        self.assertFalse(second.created)
        self.assertEqual(first.script.id, second.script.id)
        self.assertEqual(first.scene_ids, second.scene_ids)
        copies = self.db.query(UserScript).filter(UserScript.file_type == sample_copy.COPY_FILE_TYPE).count()
        self.assertEqual(copies, 1)

    def test_the_sample_steps_off_that_actors_shelf_only(self):
        self.assertIn(self.sample.id, self.shelf(self.actor))
        out = self.make_mine(self.sample.id)
        mine = self.shelf(self.actor)
        self.assertNotIn(self.sample.id, mine)
        self.assertIn(out.script.id, mine)
        self.assertIn(self.mine.id, mine)
        theirs = self.shelf(self.other)
        self.assertIn(self.sample.id, theirs)
        self.assertNotIn(out.script.id, theirs)

    def test_a_deleted_copy_gives_the_sample_back_and_a_new_edit_copies_again(self):
        out = self.make_mine(self.sample.id)
        run(api.delete_script(out.script.id, False, self.db, self.actor))
        self.assertIn(self.sample.id, self.shelf(self.actor))
        again = self.make_mine(self.sample.id)
        self.assertTrue(again.created)
        self.assertNotEqual(again.script.id, out.script.id)

    def test_editing_the_copy_leaves_the_sample_alone(self):
        out = self.make_mine(self.sample.id)
        run(api.update_script_metadata(out.script.id, api.ScriptMetadataUpdate(title="My Hamlet"), self.db, self.actor))
        self.db.refresh(self.sample)
        self.assertEqual(self.sample.title, "Hamlet")
        self.assertEqual(self.db.get(UserScript, out.script.id).title, "My Hamlet")

    def test_a_script_that_is_not_a_sample_is_refused(self):
        with self.assertRaises(HTTPException) as own:
            self.make_mine(self.mine.id)
        self.assertEqual(own.exception.status_code, 404)
        # Someone else's script, too: never copied.
        with self.assertRaises(HTTPException) as theirs:
            self.make_mine(self.mine.id, user=self.other)
        self.assertEqual(theirs.exception.status_code, 404)

    def test_the_guided_scene_is_refused(self):
        self.sample.is_guided = True
        self.db.commit()
        with self.assertRaises(HTTPException) as e:
            self.make_mine(self.sample.id)
        self.assertEqual(e.exception.status_code, 404)

    def test_an_upload_named_like_a_copy_does_not_hide_the_sample(self):
        self.db.add(UserScript(
            user_id=self.actor.id, title="Fake", author="Me", original_filename=f"sample-{self.sample.id}.txt",
            file_type="txt", processing_status="completed", characters=[], num_characters=0,
        ))
        self.db.commit()
        self.assertIn(self.sample.id, self.shelf(self.actor))
        self.assertTrue(self.make_mine(self.sample.id).created)

    def test_a_copy_cannot_be_shared_with_the_community(self):
        out = self.make_mine(self.sample.id)
        with self.assertRaises(HTTPException) as e:
            run(api.set_script_shared(out.script.id, api.ShareScriptRequest(shared=True), self.db, self.actor))
        self.assertEqual(e.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
