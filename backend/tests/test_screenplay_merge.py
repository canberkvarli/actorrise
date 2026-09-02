"""The screenplay parser rejoins a speech another character interrupted.

Its `(CONT'D)` merge only rejoins a speech the LAYOUT split — a page break, an
action beat — and that the screenwriter marked as continuing. It could not see
the commonest split of all: somebody says one line back.

The gap had a measurable shape. Of 2,746 film and TV pieces deleted at the
75-word floor, 74% were 55-74 words, median 59, and not one was under 40. A
corpus does not pile up just beneath a bar by accident.

Bounds here are TIGHTER than the play parser's, because screen dialogue
alternates far faster. Measured over five real scripts:

    no merge                        29 kept
    play defaults (2, anchor 40)    55 kept  — +90%, but Fight Club's Jack and
                                      Bob come out as a single "monologue"
    1 interruption, anchor 60       36 kept  — +24%, and the output is Tyler's
                                      Raymond K. Hessel speech, Will's Harvard
                                      bar speech, Sean's lecture on trust

The looser setting wins on count and loses on truth, and a library full of
two-handers labelled monologues is worth less than a smaller honest one.
"""

import unittest

from app.services.extraction.screenplay_pdf_parser import segment_screenplay

CUE, DIALOG, ACTION = 252, 180, 108


def _run(words: int) -> str:
    return " ".join(
        f"and the {i} thing I have to tell you is that it cannot go on"
        for i in range(words)
    ) + "."


class ScreenplayMergeTests(unittest.TestCase):
    def test_a_one_line_interruption_does_not_end_the_speech(self):
        lines = [
            (CUE, "SEAN"), (DIALOG, _run(7)),
            (CUE, "VINNIE"), (DIALOG, "Because trust is important."),
            (CUE, "SEAN"), (DIALOG, _run(3)),
        ]
        out = segment_screenplay(lines, min_words=75, max_words=400)
        self.assertEqual(len(out), 1, "the speech should have been rejoined")
        self.assertIn("(Vinnie: Because trust is important.)", out[0]["text"])
        # The interruption is not the actor's to say, so it cannot pad the floor.
        self.assertNotIn("trust is important", out[0]["dialogue"])

    def test_two_interruptions_are_a_scene_not_a_speech(self):
        """Jack and Bob: the play parser's allowance of two merges this."""
        lines = [
            (CUE, "JACK"), (DIALOG, _run(7)),
            (CUE, "BOB"), (DIALOG, "I owned my own gym."),
            (CUE, "JACK"), (DIALOG, _run(2)),
            (CUE, "BOB"), (DIALOG, "We're still men."),
            (CUE, "JACK"), (DIALOG, _run(2)),
        ]
        out = segment_screenplay(lines, min_words=75, max_words=400)
        merged = [m for m in out if m["text"].count("(Bob:") > 1]
        self.assertEqual(merged, [], "two interruptions must not merge here")

    def test_short_replies_do_not_stitch_into_a_monologue(self):
        """No anchor: nobody has a real run of talking, so nothing merges."""
        lines = []
        for i in range(6):
            lines += [(CUE, "ALPHA"), (DIALOG, "I did not, I tell you, not once.")]
            lines += [(CUE, "BETA"), (DIALOG, "You did.")]
        out = segment_screenplay(lines, min_words=75, max_words=400)
        self.assertEqual(out, [], "a duologue must not become a monologue")

    def test_a_long_interruption_ends_the_speech(self):
        lines = [
            (CUE, "SEAN"), (DIALOG, _run(7)),
            (CUE, "VINNIE"), (DIALOG, _run(4)),
            (CUE, "SEAN"), (DIALOG, _run(3)),
        ]
        out = segment_screenplay(lines, min_words=75, max_words=400)
        self.assertTrue(all("(Vinnie:" not in m["text"] for m in out))

    def test_contd_still_merges_without_an_interruption(self):
        """The original layout-split merge must survive the refactor."""
        lines = [
            (CUE, "CHARLIE"), (DIALOG, _run(5)),
            (ACTION, "A computer chimes."),
            (CUE, "CHARLIE (CONT'D)"), (DIALOG, _run(5)),
        ]
        out = segment_screenplay(lines, min_words=75, max_words=400)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["character"], "Charlie")


if __name__ == "__main__":
    unittest.main()
