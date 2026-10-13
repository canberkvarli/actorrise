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

from app.models.actor import SceneLine
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
    """Append a batch. Anything malformed (not a dict, unknown type, seq not an
    int, at_ms or line_index not a number) is dropped, never fatal. Returns
    rows attempted."""
    run = db.get(RehearsalRun, run_id)
    if run is None or run.user_id != user_id:
        raise PermissionError("not your run")
    rows = []
    for e in events:
        if not isinstance(e, dict):
            continue
        if e.get("type") not in EVENT_TYPES or not isinstance(e.get("seq"), int):
            continue
        try:
            at_ms = int(e.get("at_ms") or 0)
            line_index = None if e.get("line_index") is None else int(e["line_index"])
        except (TypeError, ValueError):
            continue
        payload = e.get("payload")
        rows.append({
            "run_id": run_id,
            "seq": e["seq"],
            "type": e["type"],
            "line_index": line_index,
            "at_ms": at_ms,
            "payload": payload if isinstance(payload, dict) else {},
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


def _actor_line_indexes(db: Session, scene_id: int, character: str) -> set[int]:
    """Positions (contract.lines_for numbering, not line_order) of every line
    in the scene that belongs to `character`, matched the way same_character
    matches: trimmed, case-insensitive."""
    position = (func.row_number().over(order_by=SceneLine.line_order) - 1).label("position")
    ordered = (
        db.query(position, SceneLine.character_name.label("character_name"))
        .filter(SceneLine.scene_id == scene_id)
        .subquery()
    )
    wanted = character.strip().lower()
    rows = db.query(ordered.c.position).filter(func.lower(func.trim(ordered.c.character_name)) == wanted).all()
    return {int(p) for (p,) in rows}


def is_fully_read(db: Session, run_id: int) -> bool:
    """Completed, and every one of the actor's lines has an actor_line_read.

    The journal is client-written, so `completed` on its own is one forged
    POST. is_finished stays the word for resume and the sessions list; this is
    the word for anything that grants something (the trial rule). A part with
    no lines in its scene is never fully read: there is nothing to have read.
    """
    run = db.get(RehearsalRun, run_id)
    if run is None or not is_finished(db, run_id):
        return False
    own = _actor_line_indexes(db, run.scene_id, run.character or "")
    if not own:
        return False
    read = {
        int(i) for (i,) in db.query(RehearsalEvent.line_index)
        .filter(RehearsalEvent.run_id == run_id, RehearsalEvent.type == "actor_line_read",
                RehearsalEvent.line_index.isnot(None))
        .distinct()
    }
    return own <= read


def user_has_finished_a_scene(db: Session, user_id: int) -> bool:
    """Any run of this user's that is fully read (see is_fully_read)."""
    completed_runs = (
        db.query(RehearsalRun.id)
        .join(RehearsalEvent, RehearsalEvent.run_id == RehearsalRun.id)
        .filter(RehearsalRun.user_id == user_id, RehearsalEvent.type == "completed")
        .distinct()
        .order_by(RehearsalRun.id.desc())
    )
    return any(is_fully_read(db, run_id) for (run_id,) in completed_runs)


def in_resume_window(run: RehearsalRun, since: datetime | None = None) -> bool:
    """Started inside RESUME_WINDOW (SQLite hands started_at back naive)."""
    since = since or datetime.now(timezone.utc) - RESUME_WINDOW
    started = run.started_at
    if started is None:
        return True
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    return started >= since


def resumable(db: Session, user_id: int, scene_id: int) -> dict | None:
    since = datetime.now(timezone.utc) - RESUME_WINDOW
    run = (
        db.query(RehearsalRun)
        .filter(RehearsalRun.user_id == user_id, RehearsalRun.scene_id == scene_id)
        .order_by(RehearsalRun.started_at.desc(), RehearsalRun.id.desc())
        .first()
    )
    if run is None or is_closed(db, run.id) or not in_resume_window(run, since):
        return None
    line = furthest_line(db, run.id)
    if not line:  # None or 0: nothing worth resuming
        return None
    return {"run_id": run.id, "line_index": line}

def latest_resumable(db: Session, user_id: int) -> dict | None:
    """The user's most recent open run, any scene, judged the way resumable
    judges one scene: each scene by its latest run, newest scene first. A
    scene whose latest run is closed is done, and the question moves to the
    scene rehearsed before it. Only runs inside the window are looked at."""
    since = datetime.now(timezone.utc) - RESUME_WINDOW
    runs = (
        db.query(RehearsalRun.scene_id)
        .filter(RehearsalRun.user_id == user_id, RehearsalRun.started_at >= since)
        .order_by(RehearsalRun.started_at.desc(), RehearsalRun.id.desc())
    )
    seen: set[int] = set()
    for (scene_id,) in runs:
        if scene_id in seen:
            continue
        seen.add(scene_id)
        found = resumable(db, user_id, scene_id)
        if found is not None:
            return {"scene_id": scene_id, **found}
    return None


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
