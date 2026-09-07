"""Two ways a Gutenberg play was read as something other than a play.

Both found by running the extractor over 25 random public-domain plays from
the corpus on 2026-09-07, rather than over the two PDFs on my desk. The
Trojan Women came back as seven lines spoken by people called "'Tis their
will" and "[_Antistrophe._", out of a 118,000 character play.

A HEADING IS A LINE, NOT THE START OF A SENTENCE. Act and scene patterns are
matched case-insensitively, `[IVX]+` therefore matches a lowercase "i", and
re.match does not require the rest of the line to agree. So this, from a
Gutenberg afterword:

    scene is perhaps marred to most modern readers by an element

matched "scene i" and became Scene 1. It sat 88% of the way through the file,
and every line of the play was in front of it, outside the only scene the map
then knew about.

VERSE IS INDENTED; THAT DOES NOT MAKE IT A SCREENPLAY. The column reader looks
for the deepest column holding short shouted lines and calls it the cue
column. A page of indented verse has one, and the "names" it finds there are
lines of poetry, each appearing once. A screenplay says the same handful of
names over and over, and it indents them well clear of the dialogue. Neither
was being checked.
"""

import unittest

from app.services.script_parser import _screenplay_columns, parse_dialogue
from app.services.script_structure import _match_act, _match_scene, detect_structure


class AHeadingIsALineOfItsOwn(unittest.TestCase):
    def test_prose_that_opens_with_the_word_is_not_a_heading(self):
        self.assertIsNone(
            _match_scene("scene is perhaps marred to most modern readers by an element")
        )

    def test_nor_is_a_sentence_about_an_act(self):
        self.assertIsNone(_match_act("act is a word with several meanings in the theatre"))

    def test_a_real_heading_still_reads(self):
        self.assertEqual(_match_scene("SCENE II"), "Scene 2")
        self.assertEqual(_match_scene("Scene 2"), "Scene 2")
        self.assertEqual(_match_act("ACT III"), "Act 3")
        self.assertEqual(_match_act("ACT ONE"), "Act 1")

    def test_a_numeral_glued_to_a_word_is_not_a_numeral(self):
        self.assertIsNone(_match_act("ACT IONE OF THE PLAYERS"))

    def test_a_long_line_is_prose_however_it_starts(self):
        self.assertIsNone(
            _match_act("ACT 1 was written in the spring of that year, and revised later")
        )

    def test_the_play_is_not_swallowed_by_an_afterword(self):
        play = (
            "ACT I\n\nHECUBA.\n\n    Up from the earth, O weary head!\n\n"
            "POSEIDON.\n\n    I am the sea god.\n\n"
            "HECUBA.\n\n    Endure and chafe not.\n\n"
            "POSEIDON.\n\n    The winds rave and falter.\n\n"
            "NOTE\n\nThe scene is perhaps marred to most modern readers by an element.\n"
        )
        labels = [(c.act_label, c.scene_label) for c in detect_structure(play)]
        self.assertEqual(labels, [("Act 1", None)])


class IndentedVerseIsNotAScreenplay(unittest.TestCase):
    VERSE = "\n".join(
        [
            "HECUBA.",
            "",
            "    Up from the earth, O weary head!",
            "      This is not Troy, about, above--",
            "      Not Troy, nor we the lords thereof.",
            "    Thou breaking neck, be strengthened!",
            "",
            "POSEIDON.",
            "",
            "    Endure and chafe not. The winds rave",
            "      And falter. Down the world's wide road,",
            "      Float, float where streams the breath of God;",
            "    Nor turn thy prow to breast the wave.",
        ]
    )

    SCREENPLAY = "\n".join(
        [
            "INT. COURTHOUSE - DAY",
            "",
            "A crowd gathers in the corridor.",
            "",
            "                    FERGUSON",
            "          Why can't I speak?",
            "",
            "                    CLERK",
            "          You need to be part of the lawsuit.",
            "",
            "                    FERGUSON",
            "          I was at Stuyvesant High.",
            "",
            "                    CLERK",
            "          I'm really sorry.",
        ]
    )

    def test_verse_is_not_read_as_columns(self):
        self.assertIsNone(_screenplay_columns(self.VERSE))

    def test_and_so_its_speakers_are_its_speakers(self):
        speakers = {l["character"] for s in parse_dialogue(self.VERSE) for l in s["lines"]}
        self.assertEqual(speakers, {"HECUBA", "POSEIDON"})

    def test_a_real_screenplay_still_reads_as_columns(self):
        columns = _screenplay_columns(self.SCREENPLAY)
        self.assertIsNotNone(columns)
        self.assertGreater(columns["cue"], columns["dialogue"])

    def test_and_its_dialogue_lands_on_its_cues(self):
        lines = [l for s in parse_dialogue(self.SCREENPLAY) for l in s["lines"]]
        said = " ".join(l["text"] for l in lines if l["character"] == "FERGUSON")
        self.assertIn("Why can't I speak?", said)
        self.assertIn("Stuyvesant High", said)


class AnItalicisedCue(unittest.TestCase):
    """Project Gutenberg marks italics with underscores, and some editions
    italicise the cue. St. Patrick's Day prints "_Flint_. Oh, faith!" and came
    back as seven lines out of a whole play."""

    SCENE = """_Flint_. Oh, faith! here comes the lieutenant.

_All_. Agreed, agreed.

_Flint_. Now, Serjeant, you will show the more judgment.

_All_. Let him alone for the argument.

_Flint_. I'll be as loud as a drum.

_All_. And point blank from the purpose.
"""

    def test_the_underscores_do_not_hide_the_cue(self):
        speakers = {l["character"] for s in parse_dialogue(self.SCENE) for l in s["lines"]}
        self.assertEqual(speakers, {"FLINT", "ALL"})

    def test_the_lines_are_whole(self):
        lines = [l for s in parse_dialogue(self.SCENE) for l in s["lines"]]
        said = " ".join(l["text"] for l in lines if l["character"] == "FLINT")
        self.assertIn("here comes the lieutenant", said)
        self.assertNotIn("_", said)


class AnUnlabelledSpanCanBeTheWholePlay(unittest.TestCase):
    """Alcestis keeps its play in one unlabelled span with a one-line
    "Prologue" heading beside it. Dropping the unlabelled span for being
    unlabelled threw the play away and returned no scenes at all."""

    PLAY = "\n".join(
        ["APOLLO.", "I have come to this house of Admetus.", "DEATH.", "What dost thou here?"]
        + [f"APOLLO.\nLine {n} of the argument.\nDEATH.\nAnd line {n} of my answer." for n in range(9)]
        + ["", "PROLOGUE", "", "ADMETUS.", "A word before we begin."]
    )

    def test_the_play_is_kept(self):
        from app.services.script_parser import whole_scenes
        from app.services.scene_map import detect_scene_spans

        scenes = whole_scenes(detect_scene_spans(self.PLAY))
        self.assertTrue(scenes)
        self.assertGreater(sum(len(s["lines"]) for s in scenes), 15)
        self.assertIn("APOLLO", {c for s in scenes for c in s["cast"]})

    def test_a_real_scrap_is_still_dropped(self):
        from app.services.script_parser import whole_scenes
        from app.services.scene_map import detect_scene_spans

        text = (
            "HELENA\nO weary night.\nHERMIA\nNever so weary.\n\nACT 1\nScene 1\n"
            + "\n".join(f"THESEUS\nLine {n} of the scene.\nHIPPOLYTA\nAnswer {n}." for n in range(12))
        )
        scenes = whole_scenes(detect_scene_spans(text))
        self.assertEqual([s["act"] for s in scenes], ["Act 1"])


if __name__ == "__main__":
    unittest.main()
