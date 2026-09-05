"""Redo scenes could not delete a scene anyone had ever rehearsed.

/reextract replaces a script's scenes by deleting the old ones, but it only ever
cleared scene_lines first. rehearsal_sessions.scene_id and scene_favorites.scene_id
are both NOT NULL foreign keys onto scenes.id with ON DELETE NO ACTION, so the
delete raised a foreign key violation and the whole request 500'd.

Measured in prod on 2026-09-04: 11 of 16 uploaded scripts would have failed this
way, blocked by 125 rehearsal sessions, 104 of them belonging to 48 real actors.
The failure landed after the AI work had already been paid for, and the button
gave no warning beforehand that anything was at stake.

delete_script has always done this correctly: deliveries, then sessions, then
favourites, then lines, then the scene. purge_scenes is that order, named, so
both paths share it and the ordering is pinned by a test rather than by luck.

These run on SQLite with PRAGMA foreign_keys=ON, so deleting in the wrong order
fails here the same way it failed in Postgres.
"""

import unittest

from app.models.actor import (
    FilmTvReference,
    Play,
    RehearsalLineDelivery,
    RehearsalSession,
    Scene,
    SceneFavorite,
    SceneLine,
    UserScript,
)
from app.models.user import User
from app.api.scripts import purge_scenes
from tests.dbfixture import memory_db, restore


# Only the tables the purge walks; see tests/dbfixture for why not all of them.
_TABLES = (
    User, FilmTvReference, Play, UserScript, Scene, SceneLine,
    RehearsalSession, RehearsalLineDelivery, SceneFavorite,
)


def _memory_db():
    return memory_db(_TABLES)


def _restore_schema(saved):
    restore(saved)


class PurgeScenesClearsEverythingHangingOffAScene(unittest.TestCase):
    def setUp(self):
        self.db, self._saved = _memory_db()

        user = User(email="actor@example.com", hashed_password="x")
        play = Play(title="A Midsummer Night's Dream", author="William Shakespeare",
                    genre="Comedy", category="classical",
                    copyright_status="public_domain", license_type="public_domain")
        self.db.add_all([user, play])
        self.db.flush()

        script = UserScript(user_id=user.id, title="Mnd", author="Unknown",
                            original_filename="MND.pdf", file_type="pdf",
                            processing_status="completed")
        self.db.add(script)
        self.db.flush()

        self.scene = Scene(
            play_id=play.id,
            user_script_id=script.id,
            title="Act 5 Scene 1",
            character_1_name="THESEUS",
            character_2_name="HIPPOLYTA",
            line_count=1, estimated_duration_seconds=30,
        )
        self.db.add(self.scene)
        self.db.flush()

        line = SceneLine(
            scene_id=self.scene.id, line_order=0,
            character_name="THESEUS", text="More strange than true.", word_count=4,
        )
        self.db.add(line)
        self.db.flush()

        session = RehearsalSession(
            user_id=user.id, scene_id=self.scene.id,
            user_character="THESEUS", ai_character="HIPPOLYTA"
        )
        self.db.add(session)
        self.db.flush()

        self.db.add(RehearsalLineDelivery(session_id=session.id, scene_line_id=line.id,
                                              delivery_order=0, user_input="More strange than true."))
        self.db.add(SceneFavorite(user_id=user.id, scene_id=self.scene.id))
        self.db.commit()

        self.script_id = script.id

    def tearDown(self):
        self.db.close()
        _restore_schema(self._saved)

    def test_the_scene_goes(self):
        purge_scenes(self.db, [self.scene])
        self.db.commit()
        self.assertEqual(self.db.query(Scene).count(), 0)

    def test_rehearsal_sessions_go_with_it(self):
        """The FK that made Redo 500 on any script an actor had used."""
        purge_scenes(self.db, [self.scene])
        self.db.commit()
        self.assertEqual(self.db.query(RehearsalSession).count(), 0)

    def test_line_deliveries_go_before_their_session(self):
        purge_scenes(self.db, [self.scene])
        self.db.commit()
        self.assertEqual(self.db.query(RehearsalLineDelivery).count(), 0)

    def test_favourites_go(self):
        purge_scenes(self.db, [self.scene])
        self.db.commit()
        self.assertEqual(self.db.query(SceneFavorite).count(), 0)

    def test_scene_lines_go(self):
        purge_scenes(self.db, [self.scene])
        self.db.commit()
        self.assertEqual(self.db.query(SceneLine).count(), 0)

    def test_purging_nothing_is_harmless(self):
        purge_scenes(self.db, [])
        self.db.commit()
        self.assertEqual(self.db.query(Scene).count(), 1)


class RecutCostTellsTheActorWhatItWillTake(unittest.TestCase):
    """The confirm dialog has to name the price before it is paid, not after."""

    def setUp(self):
        self.db, self._saved = _memory_db()
        user = User(email="actor@example.com", hashed_password="x")
        play = Play(title="MND", author="S", genre="Comedy", category="classical",
                    copyright_status="public_domain", license_type="public_domain")
        self.db.add_all([user, play])
        self.db.flush()
        script = UserScript(user_id=user.id, title="Mnd", author="Unknown",
                            original_filename="MND.pdf", file_type="pdf",
                            processing_status="completed")
        self.db.add(script)
        self.db.flush()
        self.script_id = script.id

        for i in range(3):
            scene = Scene(
                play_id=play.id, user_script_id=script.id, title=f"Scene {i}",
                character_1_name="A", character_2_name="B", line_count=0, estimated_duration_seconds=0,
            )
            self.db.add(scene)
            self.db.flush()
            if i < 2:
                self.db.add(RehearsalSession(
                    user_id=user.id, scene_id=scene.id,
                    user_character="A", ai_character="B"
                ))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        _restore_schema(self._saved)

    def test_counts_scenes_and_sessions_at_risk(self):
        from app.api.scripts import recut_cost

        cost = recut_cost(self.db, self.script_id)
        self.assertEqual(cost["scenes"], 3)
        self.assertEqual(cost["sessions"], 2)


if __name__ == "__main__":
    unittest.main()
