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


if __name__ == "__main__":
    unittest.main()
