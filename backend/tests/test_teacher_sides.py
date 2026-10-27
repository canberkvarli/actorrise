"""Sides a teacher typed up from a film: a title line on top, their own scene names."""

import unittest

from app.services.scene_reader import _drop_title_directions, check_reading
from app.services.script_parser import written_scene_title

SIDE = (
    "The Long Winter - kitchen scene\n\n"
    "NICK\nYou kept the keys.\n\n"
    "ANNA\nI kept a lot of things.\n"
)
LINES = [
    {"kind": "line", "character": "NICK", "text": "You kept the keys.", "delivery": ""},
    {"kind": "line", "character": "ANNA", "text": "I kept a lot of things.", "delivery": ""},
]
TITLE_AS_DIRECTION = [{"kind": "direction", "character": "", "text": "The Long Winter - kitchen scene"}] + LINES


class TitleLine(unittest.TestCase):
    def test_a_reading_may_leave_the_title_line_out(self):
        self.assertEqual(check_reading(SIDE, LINES), [])

    def test_a_reading_that_kept_it_loses_it_before_the_first_line(self):
        self.assertEqual(check_reading(SIDE, TITLE_AS_DIRECTION), [])
        self.assertEqual(_drop_title_directions(SIDE, TITLE_AS_DIRECTION, ["NICK", "ANNA"]), LINES)

    def test_an_opening_direction_is_still_kept(self):
        side = "Anna stands at the sink.\n\n" + SIDE.split("\n\n", 1)[1]
        items = [{"kind": "direction", "character": "", "text": "Anna stands at the sink."}] + LINES
        self.assertEqual(_drop_title_directions(side, items, ["NICK", "ANNA"]), items)
        self.assertTrue(check_reading(side, LINES))  # leaving a direction out still fails

    def test_a_cue_is_never_taken_for_a_title(self):
        bare = SIDE.split("\n\n", 1)[1]
        self.assertTrue(check_reading(bare, LINES[1:]))  # NICK's line missing is caught


class WrittenSceneTitle(unittest.TestCase):
    def test_the_heading_names_the_scene(self):
        self.assertEqual(written_scene_title("SCENE 1: The Long Winter, the kitchen\n\nNICK: Hi"),
                         "The Long Winter, the kitchen")
        self.assertEqual(written_scene_title("Scene 12 - Overtime, the lot\nDEV: Hey"), "Overtime, the lot")

    def test_a_bare_number_or_a_slugline_names_nothing(self):
        self.assertIsNone(written_scene_title("SCENE 2\n\nNICK: Hi"))
        self.assertIsNone(written_scene_title("INT. KITCHEN - NIGHT\nNICK: Hi"))
        self.assertIsNone(written_scene_title("NICK: Hi"))


if __name__ == "__main__":
    unittest.main()
