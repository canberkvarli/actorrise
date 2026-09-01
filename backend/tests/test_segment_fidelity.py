"""Segments must be the same words as the text, or they must not be written.

`text_segments` is a second, LLM-made copy of the monologue, and
`MonologueTextRenderer` shows the SEGMENTS whenever they exist — `text` is only
the fallback. So an unfaithful segmentation is not cosmetic: it is what the
actor reads.

The writer used to print `WARN len-drift` and store the row anyway. An audit of
14,914 segmented rows found 703 that disagreed with their own text, the worst
being excerpts ending in "..." whose segments carried a fluent continuation that
cannot be attributed to the playwright.

Rejecting leaves the column NULL and the reader falls back to `text`. A row we
cannot segment faithfully is better left unsegmented than segmented wrong.
"""

import unittest

from app.services.extraction.monologue_quality import (
    SEGMENT_MIN_FIDELITY,
    segment_fidelity,
)

TEXT = (
    "I have been thinking about my father a great deal lately. He was a hard "
    "man, and I spent most of my life trying to earn a word of praise that "
    "never came."
)


class SegmentFidelityTests(unittest.TestCase):
    def test_identical_text_is_perfect(self):
        self.assertEqual(segment_fidelity(TEXT, TEXT), 1.0)

    def test_split_into_segments_still_passes(self):
        """The real shape: the same words arriving as separate segments."""
        segments = " ".join([
            "I have been thinking about my father a great deal lately.",
            "He was a hard man, and I spent most of my life trying to earn a "
            "word of praise that never came.",
        ])
        self.assertGreaterEqual(segment_fidelity(TEXT, segments),
                                SEGMENT_MIN_FIDELITY)

    def test_punctuation_and_case_do_not_matter(self):
        noisy = TEXT.upper().replace(",", "").replace("'", "’")
        self.assertGreaterEqual(segment_fidelity(TEXT, noisy),
                                SEGMENT_MIN_FIDELITY)

    def test_a_dropped_sentence_fails(self):
        truncated = "I have been thinking about my father a great deal lately."
        self.assertLess(segment_fidelity(TEXT, truncated), SEGMENT_MIN_FIDELITY)

    def test_an_invented_continuation_fails(self):
        """The 292-row case: an excerpt that acquired words nobody wrote."""
        continued = TEXT + (
            " And now that he is gone I find myself repeating his gestures, "
            "his silences, the way he would look out of the window whenever he "
            "did not want to answer a question I had asked him."
        )
        self.assertLess(segment_fidelity(TEXT, continued), SEGMENT_MIN_FIDELITY)

    def test_empty_segments_fail(self):
        self.assertLess(segment_fidelity(TEXT, ""), SEGMENT_MIN_FIDELITY)


class ThresholdTests(unittest.TestCase):
    def test_threshold_is_shared_not_duplicated(self):
        """The writer rejects below this and the auditor flags below it.

        Two different numbers would have the auditor clearing rows the writer
        had just accepted, and the next writer run re-creating them, forever.
        """
        from scripts.audit_segment_integrity import MIN_FIDELITY

        self.assertIs(MIN_FIDELITY, SEGMENT_MIN_FIDELITY)

    def test_threshold_leaves_room_for_normalisation(self):
        # Strict equality would reject every legitimate multi-segment split.
        self.assertLess(SEGMENT_MIN_FIDELITY, 1.0)
        self.assertGreater(SEGMENT_MIN_FIDELITY, 0.8)


if __name__ == "__main__":
    unittest.main()
