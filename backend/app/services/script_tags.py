"""Tags on community-shared scripts: owner-authored, community-upvoted.

The shared-script library has no way to browse it — you either know a title or
you scroll. Tags fix that, but a free-for-all folksonomy would put
stranger-written text on someone's own upload, which needs a report flow and a
moderation queue nobody has time to staff.

So the split is: the **owner** writes the tags, the **community** votes on them.
Strangers can amplify a tag but never author one. Popular tags still surface
(vote count orders them), and there is no text to moderate.
"""

from __future__ import annotations

import re

#: A script may carry at most this many tags. Keeps the card readable and stops
#: tag-stuffing being used to hog the library's filters.
MAX_TAGS_PER_SCRIPT = 8
MAX_TAG_LENGTH = 32
MIN_TAG_LENGTH = 2

_TAG_CLEAN = re.compile(r"[^a-z0-9 \-]+")
_TAG_SPACES = re.compile(r"[\s_]+")


def normalize_tag(raw: str) -> str | None:
    """Fold a user-typed tag to its canonical form, or None if unusable.

    Lowercased, punctuation stripped, whitespace and underscores collapsed to
    single hyphens, so "Two Hander", "two_hander" and "two-hander!" are all one
    tag rather than three near-duplicates cluttering the filter list.
    """
    t = (raw or "").strip().lower()
    # Separators become hyphens BEFORE punctuation is stripped, or "two_hander"
    # would lose its underscore and collapse to "twohander" — a different tag
    # from "two-hander", which defeats the whole point of normalising.
    t = _TAG_SPACES.sub("-", t)
    t = _TAG_CLEAN.sub("", t)
    t = re.sub(r"-{2,}", "-", t).strip("-")
    if len(t) < MIN_TAG_LENGTH or len(t) > MAX_TAG_LENGTH:
        return None
    if not any(c.isalpha() for c in t):  # "123", "---" are not tags
        return None
    return t


def normalize_tag_list(raw_tags: list[str] | None) -> list[str]:
    """Normalise, drop unusable entries, de-duplicate, and cap the list.

    Order is preserved so the owner's first-listed tag stays first — it reads as
    the primary one on the card.
    """
    out: list[str] = []
    seen: set[str] = set()
    for raw in raw_tags or []:
        t = normalize_tag(raw)
        if t and t not in seen:
            seen.add(t)
            out.append(t)
        if len(out) >= MAX_TAGS_PER_SCRIPT:
            break
    return out
