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


if __name__ == "__main__":
    unittest.main()
