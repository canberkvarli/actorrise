"""Tests for two-person-scene intent detection.

Live finding (2026-07-20 log audit): users search the MONOLOGUE surface for
two-person SCENES and silently get 20 monologues that don't fit. One user ran
"Scenes from films for two actors" eight times in a day. Until the scene
library ships we can at least be honest: detect an EXPLICIT two-person-scene
ask and surface a truthful banner instead of pretending monologues match.

The hard part is precision — "macbeth scene", "emotional scene actress 20s",
"breakup scene", and "abuse survivor monologue ... scene" all use "scene"
loosely to mean a dramatic beat and are perfectly well served as monologues.
Only queries that clearly want TWO performers should trigger the gap.
"""

import unittest

from app.services.search.scene_intent import detect_two_person_scene_intent


class DetectTwoPersonSceneIntentTests(unittest.TestCase):
    # --- SHOULD fire: explicit two-person asks (real logged queries) ---
    def test_scenes_from_films_for_two_actors(self):
        self.assertTrue(detect_two_person_scene_intent("Scenes from films for two actors"))

    def test_scene_for_two(self):
        self.assertTrue(detect_two_person_scene_intent("dramatic scene for two"))

    def test_mm_scene_shorthand(self):
        self.assertTrue(detect_two_person_scene_intent("scene from contempory film dramatic M-M"))

    def test_two_hander(self):
        self.assertTrue(detect_two_person_scene_intent("comedic two-hander"))

    def test_duologue(self):
        self.assertTrue(detect_two_person_scene_intent("shakespeare duologue"))

    def test_scene_for_an_actor_and_an_actress(self):
        self.assertTrue(detect_two_person_scene_intent(
            "I'm looking for a scene for a young actor (late 20's) and an actress (40's)"))

    def test_two_person_scene(self):
        self.assertTrue(detect_two_person_scene_intent("two person scene"))

    # --- MUST NOT fire: loose "scene" usage, fine as monologues (real queries) ---
    def test_macbeth_scene_is_not_a_duologue(self):
        self.assertFalse(detect_two_person_scene_intent("A male scene from mcbeth"))

    def test_emotional_scene_actress(self):
        self.assertFalse(detect_two_person_scene_intent("Emotional scene actress 20s"))

    def test_breakup_scene(self):
        self.assertFalse(detect_two_person_scene_intent("breakup scene, emotional"))

    def test_single_person_scene_description(self):
        self.assertFalse(detect_two_person_scene_intent(
            "a scene consisting of a person suffering from addiction trying to break free"))

    def test_monologue_query_mentioning_scene(self):
        self.assertFalse(detect_two_person_scene_intent(
            "abuse survivor monologue confronting past emotional release scene"))

    def test_plain_monologue_query(self):
        self.assertFalse(detect_two_person_scene_intent("dramatic monologue for a senior man"))

    def test_empty(self):
        self.assertFalse(detect_two_person_scene_intent(""))
        self.assertFalse(detect_two_person_scene_intent(None))


if __name__ == "__main__":
    unittest.main()
