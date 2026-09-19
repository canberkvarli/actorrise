"""A title stored with a subtitle must be findable by its own name.

The library files 288 works with a subtitle, and for 117 of them the name an
actor would actually type is not reachable at all: "Ivanoff" is stored as
"Ivanoff: A Play", "Kill Bill" as "Kill Bill: Vol. 2", "Chushingura" as
"Chushingura; Or, The Treasury of Loyal Retainers". Generic descriptors already
work, because _TITLE_FILLER strips "a comedy"/"a tragedy" out of the query, so
"Man and Superman" resolves. Everything else falls through to the vector path.

That costs twice over, because cross-tab recovery can only rescue a title it
first DETECTS: "kill bill" on the Plays tab returned one weak result on
2026-09-16, nine days after cross-tab shipped, while seven pieces sat under
Film & TV.

Same FakeDB as test_catalogue_title_lookup: the matching is pure Python.
"""

import pytest

from app.services.search.title_lookup import (detect_catalogue_title,
                                              reset_catalogue_cache)


class FakeDB:
    def __init__(self, titles):
        self.titles = titles
        self.query_count = 0

    def execute(self, _stmt):
        self.query_count += 1
        return self

    def fetchall(self):
        return list(self.titles)


LIBRARY = [
    ("Ivanoff: A Play", "play"),
    ("Chushingura; Or, The Treasury of Loyal Retainers", "play"),
    ("Kill Bill: Vol. 1", "film"),
    ("Kill Bill: Vol. 2", "film"),
    ("Star Wars: Episode IV - A New Hope", "film"),
    ("Star Wars: Episode V - The Empire Strikes Back", "film"),
    # A standalone title that must keep winning over any head.
    ("Hamlet", "play"),
    ("Hamlet: A Modern Retelling", "film"),
    # One-word heads that are ordinary English. Safe only because a head is
    # matched against the WHOLE query, never inside a longer one.
    ("Waste: A Tragedy, In Four Acts", "play"),
]


@pytest.fixture(autouse=True)
def _fresh_cache():
    reset_catalogue_cache()
    yield
    reset_catalogue_cache()


@pytest.fixture
def db():
    return FakeDB(LIBRARY)


def test_single_subtitled_play_is_found_by_its_name(db):
    hit = detect_catalogue_title(db, "Ivanoff")
    assert hit is not None
    assert hit["title"] == "Ivanoff: A Play"


def test_semicolon_is_a_subtitle_separator_too(db):
    hit = detect_catalogue_title(db, "Chushingura")
    assert hit is not None
    assert hit["title"] == "Chushingura; Or, The Treasury of Loyal Retainers"


def test_a_franchise_head_is_not_dropped_as_a_collision(db):
    """Two Kill Bills must not cancel each other out.

    The squashed and numeric indexes drop a colliding key rather than resolve
    it arbitrarily. Doing that here would lose exactly the titles actors search
    for most: star wars, the lord of the rings, spider-man, kill bill.
    """
    hit = detect_catalogue_title(db, "kill bill")
    assert hit is not None
    assert hit["title"] == "Kill Bill"
    assert hit["medium"] == "film"


def test_star_wars_resolves_to_the_head_not_one_episode(db):
    hit = detect_catalogue_title(db, "star wars")
    assert hit is not None
    assert hit["title"] == "Star Wars"


def test_an_exact_standalone_title_still_wins(db):
    """'hamlet' is the play, not the head of 'Hamlet: A Modern Retelling'."""
    hit = detect_catalogue_title(db, "hamlet")
    assert hit is not None
    assert hit["title"] == "Hamlet"
    assert hit["medium"] == "play"


def test_a_head_does_not_match_inside_a_longer_query(db):
    """The guard that keeps one-word titles from hijacking attribute searches.

    'Waste: A Tragedy' must not turn "monologue about waste and regret" into a
    title lookup.
    """
    assert detect_catalogue_title(db, "monologue about waste and regret") is None


def test_a_whole_query_head_still_matches(db):
    hit = detect_catalogue_title(db, "waste")
    assert hit is not None
    assert hit["title"] == "Waste: A Tragedy, In Four Acts"


def test_the_catalogue_is_still_loaded_once(db):
    for _ in range(5):
        detect_catalogue_title(db, "kill bill")
    assert db.query_count == 1


class CapturingDB:
    """Captures the SQL the play-resolution step builds, then stops the query.

    The head match introduced an OR into a WHERE clause that every filter
    appends to with AND. AND binds tighter, so an unbracketed
    "A OR B AND source_type = ANY(...)" reads as "A OR (B AND ...)" and the
    exact-title branch escapes the tab filter entirely: "mean girls" came back
    with its seven film pieces while the Plays tab was active. Measured against
    the real catalogue before the fix, that query returned 1 play on the Plays
    tab and 0 after it.
    """

    def __init__(self):
        self.sql = None

    def execute(self, stmt, params=None):
        self.sql = str(stmt)
        raise RuntimeError("stop here, the SQL is what is being tested")


def test_the_or_is_bracketed_so_filters_still_apply(monkeypatch):
    from app.services.search import title_lookup as tl

    db = CapturingDB()
    monkeypatch.setattr(tl, "prepass_can_honour", lambda *a, **k: True)
    try:
        tl.find_title_monologues(db, "Kill Bill", filters={"source_type": ["play"]})
    except RuntimeError:
        pass

    assert db.sql is not None, "the play-resolution query was never built"
    where = db.sql.split("WHERE", 1)[1]

    # Walk the clause tracking bracket depth. An OR sitting at depth 0 alongside
    # an AND is the bug: SQL binds AND tighter, so the AND captures only the
    # right-hand side. Counting brackets naively does not work here because
    # ANY(:st) and regexp_replace(...) contribute their own.
    depth = 0
    top_level = []
    i = 0
    while i < len(where):
        c = where[i]
        if c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
        elif depth == 0:
            if where[i:i + 4] == " OR ":
                top_level.append("OR")
            elif where[i:i + 5] == " AND ":
                top_level.append("AND")
        i += 1

    assert "OR" not in top_level, (
        "the title/head OR is at the top level of the WHERE clause, so every "
        "filter appended with AND binds to its right-hand side only and the "
        f"exact-title branch escapes filtering entirely: {where}"
    )
