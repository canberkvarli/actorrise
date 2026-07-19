"""Tests for the AI monologue trim pass over the review queue.

433 queued pieces contain other speakers' lines, stage directions, or
screenplay action. The AI proposes the primary speaker's clean monologue;
code-side guards decide whether to auto-apply. The AI must never be trusted
to have quoted faithfully — accept_trim() rejects results whose words don't
come from the original.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from trim_review_monologues import accept_trim, parse_trim  # noqa: E402

ORIGINAL = (
    "I have carried this for years and I am done carrying it. " * 5
    + "Ruth. No, really I didn't. "
    + "You will hear me now and you will not look away from any of it. " * 3
)
CLEAN = (
    "I have carried this for years and I am done carrying it. " * 5
    + "You will hear me now and you will not look away from any of it. " * 3
).strip()


class ParseTrimTests(unittest.TestCase):
    def test_valid_payload(self):
        self.assertEqual(parse_trim('{"monologue": "To be or not to be."}'), "To be or not to be.")

    def test_null_monologue(self):
        self.assertIsNone(parse_trim('{"monologue": null}'))

    def test_bad_json(self):
        self.assertIsNone(parse_trim("not json"))
        self.assertIsNone(parse_trim(None))


class AcceptTrimTests(unittest.TestCase):
    def test_faithful_trim_is_accepted(self):
        self.assertTrue(accept_trim(ORIGINAL, CLEAN))

    def test_too_short_is_rejected(self):
        self.assertFalse(accept_trim(ORIGINAL, "I have carried this for years."))

    def test_hallucinated_text_is_rejected(self):
        invented = CLEAN + " Furthermore quantum blockchain synergy paradigm excellence unlocked today."
        self.assertFalse(accept_trim(ORIGINAL, invented))

    def test_empty_is_rejected(self):
        self.assertFalse(accept_trim(ORIGINAL, ""))
        self.assertFalse(accept_trim(ORIGINAL, None))


class CutAtFirstLeakTests(unittest.TestCase):
    def test_cut_before_leaked_cue(self):
        from trim_review_monologues import cut_at_first_leak
        text = "I don't trust that guy, and I never will. Amy. Don't-- Come on, don't be that way."
        self.assertEqual(cut_at_first_leak(text), "I don't trust that guy, and I never will.")

    def test_no_leak_returns_none(self):
        from trim_review_monologues import cut_at_first_leak
        self.assertIsNone(cut_at_first_leak("A clean speech with nothing to cut."))


if __name__ == "__main__":
    unittest.main()
