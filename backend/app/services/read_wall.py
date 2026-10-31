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
) -> bool:
    """True when this piece must be served as a teaser to this reader.

    ``already_read`` is the pieces this reader actually READ this period, the
    first ``limit`` they opened, not every piece with a view row: a walled open
    writes a row too. Re-opening one of those stays free, which is what an
    actor does with a piece they are working on.

    Saving buys nothing (2026-10-31). Saved pieces used to be exempt, and
    saving had no cap, so a free reader could save every search result and
    read all of them: the three-a-month wall stopped only the people who never
    found the heart. A saved piece spends a read when it is first read, like
    any other, and stays open after that.
    """
    if unlimited or limit < 0:
        return False
    if monologue_id in already_read:
        return False
    return reads_used >= limit
