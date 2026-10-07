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
    "audition_strip_clicked", "audition_parse_requested", "calendar_feed_subscribed",
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
    """Distinct (user_id, day) across usage_metrics and engaged user_events."""
    from sqlalchemy import Date, cast

    from app.models.billing import UsageMetrics
    from app.models.user_event import UserEvent

    a = db.query(UsageMetrics.user_id, UsageMetrics.date).filter(UsageMetrics.user_id.in_(real_ids)).distinct().all()
    b = (
        db.query(UserEvent.user_id, cast(UserEvent.created_at, Date))
        .filter(UserEvent.user_id.in_(real_ids), UserEvent.event_name.in_(ENGAGED_EVENTS))
        .distinct()
        .all()
    )
    return list({(u, d) for u, d in a + b if u is not None and d is not None})
