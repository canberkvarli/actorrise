"""Tonight's speech: the house's pick for everyone, and each actor's own.

The house pick is what it always was: the twenty most read pieces in a house,
walked by a hash of the date, so the widget and an offline phone can work it
out without asking. It moved here from api/monologues.py so the read wall can
ask it too.

The actor's own pick is chosen once a night from what they keep, and stored
(models/book.py, TonightPick). It keeps to the gender they keep most, leans
toward the feelings and tones they keep, away from the ones they have passed on, and
never repeats a piece they have been offered or already own. An actor with
nothing kept and nothing answered simply gets the house pick: there is nothing
to be personal about yet.

Either way tonight's speech is free. It never spends a read and is never
walled, which is what lets the 7pm knock and the widget always open onto a
speech the actor can actually read.
"""

import time
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from typing import Iterable, Optional, Set
from zoneinfo import ZoneInfo

from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.models.actor import Monologue, MonologueFavorite, Play
from app.models.book import TonightPick
from app.services.search.semantic_search import exclude_hidden

HOUSES = ("stage", "screen")
#: The pool a day's house pick is drawn from: the house's twenty most read pieces.
POOL = 20
#: How far down the popularity order the personal pick looks.
CANDIDATES = 300
_EPOCH = date(1970, 1, 1)


def local_today(tz: Optional[str]) -> date:
    """The actor's own date, from the IANA zone the phone sends. Anything the
    server cannot read is UTC rather than an error."""
    try:
        return datetime.now(ZoneInfo(tz)).date() if tz else datetime.now(timezone.utc).date()
    except Exception:
        return datetime.now(timezone.utc).date()


def day_start_utc(tz: Optional[str]) -> datetime:
    """The first moment of the actor's today, in UTC, naive: the shape
    monologue_views.created_at is stored in."""
    try:
        zone = ZoneInfo(tz) if tz else timezone.utc
    except Exception:
        zone = timezone.utc
    now = datetime.now(zone)
    start = datetime(now.year, now.month, now.day, tzinfo=zone)
    return start.astimezone(timezone.utc).replace(tzinfo=None)


def house_index(day_number: int, count: int) -> int:
    """Knuth's multiplicative hash of the day, so consecutive days do not walk
    the pool in order. Bit-for-bit what the app computes for itself when it is
    offline (`tonightIndex` in src/hooks/useTonight.ts), so the two agree."""
    return ((day_number * 2654435761) % (1 << 32)) % count


def _house_filter(q, house: str):
    if house == "stage":
        return q.filter(Play.source_type == "play")
    return q.filter(Play.source_type.in_(["film", "tv"]))


def house_pool(db: Session, house: str) -> list:
    q = (
        exclude_hidden(db.query(Monologue))
        .join(Play, Play.id == Monologue.play_id)
        .options(joinedload(Monologue.play).joinedload(Play.film_tv_reference))
    )
    q = _house_filter(q, house)
    pool = q.order_by((Monologue.favorite_count + Monologue.view_count / 10).desc()).limit(POOL).all()
    # By id as a string: the app sorts the same way, so the order the rows
    # arrived in never changes the pick.
    pool.sort(key=lambda m: str(m.id))
    return pool


_pool_cache: dict = {}
_POOL_TTL_SECONDS = 3600


def _pool_ids(db: Session, house: str) -> list:
    """The house pool as ids, held for an hour: the read wall asks on every
    open, and the pool only moves as popularity does."""
    hit = _pool_cache.get(house)
    if hit and time.time() - hit[0] < _POOL_TTL_SECONDS:
        return hit[1]
    ids = [int(m.id) for m in house_pool(db, house)]
    _pool_cache[house] = (time.time(), ids)
    return ids


def house_pick(pool: list, day: date):
    return pool[house_index((day - _EPOCH).days, len(pool))] if pool else None


def _score(m: Monologue, *, liked: Counter, passed: Counter, rank: int) -> float:
    s = -rank / 50.0  # popularity breaks ties, never decides on its own
    for key in (m.primary_emotion, m.tone):
        if key:
            s += 1.5 * liked.get(key, 0) - 2.0 * passed.get(key, 0)
    return s


def _choose(db: Session, user_id: int, house: str, day: date) -> Optional[Monologue]:
    kept = (
        db.query(Monologue)
        .join(MonologueFavorite, MonologueFavorite.monologue_id == Monologue.id)
        .filter(MonologueFavorite.user_id == user_id, MonologueFavorite.removed_at.is_(None))
        .all()
    )
    answered = (
        db.query(TonightPick, Monologue)
        .join(Monologue, Monologue.id == TonightPick.monologue_id)
        .filter(TonightPick.user_id == user_id)
        .all()
    )
    offered: Set[int] = {int(p.monologue_id) for p, _ in answered}
    owned: Set[int] = {int(m.id) for m in kept}

    liked: Counter = Counter()
    for m in kept:
        liked.update(k for k in (m.primary_emotion, m.tone) if k)
    for p, m in answered:
        if p.answer == "keep":
            liked.update(k for k in (m.primary_emotion, m.tone) if k)
    passed: Counter = Counter()
    for p, m in answered:
        if p.answer == "pass":
            passed.update(k for k in (m.primary_emotion, m.tone) if k)

    if not kept and not any(p.answer for p, _ in answered):
        pick = house_pick(house_pool(db, house), day)
        return pick

    genders = Counter(m.character_gender for m in kept if m.character_gender and m.character_gender != "any")
    gender = genders.most_common(1)[0][0] if genders else None

    q = exclude_hidden(db.query(Monologue)).join(Play, Play.id == Monologue.play_id)
    q = _house_filter(q, house)
    skip = offered | owned
    if skip:
        q = q.filter(~Monologue.id.in_(skip))
    order = (Monologue.favorite_count + Monologue.view_count / 10).desc()
    rows = []
    if gender:
        # A filter, not a lean: an actor keeps what they can be cast in, and a
        # speech for the other is no use however well its feeling matches.
        rows = (
            q.filter(or_(Monologue.character_gender.in_((gender, "any", "non-binary")),
                         Monologue.character_gender.is_(None)))
            .order_by(order).limit(CANDIDATES).all()
        )
    if not rows:
        rows = q.order_by(order).limit(CANDIDATES).all()
    if not rows:
        return house_pick(house_pool(db, house), day)
    ranked = sorted(
        enumerate(rows),
        key=lambda t: _score(t[1], liked=liked, passed=passed, rank=t[0]),
        reverse=True,
    )
    top = [m for _, m in ranked[:5]]
    # The same five on the same night always give the same speech; tomorrow
    # the hash moves even if the five do not.
    return top[house_index((day - _EPOCH).days + user_id, len(top))]


def pick_for(db: Session, user_id: int, house: str, day: date) -> Optional[TonightPick]:
    """This actor's pick for this night and house, choosing and storing it the
    first time it is asked for."""
    row = (
        db.query(TonightPick)
        .filter(TonightPick.user_id == user_id, TonightPick.day == day, TonightPick.house == house)
        .first()
    )
    if row:
        return row
    m = _choose(db, user_id, house, day)
    if m is None:
        return None
    row = TonightPick(user_id=user_id, day=day, house=house, monologue_id=int(m.id))
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        # Two screens asked at once; the other one's pick stands.
        db.rollback()
        row = (
            db.query(TonightPick)
            .filter(TonightPick.user_id == user_id, TonightPick.day == day, TonightPick.house == house)
            .first()
        )
    return row


def free_tonight_ids(db: Session, user_id: Optional[int], tz: Optional[str]) -> Set[int]:
    """Every speech that is tonight's for this actor, in either house: the house
    picks for their date (and the day either side, for a phone whose clock and
    the server's disagree about midnight) and any pick of their own today."""
    today = local_today(tz)
    days: Iterable[date] = (today - timedelta(days=1), today, today + timedelta(days=1))
    ids: Set[int] = set()
    try:
        for house in HOUSES:
            pool = _pool_ids(db, house)
            for d in days:
                if pool:
                    ids.add(pool[house_index((d - _EPOCH).days, len(pool))])
        if user_id is not None:
            for (mid,) in db.query(TonightPick.monologue_id).filter(
                TonightPick.user_id == user_id, TonightPick.day.in_(list(days))
            ):
                ids.add(int(mid))
    except Exception:
        # A missing table or a slow pool must not take the read path down with
        # it; without the exemption tonight's speech is just a read.
        db.rollback()
    return ids
