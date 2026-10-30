"""A few film and TV pieces under a Plays-tab search that the plays cannot serve.

The Plays tab is mostly classics. 2026-10-30, a high school class preparing a
final: 380 of its 426 searches ran on the Plays tab, which holds 28
contemporary teen pieces against about 300 in film and TV, so every student
kept landing on the same handful ("they keep getting the same options even if
they change up their search fields"). One 1890s schoolroom piece came up in 58
of their searches.

The tab is how the library is filed, not what the actor asked for. So when the
plays answer is weak, or the ask is for something the plays barely hold
(contemporary, teens), the same search also runs on film and TV and the best
few ride along under the results. The plays results are never changed.
"""

from __future__ import annotations

SCREEN_STRIP_SIZE = 6

# What the plays shelf is thin on. Measured 2026-10-30: contemporary teen
# pieces, 28 in plays against 294 in film and TV.
THIN_ON_PLAYS = {"category": {"contemporary"}, "age_range": {"teens"}}


def _is_plays_only(source_type) -> bool:
    if isinstance(source_type, (list, tuple)):
        return list(source_type) == ["play"]
    return source_type == "play"


def should_offer_screen(*, q, filters: dict, page: int, weak_match: bool, title_prepass: bool) -> bool:
    """Whether a Plays-tab search also gets a strip of film and TV pieces."""
    if page != 1 or not (q or "").strip() or title_prepass:
        return False
    filters = filters or {}
    if not _is_plays_only(filters.get("source_type")):
        return False
    # Classical is an explicit ask for the old plays; film has none.
    if filters.get("category") == "classical":
        return False
    if weak_match:
        return True
    return any(filters.get(k) in values for k, values in THIN_ON_PLAYS.items())


def screen_filters(filters: dict) -> dict:
    """The same search, on film and TV. Era says nothing there: it is all modern."""
    out = {k: v for k, v in (filters or {}).items() if k != "category"}
    out["source_type"] = ["film", "tv"]
    return out
