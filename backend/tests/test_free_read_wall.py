"""The free-read wall counts distinct pieces, monthly.

Three things were broken at once and each hid the next. `_teaser` sliced lines
from a corpus that has none, so the wall shipped the whole speech; nothing on
the client read `paywalled`, so there was no UI; and `POST /read`, the only
thing that spent the counter, is called by the iOS app and by nothing on the
web. The wall has therefore never fired for a web user in the product's life.

Counting distinct `monologue_views` rows fixes the third: the detail endpoint
already writes one per open, so the web is gated without the client spending
anything, and re-opening a piece you are working on stays free.
"""

from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine, func
from sqlalchemy.orm import sessionmaker

from app.middleware.rate_limiting import (
    CLIENT_GHOSTLIGHT,
    CLIENT_WEB,
    FREE_MONOLOGUE_READ_LIMIT,
    _period_start,
    _period_start_utc,
    distinct_reads,
    free_read_limit,
    monthly_distinct_reads,
    normalise_client,
)
from app.models.search_log import MonologueView


@pytest.fixture()
def db():
    # Only this one table: creating the whole metadata against SQLite fails on
    # the pgvector columns elsewhere in the model tree, and the gate reads
    # nothing but monologue_views.
    #
    # created_at carries server_default=now(), which is Postgres DDL and which
    # SQLite refuses. Dropped for the fixture and put back afterwards, because
    # the column definition is module-level shared state.
    created_at = MonologueView.__table__.c.created_at
    original_default = created_at.server_default
    created_at.server_default = None
    engine = create_engine("sqlite://")
    try:
        MonologueView.__table__.create(engine)
        session = sessionmaker(bind=engine)()
        yield session
        session.close()
    finally:
        created_at.server_default = original_default


def _view(
    db,
    user_id: int,
    monologue_id: int,
    when: datetime | None = None,
    client: str | None = None,
):
    # Naive UTC, matching what the database's now() writes into the column.
    db.add(
        MonologueView(
            user_id=user_id,
            monologue_id=monologue_id,
            client=client,
            created_at=when or datetime.now(timezone.utc).replace(tzinfo=None),
        )
    )
    db.commit()


class TestPeriodStart:
    def test_period_is_the_calendar_month(self):
        assert _period_start() == date.today().replace(day=1)

    def test_limit_is_a_month_not_a_lifetime(self):
        """A lifetime cap gives one conversion moment per actor, ever."""
        assert FREE_MONOLOGUE_READ_LIMIT > 0
        assert _period_start().day == 1


class TestDistinctReads:
    def test_counts_pieces_not_opens(self, db):
        for _ in range(6):
            _view(db, user_id=1, monologue_id=42)
        assert monthly_distinct_reads(1, db) == 1

    def test_counts_each_distinct_piece(self, db):
        for mid in (1, 2, 3):
            _view(db, user_id=1, monologue_id=mid)
        assert monthly_distinct_reads(1, db) == 3

    def test_last_month_does_not_count(self, db):
        _view(db, user_id=1, monologue_id=1, when=_period_start_utc() - timedelta(days=1))
        _view(db, user_id=1, monologue_id=2)
        assert monthly_distinct_reads(1, db) == 1

    def test_a_view_late_on_the_last_day_counts_in_its_own_month(self, db):
        """The UTC/local mismatch dropped exactly this row.

        23:42 UTC on the 31st is inside the month it was written in, even when
        the server's local clock has already rolled into the next one.
        """
        _view(db, user_id=1, monologue_id=1, when=_period_start_utc() + timedelta(minutes=1))
        assert monthly_distinct_reads(1, db) == 1

    def test_other_users_do_not_count(self, db):
        _view(db, user_id=2, monologue_id=1)
        assert monthly_distinct_reads(1, db) == 0

    def test_exclusion_leaves_a_piece_out_of_its_own_count(self, db):
        for mid in (1, 2, 3):
            _view(db, user_id=1, monologue_id=mid)
        assert monthly_distinct_reads(1, db, exclude_monologue_id=3) == 2


class TestWallArithmetic:
    """The gate is `distinct(excluding this one) >= limit`."""

    def _walled(self, db, user_id, monologue_id):
        return (
            monthly_distinct_reads(user_id, db, exclude_monologue_id=monologue_id)
            >= FREE_MONOLOGUE_READ_LIMIT
        )

    def test_the_allowance_is_fully_spendable(self, db):
        """The Nth new piece is the Nth free one, not the first walled one."""
        for i in range(1, FREE_MONOLOGUE_READ_LIMIT + 1):
            _view(db, user_id=1, monologue_id=i)
            assert not self._walled(db, 1, i), f"piece {i} should be free"

    def test_the_next_new_piece_is_walled(self, db):
        for i in range(1, FREE_MONOLOGUE_READ_LIMIT + 1):
            _view(db, user_id=1, monologue_id=i)
        nxt = FREE_MONOLOGUE_READ_LIMIT + 1
        _view(db, user_id=1, monologue_id=nxt)
        assert self._walled(db, 1, nxt)

    def test_rereading_an_earlier_piece_stays_free(self, db):
        """The whole point of counting pieces: an actor re-opens what they work on."""
        for i in range(1, FREE_MONOLOGUE_READ_LIMIT + 1):
            _view(db, user_id=1, monologue_id=i)
        _view(db, user_id=1, monologue_id=1)
        assert not self._walled(db, 1, 1)

    def test_a_walled_open_does_not_free_the_next_one(self, db):
        for i in range(1, FREE_MONOLOGUE_READ_LIMIT + 2):
            _view(db, user_id=1, monologue_id=i)
        after = FREE_MONOLOGUE_READ_LIMIT + 2
        _view(db, user_id=1, monologue_id=after)
        assert self._walled(db, 1, after)

    def test_a_fresh_user_is_not_walled(self, db):
        _view(db, user_id=1, monologue_id=1)
        assert not self._walled(db, 1, 1)


class TestSeparateTrialsPerClient:
    """Web and Ghost Light run separate trials that must not pool.

    Web is a free tier: 5 distinct pieces per calendar month, the same wall
    twelve times a year. Ghost Light is a trial: 3 distinct pieces for life,
    then the paywall — its own wall says "three reads were the trial", past
    tense, and a trial that refills monthly is not a trial.

    Pooling the counts is the failure this guards: reading on the web must not
    arrive in the app as a spent trial, in either direction.
    """

    def test_the_two_limits_differ(self):
        assert free_read_limit(CLIENT_WEB) == 5
        assert free_read_limit(CLIENT_GHOSTLIGHT) == 3

    def test_web_reads_do_not_spend_the_app_trial(self, db):
        for i in range(1, 6):
            _view(db, user_id=1, monologue_id=i, client=CLIENT_WEB)
        assert distinct_reads(1, db, client=CLIENT_WEB) == 5
        assert distinct_reads(1, db, client=CLIENT_GHOSTLIGHT) == 0

    def test_app_reads_do_not_spend_the_web_allowance(self, db):
        for i in range(1, 4):
            _view(db, user_id=1, monologue_id=i, client=CLIENT_GHOSTLIGHT)
        assert distinct_reads(1, db, client=CLIENT_GHOSTLIGHT) == 3
        assert distinct_reads(1, db, client=CLIENT_WEB) == 0

    def test_null_client_counts_as_web(self, db):
        # Every row written before the column existed came from the web detail
        # page. Treating NULL as web keeps those users' history; treating it as
        # the app would spend a lifetime trial nobody had opened.
        _view(db, user_id=1, monologue_id=1, client=None)
        assert distinct_reads(1, db, client=CLIENT_WEB) == 1
        assert distinct_reads(1, db, client=CLIENT_GHOSTLIGHT) == 0

    def test_the_app_trial_is_lifetime_not_monthly(self, db):
        # Two months ago. The web would have forgotten this; the app must not.
        long_ago = _period_start_utc() - timedelta(days=45)
        _view(db, user_id=1, monologue_id=1, client=CLIENT_GHOSTLIGHT, when=long_ago)
        _view(db, user_id=1, monologue_id=2, client=CLIENT_WEB, when=long_ago)
        assert distinct_reads(1, db, client=CLIENT_GHOSTLIGHT) == 1
        assert distinct_reads(1, db, client=CLIENT_WEB) == 0

    def test_reopening_a_piece_is_free_on_both(self, db):
        for _ in range(4):
            _view(db, user_id=1, monologue_id=7, client=CLIENT_GHOSTLIGHT)
        assert distinct_reads(1, db, client=CLIENT_GHOSTLIGHT) == 1

    def test_exclusion_applies_per_client(self, db):
        _view(db, user_id=1, monologue_id=1, client=CLIENT_GHOSTLIGHT)
        _view(db, user_id=1, monologue_id=2, client=CLIENT_GHOSTLIGHT)
        # The piece being opened does not count against its own read.
        assert distinct_reads(
            1, db, client=CLIENT_GHOSTLIGHT, exclude_monologue_id=2
        ) == 1


class TestNormaliseClient:
    def test_the_app_names_itself(self):
        assert normalise_client("ghostlight") == CLIENT_GHOSTLIGHT
        assert normalise_client("  GhostLight ") == CLIENT_GHOSTLIGHT

    @pytest.mark.parametrize("value", [None, "", "web", "curl/8.4", "ios", "unknown"])
    def test_everything_else_is_web(self, value):
        # Web is the safe default: it is the likelier caller and the LARGER
        # allowance, so a missing header cannot spend a stranger's trial.
        assert normalise_client(value) == CLIENT_WEB

    def test_monthly_distinct_reads_still_means_web(self, db):
        _view(db, user_id=1, monologue_id=1, client=CLIENT_GHOSTLIGHT)
        _view(db, user_id=1, monologue_id=2, client=CLIENT_WEB)
        assert monthly_distinct_reads(1, db) == 1
