"""Tests for DB-driven character detection (detect_catalogue_character).

Like the title matcher, the guard rails matter most: a character path that
fires on a bare common first name or a generic role word ("man", "young woman")
would hijack ordinary attribute searches. These pin the rules that keep it
quiet, with a fake DB so they run without Postgres.
"""

import pytest

from app.services.search.title_lookup import (detect_catalogue_character,
                                              reset_catalogue_cache)


class FakeDB:
    def __init__(self, rows):
        self.rows = rows  # list of (character_name, count)

    def execute(self, _stmt):
        return self

    def fetchall(self):
        return list(self.rows)


CHARACTERS = [
    ("Hamlet", 67),        # distinctive single word, big body -> matches
    ("Medea", 12),         # same
    ("Joan Clarke", 4),    # multi-word full name -> matches on any count
    ("Anne Frank", 1),     # multi-word, even a single piece -> matches
    ("Anna", 3),           # single word, too few pieces -> stands down
    ("Man", 40),           # generic role word -> stands down
    ("Young Woman", 20),   # every token generic -> stands down
    ("Queen", 8),          # ambiguous descriptor word -> stands down
]


@pytest.fixture(autouse=True)
def _clear_cache():
    reset_catalogue_cache()
    yield
    reset_catalogue_cache()


def test_multiword_full_name_matches():
    db = FakeDB(CHARACTERS)
    assert detect_catalogue_character(db, "joan clarke")["character"] == "joan clarke"
    assert detect_catalogue_character(db, "Anne Frank!")["character"] == "anne frank"


def test_distinctive_single_word_with_a_body_of_work_matches():
    db = FakeDB(CHARACTERS)
    assert detect_catalogue_character(db, "hamlet")["character"] == "hamlet"
    assert detect_catalogue_character(db, "medea")["character"] == "medea"


def test_single_word_with_too_few_pieces_stands_down():
    # "Anna" exists but on only 3 pieces: a first name, not a lead character.
    assert detect_catalogue_character(FakeDB(CHARACTERS), "anna") is None


def test_generic_role_words_stand_down():
    db = FakeDB(CHARACTERS)
    assert detect_catalogue_character(db, "man") is None
    assert detect_catalogue_character(db, "young woman") is None


def test_ambiguous_descriptor_single_word_stands_down():
    # "Queen" is a real character name but also an ordinary word already on the
    # ambiguous-title list; it must not shadow an attribute search.
    assert detect_catalogue_character(FakeDB(CHARACTERS), "queen") is None


def test_name_embedded_in_a_phrase_is_not_matched():
    # Whole-query equality is required, so a name inside a sentence stays vector.
    assert detect_catalogue_character(
        FakeDB(CHARACTERS), "a monologue about hamlet's grief"
    ) is None


def test_filler_words_are_stripped():
    hit = detect_catalogue_character(FakeDB(CHARACTERS), "hamlet monologue")
    assert hit and hit["character"] == "hamlet"


def test_raw_variants_returned_for_indexed_retrieval():
    hit = detect_catalogue_character(FakeDB(CHARACTERS), "hamlet")
    assert hit["names"] == ["Hamlet"]


def test_empty_and_short_queries_are_safe():
    db = FakeDB(CHARACTERS)
    assert detect_catalogue_character(db, "") is None
    assert detect_catalogue_character(db, "ab") is None
    assert detect_catalogue_character(None, "hamlet") is None


class RoutingDB:
    """Returns title rows or character rows depending on which catalogue query
    runs (they hit different SELECTs), so classify_query's catalogue-aware pass
    can be tested without Postgres."""

    def __init__(self, titles, characters):
        self.titles = titles          # (title, source_type)
        self.characters = characters  # (character_name, count)
        self._last = None

    def execute(self, stmt):
        self._last = "character" if "character_name" in str(stmt) else "title"
        return self

    def fetchall(self):
        return list(self.characters if self._last == "character" else self.titles)


def test_classify_query_is_catalogue_aware():
    from app.services.search.query_type import classify_query
    from app.services.search.title_lookup import reset_catalogue_cache

    reset_catalogue_cache()
    db = RoutingDB(
        titles=[("Hamlet", "play"), ("Fleabag", "tv"), ("Medea", "play")],
        characters=[("Hamlet", 67), ("Joan Clarke", 4), ("Anne Frank", 1)],
    )
    # Carried title / character now classify instead of falling to "other".
    assert classify_query("fleabag", db=db) == "title"
    assert classify_query("joan clarke", db=db) == "named_lookup"
    # A word that is both a play and its character prefers title (no `multi`).
    assert classify_query("hamlet", db=db) == "title"
    # Thematic and uncarried queries are untouched by the catalogue pass.
    assert classify_query("a comedic monologue for a teen", db=db) == "attribute"
    assert classify_query("erin gruwell", db=db) == "other"
    reset_catalogue_cache()
