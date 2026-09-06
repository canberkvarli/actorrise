"""The two cue shapes Folger uses that the parser could not see.

Measured on A Midsummer Night's Dream, 2026-09-06. Nine scenes in the play; the
parser delivered seven, two of them abridged to a third of their length, and
the two it lost outright were the prose scenes. Both losses come down to how a
cue is printed:

1. Prose. Folger runs the cue into the line with no punctuation at all:

       QUINCE Is all our company here?
       BOTTOM You were best to call them generally, man by
       man, according to the scrip.

   The cue regex wants a colon, a period, or a name alone on its line. None of
   the mechanicals ever get one, so the whole of Act 1 Scene 2 and Act 4
   Scene 2 read as a single unbroken speech and were thrown away as "nobody
   speaks here".

2. A direction on the cue line:

       OBERON, to Robin
       What hast thou done?

   Fifty-four of these in the play. Each one fails the cue regex and its
   speech is glued onto whoever spoke last, which is how an actor rehearsing
   Demetrius was handed Oberon's lines.

The rule for the prose shape is the same as for the inline verse cue: a name
counts only if the text itself treats it as a speaker, here by starting two
or more lines with it. A shouted word at the head of one verse line is not a
character.
"""

import unittest

from app.services.script_parser import _preprocess_text, parse_dialogue

PROSE = """QUINCE Is all our company here?
BOTTOM You were best to call them generally, man by
man, according to the scrip.
QUINCE Here is the scroll of every man's name which
is thought fit, through all Athens, to play in our
interlude before the Duke and the Duchess.
BOTTOM First, good Peter Quince, say what the play
treats on, then read the names of the actors.
QUINCE Marry, our play is Pyramus and Thisbe.
BOTTOM A very good piece of work, I assure you.
"""

DIRECTION_ON_CUE_LINE = """DEMETRIUS
Here, therefore, for a while I will remain.
He lies down and falls asleep.
OBERON, to Robin
What hast thou done? Thou hast mistaken quite.
ROBIN, in Lysander's voice
Thou coward, art thou bragging to the stars?
OBERON
About the wood go swifter than the wind.
"""

# Prose keeps the direction and the speech on one line.
DIRECTION_THEN_SPEECH = """BOTTOM Where's Peaseblossom?
PEASEBLOSSOM Ready.
BOTTOM Scratch my head, Peaseblossom.
PEASEBLOSSOM What's your will?
BOTTOM, waking up When my cue comes, call me, and I
will answer.
"""

# "O" is Flute's first word, not part of his name.
EXCLAMATION_AFTER_CUE = """FLUTE Must I speak now?
QUINCE Ay, marry, must you.
FLUTE Most radiant Pyramus, most lily-white of hue.
QUINCE Yea, and the best person too.
FLUTE O, sweet bully Bottom! Thus hath he lost sixpence
a day during his life.
"""

# A capitalised word that leads a line once is not a cue.
VERSE_SHOUT = """FAIRY
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


class ProseCuesWithNoPunctuation(unittest.TestCase):
    def test_both_mechanicals_are_heard(self):
        self.assertEqual({l["character"] for l in _lines(PROSE)}, {"QUINCE", "BOTTOM"})

    def test_every_speech_is_its_own_line(self):
        self.assertEqual(len(_lines(PROSE)), 6)

    def test_a_wrapped_speech_stays_whole(self):
        self.assertIn("man by man, according to the scrip", _said_by(PROSE, "BOTTOM"))

    def test_the_name_is_not_left_inside_the_speech(self):
        for l in _lines(PROSE):
            self.assertFalse(l["text"].startswith(("QUINCE", "BOTTOM")), l["text"])


class ADirectionOnTheCueLine(unittest.TestCase):
    def test_oberon_gets_his_own_speech(self):
        self.assertIn("What hast thou done", _said_by(DIRECTION_ON_CUE_LINE, "OBERON"))

    def test_it_is_not_glued_to_demetrius(self):
        self.assertNotIn("What hast thou done", _said_by(DIRECTION_ON_CUE_LINE, "DEMETRIUS"))

    def test_the_direction_is_kept_as_a_direction(self):
        oberon = [l for l in _lines(DIRECTION_ON_CUE_LINE) if l["character"] == "OBERON"]
        self.assertEqual(oberon[0]["stage_direction"], "to Robin")

    def test_an_apostrophe_in_the_direction_is_fine(self):
        self.assertIn("Thou coward", _said_by(DIRECTION_ON_CUE_LINE, "ROBIN"))

    def test_a_direction_then_speech_on_one_line(self):
        bottom = [l for l in _lines(DIRECTION_THEN_SPEECH) if l["character"] == "BOTTOM"]
        last = bottom[-1]
        self.assertTrue(last["text"].startswith("When my cue comes"), last["text"])
        self.assertEqual(last["stage_direction"], "waking up")


class WhatIsNotACue(unittest.TestCase):
    def test_o_is_the_first_word_of_the_speech(self):
        speakers = {l["character"] for l in _lines(EXCLAMATION_AFTER_CUE)}
        self.assertEqual(speakers, {"FLUTE", "QUINCE"})
        self.assertIn("O, sweet bully Bottom!", _said_by(EXCLAMATION_AFTER_CUE, "FLUTE"))

    def test_a_shouted_word_is_not_a_speaker(self):
        speakers = {l["character"] for l in _lines(VERSE_SHOUT)}
        self.assertEqual(speakers, {"FAIRY", "ROBIN"})


SPLIT_CUE = """FTLN 0001 TITANIA
FTLN 0002 Sing me now asleep.
FTLN 0003 She lies down.
FTLN 0004 Fairies sing.
FTLN 0005 FIRST
FTLN 0006 FAIRY
FTLN 0007 You spotted snakes with double tongue,
FTLN 0008 CHORUS
FTLN 0009 Philomel, with melody
FTLN 0010 Sing in our sweet lullaby.
"""

TALK_THAT_SOUNDS_LIKE_DIRECTIONS = """THESEUS
This fellow doth not stand upon points.
LYSANDER
He hath rid his prologue like a rough colt.
THESEUS
Pyramus draws near the wall. Silence.
TITANIA
Music, ho, music such as charmeth sleep!
HERMIA
The more I hate, the more he follows me.
DEMETRIUS
Stay, on thy peril. I alone will go. Demetrius exits.
HELENA
O, I am out of breath in this fond chase.
"""


class TheElevenTurnsThePageHadAndWeDidNot(unittest.TestCase):
    """Measured on MND after the first whole-scene cut: 495 turns extracted,
    506 on the page. These are the eleven, by cause."""

    def test_a_cue_broken_over_two_lines_is_one_cue(self):
        speakers = {l["character"] for l in _lines(SPLIT_CUE)}
        self.assertIn("FIRST FAIRY", speakers)
        self.assertNotIn("FIRST", speakers)

    def test_the_chorus_is_a_part(self):
        self.assertIn("Philomel, with melody", _said_by(SPLIT_CUE, "CHORUS"))

    def test_a_direction_between_lines_rides_on_the_speech_before(self):
        titania = [l for l in _lines(SPLIT_CUE) if l["character"] == "TITANIA"][0]
        self.assertIn("She lies down", titania["stage_direction"])
        self.assertIn("Fairies sing", titania["stage_direction"])

    def test_a_verb_does_not_make_a_line_a_direction(self):
        theseus = _said_by(TALK_THAT_SOUNDS_LIKE_DIRECTIONS, "THESEUS")
        self.assertIn("doth not stand upon points", theseus)
        self.assertIn("Pyramus draws near the wall", theseus)

    def test_the_does_not_make_a_subject(self):
        self.assertIn("the more he follows me", _said_by(TALK_THAT_SOUNDS_LIKE_DIRECTIONS, "HERMIA"))

    def test_but_the_fairies_can_still_exit(self):
        from app.services.script_parser import _is_stage_direction_line

        self.assertTrue(_is_stage_direction_line("The fairies exit.", ["FAIRY", "TITANIA"]))

    def test_a_sound_cue_with_a_comma_is_a_line(self):
        self.assertIn("Music, ho, music", _said_by(TALK_THAT_SOUNDS_LIKE_DIRECTIONS, "TITANIA"))

    def test_a_direction_at_the_end_of_a_speech_does_not_take_the_speech_with_it(self):
        demetrius = [l for l in _lines(TALK_THAT_SOUNDS_LIKE_DIRECTIONS) if l["character"] == "DEMETRIUS"]
        self.assertEqual(demetrius[0]["text"], "Stay, on thy peril. I alone will go.")
        self.assertEqual(demetrius[0]["stage_direction"], "Demetrius exits")

    def test_a_direction_about_a_named_character_is_still_a_direction(self):
        self.assertNotIn("Demetrius exits", _said_by(TALK_THAT_SOUNDS_LIKE_DIRECTIONS, "DEMETRIUS"))


class LeftoverLineNumbers(unittest.TestCase):
    """Folger numbers every fifth line. The strip only caught two digits and up,
    so "5" stayed on the end of the line and ended up in an actor's mouth."""

    def test_a_single_digit_line_number_is_stripped(self):
        text = "\n".join(
            [f"FTLN {i:04d} Verse line number {i} here." for i in range(1, 5)]
            + ["FTLN 0005 thought fit, through all Athens, to play in our 5"]
        )
        out = _preprocess_text(text)
        self.assertTrue(out.rstrip().endswith("to play in our"), out)

    def test_a_heading_keeps_its_number(self):
        """The first cut of this stripped "Scene 1" down to "Scene", and the
        whole play came back as one Prologue and one Epilogue."""
        text = "\n".join(
            [f"FTLN {i:04d} Verse line number {i} here." for i in range(1, 6)]
            + ["ACT 2", "Scene 1", "ACT 3 Scene 2"]
        )
        out = _preprocess_text(text)
        self.assertIn("ACT 2\nScene 1\nACT 3 Scene 2", out)

    def test_a_number_that_is_part_of_the_line_survives_without_ftln(self):
        plain = "ROBIN\nI have counted 5\n"
        self.assertIn("counted 5", _preprocess_text(plain))


if __name__ == "__main__":
    unittest.main()
