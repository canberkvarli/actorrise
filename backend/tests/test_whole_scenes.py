"""A play is cut on its own scene headings, and nothing inside a scene is skipped.

Until 2026-09-06 every scene on the shelf was whatever gpt-4o-mini chose to
retype out of a chunk cut at page boundaries. On A Midsummer Night's Dream that
gave 11 speeches for the four lovers' fight, which has 130, and two scenes
missing altogether. The model was choosing the lines, and the guard that put
dropped lines back only knew about the two leads.

Now a play that carries ACT / Scene headings is cut on them, every cue and
every speech is taken verbatim by the deterministic parser, the full cast is
kept, and the model is asked for a title and a summary and nothing else.
Rehearsal already reads every part that is not the actor's, so a scene with
six speakers works the same as a scene with two.
"""

import unittest
from unittest.mock import patch

from app.services.scene_map import detect_scene_spans
from app.services.script_parser import ScriptParser, whole_scene, whole_scenes

MINI_PLAY = """A Midsummer Night's Dream
by William Shakespeare

Characters in the Play
THESEUS, Duke of Athens
HIPPOLYTA, Queen of the Amazons
NICK BOTTOM, weaver
PETER QUINCE, carpenter

ACT 1
Scene 1
Enter Theseus and Hippolyta.
THESEUS
Now, fair Hippolyta, our nuptial hour
Draws on apace.
HIPPOLYTA
Four days will quickly steep themselves in night.
THESEUS, to Philostrate
Go, Philostrate, stir up the Athenian youth.
HIPPOLYTA
Four nights will quickly dream away the time.
THESEUS
Hippolyta, I wooed thee with my sword.

Scene 2
Enter Quince and Bottom.
QUINCE Is all our company here?
BOTTOM You were best to call them generally, man by
man, according to the scrip.
QUINCE Here is the scroll of every man's name.
BOTTOM First, good Peter Quince, say what the play
treats on.
QUINCE Marry, our play is Pyramus and Thisbe.
BOTTOM, as Pyramus Thisbe, the flowers of odious savors sweet.
"""


def _spans():
    return detect_scene_spans(MINI_PLAY)


class TheSceneMapSeesEveryScene(unittest.TestCase):
    def test_both_scenes_are_found(self):
        labels = [(s.act_label, s.scene_label) for s in _spans()]
        self.assertEqual(labels, [("Act 1", "Scene 1"), ("Act 1", "Scene 2")])

    def test_the_cast_list_is_not_a_scene(self):
        self.assertTrue(all(s.scene_label for s in _spans()))

    def test_the_prose_scene_has_its_speakers(self):
        prose = _spans()[1]
        self.assertEqual(set(prose.characters), {"QUINCE", "BOTTOM"})
        self.assertEqual(prose.line_count, 6)


class ASceneIsTheWholeScene(unittest.TestCase):
    def setUp(self):
        self.verse, self.prose = (whole_scene(s) for s in _spans())

    def test_every_speech_is_there_in_order(self):
        texts = [l["text"] for l in self.verse["lines"]]
        self.assertEqual(len(texts), 5)
        self.assertTrue(texts[0].startswith("Now, fair Hippolyta"))
        self.assertTrue(texts[-1].startswith("Hippolyta, I wooed"))

    def test_the_leads_are_whoever_speaks_most(self):
        self.assertEqual(self.verse["character_1"], "THESEUS")
        self.assertEqual(self.verse["character_2"], "HIPPOLYTA")

    def test_it_knows_where_it_sits_in_the_play(self):
        self.assertEqual(self.prose["act"], "Act 1")
        self.assertEqual(self.prose["scene_number"], "Scene 2")

    def test_the_title_falls_back_to_the_label(self):
        self.assertEqual(self.prose["title"], "Act 1, Scene 2")

    def test_the_full_cast_is_named(self):
        self.assertEqual(self.prose["cast"], ["QUINCE", "BOTTOM"])

    def test_a_span_nobody_speaks_in_is_not_a_scene(self):
        from app.services.scene_map import SceneSpan

        empty = SceneSpan("Act 9", "Scene 9", "Enter nobody.\n", 0, 14)
        self.assertIsNone(whole_scene(empty))


class AnUnlabelledTailIsNotAScene(unittest.TestCase):
    """A picked scene starts on a page; the top of that page is the end of the
    scene before. Once there are labelled scenes, an unlabelled preamble is a
    scrap, not a scene of its own. A side with no headings at all is still
    one scene."""

    def test_the_preamble_is_dropped_when_headings_follow(self):
        from app.services.scene_map import SceneSpan

        tail = SceneSpan(None, None, "HELENA\nO weary night.\nHERMIA\nNever so weary.\n"
                         "HELENA\nAnd sleep.\nHERMIA\nHeavens shield Lysander.\n", 0, 80)
        scenes = whole_scenes([tail] + _spans())
        self.assertEqual([s["act"] for s in scenes], ["Act 1", "Act 1"])

    def test_a_headerless_side_is_still_one_scene(self):
        side = detect_scene_spans(
            "HELENA\nO weary night, O long and tedious night.\nHERMIA\nNever so weary, never so in woe.\n"
            "HELENA\nAbate thy hours.\nHERMIA\nHere will I rest me.\n"
        )
        self.assertEqual(len(whole_scenes(side)), 1)


class TitlesLandOnTheSceneTheyDescribe(unittest.TestCase):
    """gpt-4o-mini, asked for nine titles in order, dropped one and shifted the
    rest up. The reply names the scene it is about; that is what places it."""

    def setUp(self):
        from app.services.script_parser import _place_framing

        self.place = _place_framing
        self.blank = [{"title": f"blank {i}"} for i in range(4)]
        self.valid = [(i, "x") for i in range(4)]

    def test_a_numbered_reply_goes_where_it_says(self):
        reply = [{"scene": 1, "title": "one"}, {"scene": 3, "title": "three"},
                 {"scene": 4, "title": "four"}]
        out = self.place(list(self.blank), reply, self.valid)
        self.assertEqual([o["title"] for o in out], ["one", "blank 1", "three", "four"])

    def test_a_reply_with_no_number_falls_back_to_its_position(self):
        reply = [{"title": "one"}, {"title": "two"}]
        out = self.place(list(self.blank), reply, self.valid)
        self.assertEqual([o["title"] for o in out], ["one", "two", "blank 2", "blank 3"])

    def test_a_number_off_the_end_is_ignored_not_crashed(self):
        reply = [{"scene": 9, "title": "nine"}, {"scene": "two", "title": "two"}]
        out = self.place(list(self.blank), reply, self.valid)
        self.assertEqual([o["title"] for o in out], ["nine", "two", "blank 2", "blank 3"])


class ParseScriptCutsOnTheHeadings(unittest.TestCase):
    """End to end, with the two model calls stubbed: one for the cast, one for titles."""

    def setUp(self):
        self.parser = ScriptParser()
        meta = {"title": "A Midsummer Night's Dream", "author": "William Shakespeare",
                "characters": [{"name": "THESEUS"}, {"name": "HIPPOLYTA"},
                               {"name": "QUINCE"}, {"name": "BOTTOM"}]}
        titles = [{"title": "The Duke Waits", "description": "Theseus counts the days."},
                  {"title": "Casting the Play", "description": "Quince hands out parts."}]
        with patch.object(ScriptParser, "extract_script_metadata", return_value=meta), \
             patch.object(ScriptParser, "analyze_scenes_batch", return_value=titles) as ai, \
             patch.object(ScriptParser, "extract_combined") as combined, \
             patch.object(ScriptParser, "extract_chunk_ai") as chunk_ai:
            self.result = self.parser.parse_script(MINI_PLAY.encode(), "txt", "mnd.txt")
            self.titles_call = ai
            self.combined = combined
            self.chunk_ai = chunk_ai

    def test_one_scene_per_heading(self):
        self.assertEqual(len(self.result["scenes"]), 2)

    def test_not_one_speech_is_lost(self):
        self.assertEqual([len(s["lines"]) for s in self.result["scenes"]], [5, 6])

    def test_the_model_never_chooses_lines(self):
        self.combined.assert_not_called()
        self.chunk_ai.assert_not_called()

    def test_the_model_writes_the_titles(self):
        self.assertEqual([s["title"] for s in self.result["scenes"]],
                         ["The Duke Waits", "Casting the Play"])
        self.assertEqual(self.result["scenes"][1]["description"], "Quince hands out parts.")

    def test_a_direction_rides_on_its_line(self):
        bottom = self.result["scenes"][1]["lines"][-1]
        self.assertEqual(bottom["character"], "BOTTOM")
        self.assertEqual(bottom["stage_direction"], "as Pyramus")
        self.assertTrue(bottom["text"].startswith("Thisbe, the flowers"))


if __name__ == "__main__":
    unittest.main()
