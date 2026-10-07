"""Everything the audition router does, as plain functions on a session.

The router stays thin so these can be tested against the SQLite fixture and so
Ghost Light gets the same behaviour from the same endpoints later.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.models.audition import (
    CLOSED_STATUSES,
    KINDS,
    SOURCES,
    STATUSES,
    Audition,
    AuditionEvent,
    AuditionPiece,
)
from app.services.events import record_user_event

LANDING_WINDOW_DAYS = 14  # login goes to the prep room only this close
WAITING_DAYS = 60  # unresolved this long after the date, it drops to Past
OUTCOMES = {"good": None, "callback": "callback", "no": "passed"}  # outcome -> new status (None keeps it)

EDITABLE = (
    "project", "role", "kind", "status", "starts_at", "due_at", "tz", "location", "casting",
    "material_raw", "material", "bring", "notes", "tape_link", "user_script_id", "reminders_on",
)
_CASTING_NOISE = {"casting", "csa", "inc", "llc", "co", "the", "and"}


def aware(dt: Optional[datetime]) -> Optional[datetime]:
    """SQLite hands back naive datetimes; Postgres does not. Treat naive as UTC."""
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def when(a: Audition) -> Optional[datetime]:
    return aware(a.starts_at or a.due_at)


def casting_key(name: Optional[str]) -> Optional[str]:
    words = re.sub(r"[^a-z0-9]+", " ", (name or "").lower()).split()
    words = [w for w in words if w not in _CASTING_NOISE]
    return " ".join(words) or None


def scope_of(a: Audition, now: datetime) -> str:
    w = when(a)
    if w is not None and w >= now and a.status not in CLOSED_STATUSES:
        return "upcoming"
    if a.status in CLOSED_STATUSES:
        return "past"
    if w is None or now - w <= timedelta(days=WAITING_DAYS):
        return "waiting"
    return "past"


_NOT_NULL = ("project", "kind", "status", "tz", "reminders_on")  # None means "leave it / use the default"


def _clean(data: dict[str, Any]) -> dict[str, Any]:
    out = {k: v for k, v in data.items() if k in EDITABLE and not (v is None and k in _NOT_NULL)}
    for k, v in list(out.items()):
        if isinstance(v, str):
            out[k] = v.strip() or None
    if "project" in out and not out["project"]:
        raise ValueError("project is required")
    for k in ("kind", "status", "tz"):
        if k in out and out[k] is None:
            del out[k]  # blank string: same as not sent
    if "kind" in out and out["kind"] not in KINDS:
        raise ValueError(f"kind must be one of {KINDS}")
    if "status" in out and out["status"] not in STATUSES:
        raise ValueError(f"status must be one of {STATUSES}")
    if "material" in out and out["material"] is not None and not isinstance(out["material"], dict):
        raise ValueError("material must be an object")
    if "tz" in out:
        try:
            ZoneInfo(out["tz"])
        except Exception:
            raise ValueError("tz must be an IANA timezone name")
    # Rendered as a link in the prep room, so only http(s): never javascript: or data:.
    if out.get("tape_link") and not re.match(r"^https?://\S+$", out["tape_link"], re.IGNORECASE):
        raise ValueError("tape_link must be an http(s) link")
    return out


def _check_script(db: Session, user_id: int, fields: dict[str, Any]) -> None:
    sid = fields.get("user_script_id")
    if sid is None:
        return
    from app.models.actor import UserScript

    owned = db.query(UserScript.id).filter(UserScript.id == sid, UserScript.user_id == user_id).first()
    if owned is None:
        raise ValueError("user_script_id must be one of your scripts")


def _event(db: Session, a: Audition, kind: str, data: Optional[dict] = None) -> None:
    db.add(AuditionEvent(audition_id=a.id, user_id=a.user_id, kind=kind, data=data or {}))


def create_audition(
    db: Session, user_id: int, data: dict[str, Any], *, source: str, now: Optional[datetime] = None
) -> Audition:
    if source not in SOURCES:
        raise ValueError(f"source must be one of {SOURCES}")
    fields = _clean(data)
    if not fields.get("project"):
        raise ValueError("project is required")
    _check_script(db, user_id, fields)
    fields.setdefault("kind", "in_person")
    fields.setdefault("tz", "UTC")
    if "status" not in fields:
        fields["status"] = "scheduled" if (fields.get("starts_at") or fields.get("due_at")) else "submitted"
    a = Audition(user_id=user_id, source=source, casting_key=casting_key(fields.get("casting")), **fields)
    if now is not None:
        a.created_at = now
        a.updated_at = now
    db.add(a)
    db.flush()
    _event(db, a, "created", {"source": source})
    db.commit()
    record_user_event(user_id, "audition_created", {
        "source": source,
        "kind": a.kind,
        "has_sides": a.user_script_id is not None,
        "has_material": bool(a.material_raw or a.material),
    })
    return a


def update_audition(db: Session, a: Audition, changes: dict[str, Any]) -> Audition:
    fields = _clean(changes)
    _check_script(db, a.user_id, fields)
    old_status = a.status
    for k, v in fields.items():
        setattr(a, k, v)
    if "casting" in fields:
        a.casting_key = casting_key(a.casting)
    if a.status != old_status:
        _event(db, a, "status_changed", {"from": old_status, "to": a.status})
    db.commit()
    if a.status != old_status:
        record_user_event(a.user_id, "audition_status_changed", {"audition_id": a.id, "from": old_status, "to": a.status})
    return a


def delete_audition(db: Session, a: Audition, *, now: Optional[datetime] = None) -> None:
    a.deleted_at = now or datetime.now(timezone.utc)
    db.commit()


def log_outcome(db: Session, a: Audition, outcome: str, *, via: str) -> Audition:
    if outcome not in OUTCOMES:
        raise ValueError(f"outcome must be one of {tuple(OUTCOMES)}")
    last = (
        db.query(AuditionEvent)
        .filter(AuditionEvent.audition_id == a.id, AuditionEvent.kind == "outcome_logged")
        .order_by(AuditionEvent.id.desc())
        .first()
    )
    if last is not None and (last.data or {}).get("outcome") == outcome:
        return a  # a second tap on the same link changes nothing
    new_status = OUTCOMES[outcome]
    if new_status and new_status != a.status:
        _event(db, a, "status_changed", {"from": a.status, "to": new_status})
        a.status = new_status
    _event(db, a, "outcome_logged", {"outcome": outcome, "via": via})
    db.commit()
    record_user_event(a.user_id, "audition_outcome_logged", {"audition_id": a.id, "outcome": outcome, "via": via})
    return a


def get_owned(db: Session, user_id: int, audition_id: int) -> Optional[Audition]:
    return (
        db.query(Audition)
        .filter(Audition.id == audition_id, Audition.user_id == user_id, Audition.deleted_at.is_(None))
        .first()
    )


def list_auditions(db: Session, user_id: int, now: datetime, scope: Optional[str] = None) -> list[Audition]:
    rows = db.query(Audition).filter(Audition.user_id == user_id, Audition.deleted_at.is_(None)).all()
    order = {"upcoming": 0, "waiting": 1, "past": 2}
    far = datetime.max.replace(tzinfo=timezone.utc)

    def key(a: Audition):
        s = scope_of(a, now)
        w = when(a) or far
        # upcoming soonest first; waiting and past most recent first
        return (order[s], w.timestamp() if s == "upcoming" else -w.timestamp() if w != far else 0)

    rows.sort(key=key)
    if scope:
        rows = [a for a in rows if scope_of(a, now) == scope]
    return rows


def next_upcoming(db: Session, user_id: int, now: datetime) -> Optional[Audition]:
    horizon = now + timedelta(days=LANDING_WINDOW_DAYS)
    for a in list_auditions(db, user_id, now, scope="upcoming"):
        if when(a) <= horizon:
            return a
    return None


def add_piece(
    db: Session, a: Audition, *, monologue_id: Optional[int] = None, scene_id: Optional[int] = None
) -> AuditionPiece:
    if (monologue_id is None) == (scene_id is None):
        raise ValueError("give exactly one of monologue_id or scene_id")
    piece = AuditionPiece(audition_id=a.id, monologue_id=monologue_id, scene_id=scene_id)
    db.add(piece)
    db.commit()
    return piece


def remove_piece(db: Session, a: Audition, piece_id: int) -> bool:
    piece = db.query(AuditionPiece).filter_by(id=piece_id, audition_id=a.id).first()
    if piece is None:
        return False
    db.delete(piece)
    db.commit()
    return True


def pieces_for(db: Session, a: Audition) -> list[AuditionPiece]:
    return db.query(AuditionPiece).filter_by(audition_id=a.id).order_by(AuditionPiece.id).all()


def piece_labels(db: Session, pieces: list[AuditionPiece]) -> dict[int, dict[str, Optional[str]]]:
    """Title, character and play for every linked monologue, in one query, so the
    prep room can name the piece. Imports inside for the same reason as count_runs."""
    ids = {p.monologue_id for p in pieces if p.monologue_id}
    if not ids:
        return {}
    from app.models.actor import Monologue, Play

    rows = (
        db.query(Monologue.id, Monologue.title, Monologue.character_name, Play.title)
        .join(Play, Play.id == Monologue.play_id)
        .filter(Monologue.id.in_(ids))
        .all()
    )
    return {mid: {"title": t, "character": c, "play_title": pt} for mid, t, c, pt in rows}


def count_runs(db: Session, a: Audition, pieces: list[AuditionPiece]) -> tuple[int, Optional[datetime]]:
    """Completed ScenePartner runs on the sides, plus Monologue Work starts on the
    linked pieces, since the audition was added. Imports inside: the actor models
    carry Postgres-only columns, and tests patch this function out."""
    from app.models.actor import RehearsalSession, Scene
    from app.models.user_event import UserEvent

    since = aware(a.created_at)
    stamps: list[datetime] = []
    if a.user_script_id:
        q = (
            db.query(RehearsalSession.created_at)
            .join(Scene, Scene.id == RehearsalSession.scene_id)
            .filter(
                Scene.user_script_id == a.user_script_id,
                RehearsalSession.user_id == a.user_id,
                RehearsalSession.status == "completed",
                RehearsalSession.created_at >= since,
            )
        )
        stamps += [aware(r[0]) for r in q.all()]
    mono_ids = {p.monologue_id for p in pieces if p.monologue_id}
    if mono_ids:
        rows = (
            db.query(UserEvent.created_at, UserEvent.properties)
            .filter(
                UserEvent.user_id == a.user_id,
                UserEvent.event_name == "monologue_work_started",
                UserEvent.created_at >= since,
            )
            .all()
        )
        stamps += [aware(c) for c, props in rows if (props or {}).get("monologue_id") in mono_ids]
    return len(stamps), (max(stamps) if stamps else None)


def build_prep_steps(a: Audition, *, runs: int, piece_count: int) -> list[dict[str, Any]]:
    steps: list[dict[str, Any]] = []
    if a.user_script_id:
        steps.append({"key": "sides", "label": "Run the sides", "done": runs > 0,
                      "href": f"/practice?script={a.user_script_id}"})
    if a.material_raw or a.material:
        q = a.material_raw or " ".join(str(v) for v in (a.material or {}).values() if v)
        steps.append({"key": "piece", "label": "Pick your piece", "done": piece_count > 0,
                      "href": "/monologues?" + urlencode({"q": q})})
    if not steps:
        steps.append({"key": "bring", "label": "What are you bringing?", "done": piece_count > 0,
                      "href": "/rehearse"})
    return steps


def _iso(dt: Optional[datetime]) -> Optional[str]:
    dt = aware(dt)
    return dt.isoformat() if dt else None


def serialize(db: Session, a: Audition, now: datetime, *, with_prep: bool = True) -> dict[str, Any]:
    pieces = pieces_for(db, a)
    labels = piece_labels(db, pieces)
    none = {"title": None, "character": None, "play_title": None}
    out: dict[str, Any] = {
        "id": a.id, "project": a.project, "role": a.role, "kind": a.kind, "status": a.status,
        "starts_at": _iso(a.starts_at), "due_at": _iso(a.due_at), "when": _iso(when(a)), "tz": a.tz,
        "location": a.location, "casting": a.casting, "material_raw": a.material_raw, "material": a.material,
        "bring": a.bring, "notes": a.notes, "tape_link": a.tape_link, "source": a.source,
        "user_script_id": a.user_script_id, "reminders_on": a.reminders_on,
        "scope": scope_of(a, now), "created_at": _iso(a.created_at),
        "pieces": [
            {"id": p.id, "monologue_id": p.monologue_id, "scene_id": p.scene_id, "used": p.used,
             **labels.get(p.monologue_id, none)}
            for p in pieces
        ],
    }
    if with_prep:
        runs, last = count_runs(db, a, pieces)
        out["prep"] = {"runs": runs, "last_run_at": _iso(last),
                       "steps": build_prep_steps(a, runs=runs, piece_count=len(pieces))}
    return out
