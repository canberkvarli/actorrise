"""Published pieces we point at, under a search the library cannot serve (CAN-24).

Contemporary + teens is the thinnest corner of the library (about 40% of those
searches came back weak on 2026-11-07), and nearly every contemporary play is
in copyright. So when an actor asks for that corner, or names a play we only
know about, a few references ride along under the results: the character, the
play, who wrote it and where to get the script. The results above are never
changed, and no speech is ever shown, because none is held.

Shown only when the ask says what it wants (a play/character/author by name, or
teens, contemporary or comedy). A weak search with nothing to go on gets
nothing: six random contemporary plays under "spongebob" would be noise.
"""

from __future__ import annotations

from typing import Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.monologue_reference import MonologueReference
from app.services.library_language import shows

REFERENCE_STRIP_SIZE = 6

_COMIC_GENRES = ("comedy", "dramedy", "seriocomic")

# Shortest query that may be matched against titles and names. "a", "me", "her"
# would hit half the table.
_MIN_NAME_QUERY = 4


def wanted(constraints: Optional[dict]) -> dict:
    """The parts of the ask a reference row can answer: teen, gender, comic, era."""
    c = constraints or {}
    return {
        "teen": c.get("age_range") == "teens",
        "gender": c.get("gender") if c.get("gender") in ("female", "male") else None,
        "comic": c.get("tone") == "comedic",
        "contemporary": c.get("category") == "contemporary",
        "classical": c.get("category") == "classical",
    }


def should_offer_references(*, q: Optional[str], constraints: Optional[dict], page: int) -> bool:
    """First page of a typed search that is not an explicit ask for the classics."""
    if page != 1 or not (q or "").strip():
        return False
    if wanted(constraints)["classical"]:
        return False
    return shows("en")


def _by_name(db: Session, q: str):
    """References whose play, character or writer the query names."""
    needle = q.strip()
    if len(needle) < _MIN_NAME_QUERY:
        return []
    like = f"%{needle}%"
    return (
        db.query(MonologueReference)
        .filter(
            MonologueReference.active.is_(True),
            or_(
                MonologueReference.play_title.ilike(like),
                MonologueReference.character_name.ilike(like),
                MonologueReference.author.ilike(like),
            ),
        )
        .order_by(MonologueReference.play_title, MonologueReference.id)
        .limit(REFERENCE_STRIP_SIZE)
        .all()
    )


def find_references(db: Session, *, q: str, constraints: Optional[dict]) -> list[MonologueReference]:
    """Up to six references for this ask, or none."""
    named = _by_name(db, q)
    if named:
        return named

    w = wanted(constraints)
    if not (w["teen"] or w["contemporary"] or w["comic"]):
        return []

    query = db.query(MonologueReference).filter(MonologueReference.active.is_(True))
    if w["teen"]:
        query = query.filter(MonologueReference.is_teen.is_(True))
    if w["gender"]:
        query = query.filter(or_(
            MonologueReference.character_gender.is_(None),
            func.lower(MonologueReference.character_gender).in_([w["gender"], "any", ""]),
        ))
    if w["comic"]:
        query = query.filter(func.lower(MonologueReference.genre).in_(_COMIC_GENRES))
    # Stable for one query, different across queries, so a class running ten
    # searches does not see the same six every time.
    return (
        query.order_by(func.md5(func.concat(MonologueReference.id, q.strip().lower())))
        .limit(REFERENCE_STRIP_SIZE)
        .all()
    )
