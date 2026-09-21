"""An era filter that makes the answer impossible must not stand.

"Shakespeare" with the Contemporary toggle on returned nothing, while the
library holds 1,608 Shakespeare pieces and 0 of them are contemporary. The
filter made the answer impossible before the query ran.

It is not the no-candidates case that graceful relaxation handles: 14 pieces do
exist under contemporary+play, so relaxation never triggered (14 >= the
threshold of 8). Those 14 were scored, came back at best_cosine 0.196, and the
relevance floor correctly dropped every one. Candidates existed; none of them
could ever be Shakespeare.

monologues.py already drops a contradictory `classical` era when the source is
film/TV-only. This is the same rule pointed the other way.
"""

from app.services.search.era_guard import era_contradicts


def test_a_named_author_we_hold_under_no_other_era_drops_the_era():
    assert era_contradicts(held_under_era=0, held_overall=1608) is True


def test_an_author_we_hold_under_that_era_keeps_it():
    assert era_contradicts(held_under_era=12, held_overall=1608) is False


def test_a_name_we_do_not_hold_at_all_keeps_the_era():
    """Nothing to rescue. Dropping the era would widen a search that was always
    going to fail, and hide a genuine content gap behind a broadened result."""
    assert era_contradicts(held_under_era=0, held_overall=0) is False


def test_a_single_held_piece_still_counts():
    assert era_contradicts(held_under_era=0, held_overall=1) is True
