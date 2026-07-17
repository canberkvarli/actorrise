"""Tests for the truncation/artifact repair transforms.

Repairs the 202 hard-flagged monologues from the 2026-07 audit: screenplay
artifacts are stripped, texts that end inside an unclosed stage direction or
mid-sentence are trimmed back to the last complete sentence. A repair is only
auto-applied when enough of the piece survives; everything else goes to the
existing review queue instead of being silently mangled.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from repair_truncated_monologues import (  # noqa: E402
    propose_repair,
    strip_screenplay_artifacts,
    trim_incomplete_tail,
)


class StripScreenplayArtifactsTests(unittest.TestCase):
    def test_contd_speaker_header_line_is_removed(self):
        text = "BOB (CONT'D)\nI never asked for this. It ends today."
        self.assertEqual(strip_screenplay_artifacts(text), "I never asked for this. It ends today.")

    def test_scene_heading_line_is_removed(self):
        text = "INT. FARMHOUSE - NIGHT\nI never asked for this. It ends today."
        self.assertEqual(strip_screenplay_artifacts(text), "I never asked for this. It ends today.")

    def test_vo_token_is_removed_inline(self):
        text = "MARY (V.O.)\nAnd that was the last time I saw her."
        self.assertEqual(strip_screenplay_artifacts(text), "And that was the last time I saw her.")

    def test_prose_with_normal_parens_is_untouched(self):
        text = "I told him (and I meant it) that we were done. He laughed."
        self.assertEqual(strip_screenplay_artifacts(text), text)


class TrimIncompleteTailTests(unittest.TestCase):
    def test_terminal_text_is_unchanged(self):
        text = "To be, or not to be. That is the question."
        self.assertEqual(trim_incomplete_tail(text), text)

    def test_mid_sentence_tail_is_trimmed_to_last_sentence(self):
        self.assertEqual(
            trim_incomplete_tail("First I made peace with it. And then when I finally"),
            "First I made peace with it.",
        )

    def test_unclosed_direction_is_cut_then_sentence_trimmed(self):
        self.assertEqual(
            trim_incomplete_tail("Ruined through bad morals and worse cookery. (_Enter the"),
            "Ruined through bad morals and worse cookery.",
        )
        self.assertEqual(
            trim_incomplete_tail("He is done. He imposes before he will [Stopping suddenly and staring at"),
            "He is done.",
        )

    def test_trailing_comma_is_trimmed(self):
        self.assertEqual(
            trim_incomplete_tail("I quit quite a bit at the school house. Well,"),
            "I quit quite a bit at the school house.",
        )

    def test_quote_counts_as_sentence_end(self):
        self.assertEqual(
            trim_incomplete_tail('She said, "I am done." And then when I'),
            'She said, "I am done."',
        )

    def test_no_sentence_end_anywhere_returns_empty(self):
        self.assertEqual(trim_incomplete_tail("thee not pleased at the threshold of May"), "")


class ProposeRepairTests(unittest.TestCase):
    LONG = ("I have carried this for years and I am done carrying it. " * 4).strip()  # 44 words

    def test_clean_text_proposes_no_change(self):
        new, actions = propose_repair(self.LONG)
        self.assertEqual(new, self.LONG)
        self.assertEqual(actions, [])

    def test_cutoff_tail_is_repaired(self):
        new, actions = propose_repair(self.LONG + " And then when I finally")
        self.assertEqual(new, self.LONG)
        self.assertIn("trimmed_tail", actions)

    def test_artifact_is_repaired(self):
        new, actions = propose_repair("BOB (CONT'D)\n" + self.LONG)
        self.assertEqual(new, self.LONG)
        self.assertIn("stripped_artifacts", actions)

    def test_too_destructive_repair_is_rejected(self):
        # Only one short sentence survives — send to review, don't mangle.
        text = "So short. " + "then it rambles on with no ending whatsoever and just stops mid" * 3
        new, actions = propose_repair(text)
        self.assertIsNone(new)
        self.assertIn("needs_review", actions)

    def test_unfixable_returns_review(self):
        new, actions = propose_repair("thee not pleased at the threshold of May")
        self.assertIsNone(new)
        self.assertIn("needs_review", actions)

    def test_ocr_garbage_goes_to_review_not_autofix(self):
        # Real prod case (id 11895, scanned screenplay): the tail trims to a
        # period but what survives is still OCR noise — never auto-apply that.
        garbage = self.LONG + " ' .. ...___;' I theirs, I l ' mp #1888 - Changes 6/4/59 t . ; ' 439 ' ; to and to"
        new, actions = propose_repair(garbage)
        self.assertIsNone(new)
        self.assertIn("needs_review", actions)


if __name__ == "__main__":
    unittest.main()
