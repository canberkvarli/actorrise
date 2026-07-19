"""Tests for the comedy re-extraction helpers.

The 132 PD comedy plays yielded only 140 monologues in the original ingestion
(min_words=50 favored dramatic speeches). The re-extraction runs a lower floor
over stored/fetched play texts; these tests cover its pure helpers.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from extract_pd_monologues import (  # noqa: E402
    dedupe_key,
    folger_speeches,
    gutenberg_id_from_url,
    looks_foreign,
)

FOLGER_SNIPPET = """ACT 1
Scene 1
Enter Theseus, Hippolyta, and Philostrate, with others.
THESEUS
FTLN 0001 Now, fair Hippolyta, our nuptial hour
FTLN 0002 Draws on apace. Four happy days bring in
FTLN 0003 Another moon. But, O, methinks how slow
FTLN 0004 This old moon wanes! She lingers my desires 5
HIPPOLYTA
FTLN 0005 Four days will quickly steep themselves in night.
Exit.
"""


class GutenbergIdTests(unittest.TestCase):
    def test_ebooks_url(self):
        self.assertEqual(gutenberg_id_from_url("https://www.gutenberg.org/ebooks/1514"), 1514)

    def test_files_url(self):
        self.assertEqual(gutenberg_id_from_url("https://www.gutenberg.org/files/2270/2270-0.txt"), 2270)

    def test_cache_url(self):
        self.assertEqual(gutenberg_id_from_url("https://www.gutenberg.org/cache/epub/100/pg100.txt"), 100)

    def test_non_gutenberg_returns_none(self):
        self.assertIsNone(gutenberg_id_from_url("https://archive.org/details/whatever"))
        self.assertIsNone(gutenberg_id_from_url(None))


class DedupeKeyTests(unittest.TestCase):
    def test_same_speech_different_whitespace_and_case_collide(self):
        a = dedupe_key("To BE, or not to be:   that is\nthe question.")
        b = dedupe_key("to be or not to be that is the question")
        self.assertEqual(a, b)

    def test_different_speeches_do_not_collide(self):
        self.assertNotEqual(dedupe_key("What a piece of work is a man"), dedupe_key("Now is the winter of our discontent"))

    def test_key_uses_only_the_opening(self):
        base = "word " * 40
        self.assertEqual(dedupe_key(base + "ending one"), dedupe_key(base + "different ending"))


class FolgerSpeechesTests(unittest.TestCase):
    """The Folger/Gutenberg format (bare CAPS speaker lines, FTLN prefixes)
    is invisible to PlainTextParser — the reason famous Shakespeare comedies
    yielded ZERO monologues at original ingestion."""

    def test_speakers_and_text_extracted(self):
        speeches = folger_speeches(FOLGER_SNIPPET)
        self.assertEqual([s for s, _ in speeches], ["Theseus", "Hippolyta"])

    def test_ftln_prefixes_and_verse_numbers_stripped(self):
        speeches = dict(folger_speeches(FOLGER_SNIPPET))
        self.assertIn("Now, fair Hippolyta, our nuptial hour", speeches["Theseus"])
        self.assertNotIn("FTLN", speeches["Theseus"])
        self.assertTrue(speeches["Theseus"].endswith("lingers my desires"))

    def test_direction_lines_are_skipped(self):
        speeches = dict(folger_speeches(FOLGER_SNIPPET))
        self.assertNotIn("Enter Theseus", speeches.get("Theseus", ""))
        self.assertNotIn("Exit", speeches.get("Hippolyta", ""))

    def test_plain_prose_yields_nothing(self):
        self.assertEqual(folger_speeches("Just an essay.\nNothing dramatic here at all."), [])

    # -- defects found auditing the 2026-07-18 insert batch ----------------
    def test_gutenberg_underscore_markup_is_stripped(self):
        snippet = "HELENA\nCall you me _fair_? That _fair_ again unsay.\n"
        speeches = dict(folger_speeches(snippet))
        self.assertEqual(speeches["Helena"], "Call you me fair? That fair again unsay.")

    def test_same_line_caps_speaker_starts_a_new_speech(self):
        # 193 inserted pieces leaked headers like "PIERROT . But sir..." into
        # the previous speaker's text.
        snippet = (
            "COLUMBINE\nI have waited all night in the garden for you to come home.\n"
            "PIERROT. But the moon was my mistress long before you were.\n"
        )
        speeches = dict(folger_speeches(snippet))
        self.assertNotIn("PIERROT", speeches["Columbine"])
        self.assertTrue(speeches["Pierrot"].startswith("But the moon"))

    def test_trailing_line_numbers_stripped_even_without_ftln(self):
        snippet = "THESEUS\nThe lunatic, the lover, and the poet 1789\nAre of imagination all compact.\n"
        speeches = dict(folger_speeches(snippet))
        self.assertNotIn("1789", speeches["Theseus"])


class PieceGuardTests(unittest.TestCase):
    def test_mid_speech_speaker_leak_is_flagged(self):
        from extract_pd_monologues import piece_has_leaks
        self.assertTrue(piece_has_leaks("I admire you both more than I can say. FRANÇOISE . Where are you going?"))
        self.assertTrue(piece_has_leaks("He may give you a card. McCOMAS. Boon. Mr. Boon."))

    def test_unbracketed_direction_is_flagged(self):
        from extract_pd_monologues import piece_has_leaks
        self.assertTrue(piece_has_leaks("What noise is that? Re-enter Ophelia, fantastically dressed."))

    def test_clean_verse_is_not_flagged(self):
        from extract_pd_monologues import piece_has_leaks
        self.assertFalse(piece_has_leaks(
            "Anon he finds him, striking too short at Greeks. His antique sword, "
            "rebellious to his arm, lies where it falls. O, I am fortune's fool!"
        ))

    def test_titlecase_interleave_is_flagged(self):
        # The "Anne/Ruth" class: other characters' cue lines in Title Case
        # ("...aren't they? Anne. What do you mean? Ruth. No, really I didn't.")
        from extract_pd_monologues import piece_has_leaks
        self.assertTrue(piece_has_leaks(
            "Girls are funny things, aren't they? Anne. What do you mean? "
            "I lent her my notebook once. Ruth. No, really I didn't."
        ))

    def test_honorifics_are_not_interleave(self):
        from extract_pd_monologues import piece_has_leaks
        self.assertFalse(piece_has_leaks(
            "I saw him yesterday. Mr. Darcy was there, and so was Mrs. Bennet. "
            "Dr. Jones arrived later. St. Petersburg was lovely that year."
        ))


class MultiPartInlineSpeakerTests(unittest.TestCase):
    def test_abbreviated_two_part_name_is_fully_consumed(self):
        # "MRS. LEZINSKY. No, no, Solly..." must not leave "LEZINSKY." in the text.
        snippet = "MRS. LEZINSKY. No, no, Solly, you should not speak that word to me.\n"
        speeches = dict(folger_speeches(snippet))
        self.assertIn("Mrs. Lezinsky", speeches)
        self.assertTrue(speeches["Mrs. Lezinsky"].startswith("No, no, Solly"))


class LooksForeignTests(unittest.TestCase):
    def test_dutch_text_is_flagged(self):
        # id 15099 in the audited batch: a Dutch source ingested as English.
        self.assertTrue(looks_foreign(
            "Hoe wijs ook, hebt ge u toch vergist, Gij zaagt mij nog als eertijds "
            "thuis. Met ouderliefde en met een hart dat niet vergeet."
        ))

    def test_english_verse_is_not_flagged(self):
        self.assertFalse(looks_foreign(
            "The lunatic, the lover, and the poet are of imagination all compact. "
            "One sees more devils than vast hell can hold."
        ))


if __name__ == "__main__":
    unittest.main()
