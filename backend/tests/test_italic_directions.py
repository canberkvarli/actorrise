"""The page already says what is a direction. It says it in italic.

Every edition of a play sets stage directions in italic and spoken text in
roman. That is a typographic convention, not a Folger one, and pdfplumber
reports the font of every character, so the question "is this a direction or a
line" has an answer printed on the page. Guessing it from the words is what we
were doing, and it could not be made to work:

    THESEUS   Pyramus draws near the wall. Silence.     <- a line
              Pyramus stabs himself.                    <- a direction

Same name, same shape, same kind of verb. Nothing in the words separates them.
The font does: the first is roman, the second italic. Measured on A Midsummer
Night's Dream, ten directions were sitting inside spoken lines, all of them in
the play within the play, because the roles there (Pyramus, Thisbe, Lion,
Moonshine) are never cued as speakers and so were not in the cast.

Italic on its own is not enough, which is the trap. Folger sets Bottom's
quoted verse in italic too:

    BOTTOM  ... make all split.
            The raging rocks
            And shivering shocks

Marking every italic run as a direction would delete that speech. So two rules,
both taken from where the italic sits rather than from what it says:

  - An italic run with real roman text beside it on the same line is a
    direction. "Where heart doth hop. Pyramus stabs himself." A line number is
    not real text and does not count.
  - An italic run that is a whole line is a direction only if it describes an
    action. "Lion exits." does. "The raging rocks" does not.

Text with no font information — a .txt upload, a pasted scene — is unaffected
and still goes through the word-based test.
"""

import unittest

from app.services.script_parser import (
    _ITALIC_CLOSE,
    _ITALIC_OPEN,
    _line_with_italics,
    _preprocess_text,
    parse_dialogue,
)

I, O = _ITALIC_OPEN, _ITALIC_CLOSE


def it(text):
    return f"{I}{text}{O}"


def _lines(text, cast=None):
    return [ln for sec in parse_dialogue(text, cast=cast) for ln in sec["lines"]]


def _said_by(text, who, cast=None):
    return " ".join(l["text"] for l in _lines(text, cast) if l["character"] == who)


def _directions(text, cast=None):
    return " | ".join(l.get("stage_direction") or "" for l in _lines(text, cast))


class AnItalicRunBesideRomanText(unittest.TestCase):
    """The strongest signal there is: the printer changed font mid-line."""

    SCENE = (
        "BOTTOM\n"
        "FTLN 2093 Where heart doth hop. " + it("Pyramus stabs himself.") + " 315\n"
        "FTLN 2094 Thus die I, thus, thus, thus.\n"
        "DEMETRIUS\n"
        "FTLN 2095 No die, but an ace for him.\n"
        + "\n".join(f"FTLN {n} Filler line {n}." for n in range(2096, 2101))
    )

    def test_the_direction_leaves_the_speech(self):
        self.assertNotIn("Pyramus stabs himself", _said_by(self.SCENE, "BOTTOM"))

    def test_the_speech_closes_up_around_it(self):
        self.assertIn("Where heart doth hop. Thus die I", _said_by(self.SCENE, "BOTTOM"))

    def test_it_is_kept_as_a_direction(self):
        self.assertIn("Pyramus stabs himself", _directions(self.SCENE))

    def test_no_cast_membership_was_needed(self):
        """Pyramus is a part in the play within the play, never a speaker."""
        self.assertNotIn("PYRAMUS", {l["character"] for l in _lines(self.SCENE)})


class ARomanLineIsNeverADirection(unittest.TestCase):
    """The line the word-based test could not be allowed to take."""

    SCENE = (
        "THESEUS\n"
        "FTLN 1956 Pyramus draws near the wall. Silence.\n"
        "BOTTOM\n"
        "FTLN 1957 O grim-looked night!\n"
        "THESEUS\n"
        "FTLN 1958 The wall, methinks, should curse again.\n"
        + "\n".join(f"FTLN {n} Filler line {n}." for n in range(1959, 1964))
    )

    def test_theseus_keeps_his_line(self):
        self.assertIn("Pyramus draws near the wall", _said_by(self.SCENE, "THESEUS"))

    def test_and_it_is_not_also_a_direction(self):
        self.assertNotIn("draws near", _directions(self.SCENE))


class AWholeLineOfItalic(unittest.TestCase):
    VERSE = (
        "BOTTOM\n"
        "FTLN 0285 A part to tear a cat in, to make all split.\n"
        "FTLN 0286 " + it("The raging rocks") + "\n"
        "FTLN 0287 " + it("And shivering shocks") + "\n"
        "FTLN 0288 " + it("Shall break the locks") + "\n"
        "QUINCE\n"
        "FTLN 0289 That was Ercles' vein.\n"
        + "\n".join(f"FTLN {n} Filler line {n}." for n in range(290, 295))
    )

    DIRECTION = (
        "LYSANDER\n"
        "FTLN 0228 Keep promise, love.\n"
        + it("Hermia exits.") + "\n"
        "HELENA\n"
        "FTLN 0229 How happy some can be!\n"
        + "\n".join(f"FTLN {n} Filler line {n}." for n in range(230, 235))
    )

    def test_quoted_verse_stays_in_the_speech(self):
        said = _said_by(self.VERSE, "BOTTOM")
        self.assertIn("The raging rocks", said)
        self.assertIn("And shivering shocks", said)

    def test_quoted_verse_is_not_a_direction(self):
        self.assertNotIn("raging rocks", _directions(self.VERSE))

    def test_an_action_on_its_own_line_is_a_direction(self):
        self.assertNotIn("Hermia exits", _said_by(self.DIRECTION, "LYSANDER"))
        self.assertIn("Hermia exits", _directions(self.DIRECTION))


class ACueLineIsNotSwallowed(unittest.TestCase):
    """Folger sets the direction on a cue line in italic and the name in roman:
    "LYSANDER, to Theseus". The direction has no action verb, so it is left
    where it is and the existing cue reader takes it."""

    SCENE = (
        "LYSANDER, " + it("to Theseus") + "\n"
        "FTLN 0110 I am, my lord, as well derived as he.\n"
        "THESEUS\n"
        "FTLN 0111 I must confess that I have heard so much.\n"
        + "\n".join(f"FTLN {n} Filler line {n}." for n in range(112, 117))
    )

    def test_lysander_still_speaks(self):
        self.assertIn("as well derived as he", _said_by(self.SCENE, "LYSANDER"))

    def test_the_aim_is_kept_as_the_direction(self):
        self.assertIn("to Theseus", _directions(self.SCENE))


class TextWithNoFontsIsUntouched(unittest.TestCase):
    def test_a_plain_upload_still_reads(self):
        plain = "HERMIA\nSo is Lysander.\nTHESEUS\nIn himself he is.\n"
        self.assertEqual(_preprocess_text(plain).strip(), plain.strip())

    def test_no_marker_ever_reaches_the_actor(self):
        scene = "BOTTOM\nWhere heart doth hop. " + it("Pyramus stabs himself.") + "\nQUINCE\nWell said.\n"
        for line in _lines(scene):
            self.assertNotIn(I, line["text"])
            self.assertNotIn(O, line["text"])
            self.assertNotIn(I, line.get("stage_direction") or "")


class ReadingItalicOffThePage(unittest.TestCase):
    """_line_with_italics turns pdfplumber's per-character fonts into the
    markers above. It has to line the characters up with the text pdfplumber
    lays out, and when it cannot it leaves the line alone rather than guess."""

    @staticmethod
    def _line(text, italic_from=None, italic_to=None):
        chars = []
        n = 0
        for ch in text:
            if ch.isspace():
                continue
            ital = italic_from is not None and italic_from <= n < italic_to
            chars.append({"text": ch, "fontname": "ABCDEF+Times-Italic" if ital else "ABCDEF+Times"})
            n += 1
        return {"text": text, "chars": chars}

    def test_a_run_in_the_middle_is_wrapped(self):
        # "ab cd" -> mark "cd" (non-space indices 2..4)
        out = _line_with_italics(self._line("ab cd", 2, 4))
        self.assertEqual(out, "ab " + it("cd"))

    def test_a_fully_italic_line_is_wrapped_whole(self):
        out = _line_with_italics(self._line("she exits", 0, 8))
        self.assertEqual(out, it("she exits"))

    def test_a_line_with_no_italic_is_returned_as_is(self):
        self.assertEqual(_line_with_italics(self._line("plain words")), "plain words")

    def test_a_line_it_cannot_align_is_returned_as_is(self):
        broken = {"text": "some text", "chars": [{"text": "x", "fontname": "Times-Italic"}]}
        self.assertEqual(_line_with_italics(broken), "some text")


if __name__ == "__main__":
    unittest.main()
