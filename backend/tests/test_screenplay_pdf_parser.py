"""Tests for the screenplay-aware segmentation core.

Synthetic lines mimic real ScriptSlug teleplay bands: action x0=108,
dialogue x0=180, parenthetical x0=204, CHARACTER cue x0=252, scene x0=54.
"""

import unittest

from app.services.extraction.screenplay_pdf_parser import (
    looks_like_cue,
    segment_screenplay,
)

ACTION, DIALOG, PAREN, CUE, SCENE = 108, 180, 204, 252, 54


class CueDetectionTests(unittest.TestCase):
    def test_plain_and_voiceover_cues(self):
        self.assertTrue(looks_like_cue("GREG"))
        self.assertTrue(looks_like_cue("RUE (V.O.)"))
        self.assertTrue(looks_like_cue("DR. EMERSON"))

    def test_dialogue_and_action_are_not_cues(self):
        self.assertFalse(looks_like_cue("I have like five people Gregging for me."))
        self.assertFalse(looks_like_cue("She turns and Don follows her into the apartment."))
        self.assertFalse(looks_like_cue("INT. HOSPITAL ROOM - NIGHT"))  # >4 words


class SegmentationTests(unittest.TestCase):
    def _mono(self, words):
        # build a long dialogue line of N words at the dialogue band
        return (DIALOG, " ".join(["word"] * words) + " and that is the whole truth of it.")

    def test_single_speaker_block_is_captured(self):
        lines = [
            (ACTION, "She enters the room and closes the door behind her."),
            (CUE, "MAEVE"),
            self._mono(50),
            (ACTION, "She walks out."),
        ]
        out = segment_screenplay(lines)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["character"], "Maeve")
        self.assertNotIn("She enters", out[0]["text"])
        self.assertNotIn("She walks out", out[0]["text"])

    def test_two_speakers_are_kept_separate_not_merged(self):
        lines = [
            (CUE, "TOM"), self._mono(50),
            (CUE, "GREG"), self._mono(50),
        ]
        out = segment_screenplay(lines)
        self.assertEqual(len(out), 2)
        self.assertEqual({m["character"] for m in out}, {"Tom", "Greg"})

    def test_wrylies_are_preserved_as_directions_not_split(self):
        lines = [
            (CUE, "RUE"),
            (DIALOG, "He knew he could do a better job " + "word " * 30),
            (PAREN, "(beat)"),
            (DIALOG, "than his dad, and that is the whole point of the story here."),
            (ACTION, "Cut to black."),
        ]
        out = segment_screenplay(lines)
        self.assertEqual(len(out), 1)                  # one continuous speech, not two
        self.assertIn("(beat)", out[0]["text"])        # direction preserved for italic render
        self.assertNotIn("(beat)", out[0]["dialogue"])  # spoken lines are clean

    def test_bracket_cue_becomes_parenthetical_direction(self):
        lines = [
            (CUE, "RUE"),
            (DIALOG, "I have waited my whole life to say this " + "word " * 30),
            (DIALOG, "[LAUGHTER] and here we finally are at the very end of it all."),
        ]
        out = segment_screenplay(lines)
        self.assertEqual(len(out), 1)
        self.assertIn("(LAUGHTER)", out[0]["text"])     # bracket normalised to paren
        self.assertNotIn("[", out[0]["text"])

    def test_action_between_cues_closes_the_block(self):
        lines = [
            (CUE, "DON"), self._mono(50),
            (ACTION, "He lights a cigarette and stares out the window for a while."),
            (DIALOG, "orphan dialogue with no speaker should be dropped entirely here."),
        ]
        out = segment_screenplay(lines)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["character"], "Don")

    def test_short_blocks_below_floor_are_dropped(self):
        lines = [(CUE, "PEGGY"), (DIALOG, "No, only my work.")]
        self.assertEqual(segment_screenplay(lines), [])


if __name__ == "__main__":
    unittest.main()
