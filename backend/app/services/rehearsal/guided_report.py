"""The guided first scene, read by scene AND by the part played, counting people.

One row per (scene key, part), plus one total row per scene key (part None).
Each count is people (distinct user_id), never runs: a person who opened the
same part three times is one person, and they finished if any of those runs
did. Staff are left out (services/admin_filters.test_user_filter).

  opened       had a guided run of it
  started      that run logged `started` (the partner began)
  reached_end  a run logged `completed` (raw: may be skipped through)
  finished     a run was SPOKEN (services/rehearsal/spoken), the only finish
  dead_mic     a run stopped itself on a dead mic (paused, reason deaf)

Read by GET /api/admin/sessions/guided, scripts/guided_finishes.py and the
conversion brief, so the MARA / DEV question on "A confession" is one table.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models.actor import Scene
from app.models.rehearsal import RehearsalEvent, RehearsalRun
from app.models.user import User
from app.services.admin_filters import test_user_filter
from app.services.guided_scene import guided_key
from app.services.rehearsal.spoken import outcomes

COUNTS = ("opened", "started", "reached_end", "finished", "dead_mic")


def breakdown(db: Session, since: datetime, until: Optional[datetime] = None) -> list[dict[str, Any]]:
    # Staff by id, then left out here: NOT of the filter is NULL for a user
    # with no email, which would drop real people.
    staff = {i for (i,) in db.query(User.id).filter(test_user_filter())}
    q = db.query(RehearsalRun).filter(RehearsalRun.is_guided.is_(True), RehearsalRun.started_at >= since)
    if until is not None:
        q = q.filter(RehearsalRun.started_at < until)
    runs = [r for r in q.all() if r.user_id not in staff]
    if not runs:
        return []
    o = outcomes(db, runs)
    started = {
        rid for (rid,) in db.query(RehearsalEvent.run_id)
        .filter(RehearsalEvent.run_id.in_([r.id for r in runs]), RehearsalEvent.type == "started")
        .distinct()
    }
    keys: dict[int, str] = {}
    for sid in {r.scene_id for r in runs}:
        scene = db.get(Scene, sid)
        keys[sid] = guided_key(db, scene) if scene is not None else "unknown"

    people: dict[tuple[str, Optional[str]], dict[str, set[int]]] = {}
    for r in runs:
        key = keys[r.scene_id]
        part = (r.character or "").strip().upper() or "?"
        flags = {
            "opened": True,
            "started": r.id in started,
            "reached_end": o[r.id]["reached_end"],
            "finished": o[r.id]["spoken"],
            "dead_mic": o[r.id]["dead_mic_stops"] > 0,
        }
        for group in ((key, part), (key, None)):
            sets = people.setdefault(group, {c: set() for c in COUNTS})
            for c, on in flags.items():
                if on:
                    sets[c].add(r.user_id)

    order = {"fight": 0, "flirt": 1, "confession": 2, "late": 3}
    rows = [
        {"scene": key, "part": part, **{c: len(s[c]) for c in COUNTS}}
        for (key, part), s in people.items()
    ]
    rows.sort(key=lambda r: (order.get(r["scene"], 9), r["scene"], r["part"] is not None, r["part"] or ""))
    return rows


def as_table(rows: list[dict[str, Any]]) -> str:
    """Markdown, for the brief and the script. A scene's total row comes first, its parts under it."""
    if not rows:
        return "_No guided runs in range._\n"
    head = "| scene | part | opened | started | reached the end | finished (spoken) | stopped on a dead mic |"
    out = [head, "|" + "---|" * 7]
    for r in rows:
        out.append("| {} | {} | {} | {} | {} | {} | {} |".format(
            r["scene"] if r["part"] is None else "", r["part"] or "all",
            r["opened"], r["started"], r["reached_end"], r["finished"], r["dead_mic"]))
    return "\n".join(out) + "\n"
