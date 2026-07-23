"""Screenplay dialogue extraction must be lossless and action-free.

Prod bug (2026-07-23, user Ayush, scene 868): uploading a screenplay side dropped
short interjections ("Which one?", "Yeah.") and merged speakers, because the
`mode="full"` upload path lets an LLM transcribe the dialogue (LLMs summarize).
The deterministic `parse_dialogue` keeps every line, but for screenplay format it
leaked scene headings ("EXT. GARDEN - NIGHT" became a character), action lines
("Rachel takes the camera out of her bag."), and page numbers ("22..") into the
dialogue.

These tests pin the hardened deterministic behavior on Ayush's actual side, so it
can serve as the lossless primary line source for screenplay uploads.
"""

import unittest

from app.services.script_parser import (
    parse_dialogue,
    filter_two_person_scenes,
    _recover_dropped_dialogue,
)

# A faithful excerpt of the uploaded side (Ryan - Side 1.pdf) reproducing every
# failure mode: scene heading, opening action, short interjections, an action
# line sandwiched between two same-speaker beats, and a (CONT'D) cue.
SCREENPLAY = """EXT. GARDEN - NIGHT
Ryan and Rachel are sitting, closely, next to each other on a
park bench. It's a beautiful starry night. A small house is a
little distance across from them. Ryan points towards it.
RYAN
You see that house over there?
RACHEL
Which one?
RYAN
The one with the broken roof.
RACHEL
Yeah.
RYAN
That's where I used to live. I used to fetch my baby brother, run to
this very park with him and we would play soccer or rugby.
(beat)
I miss him so much.
RACHEL
Where is he?
RYAN
(looks up)
Probably looking down on me right now, smiling because I'm finally
happy again.
RACHEL
(sympathetic)
I'm sorry.
Rachel takes the camera out of her bag. Presses record and
points it at Ryan.
RACHEL (CONT'D)
Okay. What would you tell him if he was right here?

22..
RYAN
You know I'm much more comfortable behind the camera.
"""

CHARACTERS = ["RYAN", "RACHEL"]


def _all_lines(sections):
    return [ln for sec in sections for ln in sec["lines"]]


class ScreenplayLosslessTests(unittest.TestCase):
    def setUp(self):
        self.sections = parse_dialogue(SCREENPLAY, character_names=CHARACTERS)
        self.lines = _all_lines(self.sections)
        self.speakers = {ln["character"] for ln in self.lines}
        self.blob = " ".join(ln["text"] for ln in self.lines)

    def test_scene_heading_is_not_a_character(self):
        self.assertNotIn("EXT", self.speakers)
        self.assertNotIn("GARDEN - NIGHT", self.blob)

    def test_only_the_two_real_characters_speak(self):
        self.assertEqual(self.speakers, {"RYAN", "RACHEL"})

    def test_short_interjections_are_kept(self):
        # These are exactly the lines the LLM dropped.
        self.assertIn("Which one?", self.blob)
        self.assertIn("Yeah.", self.blob)

    def test_action_lines_are_not_dialogue(self):
        # Opening action + the camera action sandwiched between Rachel's beats.
        self.assertNotIn("takes the camera", self.blob)
        self.assertNotIn("points it at Ryan", self.blob)
        self.assertNotIn("sitting, closely", self.blob)

    def test_page_numbers_are_stripped(self):
        self.assertNotIn("22..", self.blob)

    def test_contd_cue_resumes_the_same_character(self):
        # "RACHEL (CONT'D)" must count as RACHEL, not a new character named
        # "RACHEL (CONT'D)", and its line must be present.
        self.assertIn("Okay. What would you tell him if he was right here?", self.blob)
        self.assertNotIn("(CONT'D)", " ".join(self.speakers))

    def test_two_person_scene_survives_filter(self):
        two = filter_two_person_scenes(self.sections, min_lines=4)
        self.assertEqual(len(two), 1)
        self.assertGreaterEqual(len(two[0]["lines"]), 8)


class LosslessGuardTests(unittest.TestCase):
    """The guard that repairs LLM extraction after the fact."""

    # A lossy AI extraction of SCREENPLAY: it merged Ryan's opening beats and
    # dropped "Which one?" and "Yeah." (exactly Ayush's failure).
    LOSSY_AI_SCENE = {
        "title": "Heartfelt Reflection",
        "character_1": "RYAN",
        "character_2": "RACHEL",
        "lines": [
            {"character": "RYAN", "text": "You see that house over there? The one with the broken roof.", "stage_direction": None},
            {"character": "RYAN", "text": "That's where I used to live. I miss him so much.", "stage_direction": None},
            {"character": "RACHEL", "text": "Where is he?", "stage_direction": None},
            {"character": "RYAN", "text": "Probably looking down on me right now, smiling because I'm finally happy again.", "stage_direction": None},
            {"character": "RACHEL", "text": "I'm sorry.", "stage_direction": None},
        ],
    }

    def test_guard_recovers_dropped_lines_from_source(self):
        recovered = _recover_dropped_dialogue([dict(self.LOSSY_AI_SCENE)], SCREENPLAY)
        blob = " ".join(l["text"] for l in recovered[0]["lines"])
        self.assertIn("Which one?", blob)
        self.assertIn("Yeah.", blob)
        self.assertGreater(len(recovered[0]["lines"]), len(self.LOSSY_AI_SCENE["lines"]))

    def test_guard_does_not_leak_action_when_repairing(self):
        recovered = _recover_dropped_dialogue([dict(self.LOSSY_AI_SCENE)], SCREENPLAY)
        blob = " ".join(l["text"] for l in recovered[0]["lines"])
        self.assertNotIn("takes the camera", blob)

    def test_guard_preserves_scene_metadata(self):
        recovered = _recover_dropped_dialogue([dict(self.LOSSY_AI_SCENE)], SCREENPLAY)
        self.assertEqual(recovered[0]["title"], "Heartfelt Reflection")
        self.assertEqual(recovered[0]["character_1"], "RYAN")

    def test_guard_leaves_a_good_extraction_alone(self):
        # When the AI already has all the lines, don't churn/replace them.
        good = parse_dialogue(SCREENPLAY, character_names=CHARACTERS)
        good_lines = [l for sec in good for l in sec["lines"]]
        good_scene = {"title": "X", "character_1": "RYAN", "character_2": "RACHEL",
                      "lines": [dict(l, character=l["character"]) for l in good_lines]}
        before = len(good_scene["lines"])
        recovered = _recover_dropped_dialogue([dict(good_scene)], SCREENPLAY)
        self.assertEqual(len(recovered[0]["lines"]), before)


if __name__ == "__main__":
    unittest.main()
