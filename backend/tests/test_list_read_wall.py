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
                       unlimited=False, already_read=set(), favorited=set()) is False


def test_a_spent_reader_is_walled_on_something_new():
    assert should_wall(monologue_id=7, reads_used=5, limit=5,
                       unlimited=False, already_read=set(), favorited=set()) is True


def test_a_spent_reader_keeps_what_they_already_read():
    assert should_wall(monologue_id=7, reads_used=5, limit=5,
                       unlimited=False, already_read={7}, favorited=set()) is False


def test_a_spent_reader_keeps_what_they_saved():
    """Saving is the one behaviour with a pulse. Walling a saved piece would
    punish exactly the actors worth keeping."""
    assert should_wall(monologue_id=7, reads_used=9, limit=5,
                       unlimited=False, already_read=set(), favorited={7}) is False


def test_a_paying_reader_is_never_walled():
    assert should_wall(monologue_id=7, reads_used=99, limit=5,
                       unlimited=True, already_read=set(), favorited=set()) is False


def test_the_boundary_is_at_the_limit_not_past_it():
    assert should_wall(monologue_id=1, reads_used=4, limit=5,
                       unlimited=False, already_read=set(), favorited=set()) is False
    assert should_wall(monologue_id=1, reads_used=5, limit=5,
                       unlimited=False, already_read=set(), favorited=set()) is True


def test_an_unlimited_sentinel_limit_never_walls():
    """free_read_limit returning -1 means no allowance is being enforced."""
    assert should_wall(monologue_id=1, reads_used=500, limit=-1,
                       unlimited=False, already_read=set(), favorited=set()) is False
