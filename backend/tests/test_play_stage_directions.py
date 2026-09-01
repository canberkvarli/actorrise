"""The play parser keeps stage directions, and keeps emphasis as words.

`plain_text_parser` used to run

    clean = re.sub(r'\\([^)]+\\)|\\[[^\\]]+\\]', '', speech)
    clean = self._ITALIC_SPAN.sub(' ', clean)

over every speech, which did two separate kinds of damage:

  * directions were deleted from the text and flattened into the
    `stage_directions` column, losing their position — so Polonius's
    "_Laying his hand on Laertes's head._" could never be rendered where it
    belongs, and the reading view (which draws directions from `text_segments`)
    never showed it at all;
  * italicised EMPHASIS went with them. "I said _no_" became "I said". Across a
    25-play sample, 955 of 5,511 italic spans are one or two lowercase words.

The parser now returns both `text` (directions kept as `(...)`) and `dialogue`
(the spoken words), the same pair `screenplay_pdf_parser` produces for film/TV.
"""

import unittest

from app.services.extraction.plain_text_parser import PlainTextParser


def _speech(words: int, tail: str = "") -> str:
    """A body long enough to clear the 75-word floor on its spoken words."""
    body = " ".join(
        f"the matter of it is {i} and I will not be moved from it" for i in range(words)
    )
    return f"{body}. {tail}".strip()


def _play(*speeches: tuple[str, str]) -> str:
    # Five or more colon-cued speeches, so pattern 1 handles the text and the
    # later Title-Case fallbacks are not what is under test.
    return "\n\n".join(f"{name}:\n    {body}" for name, body in speeches)


class DisplayTextTests(unittest.TestCase):
    def setUp(self):
        self.p = PlainTextParser()

    def _one(self, body: str) -> dict:
        text = _play(
            ("ALPHA", body),
            ("BETA", _speech(9)),
            ("GAMMA", _speech(9)),
            ("DELTA", _speech(9)),
            ("EPSILON", _speech(9)),
            ("ZETA", _speech(9)),
        )
        out = self.p.extract_monologues(text, min_words=75, max_words=500)
        found = [m for m in out if m["character"].lower() == "alpha"]
        self.assertTrue(found, f"Alpha was not extracted from: {out}")
        return found[0]

    def test_bracketed_direction_is_kept_in_position(self):
        m = self._one(_speech(9, "[_Exit._] And so I go, and I do not look back at all."))
        self.assertIn("(Exit.)", m["text"])
        self.assertNotIn("[", m["text"])
        self.assertNotIn("Exit", m["dialogue"])

    def test_italic_direction_becomes_a_parenthetical(self):
        m = self._one(
            _speech(9, "_Laying his hand on her head._ And these few precepts keep.")
        )
        self.assertIn("(Laying his hand on her head.)", m["text"])
        self.assertNotIn("Laying his hand", m["dialogue"])

    def test_italic_emphasis_keeps_its_words(self):
        """The failure that had no name: emphasis was deleted as if it were a cue."""
        m = self._one(_speech(9, "I told him _no_ and I meant every letter of it."))
        self.assertIn("no", m["dialogue"].split())
        self.assertNotIn("(no)", m["text"])
        self.assertNotIn("_", m["text"])

    def test_existing_parenthetical_survives(self):
        m = self._one(_speech(9, "(aside) He does not know what I have done here."))
        self.assertIn("(aside)", m["text"])
        self.assertNotIn("aside", m["dialogue"])

    def test_dialogue_is_the_display_text_minus_directions(self):
        m = self._one(_speech(9, "[_Sings._] And that is the end of my song for now."))
        self.assertIn("(Sings.)", m["text"])
        self.assertNotIn("(", m["dialogue"])


class WordCountTests(unittest.TestCase):
    """The floor measures what is SPOKEN.

    Counting the directions would let a long piece of blocking push a thin
    speech over the bar — which is the whole reason the two texts are separate.
    """

    def setUp(self):
        self.p = PlainTextParser()

    def test_directions_do_not_count_toward_the_floor(self):
        padding = "_He crosses to the window and stands there watching the rain._"
        thin = "I have nothing more to say to you tonight, nothing at all."
        text = _play(
            ("ALPHA", f"{thin} {padding * 6}"),
            ("BETA", _speech(9)),
            ("GAMMA", _speech(9)),
            ("DELTA", _speech(9)),
            ("EPSILON", _speech(9)),
            ("ZETA", _speech(9)),
        )
        out = self.p.extract_monologues(text, min_words=75, max_words=500)
        self.assertEqual(
            [m for m in out if m["character"].lower() == "alpha"], [],
            "a speech padded only by directions must not clear the floor",
        )

    def test_reported_word_count_is_the_spoken_count(self):
        p = PlainTextParser()
        text = _play(
            ("ALPHA", _speech(9, "[_Exit._]")),
            ("BETA", _speech(9)),
            ("GAMMA", _speech(9)),
            ("DELTA", _speech(9)),
            ("EPSILON", _speech(9)),
            ("ZETA", _speech(9)),
        )
        m = [x for x in p.extract_monologues(text, min_words=75, max_words=500)
             if x["character"].lower() == "alpha"][0]
        self.assertEqual(m["word_count"], len(m["dialogue"].split()))
        self.assertLess(m["word_count"], len(m["text"].split()))


if __name__ == "__main__":
    unittest.main()
