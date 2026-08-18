"""Tests for relevance-band classification in semantic search.

Covers the soft-fail fallback: when the best semantic match falls in the weak
band [WEAK_MATCH_FLOOR, MIN_RELEVANCE_TO_SHOW), the closest matches are surfaced
(flagged weak) instead of returning a blank "no results" screen. Below the floor
the query is treated as gibberish/unrelated and returns empty.
"""

import unittest

from app.services.search.semantic_search import (
    MIN_RELEVANCE_TO_SHOW,
    WEAK_MATCH_FLOOR,
    classify_relevance,
)


class _Mono:
    """Minimal stand-in; classify_relevance only reads the paired score."""

    def __init__(self, mid: int):
        self.id = mid


def _scored(*scores):
    return [(_Mono(i), s) for i, s in enumerate(scores)]


class ClassifyRelevanceTests(unittest.TestCase):
    def test_empty_input_returns_empty_not_weak(self):
        results, is_weak = classify_relevance([], limit=20)
        self.assertEqual(results, [])
        self.assertFalse(is_weak)

    def test_strong_match_keeps_everything_above_floor(self):
        # Best is strong (>= show bar), so results are shown down to the FLOOR,
        # not the show bar: the show bar only picks the strong-vs-weak banner,
        # and the 0.30-0.47 tail becomes the "looser matches" group in the UI.
        # (Pre-2026-08 this pruned at the show bar, which gutted good queries
        # once real cosine — with its tight 0.40-0.47 clustering — reached here.)
        results, is_weak = classify_relevance(
            _scored(0.90, 0.55, 0.40, 0.20), limit=20
        )
        self.assertFalse(is_weak)
        self.assertEqual([s for _, s in results], [0.90, 0.55, 0.40])

    def test_weak_band_surfaces_closest_above_floor(self):
        # best is between the floor and the show bar -> weak band
        best = MIN_RELEVANCE_TO_SHOW - 0.05
        results, is_weak = classify_relevance(
            _scored(best, WEAK_MATCH_FLOOR, WEAK_MATCH_FLOOR - 0.05), limit=20
        )
        self.assertTrue(is_weak)
        # drops the sub-floor entry, keeps the two at/above the floor
        self.assertEqual([s for _, s in results], [best, WEAK_MATCH_FLOOR])

    def test_weak_band_results_sorted_descending(self):
        results, is_weak = classify_relevance(
            _scored(0.35, 0.45, 0.40), limit=20
        )
        self.assertTrue(is_weak)
        self.assertEqual([s for _, s in results], [0.45, 0.40, 0.35])

    def test_weak_band_respects_limit(self):
        results, is_weak = classify_relevance(
            _scored(0.46, 0.45, 0.44, 0.43), limit=2
        )
        self.assertTrue(is_weak)
        self.assertEqual(len(results), 2)

    def test_below_floor_returns_empty_not_weak(self):
        results, is_weak = classify_relevance(
            _scored(WEAK_MATCH_FLOOR - 0.01, 0.10), limit=20
        )
        self.assertEqual(results, [])
        self.assertFalse(is_weak)

    def test_boundary_at_show_bar_is_strong(self):
        results, is_weak = classify_relevance(
            _scored(MIN_RELEVANCE_TO_SHOW), limit=20
        )
        self.assertFalse(is_weak)
        self.assertEqual(len(results), 1)

    def test_boundary_at_floor_is_weak(self):
        results, is_weak = classify_relevance(_scored(WEAK_MATCH_FLOOR), limit=20)
        self.assertTrue(is_weak)
        self.assertEqual(len(results), 1)


class ScoresFromDistancesTests(unittest.TestCase):
    def test_pgvector_scores_are_cosine_not_rank(self):
        """The pgvector path must hand classify_relevance real cosine similarity.

        Regression: scores used to come from rank position alone
        (1.0 - rank/total*0.4), so the best result always scored 1.0 and the
        0.30 floor could never fire. A search for "Mexican" (best cosine 0.176)
        returned 20 results as if they fit.
        """
        from app.services.search.semantic_search import _scores_from_distances

        # pgvector returns cosine DISTANCE; similarity = 1 - distance.
        distances = [0.824, 0.850, 0.910]  # -> 0.176, 0.150, 0.090, all sub-floor
        scores = _scores_from_distances(distances)

        self.assertAlmostEqual(scores[0], 0.176, places=3)
        self.assertLess(
            max(scores),
            WEAK_MATCH_FLOOR,
            "a 0.176-cosine best hit must not score above the floor",
        )

    def test_below_floor_query_returns_nothing(self):
        """End of the chain: bad cosine in, empty result set out.

        classify_relevance is already correct; this pins the contract that a
        sub-floor best match yields neither results nor a weak-band fallback.
        """
        weak = _scored(0.176, 0.150, 0.090)
        results, is_weak = classify_relevance(weak, limit=20)
        self.assertEqual(results, [])
        self.assertFalse(is_weak)


if __name__ == "__main__":
    unittest.main()
