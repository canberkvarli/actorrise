"""A playwright's name next to the title must not hide the title.

"medea euripides" missed the 41 Medea pieces: the catalogue is matched on the
title alone, and "euripides" is not part of it. The name is dropped only when
every dropped word belongs to the matched title's own author, so a name can
never steer a search onto someone else's play.
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
    ("Medea", "play", "Euripides"),
    ("Hamlet", "play", "William Shakespeare"),
    ("Women", "play", "Someone Else"),
    ("Electra", "play", "Sophocles"),
    ("Ivanoff: A Play", "play", "Anton Chekhov"),
]


@pytest.fixture(autouse=True)
def _clear_cache():
    tl.reset_catalogue_cache()
    yield
    tl.reset_catalogue_cache()


def _title(q):
    hit = tl.detect_catalogue_title(FakeCatalogueDB(ROWS), q)
    return hit and hit["title"]


@pytest.mark.parametrize("q", ["medea euripides", "euripides medea", "Medea, Euripides"])
def test_the_playwright_beside_the_title_is_dropped(q):
    assert _title(q) == "Medea"


def test_a_full_name_works_too():
    assert _title("hamlet william shakespeare") == "Hamlet"


def test_the_reported_query():
    q = "medea's monologues euripides"
    assert _title(q) == "Medea"


def test_the_wrong_playwright_finds_nothing():
    assert _title("medea sophocles") is None


def test_a_name_cannot_steer_onto_another_authors_title():
    assert _title("shakespeare women") is None


def test_a_name_alone_is_not_a_title():
    assert _title("euripides") is None
    assert _title("euripides monologue") is None


def test_two_column_rows_still_load():
    """Older callers and fixtures hand back (title, source_type) only."""
    hit = tl.detect_catalogue_title(FakeCatalogueDB([("Medea", "play")]), "medea")
    assert hit["title"] == "Medea"
    assert tl.detect_catalogue_title(FakeCatalogueDB([("Medea", "play")]), "medea euripides") is None
