"""
Every value a user's profile can hold must reach something the corpus holds.

Regression cover for "Find for me returned nothing, forever". The profile
stores ages as 18-25 / 25-35 / ... and the corpus stores them as 20s / 30s /
teens / 20-30. There is no overlap between those two vocabularies, so a filter
built straight from a profile value can only ever match zero rows — which is
exactly what happened, silently, for all 379 users who had set an age.

Nothing here touches the database: it asserts that the translation tables agree
with each other and with the recorded corpus vocabulary. If someone adds a new
band to the profile form and forgets the mapping, this fails instead of the
feature quietly returning an empty list.
"""

import unittest

from app.services.search.vocabulary import (
    CORPUS_AGE_VALUES,
    PROFILE_AGE_TO_CORPUS,
    PROFILE_GENRE_COLUMN,
    corpus_ages_for_profile_band,
)

# Mirrors lib/profileOptions.ts AGE_RANGES. If the frontend list grows, this
# fails until the mapping above grows with it.
PROFILE_AGE_BANDS = ["18-25", "25-35", "35-45", "45-55", "55+"]


class ProfileAgeVocabularyTests(unittest.TestCase):
    def test_every_band_is_mapped(self):
        for band in PROFILE_AGE_BANDS:
            self.assertIn(band, PROFILE_AGE_TO_CORPUS, f"{band} has no corpus mapping")

    def test_every_band_reaches_real_corpus_values(self):
        """The actual bug: a band mapping to values no row carries."""
        for band in PROFILE_AGE_BANDS:
            values = corpus_ages_for_profile_band(band)
            self.assertTrue(values, f"{band} maps to nothing")
            real = [v for v in values if v in CORPUS_AGE_VALUES]
            self.assertTrue(
                real,
                f"{band} maps to {values}, none of which exist in the corpus",
            )

    def test_no_mapping_invents_a_value(self):
        for band, values in PROFILE_AGE_TO_CORPUS.items():
            for v in values:
                self.assertIn(
                    v, CORPUS_AGE_VALUES,
                    f"{band} maps to '{v}', which is not a corpus age value",
                )

    def test_unmapped_band_returns_empty_not_itself(self):
        """Returning the input was the original failure mode: it produced a
        filter on a string no row has, rather than no filter at all."""
        self.assertEqual(corpus_ages_for_profile_band("99-100"), ())
        self.assertEqual(corpus_ages_for_profile_band(None), ())


class ProfileGenreRoutingTests(unittest.TestCase):
    def test_genres_route_to_a_known_column(self):
        for genre, column in PROFILE_GENRE_COLUMN.items():
            self.assertIn(
                column, ("genre", "category", "author", None),
                f"{genre} routes to unknown column {column!r}",
            )

    def test_drama_and_comedy_are_not_category(self):
        """plays.category holds only classical/contemporary. Routing the two
        most common preferences there matched zero plays."""
        self.assertEqual(PROFILE_GENRE_COLUMN["Drama"], "genre")
        self.assertEqual(PROFILE_GENRE_COLUMN["Comedy"], "genre")

    def test_classical_and_contemporary_are_category(self):
        self.assertEqual(PROFILE_GENRE_COLUMN["Classical"], "category")
        self.assertEqual(PROFILE_GENRE_COLUMN["Contemporary"], "category")


if __name__ == "__main__":
    unittest.main()
