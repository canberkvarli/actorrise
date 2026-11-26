"""A playwright named in a search is read off the plays we carry.

2026-11-26: one actor searched "John Webster", "revenge, John Webster" and
"Isabella Webster" inside a minute. Webster was not on the optimizer's hand
list of authors, so every one went to the vector index and came back Henry
VIII and The Duchess of Padua, while The White Devil and The Duchess of Malfi
(120 pieces) were in the library.
"""

import pytest

from app.api.monologues import _AUTHOR_QUERY_FILLER, _query_is_only_author
from app.services.search.title_lookup import (detect_catalogue_author,
                                              reset_catalogue_cache)


class FakeDB:
    def __init__(self, rows):
        self.rows = rows  # (author, monologue count)

    def execute(self, _stmt):
        return self

    def fetchall(self):
        return list(self.rows)


AUTHORS = [
    ("John Webster", 120),
    ("Benjamin Webster", 12),
    ("Jean Webster", 11),
    ("Oscar Wilde", 60),
    ("Euripides", 80),
    ("G. K. Chesterton", 6),
    ("Ann Short", 7),  # a surname that is also a description of a piece
    ("Pat Rice", 9),   # a surname too short to trust alone
]


@pytest.fixture(autouse=True)
def _clear_cache():
    reset_catalogue_cache()
    yield
    reset_catalogue_cache()


def detect(q):
    return detect_catalogue_author(FakeDB(AUTHORS), q, filler=_AUTHOR_QUERY_FILLER)


def test_full_name_is_found_anywhere_in_the_query():
    assert detect("John Webster") == "John Webster"
    assert detect("revenge, John Webster") == "John Webster"
    assert detect("revenge monologue for a woman, John Webster") == "John Webster"
    assert detect("monologues by oscar wilde") == "Oscar Wilde"


def test_a_shared_surname_alone_is_nobody():
    # Three Websters: the surname cannot say which.
    assert detect("webster") is None
    assert detect("Isabella Webster") is None


def test_a_unique_surname_alone_is_that_playwright():
    assert detect("wilde") == "Oscar Wilde"
    assert detect("wilde monologues") == "Oscar Wilde"
    assert detect("euripides") == "Euripides"
    assert detect("chesterton") == "G. K. Chesterton"


def test_a_surname_with_other_words_is_not_a_lookup():
    # "wilde" next to a real word is not a request for his shelf.
    assert detect("wilde west cowboy") is None


def test_description_words_and_short_names_never_route():
    assert detect("short") is None
    assert detect("short monologue") is None
    assert detect("rice") is None


def test_only_author_guard_accepts_the_detected_name():
    assert _query_is_only_author("John Webster", "John Webster")
    assert _query_is_only_author("wilde monologues", "Oscar Wilde")
    assert not _query_is_only_author("revenge, John Webster", "John Webster")


def test_a_broken_db_is_nobody():
    class Broken:
        def execute(self, _stmt):
            raise RuntimeError("down")

    assert detect_catalogue_author(Broken(), "John Webster") is None
