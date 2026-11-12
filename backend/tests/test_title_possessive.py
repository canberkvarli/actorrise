"""An actor's possessive must not hide a title we carry.

Apostrophes fold into the word, so "medea's monologues" normalised to "medeas"
and missed the 41 Medea pieces (2026-11-12 brief: "medea's monologues
euripides", weak). detect_catalogue_title now tries the query as typed, then
with each possessive dropped, so titles that carry their own apostrophe still
match first.
"""

import pytest

from app.services.search import title_lookup as tl


class FakeCatalogueDB:
    def __init__(self, rows):
        self.rows = rows

    def execute(self, *_a, **_k):
        return self

    def fetchall(self):
        return list(self.rows)


ROWS = [
    ("Medea", "play"),
    ("Hamlet", "play"),
    ("A Doll's House", "play"),
    ("Who's Afraid of Virginia Woolf", "play"),
    ("The Queen's Gambit", "tv"),
]


@pytest.fixture(autouse=True)
def _clear_cache():
    tl.reset_catalogue_cache()
    yield
    tl.reset_catalogue_cache()


def _title(q):
    hit = tl.detect_catalogue_title(FakeCatalogueDB(ROWS), q)
    return hit and hit["title"]


@pytest.mark.parametrize("q", ["medea's monologues", "medea’s monologue", "Medea's"])
def test_a_possessive_finds_the_title(q):
    assert _title(q) == "Medea"


def test_the_reported_query_resolves_after_the_trailing_strip():
    q = "medea's monologues euripides"
    shorter = tl.strip_trailing_words(q)
    assert any(_title(s) == "Medea" for s in shorter)


def test_soliloquy_is_filler():
    assert _title("hamlet's soliloquy") == "Hamlet"


@pytest.mark.parametrize("q,title", [
    ("queen's gambit", "The Queen's Gambit"),
    ("who's afraid of virginia woolf", "Who's Afraid of Virginia Woolf"),
    ("a doll's house", "A Doll's House"),
])
def test_titles_with_their_own_apostrophe_still_match(q, title):
    assert _title(q) == title


def test_a_possessive_of_something_we_do_not_carry_stays_undetected():
    assert _title("lady macbeth's monologue") is None
