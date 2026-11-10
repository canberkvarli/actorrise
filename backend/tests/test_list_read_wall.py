"""A spent reader must not be handed the text in a list payload.

The wall lived only on the detail endpoint. Search returns MonologueResponse,
whose `text` is the FULL monologue, so every result arrived complete and
ungated. The web panel then opened with the search object and swapped in the
gated teaser a moment later, which is why it read as "opens fully, then
truncates" -- the full text really was on screen first, and it was in the
payload whether or not anything rendered it.

_teaser's own docstring already warned about this shape: the wall handed a spent
free user the complete piece with paywalled: true attached to it.

Pieces the reader has already spent an allowance on stay readable. The wall
counts DISTINCT pieces, so re-opening something you are working on has always
been free, and a list must not be stricter than the detail page.
"""

from app.services.read_wall import should_wall


def test_a_reader_under_the_limit_sees_everything():
    assert should_wall(monologue_id=7, reads_used=2, limit=5,
                       unlimited=False, already_read=set()) is False


def test_a_spent_reader_is_walled_on_something_new():
    assert should_wall(monologue_id=7, reads_used=5, limit=5,
                       unlimited=False, already_read=set()) is True


def test_a_spent_reader_keeps_what_they_already_read():
    assert should_wall(monologue_id=7, reads_used=5, limit=5,
                       unlimited=False, already_read={7}) is False


def test_saving_a_piece_does_not_buy_a_read():
    """Saved pieces used to be exempt and saves were uncapped, so saving every
    search result read all of them (2026-10-31). Only what was actually read
    within the allowance stays open."""
    import inspect

    assert "favorited" not in inspect.signature(should_wall).parameters
    assert should_wall(monologue_id=7, reads_used=9, limit=5,
                       unlimited=False, already_read=set()) is True


def test_a_paying_reader_is_never_walled():
    assert should_wall(monologue_id=7, reads_used=99, limit=5,
                       unlimited=True, already_read=set()) is False


def test_the_boundary_is_at_the_limit_not_past_it():
    assert should_wall(monologue_id=1, reads_used=4, limit=5,
                       unlimited=False, already_read=set()) is False
    assert should_wall(monologue_id=1, reads_used=5, limit=5,
                       unlimited=False, already_read=set()) is True


def test_an_unlimited_sentinel_limit_never_walls():
    """free_read_limit returning -1 means no allowance is being enforced."""
    assert should_wall(monologue_id=1, reads_used=500, limit=-1,
                       unlimited=False, already_read=set()) is False


# _apply_list_wall itself (2026-11-09): a list carries the opening only, even
# while a free web reader still has a read left. The full text comes from the
# detail route, where the read is counted and walled.

from types import SimpleNamespace

import pytest

import app.api.monologues as mono_api

LONG = " ".join(f"word{i}." for i in range(200))  # 200 short sentences


def _resp(i):
    return SimpleNamespace(id=i, text=LONG, text_segments=[{"line": 1}], paywalled=False)


@pytest.fixture
def free_web(monkeypatch):
    def setup(read_ids, limit=1):
        monkeypatch.setattr(mono_api, "_user_has_unlimited_reads", lambda *a, **k: False)
        monkeypatch.setattr(mono_api, "free_read_limit", lambda client: limit)
        monkeypatch.setattr(mono_api, "web_reads_this_month", lambda uid, db: list(read_ids))
    return setup


def _run(responses, **kw):
    req = SimpleNamespace(headers={})
    mono_api._apply_list_wall(responses, db=None, user=SimpleNamespace(id=1, email="a@b.c"),
                              request=req, favorite_ids=set(), **kw)


def test_a_free_reader_with_a_read_left_gets_only_openings(free_web):
    free_web(read_ids=[])
    rs = [_resp(1), _resp(2)]
    _run(rs)
    for r in rs:
        assert len(r.text.split()) <= mono_api._TEASER_MAX_WORDS
        assert r.text_segments is None
        assert r.paywalled is False  # a read is left, so no wall is drawn


def test_a_piece_already_read_stays_whole_in_a_list(free_web):
    free_web(read_ids=[1])
    rs = [_resp(1), _resp(2)]
    _run(rs)
    assert rs[0].text == LONG and rs[0].paywalled is False
    assert rs[1].paywalled is True  # the one read is spent: the rest are walled


def test_the_own_shelf_keeps_full_text_while_a_read_is_left(free_web):
    free_web(read_ids=[])
    rs = [_resp(1)]
    _run(rs, opening_only=False)
    assert rs[0].text == LONG


def test_a_paying_reader_gets_full_text_in_a_list(monkeypatch):
    monkeypatch.setattr(mono_api, "_user_has_unlimited_reads", lambda *a, **k: True)
    rs = [_resp(1)]
    _run(rs)
    assert rs[0].text == LONG
