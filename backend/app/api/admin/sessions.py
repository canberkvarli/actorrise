"""Admin ScenePartner session analytics API."""

from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Optional

from app.api.admin.stats import require_moderator
from app.api.rehearsal import schedule_synthesis
from app.core.database import get_db
from app.models.actor import Play, RehearsalLineDelivery, RehearsalSession, Scene, SceneLine
from app.models.rehearsal import RehearsalEvent, RehearsalRun
from app.models.user import User
from app.services.admin_filters import test_user_filter
from app.services.rehearsal import partner_audio
from app.services.rehearsal.contract import lines_for
from app.services.rehearsal.delivery import scene_voicing
from app.services.rehearsal.voices import voice_by_id
from app.services.rehearsal_cleanup import TIMED_OUT_STATUS, UNFINISHED_STATUSES, stale_cutoff
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/admin", tags=["admin", "sessions"])

def _rate(completed: int, unfinished: int) -> Optional[float]:
    """Completion rate over *ended* sessions only. In-progress rows are excluded
    because they haven't had the chance to succeed or fail yet."""
    ended = completed + unfinished
    return round(completed / ended * 100, 1) if ended else None


def _date_range(from_date: Optional[str], to_date: Optional[str]) -> tuple[datetime, datetime]:
    """Resolve query date strings to a [start, end) datetime range. Avoids
    ``cast(..., Date)`` on the column, which prevents index use."""
    end_d = date.fromisoformat(to_date) if to_date else date.today()
    start_d = date.fromisoformat(from_date) if from_date else end_d - timedelta(days=30)
    return datetime.combine(start_d, time.min), datetime.combine(end_d + timedelta(days=1), time.min)


# ── One row per rehearsal, from either table ─────────────────────────────────
#
# Rehearsals moved to rehearsal_runs + rehearsal_events with ScenePartner v2
# (2026-10-13). rehearsal_sessions got its last row that day, and this page,
# still reading it, said nobody had rehearsed for twelve days while 86 actors
# had. Both tables are read and turned into the same row, so a window that
# spans the move counts both sides. A run is told apart by a NEGATIVE id, which
# the lines endpoint below reads as "a run".


def _run_status(events: list, started_at: Optional[datetime], now: datetime) -> str:
    types = {e.type for e in events}
    if "completed" in types:
        return "completed"
    if "abandoned" in types:
        return "abandoned"
    started = started_at
    if started is not None and started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    # The same six hours the sweep gives a v1 session before calling it silent.
    if started is not None and started >= stale_cutoff(now):
        return "in_progress"
    return TIMED_OUT_STATUS


def _rows(
    db: Session,
    start_dt: datetime,
    end_dt: datetime,
    *,
    staff: bool = False,
    q: Optional[str] = None,
) -> list[dict[str, Any]]:
    """Every rehearsal started in [start_dt, end_dt), newest first, as dicts the
    page already knows. `staff` keeps test accounts in (the `q` lookup does)."""
    staff_ids = {r[0] for r in db.query(User.id).filter(test_user_filter()).all()}
    now = datetime.now(timezone.utc)
    out: list[dict[str, Any]] = []

    for s in (
        db.query(RehearsalSession)
        .filter(RehearsalSession.started_at >= start_dt, RehearsalSession.started_at < end_dt)
        .all()
    ):
        if not staff and s.user_id in staff_ids:
            continue
        out.append({
            "id": s.id,
            "user_id": s.user_id,
            "scene_id": s.scene_id,
            "user_character": s.user_character,
            "ai_character": s.ai_character,
            "status": s.status,
            "total_lines_delivered": s.total_lines_delivered or 0,
            "lines_retried": s.lines_retried or 0,
            "completion_percentage": s.completion_percentage,
            "overall_rating": s.overall_rating,
            "duration_seconds": s.duration_seconds,
            "started_at": s.started_at,
            "completed_at": s.completed_at,
        })

    runs = [
        r for r in db.query(RehearsalRun)
        .filter(RehearsalRun.started_at >= start_dt, RehearsalRun.started_at < end_dt)
        .all()
        if staff or r.user_id not in staff_ids
    ]
    if runs:
        run_ids = [r.id for r in runs]
        events: dict[int, list] = {i: [] for i in run_ids}
        for e in (
            db.query(RehearsalEvent.run_id, RehearsalEvent.type, RehearsalEvent.line_index,
                     RehearsalEvent.at_ms, RehearsalEvent.received_at)
            .filter(RehearsalEvent.run_id.in_(run_ids))
            .all()
        ):
            events[e.run_id].append(e)
        scene_ids = {r.scene_id for r in runs}
        line_counts = dict(
            db.query(SceneLine.scene_id, func.count(SceneLine.id))
            .filter(SceneLine.scene_id.in_(scene_ids))
            .group_by(SceneLine.scene_id)
            .all()
        )
        for r in runs:
            ev = events[r.id]
            status = _run_status(ev, r.started_at, now)
            reached = [e.line_index for e in ev if e.type in ("line_reached", "completed") and e.line_index is not None]
            total = line_counts.get(r.scene_id) or 0
            if status == "completed":
                pct = 100.0
            elif reached and total:
                pct = round(min(max(reached) + 1, total) / total * 100, 1)
            else:
                pct = 0.0
            # at_ms is the run's own audio clock, so the last event is how long it ran.
            duration = round(max(e.at_ms for e in ev) / 1000) if ev else None
            done_at = next((e.received_at for e in ev if e.type == "completed"), None)
            out.append({
                "id": -r.id,
                "user_id": r.user_id,
                "scene_id": r.scene_id,
                "user_character": r.character,
                "ai_character": ", ".join(c for c in (r.voices or {}) if c.strip().casefold() != (r.character or "").strip().casefold()) or None,
                "status": status,
                "total_lines_delivered": sum(1 for e in ev if e.type == "actor_line_read"),
                "lines_retried": 0,
                "completion_percentage": pct,
                "overall_rating": None,
                "duration_seconds": duration,
                "started_at": r.started_at,
                "completed_at": done_at,
            })

    user_map: dict[int, str] = {}
    user_ids = {r["user_id"] for r in out if r["user_id"] is not None}
    if user_ids:
        user_map = dict(db.query(User.id, User.email).filter(User.id.in_(user_ids)).all())
    scene_map: dict[int, Any] = {}
    scene_ids = {r["scene_id"] for r in out}
    if scene_ids:
        scene_map = {
            s.id: s
            for s in db.query(Scene.id, Scene.title, Scene.character_1_name, Scene.character_2_name,
                              Play.title.label("play_title"))
            .join(Play, Scene.play_id == Play.id)
            .filter(Scene.id.in_(scene_ids))
            .all()
        }
    for r in out:
        sc = scene_map.get(r["scene_id"])
        r["user_email"] = user_map.get(r["user_id"])
        r["scene_title"] = sc.title if sc else "Unknown"
        r["play_title"] = sc.play_title if sc else "Unknown"
        r["character_1"] = sc.character_1_name if sc else None
        r["character_2"] = sc.character_2_name if sc else None

    if q:
        needle = q.lower()
        out = [r for r in out if needle in (r["user_email"] or "").lower() or needle in (r["scene_title"] or "").lower()]

    def _key(r):
        t = r["started_at"]
        if t is not None and t.tzinfo is None:
            t = t.replace(tzinfo=timezone.utc)
        return t or datetime.min.replace(tzinfo=timezone.utc)

    out.sort(key=_key, reverse=True)
    return out


def _avg(values: list) -> Optional[float]:
    vals = [v for v in values if v is not None]
    return sum(vals) / len(vals) if vals else None


def _counts(rows: list[dict[str, Any]]) -> dict[str, int]:
    status = [r["status"] for r in rows]
    return {
        "total": len(rows),
        "completed": status.count("completed"),
        "abandoned": status.count("abandoned"),
        "timed_out": status.count(TIMED_OUT_STATUS),
        "in_progress": status.count("in_progress"),
    }


def _item(r: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": r["id"],
        "user_email": r["user_email"],
        "scene_title": r["scene_title"],
        "play_title": r["play_title"],
        "character_1": r["character_1"],
        "character_2": r["character_2"],
        "user_character": r["user_character"],
        "ai_character": r["ai_character"],
        "status": r["status"],
        "total_lines_delivered": r["total_lines_delivered"],
        "lines_retried": r["lines_retried"],
        "completion_percentage": r["completion_percentage"],
        "overall_rating": r["overall_rating"],
        "duration_seconds": r["duration_seconds"],
        "started_at": r["started_at"].isoformat() if r["started_at"] else None,
        "completed_at": r["completed_at"].isoformat() if r["completed_at"] else None,
    }


@router.get("/sessions")
def get_rehearsal_sessions(
    page: int = Query(1, ge=1),
    limit: int = Query(25, le=100),
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    status: Optional[str] = Query(
        None,
        description="Filter by status: in_progress, completed, abandoned, timed_out, "
        "or 'unfinished' for abandoned+timed_out together",
    ),
    q: Optional[str] = Query(None, description="Filter by user email or scene title"),
    db: Session = Depends(get_db),
    _mod: User = Depends(require_moderator),
) -> dict[str, Any]:
    """Paginated rehearsals with summary stats."""
    start_dt, end_dt = _date_range(from_date, to_date)
    # An explicit `q` finds staff too, or the filter becomes a thing you cannot
    # debug your way past. The summary below always leaves them out.
    rows = _rows(db, start_dt, end_dt, staff=bool(q), q=q)
    if status == "unfinished":
        rows = [r for r in rows if r["status"] in UNFINISHED_STATUSES]
    elif status:
        rows = [r for r in rows if r["status"] == status]

    items = [_item(r) for r in rows[(page - 1) * limit: page * limit]]

    summary: Optional[dict[str, Any]] = None
    if page == 1:
        everyone = _rows(db, start_dt, end_dt)
        c = _counts(everyone)
        avg_duration = _avg([r["duration_seconds"] for r in everyone])
        avg_rating = _avg([r["overall_rating"] for r in everyone])
        avg_completion = _avg([r["completion_percentage"] for r in everyone if r["status"] == "completed"])
        by_title: dict[str, int] = {}
        for r in everyone:
            by_title[r["scene_title"]] = by_title.get(r["scene_title"], 0) + 1
        summary = {
            "total_sessions": c["total"],
            "completed": c["completed"],
            "abandoned": c["abandoned"],
            "timed_out": c["timed_out"],
            "in_progress": c["in_progress"],
            "avg_duration_seconds": round(avg_duration) if avg_duration else None,
            "avg_rating": round(float(avg_rating), 1) if avg_rating else None,
            "avg_completion": round(float(avg_completion), 1) if avg_completion else None,
            "top_scenes": [
                {"scene": t, "count": n}
                for t, n in sorted(by_title.items(), key=lambda kv: -kv[1])[:5]
            ],
        }

    return {
        "sessions": items,
        "total": len(rows),
        "page": page,
        "limit": limit,
        "summary": summary,
    }


@router.get("/sessions/analytics")
def get_session_analytics(
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    db: Session = Depends(get_db),
    _mod: User = Depends(require_moderator),
) -> dict[str, Any]:
    """Aggregate rehearsal analytics: completion funnel, drop-off, per-scene, per-user."""
    start_dt, end_dt = _date_range(from_date, to_date)
    rows = _rows(db, start_dt, end_dt)

    c = _counts(rows)
    completed, abandoned, timed_out = c["completed"], c["abandoned"], c["timed_out"]
    unfinished = abandoned + timed_out
    timed = [r["duration_seconds"] for r in rows if r["duration_seconds"] is not None]
    avg_duration = _avg(timed)
    avg_completed = _avg([r["duration_seconds"] for r in rows if r["status"] == "completed"])

    # Drop-off: both kinds of unfinished count; going silent at 40% is
    # dropping off at 40% exactly as much as clicking away.
    dropoff_pcts = [float(r["completion_percentage"] or 0.0) for r in rows if r["status"] in UNFINISHED_STATUSES]
    buckets = [
        ("Quit immediately (0%)", lambda x: x <= 0),
        ("1-25%", lambda x: 0 < x <= 25),
        ("26-50%", lambda x: 25 < x <= 50),
        ("51-75%", lambda x: 50 < x <= 75),
        ("76-99%", lambda x: 75 < x < 100),
    ]
    dropoff = [{"bucket": label, "count": sum(1 for x in dropoff_pcts if test(x))} for label, test in buckets]

    def _group(key) -> dict[Any, list[dict[str, Any]]]:
        groups: dict[Any, list[dict[str, Any]]] = {}
        for r in rows:
            k = key(r)
            if k is not None:
                groups.setdefault(k, []).append(r)
        return groups

    by_scene = []
    for (scene_title, play_title), group in sorted(
        _group(lambda r: (r["scene_title"], r["play_title"])).items(), key=lambda kv: -len(kv[1])
    )[:10]:
        g = _counts(group)
        g_unfinished = g["abandoned"] + g["timed_out"]
        d = _avg([r["duration_seconds"] for r in group])
        by_scene.append({
            "scene_title": scene_title,
            "play_title": play_title,
            "total": g["total"],
            "completed": g["completed"],
            "abandoned": g["abandoned"],
            "timed_out": g["timed_out"],
            "unfinished": g_unfinished,
            "in_progress": g["in_progress"],
            "completion_rate": _rate(g["completed"], g_unfinished),
            "ended": g["completed"] + g_unfinished,
            "avg_duration_seconds": round(d) if d else None,
        })

    by_user = []
    for email, group in sorted(_group(lambda r: r["user_email"]).items(), key=lambda kv: -len(kv[1]))[:15]:
        g = _counts(group)
        g_unfinished = g["abandoned"] + g["timed_out"]
        last = group[0]["started_at"]  # rows are newest first
        by_user.append({
            "email": email,
            "total": g["total"],
            "completed": g["completed"],
            "abandoned": g["abandoned"],
            "timed_out": g["timed_out"],
            "unfinished": g_unfinished,
            "completion_rate": _rate(g["completed"], g_unfinished),
            "ended": g["completed"] + g_unfinished,
            "last_active": last.isoformat() if last else None,
        })

    return {
        "funnel": {
            "total": c["total"],
            "completed": completed,
            "abandoned": abandoned,
            "timed_out": timed_out,
            "unfinished": unfinished,
            "in_progress": c["in_progress"],
            "completion_rate": _rate(completed, unfinished),
            # Sample size behind the rate, so the percentage isn't read as settled.
            "ended": completed + unfinished,
        },
        "avg_duration_seconds": round(avg_duration) if avg_duration else None,
        "avg_duration_sample": len(timed),
        "avg_completed_duration_seconds": round(avg_completed) if avg_completed else None,
        "dropoff": dropoff,
        "by_scene": by_scene,
        "by_user": by_user,
    }


def _run_lines(db: Session, run_id: int) -> dict[str, Any]:
    """A run's journal as the lines panel reads it: every line the actor read
    and every line the partner played, in the order they happened."""
    run = db.get(RehearsalRun, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Session not found")
    text_at = {line.index: line.text for line in lines_for(db, run.scene_id)}
    events = (
        db.query(RehearsalEvent)
        .filter(RehearsalEvent.run_id == run_id,
                RehearsalEvent.type.in_(("actor_line_read", "partner_line_played")))
        .order_by(RehearsalEvent.seq)
        .all()
    )
    lines = []
    for n, e in enumerate(events, start=1):
        said = text_at.get(e.line_index) if e.line_index is not None else None
        actor = e.type == "actor_line_read"
        lines.append({
            "id": e.id,
            "delivery_order": n,
            "user_input": said if actor else None,
            "ai_response": None if actor else said,
            "feedback": None,
            "emotion_detected": None,
            "pacing_feedback": None,
            "was_retry": False,
            "delivered_at": e.received_at.isoformat() if e.received_at else None,
        })
    return {"overall_feedback": None, "strengths": None, "areas_to_improve": None, "lines": lines}


@router.get("/sessions/{session_id}/lines")
def get_session_line_deliveries(
    session_id: int,
    db: Session = Depends(get_db),
    _mod: User = Depends(require_moderator),
) -> dict[str, Any]:
    """Get line deliveries for a specific rehearsal session, or (negative id) a run."""
    if session_id < 0:
        return _run_lines(db, -session_id)

    session =db.query(RehearsalSession).filter(RehearsalSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    lines = (
        db.query(RehearsalLineDelivery)
        .filter(RehearsalLineDelivery.session_id == session_id)
        .order_by(RehearsalLineDelivery.delivery_order)
        .all()
    )

    return {
        "overall_feedback": session.overall_feedback,
        "strengths": session.strengths,
        "areas_to_improve": session.areas_to_improve,
        "lines": [
            {
                "id": l.id,
                "delivery_order": l.delivery_order,
                "user_input": l.user_input,
                "ai_response": l.ai_response,
                "feedback": l.feedback,
                "emotion_detected": l.emotion_detected,
                "pacing_feedback": l.pacing_feedback,
                "was_retry": l.was_retry,
                "delivered_at": l.delivered_at.isoformat() if l.delivered_at else None,
            }
            for l in lines
        ],
    }


# ── ScenePartner v2: the partner-line cache ──────────────────────────────────

class Regenerate(BaseModel):
    scene_id: int
    line_index: int
    voice: str


@router.post("/rehearsal/audio/regenerate", status_code=202)
def regenerate_partner_audio(
    req: Regenerate,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    _mod: User = Depends(require_moderator),
) -> dict[str, str]:
    """Throw one cached partner line away and make it again, for every actor.

    The row stores only the hash of what was said, so the caller names the
    line (scene, index, voice) and the key is rebuilt from the scene's text.
    202: the row is pending again and a worker has the line."""
    if voice_by_id(req.voice) is None:
        raise HTTPException(status_code=422, detail="Unknown voice")
    scene = db.get(Scene, req.scene_id)
    if scene is None:
        raise HTTPException(status_code=404, detail="Scene not found")
    lines = lines_for(db, scene.id)
    if not 0 <= req.line_index < len(lines):
        raise HTTPException(status_code=404, detail="No such line")
    line = lines[req.line_index]
    # The line as the run voices it (with its acting and delivery notes) and
    # by the vendor it would get now, so the row thrown away is the one actors
    # hear. An actor's own Plus note is per actor and is not regenerated here.
    spec = scene_voicing(db, scene, lines, enrich=False).line_voice(line)
    vendor = partner_audio.vendor_for(db, req.voice, spec, partner_audio.over_cap(db))
    key = partner_audio.audio_key(vendor, req.voice, spec)
    partner_audio.delete_row(db, key)
    partner_audio.ensure(db, vendor, req.voice, spec)
    db.commit()
    background.add_task(schedule_synthesis, [key], {key: spec})
    return {"key": key}
