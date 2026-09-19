"""Close a content request once the library can actually answer it.

`content_requests` rows never closed themselves. A title an actor asked for six
months ago reads exactly like one asked for this morning, so the admin queue
became an archive of search bugs that had already been fixed: on 2026-09-19, 4
of 18 rows were titles cross-tab recovery had found since 2026-09-07, and 5 more
were attribute phrases the `is_title` gate had refused since 2026-09-08.

The matching here is deliberately STRICTER than the search that shows an actor
their results. A false close loses a real gap silently, and nobody ever goes
looking for a row that is no longer in the queue. A row that lingers one week
too long costs nothing by comparison. So:

  - the title must match exactly, ignoring case and spacing ("Pen 15" is the
    stored "Pen15"), and nothing looser. A leading article is a DIFFERENT work:
    Jen Silverman's WITCH is not the film THE WITCH, and search's article-
    dropping normaliser would have closed that request against the wrong play.
  - a request that names an author must not contradict the author we hold. Our
    own missing author is not evidence of a different work, so it still resolves.
  - the play must have a piece an actor can open. A metadata shell with no
    monologues is not an answer.
"""

from typing import Optional

from app.models.actor import Monologue, Play
from app.models.content_request import ContentRequest
from sqlalchemy import func
from sqlalchemy.orm import Session

#: Statuses a resolution may close. `rejected` is a human decision and outranks
#: the library: landing the title does not overrule somebody saying no.
OPEN_STATUSES = ("requested", "planned")


def _squash(text: str) -> str:
    """Lowercase with whitespace removed. NOT article-stripping, on purpose."""
    return "".join((text or "").split()).casefold()


def _authors_conflict(requested: Optional[str], held: Optional[str]) -> bool:
    """True only when both names are known AND neither contains the other.

    Containment rather than equality because the two sides spell people
    differently: "Jen Silverman" against "Silverman, Jen" is the same writer, and
    a request carrying only a surname should still match.
    """
    a, b = (requested or "").strip().casefold(), (held or "").strip().casefold()
    if not a or not b:
        return False
    return a not in b and b not in a


def title_is_live(db: Session, title: str, author: Optional[str] = None) -> bool:
    """True when an actor searching `title` would now find something to open."""
    wanted = _squash(title)
    if not wanted:
        return False

    rows = (
        db.query(Play.title, Play.author)
        .join(Monologue, Monologue.play_id == Play.id)
        .filter(Monologue.review_status.is_(None))
        .group_by(Play.title, Play.author)
        .all()
    )
    for held_title, held_author in rows:
        if _squash(held_title) != wanted:
            continue
        if _authors_conflict(author, held_author):
            continue
        return True
    return False


def resolve_finished_requests(db: Session) -> int:
    """Close every open request the library can now answer. Returns how many.

    Idempotent, and safe to call from a read path: it commits only when it
    actually changed something.
    """
    open_requests = (
        db.query(ContentRequest)
        .filter(ContentRequest.status.in_(OPEN_STATUSES))
        .all()
    )
    closed = 0
    for r in open_requests:
        if title_is_live(db, r.play_title or "", author=r.author):
            r.status = "added"
            closed += 1
    if closed:
        db.commit()
    return closed
