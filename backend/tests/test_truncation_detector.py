"""Tests for the monologue truncation/artifact detector.

Audit found 232 monologues ending without terminal punctuation (41 clearly cut
mid-sentence) and 40 with screenplay artifacts. The detector powers the
read-only report in scripts/audit_truncated_monologues.py; poems that
legitimately end on an unpunctuated capitalized word must NOT be flagged as
hard cutoffs.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from audit_truncated_monologues import truncation_reasons  # noqa: E402


class TruncationReasonsTests(unittest.TestCase):
    def test_clean_text_has_no_reasons(self):
        self.assertEqual(truncation_reasons("To be, or not to be. That is the question."), [])

    def test_ends_with_question_mark_is_clean(self):
        self.assertEqual(truncation_reasons("What dreams may come?"), [])

    def test_ends_with_quote_after_period_is_clean(self):
        self.assertEqual(truncation_reasons('And then she said, "I am done."'), [])

    def test_lowercase_ending_is_hard_cutoff(self):
        # id 9738 in prod: ends "...I could be like Frank but bigger"
        self.assertEqual(
            truncation_reasons("One day I could be somebody. I could be like Frank but bigger"),
            ["hard_cutoff"],
        )

    def test_comma_ending_is_hard_cutoff(self):
        self.assertEqual(
            truncation_reasons("When I was at the school house. Well,"),
            ["hard_cutoff"],
        )

    def test_capitalized_ending_is_soft_no_punct_not_hard(self):
        # Poem-style ("...pleased at the threshold of May") — needs human eyes,
        # must not land in the hard-cutoff bucket.
        self.assertEqual(
            truncation_reasons("Who hears thee not pleased at the threshold of May"),
            ["soft_no_punct"],
        )

    def test_unclosed_stage_direction_at_end(self):
        # id 3701 in prod: ends inside "[Stopping suddenly and staring at"
        self.assertEqual(
            truncation_reasons("He imposes before he will [Stopping suddenly and staring at"),
            ["unclosed_direction"],
        )
        self.assertEqual(
            truncation_reasons("Through bad morals and worse cookery. (_Enter the"),
            ["unclosed_direction"],
        )

    def test_screenplay_artifacts(self):
        self.assertEqual(
            truncation_reasons("BOB (CONT'D)\nI never asked for this. It ends today."),
            ["screenplay_artifact"],
        )
        self.assertEqual(
            truncation_reasons("INT. FARMHOUSE - NIGHT\nI never asked for this. It ends today."),
            ["screenplay_artifact"],
        )

    def test_artifact_and_cutoff_both_reported(self):
        reasons = truncation_reasons("MARY (V.O.)\nAnd that was when I finally")
        self.assertIn("screenplay_artifact", reasons)
        self.assertIn("hard_cutoff", reasons)


if __name__ == "__main__":
    unittest.main()
