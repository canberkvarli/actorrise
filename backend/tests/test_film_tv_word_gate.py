"""Tests for the film/TV minimum-word search gate.

Canberk's bar: film/TV search must return real monologues, not sub-monologue
clips. Unlike the duration clip gate, this one is absolute — there is no "user
asked for short" escape, because a fragment below the bar is never the
monologue an actor wants.

The bar moved 75 -> 50 on 2026-08-20. At 75 the gate was hiding 1,155 film/TV
pieces, 42% of that corpus, reachable only by naming the title. The rows it hid
were kept "for later re-extraction" and two months on that had not happened, so
the gate was not deferring a decision, it was burying most of the film and TV
library. Everything below 50 words was deleted outright in the same change
rather than hidden, so this gate now only guards the 50-74 band against
regressions in extraction.
"""

import unittest

from app.services.search.semantic_search import (
    FILM_TV_MIN_WORDS,
    film_tv_word_gate_hides,
)


class FilmTvWordGateTests(unittest.TestCase):
    def test_threshold_is_fifty(self):
        self.assertEqual(FILM_TV_MIN_WORDS, 50)

    def test_short_film_piece_is_hidden(self):
        self.assertTrue(film_tv_word_gate_hides("film", 40))

    def test_short_tv_piece_is_hidden(self):
        self.assertTrue(film_tv_word_gate_hides("tv", 49))

    def test_the_previously_hidden_band_is_now_shown(self):
        # The 1,155 pieces the old 75-word bar buried.
        self.assertFalse(film_tv_word_gate_hides("tv", 50))
        self.assertFalse(film_tv_word_gate_hides("tv", 64))
        self.assertFalse(film_tv_word_gate_hides("film", 74))

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
