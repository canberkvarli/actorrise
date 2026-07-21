"""Tests for the film/TV minimum-word search gate.

Canberk's bar (2026-07-20): film/TV search must return real monologues, not
sub-monologue clips. The TV corpus is 80% under 75 words (avg 64). This gate
hides any film/TV piece under 75 words from search/discover, while the rows stay
in the DB for later re-extraction at proper length. Unlike the duration clip
gate, this one is absolute — there is no "user asked for short" escape, because
a sub-75-word film/TV fragment is never the monologue an actor wants.
"""

import unittest

from app.services.search.semantic_search import (
    FILM_TV_MIN_WORDS,
    film_tv_word_gate_hides,
)


class FilmTvWordGateTests(unittest.TestCase):
    def test_threshold_is_seventy_five(self):
        self.assertEqual(FILM_TV_MIN_WORDS, 75)

    def test_short_film_piece_is_hidden(self):
        self.assertTrue(film_tv_word_gate_hides("film", 40))

    def test_short_tv_piece_is_hidden(self):
        self.assertTrue(film_tv_word_gate_hides("tv", 74))

    def test_real_length_film_piece_is_shown(self):
        self.assertFalse(film_tv_word_gate_hides("film", 75))
        self.assertFalse(film_tv_word_gate_hides("film", 200))

    def test_real_length_tv_piece_is_shown(self):
        self.assertFalse(film_tv_word_gate_hides("tv", 130))

    def test_stage_plays_are_never_gated_by_this_rule(self):
        # Short stage-play pieces are the duration/quality gates' concern, not this one.
        self.assertFalse(film_tv_word_gate_hides("play", 10))

    def test_unknown_length_film_tv_is_hidden(self):
        # A film/TV row with no word_count is treated as too-short (conservative).
        self.assertTrue(film_tv_word_gate_hides("tv", None))
        self.assertTrue(film_tv_word_gate_hides("film", 0))


if __name__ == "__main__":
    unittest.main()
