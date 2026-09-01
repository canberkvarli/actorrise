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
            self._mono(80),
            (ACTION, "She walks out."),
        ]
        out = segment_screenplay(lines)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["character"], "Maeve")
        self.assertNotIn("She enters", out[0]["text"])
        self.assertNotIn("She walks out", out[0]["text"])

    def test_two_speakers_are_kept_separate_not_merged(self):
        lines = [
            (CUE, "TOM"), self._mono(80),
            (CUE, "GREG"), self._mono(80),
        ]
        out = segment_screenplay(lines)
        self.assertEqual(len(out), 2)
        self.assertEqual({m["character"] for m in out}, {"Tom", "Greg"})

    def test_wrylies_are_preserved_as_directions_not_split(self):
        lines = [
            (CUE, "RUE"),
            (DIALOG, "He knew he could do a better job " + "word " * 70),
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
            (DIALOG, "I have waited my whole life to say this " + "word " * 70),
            (DIALOG, "[LAUGHTER] and here we finally are at the very end of it all."),
        ]
        out = segment_screenplay(lines)
        self.assertEqual(len(out), 1)
        self.assertIn("(LAUGHTER)", out[0]["text"])     # bracket normalised to paren
        self.assertNotIn("[", out[0]["text"])

    def test_action_between_cues_closes_the_block(self):
        lines = [
            (CUE, "DON"), self._mono(80),
            (ACTION, "He lights a cigarette and stares out the window for a while."),
            (DIALOG, "orphan dialogue with no speaker should be dropped entirely here."),
        ]
        out = segment_screenplay(lines)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["character"], "Don")

    def test_short_blocks_below_floor_are_dropped(self):
        lines = [(CUE, "PEGGY"), (DIALOG, "No, only my work.")]
        self.assertEqual(segment_screenplay(lines), [])

    def test_contd_continuation_merges_across_action(self):
        # The Whale: one continuous Charlie speech the layout split with an action
        # beat and a "(CONT'D)" re-cue. Each half is under the floor; merged it
        # clears it as a single monologue.
        lines = [
            (CUE, "CHARLIE"), self._mono(50),
            (ACTION, "A computer chimes. The image resolves into ocean waves."),
            (CUE, "CHARLIE (CONT'D)"), self._mono(50),
        ]
        out = segment_screenplay(lines, min_words=80)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["character"], "Charlie")
        self.assertGreaterEqual(out[0]["word_count"], 100)

    def test_contd_merge_handles_curly_apostrophe(self):
        # Scripts overwhelmingly typeset the marker with a curly quote; matching
        # only the straight one silently disabled the merge on every such script.
        lines = [
            (CUE, "CHARLIE (V.O.)"), self._mono(50),
            (None, None),                       # page break
            (CUE, "CHARLIE (V.O.) (CONT’D)"), self._mono(50),
        ]
        out = segment_screenplay(lines, min_words=80)
        self.assertEqual(len(out), 1)
        self.assertGreaterEqual(out[0]["word_count"], 100)

    def test_contd_of_a_different_speaker_does_not_merge(self):
        # A (CONT'D) marker only continues the SAME character; a different name
        # closes the previous speech.
        lines = [
            (CUE, "CHARLIE"), self._mono(50),
            (ACTION, "She crosses the room and sits."),
            (CUE, "MARY (CONT'D)"), self._mono(50),
        ]
        out = segment_screenplay(lines, min_words=40)
        self.assertEqual({m["character"] for m in out}, {"Charlie", "Mary"})


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


class DoubledGlyphTests(unittest.TestCase):
    """A ScriptSlug PDF vintage renders type double-struck; extraction emits each
    glyph twice. De-doubling before segmentation lets the cue, the (CONT'D)
    marker and the dialogue parse as if the PDF had extracted cleanly."""

    def test_doubled_line_detected_and_folded(self):
        from app.services.extraction.screenplay_pdf_parser import (_dedouble,
                                                                   _line_is_doubled)
        self.assertTrue(_line_is_doubled("GGLLOORRIIAA"))
        self.assertEqual(_dedouble("GGLLOORRIIAA"), "GLORIA")
        self.assertEqual(_dedouble("CCOONNTT'DD"), "CONT'D")

    def test_normal_line_untouched(self):
        from app.services.extraction.screenplay_pdf_parser import (_dedouble_lines,
                                                                   _line_is_doubled)
        line = "The sound of a computer chiming fills the empty room."
        self.assertFalse(_line_is_doubled(line))
        self.assertEqual(_dedouble_lines([(108, line)]), [(108, line)])

    def test_doubled_cue_merges_via_dedoubled_contd(self):
        from app.services.extraction.screenplay_pdf_parser import (_dedouble_lines,
                                                                   segment_screenplay)
        long_dlg = " ".join(["word"] * 50) + " and that is the whole truth of it."
        lines = _dedouble_lines([
            (252, "GGLLOORRIIAA"), (180, long_dlg),
            (108, "She pauses, gathering herself before continuing."),
            (252, "GGLLOORRIIAA ((CCOONNTT'DD))"), (180, long_dlg),
        ])
        out = segment_screenplay(lines, min_words=80)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["character"], "Gloria")


class UnusableLayoutTests(unittest.TestCase):
    """Not every PDF behind a script URL is a formatted screenplay.

    Each case below used to return a bare [] — the same value a well-parsed
    script with no long speeches returns. In a sample of well-known films about
    a quarter hit one of these, so a bulk run would have dropped them silently.
    """

    def _long_line(self, x0, words=90):
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
