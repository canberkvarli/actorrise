import unittest
from types import SimpleNamespace
from unittest import mock

from app.services.rehearsal import voices
from app.services.rehearsal.contract import RehearsalLine
from app.services.rehearsal.voices import age_decade, default_voices


def _scene(g1=None, g2=None):
    return SimpleNamespace(character_1_name="ANNA", character_2_name="BEN", character_1_gender=g1, character_2_gender=g2)


LINES = [RehearsalLine(index=0, character="BEN", text="Hi"), RehearsalLine(index=1, character="ANNA", text="Hi"),
         RehearsalLine(index=2, character="MAID", text="Dinner")]


class OpenaiList(unittest.TestCase):
    """The list a deploy without a Gemini key keeps."""

    def setUp(self):
        self.p = mock.patch.object(voices, "VOICES", voices._OPENAI)
        self.p.start()

    def tearDown(self):
        self.p.stop()

    def test_gender_from_scene_picks_first_voice_of_that_gender(self):
        v = default_voices(_scene("female", "male"), LINES, actor="ANNA")
        self.assertEqual(v["BEN"], next(x.id for x in voices.VOICES if x.gender == "male"))

    def test_unknown_gender_alternates_and_never_repeats_within_a_scene(self):
        v = default_voices(_scene(), LINES, actor="ANNA")
        self.assertEqual(set(v), {"BEN", "MAID"})
        self.assertNotEqual(v["BEN"], v["MAID"])

    def test_actor_gets_no_voice(self):
        self.assertNotIn("ANNA", default_voices(_scene(), LINES, actor="ANNA"))


class GeminiList(unittest.TestCase):
    def setUp(self):
        self.p = mock.patch.object(voices, "VOICES", voices._GEMINI)
        self.p.start()

    def tearDown(self):
        self.p.stop()

    def test_ten_voices_five_of_each_each_with_a_label_and_a_stand_in(self):
        g = voices._GEMINI
        self.assertEqual(len(g), 10)
        self.assertEqual(sorted(v.gender for v in g), ["female"] * 5 + ["male"] * 5)
        self.assertEqual(len({v.id for v in g}), 10)
        for v in g:
            self.assertTrue(v.label.startswith(f"{v.id} · "), v.label)
            self.assertTrue(v.stand_in, v.id)
        # Young to old on both sides.
        for gender in ("female", "male"):
            ages = {v.age for v in g if v.gender == gender}
            self.assertEqual((min(ages), max(ages)), (2, 5))

    def test_the_reading_casts_the_part(self):
        lines = [RehearsalLine(index=0, character="ESTHER", text="No."), RehearsalLine(index=1, character="MARK", text="Ha.")]
        scene = SimpleNamespace(character_1_name="ESTHER", character_2_name="MARK", character_1_gender=None, character_2_gender=None)
        mark = {"name": "Mark", "gender": "male", "age_range": "40s", "relationship": "Esther's date",
                "wants": "", "temperament": "joking, anxious, charming"}
        self.assertEqual(default_voices(scene, lines, "ESTHER", [mark])["MARK"], "Puck")
        old = dict(mark, age_range="60s", temperament="gruff and weary")
        self.assertEqual(default_voices(scene, lines, "ESTHER", [old])["MARK"], "Algenib")
        young = dict(mark, age_range="early 20s", temperament="nervous, eager")
        self.assertEqual(default_voices(scene, lines, "ESTHER", [young])["MARK"], "Fenrir")
        esther = {"name": "ESTHER", "gender": "female", "age_range": "40s", "relationship": "",
                  "wants": "", "temperament": "guarded, blunt"}
        self.assertEqual(default_voices(scene, lines, "MARK", [mark, esther])["ESTHER"], "Kore")

    def test_the_reading_beats_the_extractors_gender_and_no_voice_is_shared(self):
        scene = _scene("female", "female")  # the extractor thought BEN was a woman
        ben = {"name": "BEN", "gender": "male", "age_range": "30s", "temperament": "warm, kind"}
        maid = {"name": "MAID", "gender": "male", "age_range": "30s", "temperament": "warm, kind"}
        v = default_voices(scene, LINES, "ANNA", [ben, maid])
        self.assertEqual(v["BEN"], "Achird")
        self.assertNotEqual(v["MAID"], v["BEN"])
        self.assertEqual(voices.voice_by_id(v["MAID"]).gender, "male")

    def test_an_unknown_gender_in_the_reading_still_gets_a_voice(self):
        v = default_voices(_scene(), LINES, "ANNA", [{"name": "BEN", "gender": "unknown", "age_range": ""}])
        self.assertIn(v["BEN"], {x.id for x in voices._GEMINI})

    def test_age_decade(self):
        self.assertEqual(age_decade("40s"), 4)
        self.assertEqual(age_decade("late 30s"), 3)
        self.assertEqual(age_decade("teens"), 1)
        self.assertEqual(age_decade("elderly"), 6)
        self.assertEqual(age_decade("middle-aged"), 4)
        self.assertIsNone(age_decade(""))
        self.assertIsNone(age_decade("unclear"))
