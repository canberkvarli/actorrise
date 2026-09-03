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


class InterjectionTests(unittest.TestCase):
    """The speaker must be counted, or a correct segmentation reads as drift.

    A merged monologue contains "(HORATIO: Ay, my lord.)". The segmenter splits
    that into {"speaker": "HORATIO", "text": "Ay, my lord."} — which is right —
    so joining only the TEXT fields loses the name.

    That mistake shipped and hard-rejected 352 of 838 rows on the first
    segmentation pass after the merge landed. 42% is not a quality problem, it
    is exactly the share of rows carrying an interjection.
    """

    MERGED = (
        "I am very glad to see you. But what, in faith, make you from "
        "Wittenberg? (HORATIO: A truant disposition, good my lord.) I would not "
        "hear your enemy say so, nor shall you do my ear that violence."
    )

    def _joined(self, segments, with_speaker: bool) -> str:
        if with_speaker:
            return " ".join(
                f"{s.get('speaker') or ''} {s['text']}".strip() for s in segments
            )
        return " ".join(s["text"] for s in segments)

    def setUp(self):
        self.segments = [
            {"type": "dialogue", "text": "I am very glad to see you. But what, "
                                         "in faith, make you from Wittenberg?"},
            {"type": "interjection", "speaker": "HORATIO",
             "text": "A truant disposition, good my lord."},
            {"type": "dialogue", "text": "I would not hear your enemy say so, "
                                         "nor shall you do my ear that violence."},
        ]

    def test_including_the_speaker_reproduces_the_text(self):
        ratio = segment_fidelity(self.MERGED, self._joined(self.segments, True))
        self.assertGreaterEqual(ratio, SEGMENT_MIN_FIDELITY)

    def test_dropping_the_speaker_looks_like_drift(self):
        """The bug, pinned: this is what a correct segmentation used to score."""
        ratio = segment_fidelity(self.MERGED, self._joined(self.segments, False))
        self.assertLess(ratio, 1.0)

    def test_a_direction_has_no_speaker_and_still_matches(self):
        text = "There, my blessing with you. (Laying his hand on his head.) And these precepts."
        segments = [
            {"type": "dialogue", "text": "There, my blessing with you."},
            {"type": "direction", "text": "(Laying his hand on his head.)"},
            {"type": "dialogue", "text": "And these precepts."},
        ]
        self.assertGreaterEqual(
            segment_fidelity(text, self._joined(segments, True)),
            SEGMENT_MIN_FIDELITY,
        )


class LongTextTests(unittest.TestCase):
    """difflib's autojunk destroys the ratio on long character sequences.

    SequenceMatcher treats any element appearing in more than 1% of a sequence
    longer than 200 as junk. On a string of CHARACTERS that is every common
    letter, so the ratio collapses. A 500-character monologue compared against a
    470-character reconstruction of itself scored 0.089, and the hard gate
    rejected 352 of 838 correct segmentations.

    Every earlier test here used short strings or identical ones, and identical
    strings short-circuit to 1.0 whatever the junk heuristic decides. That is
    why a real measure looked fine in the suite and failed on real monologues.
    """

    LONG = (
        "I conjure you, by that which you profess, however you come to know it, "
        "answer me: though you untie the winds and let them fight against the "
        "churches, though the yesty waves confound and swallow navigation up, "
        "though bladed corn be lodged and trees blown down, though castles "
        "topple on their warders heads, though palaces and pyramids do slope "
        "their heads to their foundations, though the treasure of nature's "
        "germens tumble all together, even till destruction sicken, answer me."
    )

    def test_a_long_speech_matches_itself_minus_one_direction(self):
        without = self.LONG.replace("however you come to know it, ", "")
        self.assertGreater(len(self.LONG), 200, "must exceed difflib's autojunk cutoff")
        self.assertGreaterEqual(
            segment_fidelity(self.LONG, without), SEGMENT_MIN_FIDELITY,
            "autojunk is back: a long speech no longer matches itself",
        )

    def test_a_long_speech_still_fails_against_half_of_itself(self):
        half = self.LONG[: len(self.LONG) // 2]
        self.assertLess(segment_fidelity(self.LONG, half), SEGMENT_MIN_FIDELITY)

    def test_a_long_speech_fails_against_unrelated_text(self):
        self.assertLess(
            segment_fidelity(self.LONG, "the quick brown fox " * 25),
            SEGMENT_MIN_FIDELITY,
        )


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
