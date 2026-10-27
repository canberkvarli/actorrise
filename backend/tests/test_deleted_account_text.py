"""A deleted account's uploaded scenes go with it: no text outlives the person."""

import unittest
from datetime import datetime, timezone

import app.models  # noqa: F401  every mapper the relationships name
from app.models.actor import (FilmTvReference, Monologue, Play, RehearsalLineDelivery, RehearsalSession, Scene,
                              SceneFavorite, SceneLine, UserScript)
from app.models.organization import Organization
from app.models.rehearsal import RehearsalEvent, RehearsalRun
from app.models.shelf import ShelfScene
from app.models.user import User
from app.services.user_deletion import _delete_uploaded_scenes
from tests.dbfixture import memory_db, restore


class DeletedAccountText(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db([Organization, User, FilmTvReference, Play, Monologue, UserScript, Scene,
                                         SceneLine, SceneFavorite, RehearsalSession, RehearsalLineDelivery,
                                         RehearsalRun, RehearsalEvent, ShelfScene])
        now = datetime.now(timezone.utc)
        self.teacher = User(email="t@x.com", hashed_password="x", created_at=now)
        self.student = User(email="s@x.com", hashed_password="x", created_at=now)
        self.db.add_all([self.teacher, self.student])
        self.db.flush()
        self.script = UserScript(user_id=self.teacher.id, title="Kitchen", author="Unknown",
                                 original_filename="k.txt", file_type="txt", processing_status="completed")
        self.play = Play(title="Kitchen", author="Unknown", genre="drama", category="contemporary",
                         copyright_status="user_uploaded", full_text="NICK: Go home.", text_format="plain")
        self.kept_play = Play(title="Hamlet", author="Shakespeare", genre="drama", category="classical",
                              copyright_status="public_domain", full_text="x", text_format="plain")
        self.db.add_all([self.script, self.play, self.kept_play])
        self.db.flush()
        self.scene = Scene(play_id=self.play.id, user_script_id=self.script.id, title="Kitchen",
                           character_1_name="NICK", character_2_name="ANNA", line_count=1,
                           estimated_duration_seconds=10)
        self.db.add(self.scene)
        self.db.flush()
        line = SceneLine(scene_id=self.scene.id, line_order=0, character_name="NICK", text="Go home.", word_count=2)
        self.db.add(line)
        self.db.flush()
        # The student rehearsed it, saved it, and someone pointed the library at it.
        session = RehearsalSession(user_id=self.student.id, scene_id=self.scene.id, user_character="ANNA",
                                   ai_character="NICK")
        self.db.add(session)
        self.db.flush()
        self.db.add_all([
            RehearsalLineDelivery(session_id=session.id, scene_line_id=line.id, delivery_order=0, user_input="hi"),
            RehearsalRun(user_id=self.student.id, scene_id=self.scene.id, character="ANNA"),
            SceneFavorite(user_id=self.student.id, scene_id=self.scene.id),
            ShelfScene(kind="shared", status="live", work_title="Kitchen", title="Kitchen",
                       character_1_name="NICK", character_2_name="ANNA", source_scene_id=self.scene.id,
                       shared_by_user_id=self.teacher.id),
        ])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        restore(self.saved)

    def test_the_text_and_everything_pointing_at_it_go(self):
        play_id, kept_id = self.play.id, self.kept_play.id
        _delete_uploaded_scenes(self.db, [self.script.id])
        self.db.commit()
        self.db.expunge_all()
        for model in (Scene, SceneLine, RehearsalSession, RehearsalLineDelivery, RehearsalRun, SceneFavorite):
            self.assertEqual(self.db.query(model).count(), 0, model.__name__)
        self.assertIsNone(self.db.get(Play, play_id))
        self.assertIsNotNone(self.db.get(Play, kept_id))
        self.assertIsNone(self.db.query(ShelfScene).one().source_scene_id)

    def test_a_play_something_else_still_uses_is_kept(self):
        other = UserScript(user_id=self.student.id, title="Copy", author="Unknown", original_filename="c.txt",
                           file_type="txt", processing_status="completed")
        self.db.add(other)
        self.db.flush()
        self.db.add(Scene(play_id=self.play.id, user_script_id=other.id, title="Copy", character_1_name="NICK",
                          character_2_name="ANNA", line_count=0, estimated_duration_seconds=0))
        self.db.commit()
        _delete_uploaded_scenes(self.db, [self.script.id])
        self.db.commit()
        self.assertIsNotNone(self.db.get(Play, self.play.id))
        self.assertEqual(self.db.query(Scene).count(), 1)


if __name__ == "__main__":
    unittest.main()
