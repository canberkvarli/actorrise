"""The run journal. Writes are appends; reads are queries. No counters.

Idempotency is the (run_id, seq) unique constraint: the client numbers every
event once and may send a batch twice (a retry, a sendBeacon on top of a fetch),
and the second copy is a no-op.
"""
from __future__ import annotations

import statistics
from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.rehearsal import EVENT_TYPES, RehearsalEvent, RehearsalRun

RESUME_WINDOW = timedelta(hours=24)


def create_run(db: Session, user_id: int, scene_id: int, character: str, voices: dict, is_guided: bool = False) -> RehearsalRun:
    run = RehearsalRun(user_id=user_id, scene_id=scene_id, character=character, voices=voices, is_guided=is_guided)
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def db_run(db: Session, run_id: int) -> RehearsalRun | None:
    return db.get(RehearsalRun, run_id)


def _insert_ignore(db: Session, rows: list[dict]) -> None:
    if not rows:
        return
    dialect = db.bind.dialect.name
    if dialect == "postgresql":
        from sqlalchemy.dialects.postgresql import insert
    else:
        from sqlalchemy.dialects.sqlite import insert
    stmt = insert(RehearsalEvent).values(rows).on_conflict_do_nothing(index_elements=["run_id", "seq"])
    db.execute(stmt)


def append(db: Session, run_id: int, user_id: int, events: list[dict]) -> int:
    """Append a batch. Unknown types are dropped. Returns rows attempted."""
    run = db.get(RehearsalRun, run_id)
    if run is None or run.user_id != user_id:
        raise PermissionError("not your run")
    rows = []
    for e in events:
        if e.get("type") not in EVENT_TYPES or not isinstance(e.get("seq"), int):
            continue
        rows.append({
            "run_id": run_id,
            "seq": e["seq"],
            "type": e["type"],
            "line_index": e.get("line_index"),
            "at_ms": int(e.get("at_ms") or 0),
            "payload": e.get("payload") or {},
        })
    _insert_ignore(db, rows)
    db.commit()
    return len(rows)


def furthest_line(db: Session, run_id: int) -> int | None:
    # A completed event carries the last line, and finishing is reaching it.
    return db.query(func.max(RehearsalEvent.line_index)).filter(
        RehearsalEvent.run_id == run_id, RehearsalEvent.type.in_(("line_reached", "completed"))).scalar()


def _has(db: Session, run_id: int, *types: str) -> bool:
    return db.query(RehearsalEvent.id).filter(
        RehearsalEvent.run_id == run_id, RehearsalEvent.type.in_(types)).first() is not None


def is_finished(db: Session, run_id: int) -> bool:
    return _has(db, run_id, "completed")


def is_closed(db: Session, run_id: int) -> bool:
    return _has(db, run_id, "completed", "abandoned")


def user_has_finished_a_scene(db: Session, user_id: int) -> bool:
    return (
        db.query(RehearsalEvent.id)
        .join(RehearsalRun, RehearsalRun.id == RehearsalEvent.run_id)
        .filter(RehearsalRun.user_id == user_id, RehearsalEvent.type == "completed")
        .first() is not None
    )


def resumable(db: Session, user_id: int, scene_id: int) -> dict | None:
    since = datetime.now(timezone.utc) - RESUME_WINDOW
    run = (
        db.query(RehearsalRun)
        .filter(RehearsalRun.user_id == user_id, RehearsalRun.scene_id == scene_id)
        .order_by(RehearsalRun.started_at.desc(), RehearsalRun.id.desc())
        .first()
    )
    if run is None or is_closed(db, run.id):
        return None
    started = run.started_at
    if started is not None and started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    if started is not None and started < since:
        return None
    line = furthest_line(db, run.id)
    if not line:  # None or 0: nothing worth resuming
        return None
    return {"run_id": run.id, "line_index": line}


def summaries(db: Session, user_id: int, limit: int = 50) -> list[dict]:
    """One dict per run for the sessions list, newest first."""
    runs = (
        db.query(RehearsalRun).filter(RehearsalRun.user_id == user_id)
        .order_by(RehearsalRun.started_at.desc(), RehearsalRun.id.desc()).limit(limit).all()
    )
    out = []
    for run in runs:
        events = db.query(RehearsalEvent).filter(RehearsalEvent.run_id == run.id).order_by(RehearsalEvent.seq).all()
        handovers = [e.payload.get("handover_ms") for e in events
                     if e.type == "actor_line_read" and isinstance(e.payload.get("handover_ms"), (int, float))]
        # A completed event carries the last line, and finishing is reaching it.
        reached = [e.line_index for e in events
                   if e.type in ("line_reached", "completed") and e.line_index is not None]
        out.append({
            "run_id": run.id,
            "scene_id": run.scene_id,
            "character": run.character,
            "is_guided": run.is_guided,
            "started_at": run.started_at.isoformat() if run.started_at else None,
            "finished": any(e.type == "completed" for e in events),
            "abandoned": any(e.type == "abandoned" for e in events),
            "furthest_line": max(reached) if reached else None,
            "duration_ms": max((e.at_ms for e in events), default=0),
            "lines_read": sum(1 for e in events if e.type == "actor_line_read"),
            "median_handover_ms": statistics.median(handovers) if handovers else None,
        })
    return out


def stats(db: Session, user_id: int) -> dict:
    """Two aggregate queries. Never loads an event row."""
    runs, scenes = (
        db.query(func.count(RehearsalRun.id), func.count(func.distinct(RehearsalRun.scene_id)))
        .filter(RehearsalRun.user_id == user_id)
        .one()
    )
    finished, lines_read = (
        db.query(
            func.count(func.distinct(RehearsalEvent.run_id)).filter(RehearsalEvent.type == "completed"),
            func.count(RehearsalEvent.id).filter(RehearsalEvent.type == "actor_line_read"),
        )
        .join(RehearsalRun, RehearsalRun.id == RehearsalEvent.run_id)
        .filter(RehearsalRun.user_id == user_id)
        .one()
    )
    return {
        "runs": int(runs or 0),
        "finished": int(finished or 0),
        "lines_read": int(lines_read or 0),
        "scenes": int(scenes or 0),
    }
