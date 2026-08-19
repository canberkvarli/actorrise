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


class CueNameTests(unittest.TestCase):
    def test_possessive_cue_is_not_mangled(self):
        from app.services.extraction.screenplay_pdf_parser import _clean_cue_name

        # str.title() capitalises after an apostrophe, and the result is shown
        # to the actor as the character name.
        self.assertEqual(_clean_cue_name("HOLLY'S THOUGHTS"), "Holly's Thoughts")
        self.assertEqual(_clean_cue_name("ELLIOT'S THOUGHTS"), "Elliot's Thoughts")

    def test_ordinary_cue_and_parenthetical(self):
        from app.services.extraction.screenplay_pdf_parser import _clean_cue_name

        self.assertEqual(_clean_cue_name("JESSEP"), "Jessep")
        self.assertEqual(_clean_cue_name("DIANA (V.O.)"), "Diana")


class UnusableLayoutTests(unittest.TestCase):
    """Not every PDF behind a script URL is a formatted screenplay.

    Each case below used to return a bare [] — the same value a well-parsed
    script with no long speeches returns. In a sample of well-known films about
    a quarter hit one of these, so a bulk run would have dropped them silently.
    """

    def _long_line(self, x0, words=60):
        return (x0, " ".join(["word"] * words) + " and that is the whole truth of it.")

    def test_unindented_document_yields_nothing(self):
        # 12 Angry Men: every line at the left margin, so the cue band lands at
        # ~18 and the derived dialogue window would run negative.
        lines = []
        for _ in range(6):
            lines += [(18, "JUROR EIGHT"), self._long_line(12)]
        self.assertEqual(segment_screenplay(lines), [])

    def test_dialogue_band_follows_the_text_not_a_fixed_offset(self):
        # Good Will Hunting: cue and dialogue indents nearly coincide, so a
        # hardcoded cue-110..cue-20 window misses the dialogue entirely.
        CUE_X, DLG_X = 306, 288
        lines = [
            (CUE_X, "SEAN"),
            self._long_line(DLG_X),
            (108, "He leaves."),
        ]
        monos = segment_screenplay(lines)
        self.assertEqual(len(monos), 1)
        self.assertEqual(monos[0]["character"], "Sean")


class StatusTests(unittest.TestCase):
    """extract_with_status() must name the failure, not just return []."""

    def test_no_cue_column_is_reported_as_layout_failure(self):
        from app.services.extraction import screenplay_pdf_parser as sp

        # Enough text to clear the text-layer guard, but no cue column.
        lines = [(12, " ".join(["word"] * 40)) for _ in range(300)]
        orig = sp.lines_from_pdf
        sp.lines_from_pdf = lambda *_a, **_k: lines
        try:
            monos, status = sp.extract_with_status("ignored.pdf")
        finally:
            sp.lines_from_pdf = orig
        self.assertEqual(monos, [])
        self.assertEqual(status, "not_screenplay_layout")

    def test_empty_text_layer_is_reported_not_treated_as_clean(self):
        from app.services.extraction import screenplay_pdf_parser as sp

        # A scan extracts to nothing. cid_ratio() is then 0/1 = 0.0, i.e. a
        # perfect score, so the OCR guard alone would pass it through.
        orig = sp.lines_from_pdf
        sp.lines_from_pdf = lambda *_a, **_k: []
        try:
            monos, status = sp.extract_with_status("scan.pdf")
        finally:
            sp.lines_from_pdf = orig
        self.assertEqual(monos, [])
        self.assertEqual(status, "no_text_layer")
        self.assertEqual(sp.cid_ratio([]), 0.0)  # the reason the guard misses it


if __name__ == "__main__":
    unittest.main()
