"""Whether one piece in a LIST payload must be served as a teaser.

The free-read wall lived only on the detail endpoint. Search returns
`MonologueResponse`, whose `text` is the full monologue, so every result left
the server complete and ungated no matter how much of their allowance the
reader had spent. The web panel opens with the search object and swaps in the
gated version a moment later, which is why it reads as "opens fully, then
truncates": the full text really is on screen first, and it is in the payload
whether or not anything renders it.

`_teaser`'s own docstring already warned about this exact shape -- the wall
handing a spent free user the complete piece with `paywalled: true` attached.
That was fixed on the detail page and never on the lists.

Kept as a pure function so the rule is testable without a database, and so the
detail page and every list agree about who may read what.
"""

from typing import Set


def should_wall(
    *,
    monologue_id: int,
    reads_used: int,
    limit: int,
    unlimited: bool,
    already_read: Set[int],
    favorited: Set[int],
) -> bool:
    """True when this piece must be served as a teaser to this reader.

    A list must never be stricter than the detail page, so two exemptions carry
    over from it:

    - Pieces already read. The allowance counts DISTINCT pieces, so re-opening
      something you are working on has always been free.
    - Pieces saved. Saving is the one behaviour in this product with a pulse,
      and walling a saved piece would punish precisely the actors worth keeping.
    """
    if unlimited or limit < 0:
        return False
    if monologue_id in favorited or monologue_id in already_read:
        return False
    return reads_used >= limit
