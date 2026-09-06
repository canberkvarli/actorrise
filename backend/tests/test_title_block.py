"""A title is not a character.

Paste a scene that opens the way scripts open:

    THE BREAKUP
    A short scene. Author: Sample Script.

    JORDAN
    We need to talk.

and the parser reads the title as a speaker cue and the byline as its one
line. ActorRise's own sample script does exactly this, so the demo produced a
three-hander whose third part is the name of the play. The actor sees it in
the cast, and can be given it to read.

The test that catches it without catching anybody real: a title block is the
first speech in the text, its speaker never speaks again, and what it says is
publication detail rather than dialogue — a byline, an author, a translator, a
draft date. A character with one line still has a line, so all three have to
hold before anything is dropped.

Hamlet is the reason the rule cannot be "drop the speaker whose name matches
the play". It very often does.
"""

import unittest

from app.services.script_parser import parse_dialogue

SAMPLE = """THE BREAKUP
A short scene. Author: Sample Script.

JORDAN
We need to talk.

SAM
I know.

JORDAN
I've been thinking about us.

SAM
Where do you think we're going?
"""

BYLINE = """THE GLASS MENAGERIE
by Tennessee Williams

TOM
I have tricks in my pocket.

AMANDA
Honey, don't push with your fingers.

TOM
I am the opposite of a stage magician.

AMANDA
Eat your supper.
"""

# A real one-line part, in the same position a title block would sit.
ONE_LINE_PART = """MESSENGER
My lord, the carriage waits below.

ANNA
Tell him I will be down directly.

BORIS
You are not going.

ANNA
I am.

BORIS
Anna.
"""

# The play's name is also the part, and he does not stop talking.
NAMED_FOR_ITS_LEAD = """HAMLET
To be, or not to be, that is the question.

HORATIO
My lord?

HAMLET
Whether 'tis nobler in the mind to suffer.

HORATIO
I do not follow.
"""


def _lines(text):
    return [ln for sec in parse_dialogue(text) for ln in sec["lines"]]


def _speakers(text):
    return {l["character"] for l in _lines(text)}


class ATitleBlockIsNotASpeaker(unittest.TestCase):
    def test_the_play_is_not_in_the_cast(self):
        self.assertEqual(_speakers(SAMPLE), {"JORDAN", "SAM"})

    def test_the_byline_is_not_a_line(self):
        self.assertNotIn("Author: Sample Script", " ".join(l["text"] for l in _lines(SAMPLE)))

    def test_the_scene_itself_is_untouched(self):
        said = " ".join(l["text"] for l in _lines(SAMPLE) if l["character"] == "JORDAN")
        self.assertIn("We need to talk", said)
        self.assertIn("thinking about us", said)

    def test_an_author_credit_goes_too(self):
        self.assertEqual(_speakers(BYLINE), {"TOM", "AMANDA"})


class WhatMustSurvive(unittest.TestCase):
    def test_a_part_with_one_line_keeps_it(self):
        self.assertIn("MESSENGER", _speakers(ONE_LINE_PART))
        said = " ".join(l["text"] for l in _lines(ONE_LINE_PART) if l["character"] == "MESSENGER")
        self.assertIn("the carriage waits below", said)

    def test_a_play_named_for_its_lead_keeps_its_lead(self):
        self.assertIn("HAMLET", _speakers(NAMED_FOR_ITS_LEAD))
        said = " ".join(l["text"] for l in _lines(NAMED_FOR_ITS_LEAD) if l["character"] == "HAMLET")
        self.assertIn("To be, or not to be", said)


if __name__ == "__main__":
    unittest.main()
