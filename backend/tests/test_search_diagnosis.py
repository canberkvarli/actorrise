"""Classifying a failed search: do we hold the piece, or not?

This is the only split on the diagnosis page, so the cost of getting it wrong is
asymmetric. Saying "we don't have it" about something we do costs a name on a
scrape list. Saying "we have it" about something we do not hides a real search
bug behind a content excuse. So anything the classifier cannot judge counts as
missing.
"""

import pytest

from app.services.search_diagnosis import classify_query


class FakeDB:
    """The detection under test is pure Python over a cached catalogue."""

    def __init__(self, titles=(), characters=()):
        self.titles = list(titles)
        self.characters = list(characters)
        self.calls = 0
        self._last = ""

    def execute(self, stmt, params=None):
        self.calls += 1
        self._last = str(stmt)
        return self

    def fetchall(self):
        if "character_name" in self._last:
            return list(self.characters)
        return list(self.titles)


@pytest.fixture(autouse=True)
def _fresh_cache():
    from app.services.search.title_lookup import reset_catalogue_cache
    reset_catalogue_cache()
    yield
    reset_catalogue_cache()


def test_a_title_we_hold_is_have_it():
    db = FakeDB(titles=[("Mean Girls", "film")])
    verdict, resolves_to = classify_query(db, "mean girls")
    assert verdict == "have_it"
    assert resolves_to == "Mean Girls"


def test_a_subtitled_title_we_hold_is_have_it():
    db = FakeDB(titles=[("Ivanoff: A Play", "play")])
    verdict, resolves_to = classify_query(db, "ivanoff")
    assert verdict == "have_it"
    assert resolves_to == "Ivanoff: A Play"


def test_a_query_naming_nothing_is_missing():
    db = FakeDB(titles=[("Mean Girls", "film")])
    assert classify_query(db, "fantasy setting") == ("missing", None)


def test_an_unjudgeable_query_falls_to_missing():
    """A failed catalogue load must not be read as 'we have it'."""

    class BrokenDB:
        def execute(self, *a, **k):
            raise RuntimeError("database is down")

    assert classify_query(BrokenDB(), "mean girls") == ("missing", None)


def test_a_bare_word_that_merely_appears_in_the_catalogue_is_missing(monkeypatch):
    """`term_is_in_catalogue` answers a different question and must not be used.

    It asks whether a word appears anywhere in the catalogue, which grounding
    uses to decide whether a query is servable at all. It is NOT part of the
    retrieval path. The library holds a character literally named "War" (one
    piece, in Numantia), so routing "war" through that helper put it on the
    "search to fix" list -- claiming search should have surfaced a speech
    nobody asking about war wants. Only the title and character pre-passes
    actually retrieve, so only they may say have_it.

    Forced True here, because the verdict must not depend on it either way.
    """
    from app.services.search import title_lookup

    monkeypatch.setattr(title_lookup, "term_is_in_catalogue", lambda *a, **k: True)
    db = FakeDB(titles=[("Numantia", "play")], characters=[])
    assert classify_query(db, "war") == ("missing", None)


def test_an_empty_query_is_missing():
    assert classify_query(FakeDB(), "   ") == ("missing", None)


from datetime import datetime, timedelta, timezone

from app.models.actor import FilmTvReference, Monologue, Play
from app.models.organization import Organization
from app.models.search_log import SearchLog
from app.models.user import User
from app.services.search_diagnosis import diagnose_window
from tests.dbfixture import memory_db, restore


class TestDiagnoseWindow:
    def setup_method(self):
        self.db, self.saved = memory_db(
            [Organization, User, FilmTvReference, Play, Monologue, SearchLog]
        )
        self.actor = User(email="actor@gmail.com", hashed_password="x")
        self.staff = User(email="canberkvarli@gmail.com", hashed_password="x")
        self.db.add_all([self.actor, self.staff])
        self.db.commit()
        self.start = datetime(2026, 9, 1, tzinfo=timezone.utc)
        self.end = datetime(2026, 10, 1, tzinfo=timezone.utc)
        self.when = self.start + timedelta(days=1)

    def teardown_method(self):
        self.db.close()
        restore(self.saved)

    def _log(self, query, *, results=20, weak=False, user=None):
        self.db.add(
            SearchLog(
                query=query, results_count=results, weak_match=weak,
                user_id=user.id if user else None, created_at=self.when,
            )
        )
        self.db.commit()

    def test_found_and_short_sum_to_total(self):
        self._log("hamlet", results=20, weak=False, user=self.actor)
        self._log("lila", results=0, weak=True, user=self.actor)
        out = diagnose_window(self.db, self.start, self.end)
        assert out["total"] == 2
        assert out["found"] + out["short"] == out["total"]
        assert out["short"] == 1

    def test_a_row_that_is_both_zero_and_weak_counts_once(self):
        """15 rows in prod are both. Adding zero + weak double-counts them."""
        self._log("tech bro", results=0, weak=True, user=self.actor)
        assert diagnose_window(self.db, self.start, self.end)["short"] == 1

    def test_staff_searches_are_excluded(self):
        self._log("my own test", results=0, weak=True, user=self.staff)
        assert diagnose_window(self.db, self.start, self.end)["total"] == 0

    def test_anonymous_searches_are_counted(self):
        """A logged-out actor is a real actor."""
        self._log("crazy birds", results=0, weak=True, user=None)
        assert diagnose_window(self.db, self.start, self.end)["total"] == 1

    def test_failures_split_into_the_two_lists(self):
        self._log("lila", results=0, weak=True, user=self.actor)
        self._log("lila", results=0, weak=True, user=self.actor)
        out = diagnose_window(self.db, self.start, self.end)
        assert out["missing"]["searches"] == 2
        assert out["missing"]["queries"][0]["query"] == "lila"
        assert out["missing"]["queries"][0]["count"] == 2
        assert out["have_it"]["searches"] == 0

    def test_most_asked_counts_every_search_not_only_failures(self):
        for _ in range(3):
            self._log("comedic monologue", results=20, weak=False, user=self.actor)
        out = diagnose_window(self.db, self.start, self.end)
        assert out["most_asked"][0] == {"query": "comedic monologue", "count": 3}

    def test_an_empty_window_does_not_divide_by_zero(self):
        out = diagnose_window(self.db, self.start, self.end)
        assert out["total"] == 0 and out["short"] == 0
        assert out["missing"]["queries"] == []


def test_the_endpoint_returns_the_whole_funnel():
    from app.api.admin.searches import get_search_diagnosis

    db, saved = memory_db(
        [Organization, User, FilmTvReference, Play, Monologue, SearchLog]
    )
    try:
        mod = User(email="mod@actorrise.com", hashed_password="x")
        db.add(mod)
        db.commit()
        out = get_search_diagnosis(from_date=None, to_date=None, db=db, _mod=mod)
        assert set(out) == {
            "total", "found", "short", "have_it", "missing",
            "most_asked", "struggling_actors",
        }
    finally:
        db.close()
        restore(saved)
