"""GET /api/admin/auditions: is the tracker being used, and is it bringing people back?"""

from collections import Counter
from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import Date, func
from sqlalchemy.orm import Session

from app.api.admin.stats import require_moderator
from app.core.database import get_db
from app.models.audition import Audition
from app.models.user import User
from app.models.user_event import UserEvent
from app.services import engagement
from app.services.admin_filters import real_user_ids_query
from app.services.auditions.core import aware

router = APIRouter(prefix="/api/admin/auditions", tags=["admin"])


def _day(v) -> date:
    return v if isinstance(v, date) and not isinstance(v, datetime) else date.fromisoformat(str(v)[:10])


@router.get("")
def auditions_panel(_: User = Depends(require_moderator), db: Session = Depends(get_db)) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    real = real_user_ids_query(db)
    real_ids = [r[0] for r in real.all()]
    live = (Audition.deleted_at.is_(None), Audition.user_id.in_(real))

    total = db.query(func.count(Audition.id)).filter(*live).scalar() or 0
    # First audition per user: a user is a "tracker user" in a week only once they have one.
    first_at = {
        uid: aware(t).date()
        for uid, t in db.query(Audition.user_id, func.min(Audition.created_at)).filter(*live).group_by(Audition.user_id).all()
        if t is not None
    }
    tracker_users = set(first_at)
    users_with_auditions = len(tracker_users)

    # Created per week and source, bucketed from per-day SQL counts.
    by_week_source: dict[str, Counter] = {}
    day = func.date(Audition.created_at, type_=Date)
    for d, source, n in db.query(day, Audition.source, func.count(Audition.id)).filter(*live).group_by(day, Audition.source).all():
        if d is None:
            continue
        w = engagement.week_start(_day(d)).isoformat()
        by_week_source.setdefault(w, Counter())[source] += n

    names = ("audition_parse_requested", "audition_parse_corrected", "audition_parse_failed")
    count = Counter(dict(
        db.query(UserEvent.event_name, func.count(UserEvent.id))
        .filter(UserEvent.event_name.in_(names), UserEvent.user_id.in_(real))
        .group_by(UserEvent.event_name).all()
    ))

    def props_of(name):
        return (
            db.query(UserEvent.user_id, UserEvent.properties, UserEvent.created_at)
            .filter(UserEvent.event_name == name, UserEvent.user_id.in_(real))
            .all()
        )

    owner: dict[int, int] = {}
    past_rows = []
    for aid, uid, starts, due in db.query(Audition.id, Audition.user_id, Audition.starts_at, Audition.due_at).filter(*live).all():
        owner[aid] = uid
        t = aware(starts or due)
        if t is not None and t < now:
            past_rows.append((aid, t))

    def audition_id(props):
        try:
            return int((props or {}).get("audition_id"))
        except (TypeError, ValueError):
            return None

    # Prep events count only when the event's user owns the audition.
    prep_at: dict[int, list[datetime]] = {}
    for uid, props, created in props_of("audition_prep_started"):
        aid = audition_id(props)
        if aid is not None and owner.get(aid) == uid and created is not None:
            prep_at.setdefault(aid, []).append(aware(created))
    # Prep before the date: a past audition with an audition_prep_started before its time.
    past = len(past_rows)
    prepped = sum(1 for aid, t in past_rows if any(p <= t for p in prep_at.get(aid, [])))

    # Reminder loop: of auditions that got a reminder, how many were prepped after the first one went out.
    first_sent: dict[int, datetime] = {}
    for uid, props, created in props_of("audition_reminder_sent"):
        aid = audition_id(props)
        if aid is not None and owner.get(aid) == uid and created is not None:
            t = aware(created)
            first_sent[aid] = min(t, first_sent.get(aid, t))
    reminded_prepped = sum(1 for aid, t in first_sent.items() if any(p > t for p in prep_at.get(aid, [])))

    reminders = Counter((p or {}).get("moment") for _, p, _ in props_of("audition_reminder_sent"))
    clicks = Counter((p or {}).get("moment") for _, p, _ in props_of("audition_reminder_clicked"))
    outcomes = Counter((p or {}).get("via") for _, p, _ in props_of("audition_outcome_logged"))
    winback_users = {u for u, p, _ in props_of("audition_strip_clicked") if (p or {}).get("surface") == "winback_email"}

    # Habit: of each week's active tracker users vs other actives, how many came back the next week.
    by_week: dict = {}
    for uid, d in engagement.activity_rows(db, real_ids):
        by_week.setdefault(engagement.week_start(d), set()).add(uid)
    habit = []
    for w in sorted(by_week)[-7:-1]:
        nxt = by_week.get(w + timedelta(days=7), set())
        mine = {u for u in by_week[w] if u in first_at and first_at[u] <= w + timedelta(days=6)}
        t = mine
        o = by_week[w] - mine
        habit.append({
            "week_start": w.isoformat(),
            "tracker_active": len(t), "tracker_back": len(t & nxt),
            "other_active": len(o), "other_back": len(o & nxt),
        })

    return {
        "users_with_auditions": users_with_auditions,
        "auditions": total,
        "created_by_week": [{"week_start": w, **dict(c)} for w, c in sorted(by_week_source.items())[-8:]],
        "parse": {"requested": count["audition_parse_requested"], "corrected": count["audition_parse_corrected"],
                  "failed": count["audition_parse_failed"]},
        "prep_before_date": {"past": past, "prepped": prepped},
        "reminders": {"sent": dict(reminders), "clicked": dict(clicks),
                      "auditions": len(first_sent), "prepped_after": reminded_prepped},
        "outcomes_by_via": dict(outcomes),
        "habit": habit,
        "winback_users": len(winback_users),
    }
