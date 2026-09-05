"""The name on the card has to be the name an actor would search for.

Two failures found by applying the Gutenberg sweep to four real books:

1. *The Beggar's Opera* produced 42 "monologues" whose characters were called
   "Air I", "Air Xxxvii", "Air Lxvi". It is a ballad opera: the song headings
   look exactly like speaker cues, so every row was a lyric attributed to a
   roman numeral. `_ROMAN` did not catch them because the numeral has a word in
   front of it.

2. *The Way of the World* stored its speakers as Congreve printed them --
   "Mira.", "Milla.", "Mrs Mar.", "Sir Wil.", "Foib.", and a character simply
   called "Lady". Nobody searching Millamant or Marwood would ever find them,
   and "Lady" is not a character. Every Restoration and 18th-century text
   abbreviates this way, and those are exactly the comedies the sweep is for.
"""

import unittest

from app.services.extraction.plain_text_parser import PlainTextParser


class SongHeadingTests(unittest.TestCase):
    """A song number is not a person."""

    def setUp(self):
        self.parser = PlainTextParser()

    def test_ballad_opera_air_headings_are_not_characters(self):
        for heading in ["AIR I", "Air Xxxvii", "AIR LXVI.", "air 12"]:
            self.assertFalse(
                self.parser._is_plausible_character(heading),
                f"{heading!r} was accepted as a character",
            )

    def test_other_musical_headings_are_rejected(self):
        for heading in ["SONG III", "Duet II", "CHORUS I", "RECITATIVE IV"]:
            self.assertFalse(self.parser._is_plausible_character(heading), heading)

    def test_a_real_character_is_still_accepted(self):
        for name in ["MACHEATH", "Polly Peachum", "Mrs Peachum", "Lucy"]:
            self.assertTrue(self.parser._is_plausible_character(name), name)

    def test_a_person_whose_name_starts_with_air_survives(self):
        """The guard is 'AIR <numeral>', not any name beginning with air."""
        self.assertTrue(self.parser._is_plausible_character("Airlie"))


class CastExpansionTests(unittest.TestCase):
    WAY_OF_THE_WORLD = [
        "FAINALL", "MIRABELL", "WITWOUD", "PETULANT", "SIR WILFULL WITWOUD",
        "WAITWELL", "LADY WISHFORT", "MRS MILLAMANT", "MRS MARWOOD",
        "MRS FAINALL", "FOIBLE", "MINCING",
    ]

    def setUp(self):
        self.parser = PlainTextParser()

    def expand(self, cue, cast=None):
        return self.parser._expand_from_cast(cue, cast or self.WAY_OF_THE_WORLD)

    def test_a_prefix_cue_reaches_its_full_name(self):
        self.assertEqual(self.expand("Mira"), "Mirabell")
        self.assertEqual(self.expand("Foib"), "Foible")
        self.assertEqual(self.expand("Pet"), "Petulant")

    def test_a_multi_word_cue_matches_positionally(self):
        self.assertEqual(self.expand("Sir Wil"), "Sir Wilfull Witwoud")
        self.assertEqual(self.expand("Mrs Mar"), "Mrs Marwood")
        self.assertEqual(self.expand("Mrs Fain"), "Mrs Fainall")

    def test_a_bare_honorific_resolves_when_only_one_fits(self):
        """'Lady' is useless on a card; only one Lady is in the play."""
        self.assertEqual(self.expand("Lady"), "Lady Wishfort")

    def test_a_surname_cue_finds_a_two_part_entry(self):
        """'Milla.' is Millamant, whose cast entry reads MRS MILLAMANT."""
        self.assertEqual(self.expand("Milla"), "Mrs Millamant")

    def test_an_unknown_cue_is_left_alone(self):
        """A servant with no cast entry keeps whatever the text called them."""
        self.assertEqual(self.expand("Serv"), "Serv")

    def test_ambiguity_keeps_the_original(self):
        """A wrong expansion is worse than an abbreviation: it looks correct."""
        cast = ["JOHN SMITH", "JOHN BROWN"]
        self.assertEqual(self.parser._expand_from_cast("John", cast), "John")

    def test_accented_names_match_an_unaccented_cue(self):
        """Molière abbreviates CLÉANTHIS to 'Cle.', without the accent."""
        cast = ["MERCURY", "JUPITER", "ALCMÈNE", "CLÉANTHIS", "NAUCRATÈS"]
        self.assertEqual(self.parser._expand_from_cast("Cle", cast), "Cléanthis")
        self.assertEqual(self.parser._expand_from_cast("Alcm", cast), "Alcmène")

    def test_no_cast_block_changes_nothing(self):
        """Modern texts spell speakers out and must pass through untouched."""
        self.assertEqual(self.parser._expand_from_cast("Mrs Tarleton", []),
                         "Mrs Tarleton")


class CastListTests(unittest.TestCase):
    """Reading the DRAMATIS PERSONAE block itself."""

    CRLF_TEXT = (
        "THE WAY OF THE WORLD\r\n\r\n"
        "DRAMATIS PERSONAE.\r\n\r\n"
        "                        MEN.\r\n"
        "FAINALL, in love with Mrs. Marwood,          _Mr. Betterton_.\r\n"
        "MIRABELL, in love with Mrs. Millamant,       _Mr. Verbruggen_.\r\n"
        "SIR WILFULL WITWOUD, half brother to Witwoud,\r\n"
        "                        WOMEN.\r\n"
        "LADY WISHFORT, enemy to Mirabell,            _Mrs. Leigh_.\r\n"
        "MRS. MARWOOD, friend to Mr. Fainall,         _Mrs. Barry_.\r\n\r\n"
        "ACT I. SCENE I.\r\n"
    )

    def setUp(self):
        self.parser = PlainTextParser()

    def test_reads_the_block_through_crlf_line_endings(self):
        """Gutenberg files are CRLF; a bare `$` anchor finds nothing in them."""
        cast = self.parser._cast_list(self.CRLF_TEXT)
        self.assertIn("MIRABELL", cast)
        self.assertIn("SIR WILFULL WITWOUD", cast)

    def test_a_period_does_not_truncate_a_title(self):
        """'MRS. MARWOOD' must not be read as 'MRS'."""
        self.assertIn("MRS MARWOOD", self.parser._cast_list(self.CRLF_TEXT))

    def test_section_labels_are_not_characters(self):
        cast = self.parser._cast_list(self.CRLF_TEXT)
        self.assertNotIn("MEN", cast)
        self.assertNotIn("WOMEN", cast)

    def test_the_block_stops_at_the_first_act(self):
        self.assertNotIn("ACT I", " ".join(self.parser._cast_list(self.CRLF_TEXT)))

    def test_a_dedication_mentioning_characters_is_not_a_cast_block(self):
        """The heading must own its line, or prose about 'characters' matches."""
        prose = ("Those characters which are meant to be ridiculed in most of "
                 "our comedies are of fools so gross that they disturb.\n")
        self.assertEqual(self.parser._cast_list(prose), [])


class BareCapsCueTests(unittest.TestCase):
    """A speaker named on its own line, with no punctuation to anchor on.

    The largest measured blind spot in the parser. Of 461 Gutenberg books a
    sweep read and got nothing from, sampling put roughly five in eight here
    rather than at a legitimate zero -- Racine's Phaedra, Maeterlinck's The Blue
    Bird and Moliere's Tartuffe among them, all returning 0 monologues from
    texts full of dialogue. Patterns 1 and 2 need a colon or a period, and
    pattern 4 needs Title Case; none of them can see this.

        PHAEDRA                        indented, bare
        THE BEECH                      at column 0
        TARTUFFE (after sitting down)  with a direction
    """

    # Each speaker recurs five times: _MIN_CUE_REPEATS is what separates a
    # speaker from a title that happens to be capitalised, so a shorter fixture
    # tests nothing.
    PHAEDRA = (
        "          OENONE\n"
        "          How cruelly his eyes, severely fixed,\n"
        "          Surveyed you almost prostrate at his feet!\n"
        "          PHAEDRA\n"
        "          This proud mood that you resent may yield to time.\n"
        "          OENONE\n"
        "          He is a son of the Amazon, and cold.\n"
        "          PHAEDRA\n"
        "          And yet I saw him blush when he was named.\n"
        "          OENONE\n"
        "          Then there is hope for you, and I am glad.\n"
        "          PHAEDRA\n"
        "          Hope is the cruellest gift the gods can send.\n"
        "          OENONE\n"
        "          Do not despair, my lady, while he lives.\n"
        "          PHAEDRA\n"
        "          I have said too much. Leave me to my shame.\n"
        "          OENONE\n"
        "          I will not leave you to it. Come away.\n"
        "          PHAEDRA\n"
        "          Then lead me where the light cannot find me.\n"
    )

    def setUp(self):
        self.parser = PlainTextParser()

    def test_bare_caps_names_are_found(self):
        cast = self.parser._bare_caps_cast(self.PHAEDRA)
        self.assertIn("PHAEDRA", cast)
        self.assertIn("OENONE", cast)

    def test_speeches_split_at_each_cue(self):
        speeches = self.parser._split_on_bare_caps(
            self.PHAEDRA, self.parser._bare_caps_cast(self.PHAEDRA))
        self.assertEqual(len(speeches), 10)   # 5 cues each for two speakers
        self.assertEqual(speeches[0][0], "OENONE")
        self.assertIn("severely fixed", speeches[0][1])
        # A speech must stop at the next cue, not swallow the rest of the play.
        self.assertNotIn("PHAEDRA", speeches[0][1])

    def test_a_cue_may_carry_a_direction(self):
        text = self.PHAEDRA.replace("          PHAEDRA\n",
                                    "          PHAEDRA (rising)\n", 1)
        self.assertIn("PHAEDRA", self.parser._bare_caps_cast(text))

    def test_a_name_at_column_zero_works(self):
        """Maeterlinck sets them flush left; Racine indents. Both are cues."""
        flush = self.PHAEDRA.replace("          ", "")
        self.assertIn("PHAEDRA", self.parser._bare_caps_cast(flush))

    def test_act_headings_do_not_become_speakers(self):
        text = ("ACT I\n\nSCENE II\n\n" + self.PHAEDRA) * 1
        cast = self.parser._bare_caps_cast(text)
        self.assertNotIn("ACT I", cast)
        self.assertNotIn("SCENE II", cast)

    def test_a_one_off_capital_line_is_not_a_speaker(self):
        """A title needs to recur before it counts, or every heading qualifies."""
        text = "THE TRAGEDY OF PHAEDRA\n\nsome front matter here\n"
        self.assertEqual(self.parser._bare_caps_cast(text), [])


if __name__ == "__main__":
    unittest.main()
