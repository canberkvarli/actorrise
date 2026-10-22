"""The rule parser on a script written in a word processor: NAME: line, one paragraph each.

User script 132, "Almost a Therapist", came back with Mark's routine in
Esther's mouth ("MARK (continuing his act):" was not a cue), Esther's "Stop
it." swallowed into that, "They stop walking." spoken by Mark, "Mark continues
with his act." run into his line, and the row of dots under the last line read
as part of Esther's "I said no." The model reads every scene now, but the
rules are what a scene falls back to, so they get the obvious fixes too.
"""

import unittest
from pathlib import Path

from app.services.scene_map import detect_scene_spans
from app.services.script_parser import (
    _is_narrative_direction,
    _preprocess_text,
    _strip_production_marks,
    parse_dialogue,
    whole_scenes,
)

FIXTURE = Path(__file__).parent / "fixtures" / "scene_reader" / "almost_a_therapist.txt"


def _lines():
    raw = FIXTURE.read_text()
    [scene] = whole_scenes(detect_scene_spans(_preprocess_text(_strip_production_marks(raw))))
    return scene["lines"]


def _find(lines, start):
    return next(l for l in lines if l["text"].startswith(start))


class TheTherapistScene(unittest.TestCase):

    def setUp(self):
        self.lines = _lines()

    def test_a_cue_with_a_note_is_a_cue(self):
        routine = _find(self.lines, "“Then the other afternoon")
        self.assertEqual(routine["character"], "MARK")
        self.assertEqual(routine["stage_direction"], "continuing his act")
        self.assertNotIn("MARK", routine["text"])

    def test_esther_keeps_her_lines(self):
        esther = [l["text"] for l in self.lines if l["character"] == "ESTHER"]
        self.assertIn("This is not funny Mark.", esther)
        self.assertIn("Stop it.", esther)

    def test_a_full_stop_cue_is_a_cue(self):
        self.assertEqual(_find(self.lines, "I mean Stop.")["character"], "ESTHER")

    def test_business_between_speeches_is_not_spoken(self):
        for line in self.lines:
            self.assertNotIn("They stop walking", line["text"])
            self.assertNotIn("Mark continues with his act", line["text"])
            self.assertNotIn("Esther is in the park", line["text"])

    def test_business_rides_on_the_line_after_it(self):
        self.assertEqual(_find(self.lines, "Breaks my heart")["stage_direction"], "They stop walking.")
        self.assertEqual(
            _find(self.lines, "“So yesterday")["stage_direction"], "Mark continues with his act."
        )
        self.assertEqual(self.lines[0]["stage_direction"], "Esther is in the park with Mark.")

    def test_the_line_before_the_business_is_left_alone(self):
        self.assertEqual(_find(self.lines, "Oh honey")["text"], "Oh honey … I’m so sorry.")
        self.assertIsNone(_find(self.lines, "Oh honey")["stage_direction"])

    def test_mark_still_talking_is_still_mark(self):
        tail = _find(self.lines, "“Besides")
        self.assertEqual(tail["character"], "MARK")
        self.assertTrue(tail["text"].endswith("You know something Esther. Being you is a dream."))

    def test_the_dot_leaders_are_gone(self):
        self.assertEqual(self.lines[-1]["text"], "I said no.")

    def test_nothing_is_lost(self):
        self.assertEqual(len(self.lines), 37)


class DotLeaders(unittest.TestCase):

    def test_on_the_same_line(self):
        self.assertEqual(_strip_production_marks("ESTHER: I said no. …………………………"), "ESTHER: I said no.")
        self.assertEqual(_strip_production_marks("End.........."), "End.")

    def test_one_ellipsis_is_somebody_trailing_off(self):
        self.assertEqual(_strip_production_marks("ESTHER: Buster died …"), "ESTHER: Buster died …")
        self.assertEqual(_strip_production_marks("MARK: Well..."), "MARK: Well...")


class SidesCues(unittest.TestCase):

    SIDES = (
        "MAYA (beat): You kept it.\n"
        "THEO: Of course I kept it.\n"
        "MAYA, quietly: I thought you'd throw it out.\n"
        "THEO: (softly) I almost did.\n"
        "MAYA (CONT'D): And now?\n"
    )

    def setUp(self):
        self.lines = [l for s in parse_dialogue(self.SIDES) for l in s["lines"]]

    def test_each_note_rides_on_its_line(self):
        self.assertEqual(
            [(l["character"], l["text"], l["stage_direction"]) for l in self.lines],
            [
                ("MAYA", "You kept it.", "beat"),
                ("THEO", "Of course I kept it.", None),
                ("MAYA", "I thought you'd throw it out.", "quietly"),
                ("THEO", "I almost did.", "softly"),
                ("MAYA", "And now?", None),
            ],
        )


class NarrativeDirection(unittest.TestCase):
    CAST = {"MARK", "ESTHER"}

    def test_what_happens(self):
        for s in ("Mark continues with his act.", "They stop walking.",
                  "Esther is in the park with Mark.", "Mark and Esther sit down."):
            with self.subTest(s):
                self.assertTrue(_is_narrative_direction(s, self.CAST))

    def test_what_is_said(self):
        for s in ("You know something Esther. Being you is a dream.",
                  "What I really wanted to say was “Listen little lady.”",
                  "“So yesterday my day was shit.”", "He was my brother.",
                  "Mark, are you listening?", "Esther left me."):
            with self.subTest(s):
                self.assertFalse(_is_narrative_direction(s, self.CAST))

    def test_a_play_with_cues_on_their_own_line_is_untouched(self):
        play = "HAMLET\nShe goes to the window.\nOPHELIA\nMy lord?\nHAMLET\nThey stop walking.\n"
        lines = [l for s in parse_dialogue(play) for l in s["lines"]]
        self.assertEqual(lines[0]["text"], "She goes to the window.")
        self.assertEqual(lines[-1]["text"], "They stop walking.")


if __name__ == "__main__":
    unittest.main()
