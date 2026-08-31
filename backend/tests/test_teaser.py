"""The teaser is the only thing standing between a walled reader and the text.

It has two callers and both are load-bearing: the rights guard, which uses it
for works we have no licence to serve whole, and the Ghost Light wall, which
uses it once a free user has spent their three lifetime reads.

It was slicing the first two *lines*. 97% of the corpus is a single prose
paragraph with no newline in it, so for 13,709 of 14,034 monologues the slice
returned the entire text and both callers became decorative — the wall answered
`paywalled: true` and attached the complete piece to it.
"""

import pytest

from app.api.monologues import _TEASER_MAX_WORDS, _teaser

PROSE = (
    "But you were wrong the other day. That's not what a train does to you. "
    "It doesn't mush you up in neat little pieces. This train, she's a knife. "
    "That's what she is, and I have been thinking about it every hour since, "
    "turning it over and over until there is nothing left of it at all."
)


class TestTeaser:
    def test_a_prose_paragraph_is_actually_shortened(self):
        """The whole bug, in one assertion."""
        out = _teaser(PROSE)
        assert out.strip() != PROSE.strip()
        assert len(out.split()) <= _TEASER_MAX_WORDS

    def test_it_stops_on_a_sentence_boundary(self):
        assert _teaser(PROSE).startswith("But you were wrong the other day.")

    def test_a_run_on_with_no_punctuation_is_still_capped(self):
        """No sentence to stop at, so the word budget has to do it alone."""
        out = _teaser("word " * 500)
        assert len(out.split()) <= _TEASER_MAX_WORDS

    def test_a_single_sentence_longer_than_the_budget_is_cut(self):
        """The first sentence is always kept, so it must be cut, not waved past."""
        out = _teaser("I " + "went on and on " * 60 + "and then stopped.")
        assert len(out.split()) <= _TEASER_MAX_WORDS

    def test_verse_still_gets_its_two_lines(self):
        text = "First line of the speech\nSecond line of it\nThird line\nFourth"
        out = _teaser(text)
        assert out == "First line of the speech\nSecond line of it"

    def test_truncation_is_visible_to_the_reader(self):
        assert _teaser(PROSE).endswith("…")

    def test_a_short_piece_is_left_alone(self):
        """Nothing to hide: under budget, the teaser is the text, no ellipsis."""
        short = "I have said all I mean to say."
        assert _teaser(short) == short

    @pytest.mark.parametrize("text", ["", "   ", "\n\n"])
    def test_empty_input_does_not_raise(self, text):
        assert _teaser(text).strip() == ""

    def test_never_exceeds_budget_across_shapes(self):
        for text in [PROSE, PROSE.replace(". ", ".\n"), "word " * 200, PROSE * 3]:
            assert len(_teaser(text).split()) <= _TEASER_MAX_WORDS
