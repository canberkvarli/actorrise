"""Tests for DB-driven title detection (detect_catalogue_title).

The guard rails matter more than the hits here. The library holds one-word
titles that are also ordinary English words ("Big", "Audition", "The", "It",
"Up"); a matcher that promotes those hijacks every attribute search. These
tests pin the rules that keep it quiet, using a fake DB so they run without
Postgres.
"""

import pytest

from app.services.search.title_lookup import (detect_catalogue_title,
                                              reset_catalogue_cache)


class FakeDB:
    """Stands in for a Session. The matching itself is pure Python, so this
    only has to hand back the catalogue rows and count how often it was asked
    (the query is cached; hitting the DB per search was the thing being fixed).
    """

    def __init__(self, titles):
        self.titles = titles  # list of (title, source_type)
        self.query_count = 0

    def execute(self, _stmt):
        self.query_count += 1
        return self

    def fetchall(self):
        return list(self.titles)


LIBRARY = [
    ("The Queens Gambit", "tv"),
    ("Hamlet", "play"),
    ("A Doll's House", "play"),
    ("The Office", "tv"),
    ("Dear Evan Hansen", "play"),
    # The dangerous ones: real rows whose titles are common words.
    ("Big", "film"),
    ("Audition", "film"),
    ("The", "tv"),
    ("It", "film"),
]


@pytest.fixture(autouse=True)
def _clear_cache():
    # The catalogue is cached at module level for 15 min; without this the
    # first test's library would leak into every other test.
    reset_catalogue_cache()
    yield
    reset_catalogue_cache()


@pytest.fixture
def db():
    return FakeDB(LIBRARY)


class TestFindsCarriedTitles:
    def test_apostrophe_title_matches_stored_form(self, db):
        # The reported break: stored "The Queens Gambit" vs typed "queen's
        # gambit". Punctuation is removed, not spaced, or these never meet.
        hit = detect_catalogue_title(db, "queen's gambit")
        assert hit == {"title": "The Queens Gambit", "medium": "tv"}

    def test_filler_words_are_stripped(self, db):
        assert detect_catalogue_title(db, "hamlet monologue")["title"] == "Hamlet"
        assert detect_catalogue_title(db, "the office monologue")["title"] == "The Office"

    def test_multiword_title_inside_longer_query(self, db):
        hit = detect_catalogue_title(db, "Nora's speech from A Dolls House")
        assert hit["title"] == "A Doll's House"

    def test_longest_title_wins(self, db):
        # "The" is a real row; it must never beat a real title.
        assert detect_catalogue_title(db, "the office")["title"] == "The Office"


class TestGuardsAgainstCommonWordTitles:
    def test_single_word_title_does_not_match_inside_a_phrase(self, db):
        # "Audition" is a film in the library. If it matched as a substring,
        # every audition-related attribute search would promote it.
        assert detect_catalogue_title(db, "funny audition monologue for a teen") is None

    def test_big_does_not_hijack_attribute_search(self, db):
        assert detect_catalogue_title(db, "big emotional dramatic monologue") is None

    def test_uncarried_title_returns_nothing(self, db):
        # We do not hold The Big Bang Theory; silence here is what lets the
        # content-gap path report it honestly instead of promoting *Big*.
        assert detect_catalogue_title(db, "the big bang theory") is None

    def test_plain_attribute_queries_stay_silent(self, db):
        for q in [
            "funny female 2 minute monologue",
            "dramatic monologue",
            "Contemporary comedic male monologue late 20s",
            "two sisters arguing about their mother",
        ]:
            assert detect_catalogue_title(db, q) is None, q


class TestEmptyShellDoesNotSuppressTheGap:
    """A play row with no monologues is not a title we carry.

    252 of 1,608 rows are empty shells. Counting them made compute_content_gap
    stay silent for titles the library held nothing of — searching Beetlejuice
    (a film row with 0 monologues) showed no gap banner and no request CTA.
    """

    def _gap(self, monkeypatch, carried):
        from app.services.search import title_lookup as tl

        monkeypatch.setattr(tl, "find_catalogue_source_types", lambda *_: carried)
        monkeypatch.setattr(tl, "detect_catalogue_title", lambda *_: None)
        return tl.compute_content_gap(
            "beetlejuice", None, None, ["Some Other Play"], [], db=object()
        )

    def test_empty_shell_reports_a_gap(self, monkeypatch):
        gap = self._gap(monkeypatch, [])
        assert gap is not None
        assert gap["play"] == "Beetlejuice"

    def test_genuinely_carried_title_reports_no_gap(self, monkeypatch):
        assert self._gap(monkeypatch, ["film"]) is None


# Library for the fuzzy/alias tests: titles typed as a prefix, a reorder, or a
# typo of a longer stored title — the class detect_catalogue_title missed until
# _fuzzy_catalogue_match. Kept separate from LIBRARY so the guard tests above
# keep their exact fixture.
FUZZY_LIBRARY = [
    ("Sweeney Todd: The Demon Barber of Fleet Street", "film"),
    ("Finding Corey Taylor", "play"),
    ("Hannah Montana", "tv"),
    ("The Fault in Our Stars", "film"),
    # Two titles that share a two-word prefix, to prove an ambiguous fragment
    # stands down instead of guessing one.
    ("High School Musical", "musical"),
    ("High School Reunion", "tv"),
]


class TestFuzzyPartialAndReorder:
    @pytest.fixture
    def db(self):
        return FakeDB(FUZZY_LIBRARY)

    def test_prefix_of_a_long_title_resolves_to_the_canonical_title(self, db):
        # "sweeney todd" is a prefix of the stored title; it must return the FULL
        # stored form so find_title_monologues can match it exactly.
        hit = detect_catalogue_title(db, "sweeney todd")
        assert hit["title"] == "Sweeney Todd: The Demon Barber of Fleet Street"

    def test_prefix_with_filler_word(self, db):
        hit = detect_catalogue_title(db, "sweeney todd monologue")
        assert hit["title"] == "Sweeney Todd: The Demon Barber of Fleet Street"

    def test_reordered_words_match_the_whole_title(self, db):
        assert detect_catalogue_title(db, "corey taylor finding")["title"] == "Finding Corey Taylor"

    def test_contiguous_fragment_inside_a_title(self, db):
        assert detect_catalogue_title(db, "corey taylor")["title"] == "Finding Corey Taylor"

    def test_single_letter_typo_still_matches(self, db):
        assert detect_catalogue_title(db, "hannah montanna")["title"] == "Hannah Montana"

    def test_ambiguous_prefix_stands_down(self, db):
        # "high school" prefixes two different titles; guessing one would be
        # worse than falling through to the vector path.
        assert detect_catalogue_title(db, "high school") is None

    def test_single_word_never_fuzzy_matches(self, db):
        # A lone word must not partial-match a longer title ("todd" -> Sweeney).
        assert detect_catalogue_title(db, "todd") is None

    def test_attribute_query_not_hijacked_by_fuzzy(self, db):
        for q in ["dramatic teen monologue", "funny two minute monologue"]:
            assert detect_catalogue_title(db, q) is None, q


class TestAliasExpansion:
    @pytest.fixture
    def db(self):
        return FakeDB(FUZZY_LIBRARY)

    def test_known_abbreviation_expands_and_resolves(self, db):
        # "tfios" -> "the fault in our stars" -> stored "The Fault in Our Stars".
        assert detect_catalogue_title(db, "tfios")["title"] == "The Fault in Our Stars"

    def test_uncarried_abbreviation_still_returns_none(self, db):
        # "ddlj" expands to a title we do not carry: silence, so the content-gap
        # path can report it honestly.
        assert detect_catalogue_title(db, "ddlj") is None

    def test_abbreviation_inside_a_phrase_is_left_alone(self, db):
        # Only a whole-query abbreviation expands; "hsm energy" is not HSM.
        assert detect_catalogue_title(db, "hsm energy monologue") is None


class TestSafety:
    def test_no_db_returns_none(self):
        assert detect_catalogue_title(None, "hamlet") is None

    def test_empty_query(self, db):
        assert detect_catalogue_title(db, "") is None
        assert detect_catalogue_title(db, "   ") is None

    def test_too_short_query_never_hits_the_db(self, db):
        assert detect_catalogue_title(db, "it") is None
        assert db.query_count == 0

    def test_catalogue_is_loaded_once_not_per_search(self, db):
        # The whole reason this is cached: the SQL form cost ~340 ms/query.
        for q in ["hamlet monologue", "queen's gambit", "the office", "funny female"]:
            detect_catalogue_title(db, q)
        assert db.query_count == 1

    def test_db_failure_degrades_to_no_match(self):
        class BrokenDB:
            def execute(self, _stmt):
                raise RuntimeError("connection lost")

        # A catalogue that will not load must not take the search down with it.
        assert detect_catalogue_title(BrokenDB(), "hamlet monologue") is None


class TestCuratedShortLabelDoesNotDenyACarriedTitle:
    """compute_content_gap must resolve the title the way the SEARCH does.

    The curated dictionary holds a short label ("Sweeney Todd"); the library
    stores the canonical name ("Sweeney Todd: The Demon Barber of Fleet
    Street"). find_catalogue_source_types only matches a stored title that is a
    substring of the queried one, never the reverse, so asking it about the
    short label returned [] and the actor was told "we don't have Sweeney Todd
    yet, want to request it?" over 5 monologues we hold (2026-09-01 log read).

    Fix: consult the catalogue before the dictionary, as monologues.py already
    does. The dictionary stays as the fallback, so titles we genuinely lack are
    still reported as gaps.
    """

    CANONICAL = "Sweeney Todd: The Demon Barber of Fleet Street"

    def _patch(self, monkeypatch, catalogue_hit):
        from app.services.search import title_lookup as tl

        monkeypatch.setattr(
            tl, "detect_catalogue_title", lambda *_: catalogue_hit
        )
        monkeypatch.setattr(
            tl, "detect_title_lookup",
            lambda *_: {"title": "Sweeney Todd", "medium": "film"},
        )
        monkeypatch.setattr(
            tl, "find_catalogue_source_types",
            lambda _db, title: ["film"] if title == self.CANONICAL else [],
        )
        return tl

    def test_carried_title_reports_available_in_not_a_gap(self, monkeypatch):
        tl = self._patch(
            monkeypatch, {"title": self.CANONICAL, "medium": "film"}
        )
        gap = tl.compute_content_gap(
            "sweeney todd", None, None, ["Some Other Play"], [],
            db=object(), applied_source_type="play",
        )
        assert gap is not None
        assert gap["play"] == self.CANONICAL
        assert gap["available_in"] == ["film"]

    def test_uncarried_title_still_reports_a_real_gap(self, monkeypatch):
        # Nothing in the catalogue: the curated dictionary is still the only
        # thing that can name a title we do not hold, and must keep doing so.
        tl = self._patch(monkeypatch, None)
        gap = tl.compute_content_gap(
            "sweeney todd", None, None, ["Some Other Play"], [],
            db=object(), applied_source_type=None,
        )
        assert gap is not None
        assert gap["play"] == "Sweeney Todd"
        assert "available_in" not in gap
