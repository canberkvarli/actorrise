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

    def test_strong_match_keeps_only_at_or_above_bar(self):
        results, is_weak = classify_relevance(
            _scored(0.90, 0.55, 0.40, 0.20), limit=20
        )
        self.assertFalse(is_weak)
        self.assertEqual([s for _, s in results], [0.90, 0.55])

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


if __name__ == "__main__":
    unittest.main()
