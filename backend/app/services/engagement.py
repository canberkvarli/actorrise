"""Engaged activity: usage_metrics days plus days with a meaningful user_event.

The admin's WAU reads usage_metrics alone, which only gated features write
(search, ScenePartner, CraftCoach, Monologue Work). An actor who opens the
audition tracker every week to log an outcome counted as inactive. This is the
second line, kept beside the old one so the before/after stays comparable.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Iterable

ENGAGED_EVENTS = frozenset({
    "monologue_work_started", "monologue_work_finished", "scene_line_delivered",
    "guided_scene_started", "beat_saved", "memorized_toggled", "cut_editor_opened",
    "audition_created", "audition_status_changed", "audition_outcome_logged",
    "audition_prep_started", "audition_reminder_clicked", "audition_landing_shown",
    "audition_strip_clicked", "audition_parse_requested", "audition_parse_corrected", "calendar_feed_subscribed",
})


def week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


def weekly(rows: Iterable[tuple[int, date]]) -> dict[date, dict[str, int]]:
    by_week: dict[date, set[int]] = {}
    for uid, d in rows:
        by_week.setdefault(week_start(d), set()).add(uid)
    out, seen = {}, set()
    for w in sorted(by_week):
        users = by_week[w]
        out[w] = {"active": len(users), "returning": len(users & seen)}
        seen |= users
    return out


def activity_rows(db, real_ids) -> list[tuple[int, date]]:
    """Distinct (user_id, day) across usage_metrics and engaged user_events.

    A user's signup day never counts: arriving is not coming back. The full
    history is read on purpose, because "returning" needs every earlier week.
    """
    from app.models.billing import UsageMetrics
    from app.models.user import User
    from app.models.user_event import UserEvent

    a = db.query(UsageMetrics.user_id, UsageMetrics.date).filter(UsageMetrics.user_id.in_(real_ids)).distinct().all()
    # Days are cut in Python: CAST(.. AS DATE) is Postgres-only (SQLite returns a number).
    b = {
        (u, ts.date())
        for u, ts in db.query(UserEvent.user_id, UserEvent.created_at)
        .filter(UserEvent.user_id.in_(real_ids), UserEvent.event_name.in_(ENGAGED_EVENTS))
        .all()
        if ts is not None
    }
    signup = {
        uid: created.date()
        for uid, created in db.query(User.id, User.created_at).filter(User.id.in_(real_ids)).all()
        if created is not None
    }
    return list({(u, d) for u, d in list(a) + list(b) if u is not None and d is not None and signup.get(u) != d})
