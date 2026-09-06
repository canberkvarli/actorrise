"""Four things that reached an actor's page and should not have.

All four measured on the Act 1 Scene 1 that came out of A Midsummer Night's
Dream on 2026-09-06, after the whole-scene cut landed. The scene was complete
and in order; these are what was wrong inside it.

1. A PARENTHESIS IS PUNCTUATION, NOT A DIRECTION. Folger sets an aside in verse
   in round brackets:

       Turned her obedience (which is due to me)
       To stubborn harshness.

   Both halves are Egeus speaking. The parser lifted every bracket out of the
   line into a stage direction, so the actor was handed "Turned her obedience
   To stubborn harshness" with three words missing from the verse and printed
   somewhere else on the page. Four times in that one scene. It also left the
   punctuation behind: "By all the vows that ever men have broke ,".

   A bracket that is the whole line is a screenplay wryly and stays a
   direction. A bracket inside a longer line is the playwright's.

2. A DIRECTION NAMING SOMEONE WHO IS SILENT IN THAT SCENE. "Philostrate exits."
   sat in the middle of Theseus's speech. The check for whether a sentence is
   about a character only knew the cues in that one scene, and Philostrate
   never speaks in Act 1. The play knows him; the scene does not. So the cast
   has to come from the whole text.

   The check has to keep working the other way: "Pyramus draws near the wall."
   is Theseus, and Pyramus is a part in a play the characters are performing,
   never a speaker.

3. A LINE NUMBER ATE THE NEXT LINE INSTEAD OF ITSELF. Folger prints a number
   every fifth line, and the strip for it used \\s+, which matches a newline.
   Given "...and with reveling. 20\\n7\\n", it matched across the break, threw
   away the page number "7" on the following line and kept the "20" it was
   aimed at. The actor's line ended "with reveling. 20".

4. A HYPHEN WITH A SPACE IN FRONT OF IT. The PDF gives "New -bent in heaven"
   for "New-bent". Cosmetic, but it is the kind of small wrongness that makes
   an actor distrust everything beside it.
"""

import unittest

from app.services.script_parser import (
    _is_stage_direction_line,
    _preprocess_text,
    parse_dialogue,
    whole_scenes,
)
from app.services.scene_map import detect_scene_spans

ASIDE_IN_VERSE = """EGEUS
With cunning hast thou filched my daughter's heart,
Turned her obedience (which is due to me)
To stubborn harshness.
THESEUS
Know of your youth, examine well your blood,
Whether (if you yield not to your father's choice)
You can endure the livery of a nun.
HERMIA
By all the vows that ever men have broke
(In number more than ever women spoke),
In that same place thou hast appointed me.
"""

WRYLY_ON_ITS_OWN_LINE = """RACHEL
I told you already.
(beat)
Twice.
RYAN
I heard you the first time.
"""


def _lines(text, cast=None):
    return [ln for sec in parse_dialogue(text, cast=cast) for ln in sec["lines"]]


def _said_by(text, who, cast=None):
    return " ".join(l["text"] for l in _lines(text, cast) if l["character"] == who)


class AParenthesisInVerseIsSpoken(unittest.TestCase):
    def test_the_aside_stays_in_the_line(self):
        self.assertIn(
            "Turned her obedience (which is due to me) To stubborn harshness",
            _said_by(ASIDE_IN_VERSE, "EGEUS"),
        )

    def test_it_is_not_filed_as_a_direction(self):
        for line in _lines(ASIDE_IN_VERSE):
            self.assertIsNone(line.get("stage_direction"), line)

    def test_the_second_one_too(self):
        self.assertIn(
            "Whether (if you yield not to your father's choice) You can endure",
            _said_by(ASIDE_IN_VERSE, "THESEUS"),
        )

    def test_no_space_is_left_where_the_bracket_was(self):
        """"...that ever men have broke ," was what the actor saw."""
        hermia = _said_by(ASIDE_IN_VERSE, "HERMIA")
        self.assertNotIn(" ,", hermia)
        self.assertIn("men have broke (In number more than ever women spoke), In that same place", hermia)


LINE_BROKEN_PARENTHESIS = """HORATIO
in which our valiant Hamlet
(For so this side of our known world esteemed him)
Did slay this Fortinbras.
MARCELLUS
Good now, sit down and tell me.
HORATIO
That can I.
MARCELLUS
Say it.
"""


class AParenthesisOnItsOwnLineIsStillVerse(unittest.TestCase):
    """Folger breaks a long parenthetical onto its own line, and it is spoken.
    Every whole-line bracket in the two plays measured is of this kind; reading
    them as directions took a line of Hamlet's out of the play. A screenplay's
    wryly is a couple of words, usually lowercase, and stays a direction."""

    def test_the_clause_is_still_horatios(self):
        self.assertIn(
            "For so this side of our known world esteemed him",
            _said_by(LINE_BROKEN_PARENTHESIS, "HORATIO"),
        )

    def test_it_is_not_filed_as_a_direction(self):
        for line in _lines(LINE_BROKEN_PARENTHESIS):
            self.assertIsNone(line.get("stage_direction"), line)


class AParenthesisAloneOnALineIsADirection(unittest.TestCase):
    def test_a_wryly_is_still_a_direction(self):
        rachel = [l for l in _lines(WRYLY_ON_ITS_OWN_LINE) if l["character"] == "RACHEL"]
        self.assertNotIn("beat", " ".join(l["text"] for l in rachel))
        self.assertIn("beat", " ".join(l.get("stage_direction") or "" for l in rachel))

    def test_and_the_speech_around_it_survives(self):
        said = _said_by(WRYLY_ON_ITS_OWN_LINE, "RACHEL")
        self.assertIn("I told you already", said)
        self.assertIn("Twice", said)


class ADirectionAboutSomeoneSilentInThisScene(unittest.TestCase):
    SCENE = """THESEUS
The pale companion is not for our pomp.
Philostrate exits.
Hippolyta, I wooed thee with my sword.
HIPPOLYTA
Four days will quickly steep themselves in night.
"""

    PLAY_CAST = ["THESEUS", "HIPPOLYTA", "PHILOSTRATE", "EGEUS"]

    def test_it_is_a_direction_when_the_play_knows_the_name(self):
        self.assertNotIn("Philostrate exits", _said_by(self.SCENE, "THESEUS", self.PLAY_CAST))

    def test_the_speech_closes_back_up_around_it(self):
        said = _said_by(self.SCENE, "THESEUS", self.PLAY_CAST)
        self.assertIn("not for our pomp. Hippolyta, I wooed thee", said)

    def test_it_is_kept_as_the_direction_it_is(self):
        theseus = [l for l in _lines(self.SCENE, self.PLAY_CAST) if l["character"] == "THESEUS"]
        self.assertIn("Philostrate exits", " ".join(l.get("stage_direction") or "" for l in theseus))

    def test_a_role_inside_the_play_is_not_a_character(self):
        """Pyramus is a part the mechanicals perform, never a speaker."""
        self.assertFalse(
            _is_stage_direction_line("Pyramus draws near the wall.", self.PLAY_CAST)
        )

    def test_and_a_real_exit_still_reads_as_one(self):
        self.assertTrue(_is_stage_direction_line("Philostrate exits.", self.PLAY_CAST))


class ADirectionThatNamesWhoItIsAimedAt(unittest.TestCase):
    """Folger: "PHILOSTRATE, giving Theseus a paper".

    The direction runs until the speech starts, and it can name a character on
    the way. The first cut broke at the first capital letter unless the word
    before it was one of a short list of prepositions, so "giving" was taken as
    the whole direction and Philostrate's line began "Theseus a paper There is
    a brief how many sports are ripe."

    A capital only continues the direction when it is somebody the play cues.
    That is what stops "waking up When my cue comes" losing the "When".
    """

    CAST = ["THESEUS", "PHILOSTRATE", "BOTTOM", "FLUTE", "LYSANDER"]

    SCENE = """THESEUS
Say what abridgment have you for this evening?
PHILOSTRATE, giving Theseus a paper
There is a brief how many sports are ripe.
THESEUS
What are they that do play it?
"""

    def test_the_whole_direction_is_the_direction(self):
        line = [l for l in _lines(self.SCENE, self.CAST) if l["character"] == "PHILOSTRATE"][0]
        self.assertEqual(line["stage_direction"], "giving Theseus a paper")

    def test_and_the_speech_starts_where_it_should(self):
        said = _said_by(self.SCENE, "PHILOSTRATE", self.CAST)
        self.assertTrue(said.startswith("There is a brief"), said)
        self.assertNotIn("Theseus a paper", said)

    def test_a_direction_that_names_nobody_still_ends_at_the_speech(self):
        scene = "BOTTOM, waking up When my cue comes, call me.\nFLUTE Ready.\nBOTTOM And I.\nFLUTE Now.\n"
        line = [l for l in _lines(scene, self.CAST) if l["character"] == "BOTTOM"][0]
        self.assertEqual(line["stage_direction"], "waking up")
        self.assertTrue(line["text"].startswith("When my cue comes"), line["text"])

    def test_a_role_the_actor_plays_is_not_swallowed(self):
        """"BOTTOM, as Pyramus" — the direction stops after the role."""
        scene = ("BOTTOM, as Pyramus Thisbe, the flowers of odious savors sweet.\n"
                 "FLUTE Ready.\nBOTTOM And I.\nFLUTE Now.\n")
        line = [l for l in _lines(scene, self.CAST) if l["character"] == "BOTTOM"][0]
        self.assertEqual(line["stage_direction"], "as Pyramus")
        self.assertTrue(line["text"].startswith("Thisbe, the flowers"), line["text"])


class TheLineNumberStripStaysOnItsOwnLine(unittest.TestCase):
    SAMPLE = (
        "\n".join(f"FTLN {i:04d} Verse line {i} of the speech." for i in range(14, 19))
        + "\nFTLN 0019 With pomp, with triumph, and with reveling. 20\n7\n\n"
        + "9 A Midsummer Night's Dream ACT 1. SC. 1\n"
    )

    def test_the_number_on_this_line_goes(self):
        out = _preprocess_text(self.SAMPLE)
        self.assertIn("and with reveling.", out)
        self.assertNotIn("reveling. 20", out)

    def test_it_does_not_reach_across_the_line_break(self):
        """It used to eat the page number below and keep the one it was aimed at."""
        out = _preprocess_text(self.SAMPLE)
        self.assertIn("\n7\n", out)

    def test_a_heading_keeps_its_number(self):
        out = _preprocess_text(self.SAMPLE + "\nACT 2\nScene 1\n")
        self.assertIn("ACT 2\nScene 1", out)


class AHyphenThePdfPulledApart(unittest.TestCase):
    def test_the_space_before_it_closes(self):
        out = _preprocess_text("HIPPOLYTA\nAnd then the moon, like to a silver bow\nNew -bent in heaven.\n")
        self.assertIn("New-bent in heaven", out)

    def test_a_dash_between_words_is_left_alone(self):
        """An em dash spaced as a dash is punctuation, not a broken word."""
        out = _preprocess_text("HERMIA\nStand forth, Demetrius - my noble lord.\n")
        self.assertIn("Demetrius - my noble lord", out)


class TheWholeSceneCarriesThemAll(unittest.TestCase):
    """End to end on the shape Act 1 Scene 1 actually has.

    Two details of the real file matter and the first draft of this fixture had
    neither. The line-number strip only runs on a text that carries FTLN
    prefixes, because a bare number at the end of a line is only junk in an
    edition that numbers its lines. And Philostrate is silent in Act 1 — the
    whole point of the bug — so he has to speak somewhere else in the play for
    the cast to know him, which is exactly where Act 5 comes in.
    """

    PLAY = """ACT 1
Scene 1
Enter Theseus and Hippolyta.
THESEUS
FTLN 0014 Turn melancholy forth to funerals;
FTLN 0015 The pale companion is not for our pomp.
Philostrate exits.
FTLN 0016 Hippolyta, I wooed thee with my sword
FTLN 0017 And won thy love doing thee injuries. 20
EGEUS
FTLN 0018 With cunning hast thou filched my daughter's heart,
FTLN 0019 Turned her obedience (which is due to me)
FTLN 0020 To stubborn harshness.
THESEUS
FTLN 0021 What say you, Hermia? Be advised, fair maid.
HERMIA
FTLN 0022 So is Lysander.

ACT 5
Scene 1
THESEUS
FTLN 1900 Call Philostrate.
PHILOSTRATE
FTLN 1901 Here, mighty Theseus.
THESEUS
FTLN 1902 Say, what abridgment have you for this evening?
PHILOSTRATE
FTLN 1903 There is a brief how many sports are ripe.
"""

    def setUp(self):
        self.scene = whole_scenes(detect_scene_spans(_preprocess_text(self.PLAY)))[0]
        self.said = {
            c: " ".join(l["text"] for l in self.scene["lines"] if l["character"] == c)
            for c in self.scene["cast"]
        }

    def test_the_aside_is_in_the_verse(self):
        self.assertIn("(which is due to me)", self.said["EGEUS"])

    def test_the_exit_is_not(self):
        self.assertNotIn("Philostrate exits", self.said["THESEUS"])

    def test_no_line_number_survives(self):
        self.assertNotIn("injuries. 20", self.said["THESEUS"])
        self.assertIn("doing thee injuries", self.said["THESEUS"])


if __name__ == "__main__":
    unittest.main()
