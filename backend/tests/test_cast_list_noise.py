"""Apparatus is not cast.

Across 40 corpus plays the cast lists came back carrying things nobody can
play. Wilde's setting headers (TIME, PLACE, LONDON), the table of contents of
an edition (INTRODUCTION, FOOTNOTES, CONTENTS), act headings written out
("THE FIRST ACT"), roman numerals from a scene list (III, IV, V), and stray
initials left by a footnote marker (J, P, G).

The line to hold is that plenty of odd-looking cues are real parts and have to
survive: ALL and BOTH and VOICES are how a crowd is cued, FIRST HERALD and
ANOTHER LORD and FOOTMAN are people with one line each, and PA is somebody's
father. So this is a list of things that are never a part, not a rule about
speaking rarely.
"""

import unittest

from app.services.script_parser import _is_excluded, parse_dialogue


class NeverAPart(unittest.TestCase):
    def test_the_headings_of_a_cast_list(self):
        for name in ("CHARACTERS", "PERSONS", "DRAMATIS PERSONAE", "CAST"):
            self.assertTrue(_is_excluded(name), name)

    def test_the_furniture_of_an_edition(self):
        for name in ("INTRODUCTION", "PREFACE", "CONTENTS", "FOOTNOTES", "NOTES", "APPENDIX"):
            self.assertTrue(_is_excluded(name), name)

    def test_a_setting_header(self):
        for name in ("TIME", "PLACE", "SETTING", "SYNOPSIS", "ARGUMENT"):
            self.assertTrue(_is_excluded(name), name)

    def test_an_act_heading_written_out(self):
        for name in ("THE FIRST ACT", "THE SECOND ACT", "THE FIFTH ACT", "ACT", "SCENE", "CURTAIN"):
            self.assertTrue(_is_excluded(name), name)

    def test_a_roman_numeral_from_a_scene_list(self):
        for name in ("III", "IV", "V", "VII", "XI"):
            self.assertTrue(_is_excluded(name), name)

    def test_a_stray_initial(self):
        for name in ("J", "P", "G"):
            self.assertTrue(_is_excluded(name), name)

    def test_a_title_left_on_its_own(self):
        for name in ("MR", "MRS", "DR", "ST", "REV", "CAPT", "PROF"):
            self.assertTrue(_is_excluded(name), name)


class StillAPart(unittest.TestCase):
    def test_a_crowd_is_cued_somehow(self):
        for name in ("ALL", "BOTH", "VOICES", "MEN", "OMNES"):
            self.assertFalse(_is_excluded(name), name)

    def test_a_person_with_one_line(self):
        for name in ("FIRST HERALD", "ANOTHER LORD", "FOOTMAN", "A FAIRY", "SECOND FAIRY"):
            self.assertFalse(_is_excluded(name), name)

    def test_two_letters_can_be_somebody(self):
        for name in ("PA", "MA", "BO"):
            self.assertFalse(_is_excluded(name), name)

    def test_the_parts_of_a_play_within_a_play(self):
        for name in ("PROLOGUE", "CHORUS", "EPILOGUE"):
            self.assertFalse(_is_excluded(name), name)

    def test_a_title_that_is_a_whole_part(self):
        """Hamlet Act 5 Scene 2 has a Lord who comes in with a message.
        Reading LORD as a stranded honorific cost him all three speeches."""
        for name in ("LORD", "LADY", "SIR", "DOCTOR", "CAPTAIN", "FIRST LORD"):
            self.assertFalse(_is_excluded(name), name)


class ItCleansARealCastList(unittest.TestCase):
    PLAY = """CHARACTERS.
The people of the play.

TIME.
The present.

PLACE.
London.

LORD GORING.
I have nothing to declare.

MRS CHEVELEY.
Nothing at all?

LORD GORING.
Nothing whatever.

MRS CHEVELEY.
How very disappointing.

ALL.
Hear, hear!

FOOTMAN.
The carriage is waiting, my lord.
"""

    def test_the_apparatus_is_gone(self):
        speakers = {l["character"] for s in parse_dialogue(self.PLAY) for l in s["lines"]}
        self.assertNotIn("CHARACTERS", speakers)
        self.assertNotIn("TIME", speakers)
        self.assertNotIn("PLACE", speakers)

    def test_the_people_are_all_there(self):
        speakers = {l["character"] for s in parse_dialogue(self.PLAY) for l in s["lines"]}
        self.assertEqual(speakers, {"LORD GORING", "MRS CHEVELEY", "ALL", "FOOTMAN"})

    def test_and_keep_what_they_say(self):
        lines = [l for s in parse_dialogue(self.PLAY) for l in s["lines"]]
        said = " ".join(l["text"] for l in lines if l["character"] == "FOOTMAN")
        self.assertIn("The carriage is waiting", said)


if __name__ == "__main__":
    unittest.main()
