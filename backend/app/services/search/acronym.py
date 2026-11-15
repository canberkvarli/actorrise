"""A dotted acronym, typed the way a title page prints it.

"WASP" found three pieces and "W.A.S.P.", typed thirteen seconds later by the
same actor, found none (2026-11-14): the dots move the embedding far enough
that every candidate lands under the relevance floor. The dots carry no
meaning, so when a search comes back empty the API tries once more without
them.

Only a retry, never a rewrite: "G.B.F." is how that play's title is actually
filed, and the title lookup must see it as typed first.
"""

import re

# Two or more single letters each followed by a dot, and an optional last
# letter that lost its dot ("U.S.A"). Not part of a longer word either side.
_DOTTED = re.compile(r"(?<![A-Za-z])(?:[A-Za-z]\.){2,}(?:[A-Za-z](?![A-Za-z]))?")


def collapse_dotted_acronyms(query: str) -> str:
    """ "W.A.S.P." -> "WASP". Returns the query unchanged when there is none."""
    return _DOTTED.sub(lambda m: m.group(0).replace(".", ""), query or "")
