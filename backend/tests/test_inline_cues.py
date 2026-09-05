"""A cue printed on the same line as its dialogue is still a cue.

Folger sets a shared verse line with the second speaker's name inline:

    FTLN 1810 LYSANDER More than to us
    FTLN 1811 Wait in your royal walks, your board, your bed!

Once the through-line number is stripped that reads "LYSANDER More than to us",
cue and dialogue on one line. parse_dialogue only recognises a cue standing
alone on its own line, so it read the whole thing as a continuation of whoever
spoke last and Lysander's speech was filed under Theseus.

Measured on A Midsummer Night's Dream this was the last remaining source of
wrong words in an actor's mouth, about 4% of extracted lines:

    ROBIN  "Ay, there it is. OBERON I pray thee give it me."
    ROBIN  "I'll put a girdle round about the Earth OBERON Having once this juice,"

It survived the earlier fix because _split_inline_speakers runs on the prompt
sent to the model, while the deterministic recovery path calls parse_dialogue
directly and never saw it. Doing the split inside _preprocess_text puts it under
every path at once: the AI prompt, the lossless guard, the regex fallback.

The safety rule is that a name only counts if it also appears somewhere in the
same text as a cue on a line of its own. Otherwise any shouted word at the head
of a line ("OVER hill, over dale") would be mistaken for a speaker.
"""

import unittest

from app.services.script_parser import parse_dialogue

SHARED_LINE = """THESEUS
Come now, what masques, what dances shall we have?
Joy, gentle friends! Joy and fresh days of love
Accompany your hearts!
LYSANDER More than to us
Wait in your royal walks, your board, your bed!

THESEUS
Say what abridgment have you for this evening?

LYSANDER
A play there is, my lord, some ten words long.
"""

MID_LINE = """OBERON
I know a bank where the wild thyme blows.

ROBIN
Ay, there it is. OBERON I pray thee give it me.

OBERON
Having once this juice, I'll watch Titania when she is asleep.
"""

# "OVER" leads a line and is capitalised, but never stands alone as a cue.
NOT_A_CUE = """FAIRY
Over hill, over dale,
OVER park, over pale,
Thorough flood, thorough fire.

ROBIN
How now, spirit? Whither wander you?
"""


def _lines(text):
    return [ln for sec in parse_dialogue(text) for ln in sec["lines"]]


def _said_by(text, who):
    return " ".join(l["text"] for l in _lines(text) if l["character"] == who)


class ACueAtTheHeadOfALine(unittest.TestCase):
    def test_the_shared_line_is_attributed_to_its_speaker(self):
        self.assertIn("More than to us", _said_by(SHARED_LINE, "LYSANDER"))

    def test_it_does_not_stay_glued_to_the_previous_speaker(self):
        self.assertNotIn("More than to us", _said_by(SHARED_LINE, "THESEUS"))

    def test_the_speaker_appears_in_the_scene_at_all(self):
        speakers = {l["character"] for l in _lines(SHARED_LINE)}
        self.assertIn("LYSANDER", speakers)

    def test_the_continuation_line_stays_with_it(self):
        self.assertIn("Wait in your royal walks", _said_by(SHARED_LINE, "LYSANDER"))


class ACueAfterASentenceEnds(unittest.TestCase):
    def test_oberon_is_taken_off_robins_line(self):
        self.assertIn("I pray thee give it me", _said_by(MID_LINE, "OBERON"))

    def test_robin_keeps_only_his_own_words(self):
        robin = _said_by(MID_LINE, "ROBIN")
        self.assertIn("Ay, there it is", robin)
        self.assertNotIn("I pray thee give it me", robin)


class ShoutingIsNotSpeaking(unittest.TestCase):
    """The guard against turning any capitalised word into a character."""

    def test_a_capitalised_word_that_is_never_a_cue_is_left_alone(self):
        speakers = {l["character"] for l in _lines(NOT_A_CUE)}
        self.assertNotIn("OVER", speakers)

    def test_and_its_text_stays_with_the_fairy(self):
        self.assertIn("OVER park, over pale", _said_by(NOT_A_CUE, "FAIRY"))


class LineNumbersAreFoundWhereverTheyStart(unittest.TestCase):
    """A play's first 5,000 characters are its title page, not its dialogue.

    _preprocess_text decided whether a text was a Folger edition by counting
    FTLN prefixes in text[:5000]. A whole play opens with a title page, a cast
    list and a note on the text — several thousand characters with no line
    numbers in them — so the count came back zero and the entire document kept
    its prefixes. Chunks escaped it by starting mid-play, which is why extraction
    looked fine while raw_text, and anything reading the document whole, did not.
    """

    FRONT_MATTER = ("A Midsummer Night's Dream\nby William Shakespeare\n\n"
                    "Characters in the Play\n" + ("Some prefatory note. " * 320))
    BODY = "\n".join(
        f"FTLN {1770 + i} Line number {i} of the verse goes here." for i in range(12)
    )

    def test_a_play_with_a_long_title_page_is_still_stripped(self):
        from app.services.script_parser import _preprocess_text

        self.assertGreater(len(self.FRONT_MATTER), 5000, "fixture must clear the old window")
        out = _preprocess_text(self.FRONT_MATTER + "\n" + self.BODY)
        self.assertNotIn("FTLN", out)

    def test_a_text_with_no_line_numbers_is_left_alone(self):
        from app.services.script_parser import _preprocess_text

        plain = "ROBIN\nHow now, spirit? Whither wander you?\n"
        self.assertEqual(_preprocess_text(plain).strip(), plain.strip())


if __name__ == "__main__":
    unittest.main()
