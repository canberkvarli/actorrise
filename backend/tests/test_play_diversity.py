"""Tests for per-play result diversification.

Live finding (2026-07-20): every query is dominated by one play — "senior
man" returned King Lear x5 + The Intruder x4 (9 of 20 from two plays),
"courtroom" was The Rising of the Moon x5. Actors browsing want a variety of
pieces to choose from. diversify_by_play caps how many pieces one play holds
in the visible window, sinking the overflow lower (nothing is dropped, and a
query that genuinely only matches one play is unharmed).
"""

import unittest

from app.services.search.semantic_search import diversify_by_play


class _P:
    def __init__(self, title):
        self.title = title


class _M:
    def __init__(self, mid, play):
        self.id = mid
        self.play = _P(play) if play else None


def rows(*specs):
    return [(_M(mid, play), score) for mid, play, score in specs]


def ids(result):
    return [m.id for m, _ in result]


class DiversifyByPlayTests(unittest.TestCase):
    def test_overflow_sinks_below_cap_stably(self):
        r = rows((1, "Lear", 0.9), (2, "Lear", 0.85), (3, "Lear", 0.8),
                 (4, "Ion", 0.7), (5, "Lear", 0.6))
        # First two Lears kept in place, Ion kept, extra Lears sink — order preserved.
        self.assertEqual(ids(diversify_by_play(r, max_per_play=2)), [1, 2, 4, 3, 5])

    def test_no_op_when_all_under_cap(self):
        r = rows((1, "A", 0.9), (2, "B", 0.8), (3, "C", 0.7))
        self.assertEqual(ids(diversify_by_play(r, max_per_play=2)), [1, 2, 3])

    def test_single_play_query_is_unharmed(self):
        r = rows((1, "A", 0.9), (2, "A", 0.8), (3, "A", 0.7))
        self.assertEqual(ids(diversify_by_play(r, max_per_play=2)), [1, 2, 3])

    def test_missing_play_is_kept(self):
        r = rows((1, "A", 0.9), (2, None, 0.8), (3, "A", 0.7), (4, "A", 0.6))
        # None-play items never counted against a cap; extra A sinks.
        self.assertEqual(ids(diversify_by_play(r, max_per_play=2)), [1, 2, 3, 4])

    def test_empty(self):
        self.assertEqual(diversify_by_play([], max_per_play=2), [])


if __name__ == "__main__":
    unittest.main()
