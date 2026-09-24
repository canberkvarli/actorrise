"""A show's name with a character's name after it is still naming the show.

Actors type "nina black swan" and "the bear sydney" and "never can tell
valentine". The bare titles all resolve; adding the character breaks them:

    never can tell              -> You Never Can Tell   (25 results)
    never can tell valentine    -> nothing              (weak)
    black swan                  -> Black Swan
    nina black swan             -> Black Swan           (phrase match survives)
    the bear                    -> The Bear
    the bear sydney             -> nothing

Two different causes. The catalogue key is "you never can tell", and the query
is missing "you", so the phrase match cannot fire and the fuzzy ratio falls once
"valentine" is appended. "The Bear" normalises to "bear", four characters, under
the 8-char floor that stops one-word titles hijacking ordinary attribute
searches -- a floor that must stay.

So the trailing words are dropped and the title looked up again. Conservative on
purpose: two words at most, and never down to something too short to be a title,
because "sad bully monologue" must not become a lookup for a play called Sad.
"""

import pytest

from app.services.search.title_lookup import (reset_catalogue_cache,
                                              strip_trailing_words)


class FakeDB:
    def __init__(self, titles=()):
        self.titles = list(titles)
        self._last = ""

    def execute(self, stmt, params=None):
        self._last = str(stmt)
        return self

    def fetchall(self):
        return [] if "character_name" in self._last else list(self.titles)


@pytest.fixture(autouse=True)
def _fresh():
    reset_catalogue_cache()
    yield
    reset_catalogue_cache()


def test_it_offers_the_query_with_its_last_word_removed():
    assert "never can tell" in strip_trailing_words("never can tell valentine")


def test_it_offers_two_words_removed_as_well():
    out = strip_trailing_words("the bear sydney carmy")
    assert "the bear" in out


def test_the_full_query_is_never_offered_back():
    """The caller has already tried it; offering it again just wastes a lookup."""
    assert "never can tell valentine" not in strip_trailing_words("never can tell valentine")


def test_it_never_strips_below_a_plausible_title():
    """"sad bully monologue" must not become a lookup for a play called Sad."""
    assert strip_trailing_words("sad bully monologue") == ["sad bully"]


def test_a_two_word_query_is_left_alone():
    assert strip_trailing_words("black swan") == []


def test_a_one_word_query_is_left_alone():
    assert strip_trailing_words("hamlet") == []


def test_candidates_come_back_longest_first():
    """The longest surviving phrase is the most likely title, so try it first."""
    out = strip_trailing_words("the bear sydney carmy")
    assert out == ["the bear sydney", "the bear"]
