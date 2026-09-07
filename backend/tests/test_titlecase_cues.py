"""Half the corpus does not shout its character names.

Measured 2026-09-07 on 25 random public-domain plays with full text: 13 of them
came back broken. Six produced no scenes at all and seven produced four or five
lines out of a whole play. Every one of them prints its cues in title case, the
way most editions outside Shakespeare do:

    Adolf.
    And it's you I've got to thank for all this.

    Gustav.
    Is it?

The parser only ever recognised a cue in capitals, so none of that is dialogue
to it. The plays it did read -- Hedda Gabler with 213 capitalised cues, As You
Like It with 23 -- were the ones typeset the way Shakespeare is.

The risk in reading title case is obvious: "Yes." and "No." sit at the head of
a line and end with a period too, and a play is full of them. Three things
keep them out. A name has to lead at least three lines to count, it has to not
be an ordinary word, and there have to be at least two such names, because a
scene with one speaker is not a scene.

The whole pass is also gated on the document not already having capitalised
cues. It exists to rescue a text the normal reading cannot see, so it never
runs on one that reads fine and cannot regress it.
"""

import unittest

from app.services.script_parser import (
    _normalise_titlecase_cues,
    parse_dialogue,
)

CREDITOR = """Scene I.

Adolf.
And it's you I've got to thank for all this.

Gustav.
Is it? Not I alone.

Adolf.
Yes. You more than anyone.

Gustav.
Perhaps. And your wife?

Adolf.
Thekla is away.

Thekla.
No. I am here.

Gustav.
Then we three are together.

Thekla.
Yes.

Adolf.
You said nothing of this.

Thekla.
You never asked.
"""

HONORIFICS = """Dr. Stockmann.
The town is poisoned.

Mrs. Stockmann.
Thomas, you must be careful.

Dr. Stockmann.
I will not be careful.

Mrs. Stockmann.
Think of the children.

Dr. Stockmann.
I am thinking of them.

Mrs. Stockmann.
Then say nothing tonight.
"""

# The shape the pass must never touch: capitals, and it already reads.
ALREADY_CAPITALISED = """HEDDA.
I am bored.

TESMAN.
Yes. Well.

HEDDA.
Say something, Tesman.

TESMAN.
What should I say?
"""


def _lines(text):
    return [ln for sec in parse_dialogue(text) for ln in sec["lines"]]


def _speakers(text):
    return {l["character"] for l in _lines(text)}


def _said_by(text, who):
    return " ".join(l["text"] for l in _lines(text) if l["character"] == who)


class ATitleCasePlayIsRead(unittest.TestCase):
    def test_its_cast_is_found(self):
        self.assertEqual(_speakers(CREDITOR), {"ADOLF", "GUSTAV", "THEKLA"})

    def test_the_lines_land_on_the_right_people(self):
        self.assertIn("you I've got to thank", _said_by(CREDITOR, "ADOLF"))
        self.assertIn("Not I alone", _said_by(CREDITOR, "GUSTAV"))
        self.assertIn("I am here", _said_by(CREDITOR, "THEKLA"))

    def test_a_cue_is_not_left_inside_the_speech(self):
        for line in _lines(CREDITOR):
            self.assertFalse(line["text"].startswith(("Adolf.", "Gustav.", "Thekla.")), line["text"])

    def test_yes_and_no_are_not_characters(self):
        self.assertNotIn("YES", _speakers(CREDITOR))
        self.assertNotIn("NO", _speakers(CREDITOR))

    def test_a_one_word_answer_is_still_a_line(self):
        self.assertIn("Yes", _said_by(CREDITOR, "THEKLA"))


class ANameWithATitleInFrontOfIt(unittest.TestCase):
    """"Dr. Stockmann." is one cue. Reading it as "Dr" cost the play its
    leading character 449 times over."""

    def test_the_doctor_is_one_person(self):
        self.assertEqual(_speakers(HONORIFICS), {"DR STOCKMANN", "MRS STOCKMANN"})

    def test_and_keeps_his_lines(self):
        self.assertIn("The town is poisoned", _said_by(HONORIFICS, "DR STOCKMANN"))
        self.assertIn("I will not be careful", _said_by(HONORIFICS, "DR STOCKMANN"))

    def test_his_wife_is_a_different_person(self):
        self.assertIn("Think of the children", _said_by(HONORIFICS, "MRS STOCKMANN"))


NAMED_BY_ROLE = """The Grandfather.
I hear something in the garden.

The Father.
It is the wind.

The Uncle.
There is no wind tonight.

The Grandfather.
Someone has come in.

The Father.
No one has come in.

The Uncle.
Sit down, all of you.

The Grandfather.
I am not deceived.

The Father.
You are tired.

The Uncle.
We are all tired.
"""


class ACastNamedByRole(unittest.TestCase):
    """Maeterlinck names nobody: The Grandfather, The Father, The Uncle. An
    over-eager stop word threw "The" away and with it every speaker in the
    play, which came back with no scenes at all."""

    def test_they_are_all_there(self):
        self.assertEqual(
            _speakers(NAMED_BY_ROLE),
            {"THE GRANDFATHER", "THE FATHER", "THE UNCLE"},
        )

    def test_and_keep_their_lines(self):
        self.assertIn("something in the garden", _said_by(NAMED_BY_ROLE, "THE GRANDFATHER"))
        self.assertIn("It is the wind", _said_by(NAMED_BY_ROLE, "THE FATHER"))

    def test_a_sentence_starting_with_the_is_not_a_cue(self):
        line = "HERMIA\nThe more I hate, the more he follows me.\nHELENA\nThe more I love.\n"
        self.assertNotIn("THE MORE", _speakers(line))


class ItLeavesAWorkingScriptAlone(unittest.TestCase):
    def test_capitalised_cues_are_untouched(self):
        self.assertEqual(_normalise_titlecase_cues(ALREADY_CAPITALISED), ALREADY_CAPITALISED)

    def test_and_still_read_as_they_did(self):
        self.assertEqual(_speakers(ALREADY_CAPITALISED), {"HEDDA", "TESMAN"})

    def test_one_speaker_is_not_enough_to_rewrite_anything(self):
        solo = "Adolf.\nOne line.\n\nAdolf.\nAnother.\n\nAdolf.\nA third.\n"
        self.assertEqual(_normalise_titlecase_cues(solo), solo)

    def test_a_name_seen_twice_is_not_yet_a_cue(self):
        thin = "Adolf.\nOne.\n\nGustav.\nTwo.\n\nAdolf.\nThree.\n\nGustav.\nFour.\n"
        self.assertEqual(_normalise_titlecase_cues(thin), thin)


if __name__ == "__main__":
    unittest.main()
