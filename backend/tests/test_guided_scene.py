"""The guided first scene.

Spec: docs/superpowers/specs/2026-09-26-guided-first-scene-design.md. The hub
starts this scene at an actor who has never rehearsed. It is a real sample
script that no shelf lists, started by an endpoint that charges no meter.
"""
import unittest

from app.models.actor import (
    ActorProfile,
    FilmTvReference,
    Play,
    RehearsalLineDelivery,
    RehearsalSession,
    Scene,
    SceneLine,
    UserScript,
)
from app.models.billing import UsageMetrics
from app.models.organization import Organization
from app.models.user import User
from scripts.seed_sample_script import seed_late
from tests.dbfixture import memory_db, restore

_TABLES = (
    Organization, User, ActorProfile, FilmTvReference, Play, UserScript, Scene, SceneLine,
    RehearsalSession, RehearsalLineDelivery, UsageMetrics,
)


class Fixture(unittest.TestCase):
    def setUp(self):
        self.db, self._saved = memory_db(_TABLES)
        self.user = User(email="actor@example.com", hashed_password="x")
        self.db.add(self.user)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        restore(self._saved)


class TheSeed(Fixture):
    def test_it_seeds_a_guided_sample_with_six_lines(self):
        seed_late(self.db)
        self.db.commit()
        script = self.db.query(UserScript).filter(UserScript.title == "Late").one()
        self.assertTrue(script.is_sample)
        self.assertTrue(script.is_guided)
        self.assertIsNone(script.user_id)
        scene = self.db.query(Scene).filter(Scene.user_script_id == script.id).one()
        lines = sorted(scene.lines, key=lambda l: l.line_order)
        self.assertEqual(len(lines), 6)
        self.assertEqual((lines[0].character_name, lines[0].text), ("RILEY", "You're late."))
        self.assertEqual([l.character_name for l in lines], ["RILEY", "ALEX"] * 3)

    def test_it_is_idempotent(self):
        seed_late(self.db)
        seed_late(self.db)
        self.db.commit()
        self.assertEqual(self.db.query(UserScript).filter(UserScript.title == "Late").count(), 1)
        self.assertEqual(self.db.query(SceneLine).count(), 6)


class NoShelfListsIt(Fixture):
    def setUp(self):
        super().setUp()
        seed_late(self.db)
        self.db.commit()

    def test_the_demo_rung_never_picks_it(self):
        # whats_next's last rung is "the sample play speaks first". With only
        # the guided sample seeded there must be nothing to say.
        from app.api.scenes import whats_next
        self.assertIsNone(whats_next(self.db, self.user.id))

    def test_the_shelf_query_excludes_it(self):
        from app.api.scripts import shelf_scripts_query
        rows = shelf_scripts_query(self.db, self.user.id).all()
        self.assertEqual([s.title for s in rows], [])

    def test_the_community_query_excludes_it(self):
        from app.api.community import community_scripts_query
        rows = community_scripts_query(self.db).all()
        self.assertEqual(rows, [])


if __name__ == "__main__":
    unittest.main()
