"""
One play must not own the page.

Searching "war" on the Plays tab returned 20 pieces, 14 of them Edward the
Second (audit, 2026-09-06). Every one scored honestly. It is still a useless
page: an actor typing one broad word wants range to choose from, not one
Marlowe history read fourteen ways.

The cap already existed and already ran. It ran in the wrong place. The
semantic pool was diversified BEFORE the text matches were merged in, and the
merge's re-sort then undid it. The pool handed to diversify_by_play held 14
distinct plays and no Edward the Second at all: it arrived on the text side,
which never passed the cap.
"""

from types import SimpleNamespace

from app.services.search.semantic_search import MAX_PER_PLAY, diversify_by_play


def _piece(i: int, play: str):
    return SimpleNamespace(id=i, play=SimpleNamespace(title=play))


def _titles(scored):
    return [m.play.title for m, _ in scored]


def test_one_play_cannot_hold_more_than_the_cap_up_front():
    """The real Edward the Second shape: one play tops the candidate list, and
    there is enough else in the pool to fill a page without it.

    The pool has to be wider than the page for the cap to be visible at all. On
    the live query the pool held 14 distinct plays behind the flood, which is
    why the page went from 14 Edward the Second pieces to 2.
    """
    scored = [(_piece(i, "Edward the Second"), 0.9 - i * 0.01) for i in range(14)]
    scored += [(_piece(100 + i, f"Play {i}"), 0.5) for i in range(20)]

    out = diversify_by_play(scored)[:20]

    assert _titles(out).count("Edward the Second") == MAX_PER_PLAY
    assert len(out) == 20, "the page still fills, from other plays"
    assert len(set(_titles(out))) == 19, "19 plays instead of the old 5"


def test_the_overflow_is_still_reachable_when_nothing_else_exists():
    """Capping must never shrink a page. With only six other plays in the pool,
    the held-back pieces come back rather than leaving the actor short."""
    scored = [(_piece(i, "Edward the Second"), 0.9 - i * 0.01) for i in range(14)]
    scored += [(_piece(100 + i, f"Play {i}"), 0.5) for i in range(6)]

    out = diversify_by_play(scored)[:20]

    assert len(out) == 20, "a thin pool still fills the page"
    assert _titles(out)[:2] == ["Edward the Second"] * 2
    assert _titles(out)[2:8] == [f"Play {i}" for i in range(6)], "others come first"


def test_overflow_sinks_rather_than_disappearing():
    """A thin corner of the library must still fill a page."""
    scored = [(_piece(i, "Only Play"), 0.9) for i in range(10)]

    out = diversify_by_play(scored)

    assert len(out) == 10, "a query matching one play is returned whole"
    assert _titles(out) == ["Only Play"] * 10


def test_relevance_order_is_kept_within_what_is_allowed():
    scored = [
        (_piece(1, "A"), 0.9),
        (_piece(2, "B"), 0.8),
        (_piece(3, "A"), 0.7),
        (_piece(4, "A"), 0.6),
        (_piece(5, "C"), 0.5),
    ]

    out = diversify_by_play(scored)

    # A's third piece is pushed behind C, the rest keep their order.
    assert [m.id for m, _ in out] == [1, 2, 3, 5, 4]


def test_a_piece_with_no_play_is_never_held_back():
    scored = [(SimpleNamespace(id=1, play=None), 0.9)] * 5
    out = diversify_by_play(scored)
    assert len(out) == 5
