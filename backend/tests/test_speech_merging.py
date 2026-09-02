"""A speech someone briefly interrupted is still one speech.

The cue splitter cuts at every cue, so

    HAMLET  Speak, I am bound to hear.
    GHOST   So art thou to revenge, when thou shalt hear.
    HAMLET  What?

arrives as two Hamlet fragments with somebody else between them, and both can
fall under the 75-word floor and vanish. That is how a real monologue becomes no
monologue at all, and it is the likeliest reason a play whose full text we hold
extracts almost nothing: Hedda Gabler had 2 searchable monologues, The Master
Builder 4, Rosmersholm 17.

The rule is not "merge whenever the speaker returns". The first cut of this did
that and turned 61 of Hamlet's 91 speeches into stitched-together dialogue —
Miss Tesman and Berta arriving as a "monologue". Three things bound it:

  * the interruption must be SHORT (MAX_INTERRUPTION_WORDS),
  * there must be few of them (MAX_INTERRUPTIONS),
  * and what is left must be MOSTLY one person, with a real run of talking in
    it somewhere (MAX_INTERJECTION_SHARE, MIN_ANCHOR_WORDS).

The interrupting line is kept inline as `(NAME: ...)` rather than dropped, so
the speech is not answering a question the reader cannot see. As a parenthetical
it cannot pad the word floor, it counts against the direction share, and the
segmenter can tag it as an interjection.
"""

import unittest

from app.services.extraction.plain_text_parser import PlainTextParser


def _run(words: int) -> str:
    """A continuous run of talking, comfortably over the anchor length."""
    return " ".join(
        f"and the {i} thing I have to say to you is that it will not do"
        for i in range(words)
    ) + "."


def _play(*speeches: tuple) -> str:
    return "\n\n".join(f"{name}:\n    {body}" for name, body in speeches)


FILLER = [("BETA", _run(6)), ("GAMMA", _run(6)), ("DELTA", _run(6)),
          ("EPSILON", _run(6)), ("ZETA", _run(6))]


class MergeTests(unittest.TestCase):
    def setUp(self):
        self.p = PlainTextParser()

    def _alpha(self, *speeches):
        out = self.p.extract_monologues(
            _play(*speeches, *FILLER), min_words=75, max_words=500)
        return [m for m in out if m["character"].lower() == "alpha"]

    def test_a_short_interruption_does_not_end_the_speech(self):
        found = self._alpha(
            ("ALPHA", _run(6)),
            ("BETA", "Ay, my lord."),
            ("ALPHA", _run(6)),
        )
        self.assertEqual(len(found), 1, "the speech should have been rejoined")
        self.assertIn("(BETA: Ay, my lord.)", found[0]["text"])

    def test_the_interruption_does_not_count_toward_the_floor(self):
        found = self._alpha(
            ("ALPHA", _run(6)),
            ("BETA", "Ay, my lord."),
            ("ALPHA", _run(6)),
        )
        self.assertNotIn("Ay, my lord", found[0]["dialogue"])
        self.assertEqual(found[0]["word_count"], len(found[0]["dialogue"].split()))

    def test_a_long_interruption_ends_the_speech(self):
        """Forty words back is not a beat, it is the other half of a scene."""
        found = self._alpha(
            ("ALPHA", _run(6)),
            ("BETA", _run(4)),
            ("ALPHA", _run(6)),
        )
        self.assertNotIn("BETA:", " ".join(m["text"] for m in found))

    def test_a_conversation_is_not_merged_into_a_monologue(self):
        """No anchor: three one-liners from ALPHA are not a speech.

        This is the Miss Tesman case — short replies either side of short
        replies, which the first version happily welded together.
        """
        found = self._alpha(
            ("ALPHA", "I did not."),
            ("BETA", "You did."),
            ("ALPHA", "I did not, I tell you."),
            ("BETA", "You did."),
            ("ALPHA", "Well, perhaps."),
        )
        self.assertEqual(found, [], "a duologue must not become a monologue")

    def test_interjections_are_capped_in_number(self):
        found = self._alpha(
            ("ALPHA", _run(6)), ("BETA", "One."),
            ("ALPHA", _run(6)), ("BETA", "Two."),
            ("ALPHA", _run(6)), ("BETA", "Three."),
            ("ALPHA", _run(6)), ("BETA", "Four."),
            ("ALPHA", _run(6)),
        )
        self.assertTrue(found)
        merged = found[0]["text"]
        self.assertLessEqual(
            merged.count("(BETA:"), PlainTextParser.MAX_INTERRUPTIONS,
            "more interruptions than the cap were absorbed",
        )


class LeadingNarrativeTests(unittest.TestCase):
    """Story explained first, speech second — keep the speech, cut the story."""

    def setUp(self):
        self.p = PlainTextParser()

    def _alpha(self, body):
        out = self.p.extract_monologues(
            _play(("ALPHA", body), *FILLER), min_words=75, max_words=500)
        found = [m for m in out if m["character"].lower() == "alpha"]
        self.assertTrue(found, "ALPHA was not extracted")
        return found[0]

    def test_scene_setting_before_the_speech_is_cut(self):
        scene = ("[A drawing room in the Tesman villa, furnished in dark "
                 "colours, with a glass door at the back leading out onto a "
                 "verandah and the garden beyond it, where the autumn leaves "
                 "have begun to fall across the gravel path.]")
        m = self._alpha(f"{scene} {_run(6)}")
        self.assertNotIn("drawing room", m["text"])
        self.assertNotIn("verandah", m["text"])
        self.assertTrue(m["text"].startswith("and the 0 thing"), m["text"][:60])

    def test_a_short_wrylie_at_the_head_is_kept(self):
        """"(drinks coffee and looks away)" is the actor's business."""
        m = self._alpha(f"[_She drinks her coffee and looks away._] {_run(6)}")
        self.assertIn("drinks her coffee", m["text"])

    def test_a_speech_that_is_only_scene_setting_is_not_gutted(self):
        """Nothing underneath means there was no speech to recover."""
        only_scene = ("[A drawing room in the Tesman villa, furnished in dark "
                      "colours, with a glass door at the back leading onto a "
                      "verandah and the garden beyond, where the autumn leaves "
                      "have begun to fall across the gravel path and the light "
                      "is going out of the afternoon sky above the fjord.]")
        out = self.p.extract_monologues(
            _play(("ALPHA", only_scene), *FILLER), min_words=75, max_words=500)
        alpha = [m for m in out if m["character"].lower() == "alpha"]
        # Either dropped for having no spoken words, or kept whole — never
        # silently emptied into a fragment.
        for m in alpha:
            self.assertIn("drawing room", m["text"])


if __name__ == "__main__":
    unittest.main()
