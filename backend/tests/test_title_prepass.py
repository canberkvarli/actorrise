"""Tests for the title pre-pass (find_title_monologues + its filter guard).

The pre-pass is what turns "the night manager" from a weak match into the 39
pieces we already had (H-07). What matters here is that it is *honest*: it
returns the show's own pieces in quality order, it refuses to run when it
cannot honour the actor's filters, and it stays silent for titles we do not
carry rather than guessing. A fake DB keeps these runnable without Postgres.
"""

import pytest

from app.api.monologues import _prepass_blocked_by_filters
from app.models.actor import Monologue
from app.services.search.title_lookup import find_title_monologues


def mono(id_, quality_score=None, review_status=None, play_id=1):
    m = Monologue(
        id=id_,
        play_id=play_id,
        title=f"m{id_}",
        character_name="X",
        text="...",
        word_count=100,
        estimated_duration_seconds=60,
    )
    m.quality_score = quality_score
    m.review_status = review_status
    return m


class FakeQuery:
    def __init__(self, rows):
        self._rows = rows

    def options(self, *_):
        return self

    def filter(self, *_):
        return self

    def all(self):
        return list(self._rows)


class FakeDB:
    """Hands back play ids for the raw SQL, then monologues for the ORM query.

    `play_ids` is what the normalised-title SQL is pretended to return; set it
    to [] to simulate a title we do not carry.
    """

    def __init__(self, play_ids, monologues):
        self.play_ids = play_ids
        self.monologues = monologues
        self.last_sql = ""
        self.last_params = {}

    def execute(self, stmt, params=None):
        self.last_sql = str(stmt)
        self.last_params = params or {}
        return self

    def fetchall(self):
        return [(pid,) for pid in self.play_ids]

    def query(self, _model):
        return FakeQuery(self.monologues)


class TestOrdering:
    def test_ranked_by_quality_score_desc(self):
        db = FakeDB([1], [mono(1, 0.4), mono(2, 0.9), mono(3, 0.6)])
        got = find_title_monologues(db, "The Night Manager")
        assert [m.id for m in got] == [2, 3, 1]

    def test_unscored_pieces_sort_last_not_first(self):
        # quality_score is nullable and plenty of rows have none. Treating NULL
        # as 0.0 would be fine; treating it as "best" would put the unjudged
        # pieces of a show at the top of the page.
        db = FakeDB([1], [mono(1, None), mono(2, 0.1), mono(3, None)])
        got = find_title_monologues(db, "Fleabag")
        assert [m.id for m in got] == [2, 1, 3]

    def test_ties_break_on_id_so_the_page_is_stable(self):
        db = FakeDB([1], [mono(7, 0.5), mono(3, 0.5), mono(5, 0.5)])
        assert [m.id for m in find_title_monologues(db, "Newsies")] == [3, 5, 7]

    def test_limit_caps_the_page(self):
        db = FakeDB([1], [mono(i, 1.0 - i / 100) for i in range(1, 40)])
        assert len(find_title_monologues(db, "The Night Manager", limit=20)) == 20


class TestGates:
    def test_pieces_awaiting_review_are_excluded(self):
        # review_status='pending' means the repair pass pulled it out of
        # circulation. Naming the show does not make a broken piece shippable.
        db = FakeDB([1], [mono(1, 0.9, review_status="pending"), mono(2, 0.2)])
        assert [m.id for m in find_title_monologues(db, "Bottoms")] == [2]

    def test_short_film_tv_pieces_are_kept(self):
        # Deliberate: the 75-word film/TV gate hid 162 of 355 TV titles from
        # lookup by name (2026-08-17). A named title bypasses it.
        short = mono(1, 0.5)
        short.word_count = 20
        db = FakeDB([1], [short])
        assert [m.id for m in find_title_monologues(db, "Fleabag")] == [1]


class TestMatching:
    def test_title_we_do_not_carry_returns_empty(self):
        db = FakeDB([], [mono(1, 0.9)])
        assert find_title_monologues(db, "Normal People") == []

    def test_query_is_normalised_before_matching(self):
        db = FakeDB([1], [mono(1)])
        find_title_monologues(db, "  The Queen's   Gambit ")
        # lowercase, punctuation stripped, leading article dropped, whitespace
        # collapsed — the same normalisation the catalogue is built with.
        assert db.last_params["n"] == "queens gambit"

    def test_matching_is_exact_not_fuzzy(self):
        # pg_trgm is not installed on this project, so the SQL must compare with
        # equality. A LIKE/similarity branch creeping in here would silently
        # change which searches take the title path.
        db = FakeDB([1], [mono(1)])
        find_title_monologues(db, "Fleabag")
        assert "= :n" in db.last_sql
        assert "similarity(" not in db.last_sql

    def test_too_short_a_title_is_ignored(self):
        db = FakeDB([1], [mono(1)])
        assert find_title_monologues(db, "It") == []

    def test_source_type_narrows_the_play_set(self):
        db = FakeDB([1], [mono(1)])
        find_title_monologues(db, "Fleabag", source_type="tv")
        assert db.last_params["st"] == ["tv"]
        assert "source_type" in db.last_sql

    def test_source_type_accepts_a_list(self):
        db = FakeDB([1], [mono(1)])
        find_title_monologues(db, "Fleabag", source_type=["film", "tv"])
        assert db.last_params["st"] == ["film", "tv"]


class TestDegradesSafely:
    def test_db_failure_falls_through_instead_of_raising(self):
        # A broken pre-pass must cost the vector path, not the search.
        class Boom:
            def execute(self, *_a, **_k):
                raise RuntimeError("connection reset")

        assert find_title_monologues(Boom(), "Fleabag") == []

    def test_no_db_and_no_title_are_no_ops(self):
        assert find_title_monologues(None, "Fleabag") == []
        assert find_title_monologues(FakeDB([1], []), "") == []


class TestFilterGuard:
    def test_no_filters_allows_the_prepass(self):
        assert _prepass_blocked_by_filters({}) is False
        assert _prepass_blocked_by_filters(None) is False

    def test_source_type_alone_allows_the_prepass(self):
        # The tab filter narrows plays, which the pre-pass can honour itself.
        assert _prepass_blocked_by_filters({"source_type": "tv"}) is False

    @pytest.mark.parametrize(
        "key,value",
        [
            ("gender", "female"),
            ("tone", "comedic"),
            ("max_duration", 120),
            ("category", "classical"),
            ("max_overdone_score", 0.3),
            ("age_range", "20s"),
        ],
    )
    def test_attribute_filters_block_the_prepass(self, key, value):
        # The hard-filter cascade lives in SemanticSearch.search. Rather than
        # re-implement it (and drift), the pre-pass stands down and the vector
        # path — which already promotes title matches — serves the query.
        assert _prepass_blocked_by_filters({key: value}) is True

    def test_source_type_plus_an_attribute_still_blocks(self):
        assert _prepass_blocked_by_filters(
            {"source_type": "tv", "gender": "female"}
        ) is True
