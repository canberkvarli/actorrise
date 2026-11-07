"""What "finished" means: the actor reached the end AND was heard saying it.

A `completed` event only says the run reached its last line. On the guided
first scene that was not the same thing: from 2026-11-03 to 2026-11-06, five
of the ten runs of "A fight" that reached the end had nothing heard on any of
the actor's eight lines (every actor_line_read `deaf: true` or `score: 0`,
`matched: []`, `ended_by: "skipped"`), skipped through in 4 to 12 seconds.

So, everywhere a finish is counted as the actor's first real scene (the
admin rehearsal pages, the conversion brief, the guided report, the earned
trial week), a run is FINISHED only when it is SPOKEN:

  completed, and at least SPOKEN_SHARE of the actor's own lines in the scene
  have a read that was heard: `ended_by` is not "skipped", `deaf` is not true
  and `score` > 0.

`reached_end` stays available as the raw `completed`, and is always labelled
"reached the end", never "finished". The same rule is in one place for every
reader: `heard()` for one read, `is_spoken_run()` for one run in the database,
`outcomes()` for many runs in one query.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Iterable

from sqlalchemy.orm import Session

from app.models.rehearsal import RehearsalEvent, RehearsalRun

SPOKEN_SHARE = 0.5


def heard(payload: dict | None) -> bool:
    """One actor_line_read: the mic heard the actor say it."""
    p = payload if isinstance(payload, dict) else {}
    if p.get("ended_by") == "skipped" or p.get("deaf") is True:
        return False
    score = p.get("score")
    return isinstance(score, (int, float)) and not isinstance(score, bool) and score > 0


def spoken(reads: Iterable[tuple[int | None, dict | None]], own: set[int]) -> bool:
    """`reads` are (line_index, payload) of a run's actor_line_read events;
    `own` is the actor's line positions in the scene. A line read twice (back,
    say it again) counts once, heard if any read of it was."""
    if not own:
        return False
    got = {i for i, p in reads if i in own and heard(p)}
    return len(got) >= SPOKEN_SHARE * len(own)


def is_dead_mic_stop(type_: str, payload: dict | None) -> bool:
    """The guided run paused itself on a dead mic (lib/rehearsal/engine `stall`)."""
    return type_ == "paused" and isinstance(payload, dict) and payload.get("reason") == "deaf"


def _own_lines(db: Session, scene_id: int, character: str, cache: dict) -> set[int]:
    from app.services.rehearsal.journal import _actor_line_indexes

    key = (scene_id, (character or "").strip().lower())
    if key not in cache:
        cache[key] = _actor_line_indexes(db, scene_id, character or "")
    return cache[key]


def outcomes(db: Session, runs: list[RehearsalRun]) -> dict[int, dict]:
    """Per run id: reached_end (raw `completed`), spoken (finished, by the rule
    above), lines (the actor's lines in the scene), heard (of them, heard),
    dead_mic_stops (times the run stopped itself on a dead mic). One query for
    the events of every run."""
    if not runs:
        return {}
    ids = [r.id for r in runs]
    by_run: dict[int, list] = defaultdict(list)
    for e in (
        db.query(RehearsalEvent.run_id, RehearsalEvent.type, RehearsalEvent.line_index, RehearsalEvent.payload)
        .filter(RehearsalEvent.run_id.in_(ids),
                RehearsalEvent.type.in_(("completed", "actor_line_read", "paused")))
    ):
        by_run[e.run_id].append(e)
    cache: dict = {}
    out: dict[int, dict] = {}
    for r in runs:
        ev = by_run.get(r.id, [])
        own = _own_lines(db, r.scene_id, r.character, cache)
        reads = [(e.line_index, e.payload) for e in ev if e.type == "actor_line_read"]
        reached = any(e.type == "completed" for e in ev)
        out[r.id] = {
            "reached_end": reached,
            "spoken": reached and spoken(reads, own),
            "lines": len(own),
            "heard": len({i for i, p in reads if i in own and heard(p)}),
            "dead_mic_stops": sum(1 for e in ev if is_dead_mic_stop(e.type, e.payload)),
        }
    return out


def is_spoken_run(db: Session, run_id: int) -> bool:
    run = db.get(RehearsalRun, run_id)
    if run is None:
        return False
    return outcomes(db, [run])[run.id]["spoken"]
