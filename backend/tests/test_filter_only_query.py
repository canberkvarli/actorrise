"""Tests for filter-only query detection.

Live-telemetry finding (2026-07-20): "funny and for women 2 min" was flagged
weak_match (best cosine 0.33) even though the hard filters served exactly-right
comedic/female/2-minute pieces. Filter-vocabulary queries score low against
monologue TEXT embeddings by nature — the weak banner must not fire when the
query contains no semantic content beyond the filters.
"""

import unittest

from app.services.search.query_optimizer import is_filter_only_query


class FilterOnlyQueryTests(unittest.TestCase):
    def test_pure_filter_queries(self):
        for q in (
            "funny and for women 2 min",
            "funny and for women",
            "comedic monologue for a teenage girl",
            "2 min monologue",
            "dramatic",
            "classical, female 20s",
            "male under 2 minutes",
        ):
            self.assertTrue(is_filter_only_query(q), q)

    def test_semantic_content_keeps_the_quality_bar(self):
        for q in (
            "courtroom",
            "guarded vulnerability female young adult",
            "monologue about grief for a woman",
            "Dramatic monologue with heart for a senior man",
            "two sisters arguing about their mother",
            "breaking bad",
        ):
            self.assertFalse(is_filter_only_query(q), q)

    def test_empty_query_is_not_filter_only(self):
        self.assertFalse(is_filter_only_query(""))
        self.assertFalse(is_filter_only_query(None))

    def test_descriptor_and_identity_queries_are_filter_only(self):
        # 2026-08-24: these came back weak (good results, wrong banner) because
        # short descriptor/identity words weren't recognised as filter vocabulary.
        for q in (
            "sexy flirty comedy",
            "quirky teenage male",
            "sultry seductive woman",
            "sarcastic",
            "energetic",
            "queer roles",
            "a comedy monologue",
        ):
            self.assertTrue(is_filter_only_query(q), q)


class ToneAndThemeVocabularyTests(unittest.TestCase):
    """The descriptor words must also resolve real facets where the corpus has
    them, so results are narrowed, not just the banner suppressed."""

    def _extract(self, q):
        from app.services.search.query_optimizer import KeywordExtractor
        return KeywordExtractor.extract(q)

    def test_comedy_noun_resolves_comedic_tone(self):
        # "comedy" the noun was missing, so "a comedy monologue" got no tone.
        self.assertEqual(self._extract("a comedy monologue").get("tone"), "comedic")
        self.assertEqual(self._extract("quirky monologue").get("tone"), "comedic")

    def test_flirty_maps_to_love_theme_not_tone(self):
        # So "sexy flirty comedy" keeps comedic tone AND adds the love theme.
        f = self._extract("sexy flirty comedy")
        self.assertEqual(f.get("tone"), "comedic")
        self.assertIn("love", f.get("themes", []))


if __name__ == "__main__":
    unittest.main()
