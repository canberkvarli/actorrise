"""The parser learns the title and author, then throws them away.

Canberk's shelf, 2026-09-04: "Mnd / Unknown", "Anita Ferguson Sides / Unknown",
"[TEST] Ryan Side 1 / Unknown". Every uploaded script is named after its file and
credited to nobody.

It is not that extraction failed to work it out. Reading only Act 5 of the picked
MND pages, with no title page in the text at all, metadata extraction returns
title "A Midsummer Night's Dream" and author "William Shakespeare", and the
title-page guard is happy to keep both. The upload endpoint sets the title from
the filename before the parse starts, and no path afterwards ever writes the
learned pair back: _extract_in_background stores characters, genre, length and
synopsis, and stops there.

The one thing this must not do is overrule the actor. If they typed a title in
the upload form, that is the title, however sure the model is. So a value only
gets upgraded when it is a placeholder: a title that is just the filename, or an
author that is "Unknown".
"""

import unittest

from app.api.scripts import learned_identity


class LearnedTitleReplacesTheFilename(unittest.TestCase):
    def test_filename_title_is_upgraded(self):
        title, _ = learned_identity(
            "Mnd",
            "Unknown",
            {"title": "A Midsummer Night's Dream", "author": "William Shakespeare"},
            "MND.pdf",
        )
        self.assertEqual(title, "A Midsummer Night's Dream")

    def test_unknown_author_is_upgraded(self):
        _, author = learned_identity(
            "Mnd", "Unknown",
            {"title": "A Midsummer Night's Dream", "author": "William Shakespeare"},
            "MND.pdf",
        )
        self.assertEqual(author, "William Shakespeare")

    def test_a_missing_author_is_upgraded(self):
        _, author = learned_identity("Mnd", None, {"author": "William Shakespeare"}, "MND.pdf")
        self.assertEqual(author, "William Shakespeare")


class TheActorsOwnWordsSurvive(unittest.TestCase):
    """Typing a title is a decision, not a guess to be corrected."""

    def test_a_typed_title_is_left_alone(self):
        title, _ = learned_identity(
            "Dream (audition cut)",
            "Unknown",
            {"title": "A Midsummer Night's Dream", "author": "William Shakespeare"},
            "MND.pdf",
        )
        self.assertEqual(title, "Dream (audition cut)")

    def test_a_typed_author_is_left_alone(self):
        _, author = learned_identity(
            "Mnd", "Shakespeare, adapted by me",
            {"author": "William Shakespeare"}, "MND.pdf",
        )
        self.assertEqual(author, "Shakespeare, adapted by me")


class NothingLearnedChangesNothing(unittest.TestCase):
    def test_no_metadata_keeps_the_filename_title(self):
        title, author = learned_identity("Mnd", "Unknown", {}, "MND.pdf")
        self.assertEqual(title, "Mnd")
        self.assertEqual(author, "Unknown")

    def test_an_unusable_title_is_rejected(self):
        """The guard that stops a side being named after a slug line still applies."""
        title, _ = learned_identity("Mnd", "Unknown", {"title": "INT. FOREST - NIGHT:"}, "MND.pdf")
        self.assertEqual(title, "Mnd")

    def test_a_placeholder_author_is_not_written_over_a_placeholder(self):
        _, author = learned_identity("Mnd", "Unknown", {"author": "Unknown"}, "MND.pdf")
        self.assertEqual(author, "Unknown")


if __name__ == "__main__":
    unittest.main()
