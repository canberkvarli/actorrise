"""
Naming a show we carry must never return an empty screen.

Replaying the 30 days of failed searches to 2026-09-07, five of the fourteen
queries that still came back with literally nothing were titles already in the
library, searched from the wrong tab: "sing street" three times and "better
call saul" twice, both on Plays, both filed under film and TV.

`content_gap` already told those actors the show lives elsewhere. A banner over
an empty stage is still an empty stage. Asking somebody to notice a tab, press
it and retype is a worse answer than showing them what they asked for. The tab
is how the library is filed. It is not what the actor wanted.
"""

from unittest.mock import MagicMock

import pytest


def _find(rows_by_source):
    """Stand-in for find_title_monologues: returns rows only for the sources
    the title is actually filed under."""

    def inner(db, title, filters=None, limit=20):
        source = (filters or {}).get("source_type")
        if source is None:
            return sum(rows_by_source.values(), [])
        wanted = source if isinstance(source, list) else [source]
        out = []
        for src in wanted:
            out.extend(rows_by_source.get(src, []))
        return out

    return inner


def _lookup(rows_by_source, filters):
    """The endpoint's two-step: honour the tab, then retry without it."""
    find = _find(rows_by_source)
    rows = find(None, "Sing Street", filters=filters)
    crossed = False
    if not rows:
        without_source = {k: v for k, v in (filters or {}).items() if k != "source_type"}
        rows = find(None, "Sing Street", filters=without_source)
        crossed = bool(rows)
    return rows, crossed


FILM_ONLY = {"film": ["a", "b", "c"]}
BOTH = {"film": ["a"], "play": ["p1", "p2"]}


def test_a_film_title_searched_on_the_plays_tab_still_returns_it():
    rows, crossed = _lookup(FILM_ONLY, {"source_type": "play"})
    assert rows == ["a", "b", "c"]
    assert crossed is True


def test_the_right_tab_is_never_second_guessed():
    """When the tab already answers, nothing changes and no retry happens."""
    rows, crossed = _lookup(BOTH, {"source_type": "play"})
    assert rows == ["p1", "p2"]
    assert crossed is False


def test_a_title_we_do_not_carry_stays_empty():
    """The retry must not invent results. This is what keeps a genuine gap a
    gap, so the content-request queue still learns what to buy."""
    rows, crossed = _lookup({}, {"source_type": "play"})
    assert rows == []
    assert crossed is False


def test_other_filters_survive_the_retry():
    """Only the tab is dropped. A gender or duration the actor chose by hand is
    a real narrowing and has to be honoured on the second pass too."""
    seen = {}

    def find(db, title, filters=None, limit=20):
        seen.update(filters or {})
        return [] if (filters or {}).get("source_type") else ["a"]

    filters = {"source_type": "play", "gender": "female", "max_duration": 90}
    rows = find(None, "X", filters=filters)
    if not rows:
        without_source = {k: v for k, v in filters.items() if k != "source_type"}
        rows = find(None, "X", filters=without_source)

    assert rows == ["a"]
    assert seen["gender"] == "female", "a chosen filter is not dropped"
    assert seen["max_duration"] == 90
    assert "source_type" not in {k: v for k, v in filters.items() if k != "source_type"}


@pytest.mark.parametrize("source", ["film", "tv"])
def test_both_screen_tabs_recover(source):
    rows, crossed = _lookup({source: ["x"]}, {"source_type": "play"})
    assert rows == ["x"]
    assert crossed is True
