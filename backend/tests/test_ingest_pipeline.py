"""The one ingest path every source is supposed to use.

`scrape_all_sources.py` fed Gutenberg, Archive.org, Wikisource and Perseus into
a hand-rolled insert loop that ran no quality gate, no duplicate check, no
language check, produced no metadata and no embedding. Its rows were invisible
to semantic search (nothing to search on) AND to every filter (no gender, age or
tone), so the count went up and the library did not.

These tests pin the refusals that happen BEFORE any database work, which is why
they need no database: rights, then usable text, then language. Getting that
order wrong is how 267 rows arrived `copyrighted` with no `license_type` — the
one combination `may_store_text` refuses — and sat unnoticed for months.
"""

import unittest

from app.services.data_ingestion.pipeline import GROUP_CUES, ingest_play

ENGLISH = (
    "I have been thinking about my father a great deal lately and I do not "
    "know what to do with any of it. He was a hard man and I spent my life "
    "trying to earn a word from him that never came, not once, not ever. "
) * 20


class RightsRefusalTests(unittest.TestCase):
    """No basis, no ingest. Checked first, before anything is parsed."""

    def _refusal(self, **kw):
        # db=None on purpose: if any of these reach the database this test
        # raises AttributeError, which is the failure we want to hear about.
        return ingest_play(
            None, title="X", author="Y", full_text=ENGLISH,
            copyright_status=kw.pop("copyright_status", "public_domain"),
            license_type=kw.pop("license_type", "public_domain"), **kw,
        ).refused

    def test_copyrighted_with_no_licence_is_refused(self):
        refused = self._refusal(copyright_status="copyrighted", license_type=None)
        self.assertIsNotNone(refused)
        self.assertIn("no basis to store text", refused)

    def test_unknown_status_is_refused(self):
        self.assertIsNotNone(
            self._refusal(copyright_status="unknown", license_type=None))

    def test_public_domain_is_allowed_through(self):
        """Not refused — it gets as far as parsing, which is the point."""
        self.assertIsNone(self._refusal())

    def test_licensed_copyrighted_work_is_allowed_through(self):
        self.assertIsNone(
            self._refusal(copyright_status="copyrighted", license_type="licensed"))

    def test_rights_are_checked_before_the_text(self):
        """Order matters: a bad-rights source must not even be parsed."""
        refused = ingest_play(
            None, title="X", author="Y", full_text="",
            copyright_status="copyrighted", license_type=None,
        ).refused
        self.assertIn("no basis to store text", refused)


class SourceRefusalTests(unittest.TestCase):
    def test_a_document_with_no_usable_text_is_refused(self):
        r = ingest_play(None, title="X", author="Y", full_text="short",
                        copyright_status="public_domain",
                        license_type="public_domain")
        self.assertEqual(r.refused, "no usable full text")

    def test_a_non_english_source_is_refused(self):
        """Language is judged once on the DOCUMENT, never per speech.

        Judging per monologue rejected real Shakespeare, whose archaic function
        words score like another language over fifty words of verse.
        """
        dutch = ("Ik kan niet geloven wat je mij nu vertelt op dit moment "
                 "dat zo belangrijk is voor ons beiden en voor alles ") * 40
        r = ingest_play(None, title="X", author="Y", full_text=dutch,
                        copyright_status="public_domain",
                        license_type="public_domain")
        self.assertEqual(r.refused, "source is not English")


class ApplyContractTests(unittest.TestCase):
    def test_writing_requires_an_analyser_and_an_embedder(self):
        """Injected, not imported, so a dry run costs nothing and needs no key.

        Failing loudly here beats inserting rows with no embedding, which is
        precisely what the old scraper did — and an unembedded row cannot be
        found by the search the whole product is built on.
        """
        with self.assertRaises(ValueError):
            ingest_play(None, title="X", author="Y", full_text=ENGLISH,
                        copyright_status="public_domain",
                        license_type="public_domain", apply=True)


class GroupCueTests(unittest.TestCase):
    def test_crowds_are_not_characters(self):
        """Several actors speaking at once is not somebody's monologue."""
        for cue in ("all", "both", "omnes", "chorus", "citizens"):
            with self.subTest(cue=cue):
                self.assertIn(cue, GROUP_CUES)


if __name__ == "__main__":
    unittest.main()
