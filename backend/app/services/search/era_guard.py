"""An era filter that makes the answer impossible must not stand.

"Shakespeare" with the Contemporary toggle on returned nothing, while the
library holds 1,608 Shakespeare pieces and 0 of them contemporary. The filter
made the answer impossible before the query ran.

This is NOT the no-candidates case that graceful relaxation handles. 14 pieces
do exist under contemporary+play, so relaxation never triggered (14 is above the
threshold of 8); those 14 were scored, came back at best_cosine 0.196, and the
relevance floor correctly dropped every one. Candidates existed. None of them
could ever have been Shakespeare.

`monologues.py` already drops a contradictory `classical` era when the source is
film/TV-only. This is that rule pointed the other way, and the decision is kept
here as a pure function so it can be tested without a database.
"""


def era_contradicts(*, held_under_era: int, held_overall: int) -> bool:
    """True when the era filter is the only reason a named work returns nothing.

    `held_under_era` is how many live pieces match the name AND the era;
    `held_overall` how many match the name at all.

    Both zero means the library simply does not hold it. Dropping the era there
    would widen a search that was always going to fail and hide a real content
    gap behind a broadened result, so the era stays and the gap stays visible.
    """
    return held_overall > 0 and held_under_era == 0
