"""A title typed one letter off still finds the title (2026-11-12).

"halet", "Yellojackets", "sweeny todd", "julius ceasar" all came back weak
while the library holds every one of them. A word is corrected only when it
is long, not a word of any title, absent from the library's own text
(corpus_terms), and one edit from exactly one title word; the corrected query
must then name a title through the ordinary lookup.
"""

import pytest

from app.services.search import title_lookup as tl

CORPUS = {"grief", "lonely", "rebellion", "monologue", "about", "hamlet", "caesar", "town"}


class _Result:
    def __init__(self, rows):
        self.rows = rows

    def fetchall(self):
        return self.rows

    def first(self):
        return self.rows[0] if self.rows else None


class FakeDB:
    def __init__(self, catalogue, corpus=CORPUS, corpus_built=True):
        self.catalogue, self.corpus, self.built = catalogue, corpus, corpus_built

    def execute(self, sql, params=None):
        q = str(sql)
        if "corpus_terms" in q:
            if "LIMIT 1" in q:
                return _Result([(1,)] if self.built else [])
            return _Result([(t,) for t in params["t"] if t in self.corpus])
        return _Result(self.catalogue)


ROWS = [(t, "play", "X") for t in [
    "Hamlet", "Yellowjackets", "Sweeney Todd: The Demon Barber of Fleet Street",
    "Julius Caesar", "Our Town", "Brief Encounter", "Lonely Hearts",
]]


@pytest.fixture(autouse=True)
def _clear_cache():
    tl.reset_catalogue_cache()
    yield
    tl.reset_catalogue_cache()


def _title(q, **kw):
    hit = tl.detect_catalogue_title(FakeDB(ROWS, **kw), q)
    return hit and hit["title"]


@pytest.mark.parametrize("q,title", [
    ("halet", "Hamlet"),
    ("hamlte", "Hamlet"),
    ("halet monologue", "Hamlet"),
    ("Yellojackets", "Yellowjackets"),
    ("sweeny todd", "Sweeney Todd: The Demon Barber of Fleet Street"),
    ("julius ceasar", "Julius Caesar"),
])
def test_a_title_one_letter_off_is_found(q, title):
    assert _title(q) == title


@pytest.mark.parametrize("q", ["grief", "monologue about grief", "lonely", "rebellion"])
def test_a_real_word_is_never_corrected(q):
    assert _title(q) is None


def test_nothing_is_corrected_when_the_word_list_is_not_built():
    assert _title("halet", corpus=set(), corpus_built=False) is None


def test_one_edit_apart():
    assert tl._one_edit_apart("halet", "hamlet")
    assert tl._one_edit_apart("hamlte", "hamlet")
    assert tl._one_edit_apart("ceasar", "caesar")
    assert not tl._one_edit_apart("ceaser", "caesar")
    assert not tl._one_edit_apart("hamlet", "hamlet")


def test_bella_baxter_is_poor_things():
    assert tl.detect_title_lookup("bella baxter") == {"title": "Poor Things", "medium": "film"}
