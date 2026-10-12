import unittest
from types import SimpleNamespace

from app.services.rehearsal.contract import RehearsalLine
from app.services.rehearsal.voices import VOICES, default_voices


def _scene(g1=None, g2=None):
    return SimpleNamespace(character_1_name="ANNA", character_2_name="BEN", character_1_gender=g1, character_2_gender=g2)


LINES = [RehearsalLine(index=0, character="BEN", text="Hi"), RehearsalLine(index=1, character="ANNA", text="Hi"),
         RehearsalLine(index=2, character="MAID", text="Dinner")]


class Voices(unittest.TestCase):
    def test_four_voices_two_of_each(self):
        self.assertEqual(len(VOICES), 4)
        self.assertEqual(sorted(v.gender for v in VOICES), ["female", "female", "male", "male"])

    def test_gender_from_scene_picks_first_voice_of_that_gender(self):
        v = default_voices(_scene("female", "male"), LINES, actor="ANNA")
        self.assertEqual(v["BEN"], next(x.id for x in VOICES if x.gender == "male"))

    def test_unknown_gender_alternates_and_never_repeats_within_a_scene(self):
        v = default_voices(_scene(), LINES, actor="ANNA")
        self.assertEqual(set(v), {"BEN", "MAID"})
        self.assertNotEqual(v["BEN"], v["MAID"])

    def test_actor_gets_no_voice(self):
        self.assertNotIn("ANNA", default_voices(_scene(), LINES, actor="ANNA"))
