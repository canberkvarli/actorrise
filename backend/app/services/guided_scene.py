"""The guided first scene: which scene, and which part the actor plays.

The hub starts this at an actor who has never rehearsed. The run itself is
started by POST /api/rehearsal/runs/guided (api/rehearsal.py), which skips
require_scene_partner (the 3-a-month meter and the free-tier "sample only"
rule): a six-line scene is not worth metering, and a run that failed on the
mic must be retryable.

Spec: docs/superpowers/specs/2026-09-26-guided-first-scene-design.md
"""

from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from app.models.actor import Scene, UserScript

# Must agree with the seed (scripts/seed_sample_script.py::seed_late) and with
# lib/guided-scene.ts, which prints the opening line before a session exists.
GUIDED_ACTOR = "ALEX"

# The phone's three first scenes, one a key, found by title. Must agree with
# the seed (scripts/seed_sample_script.py::GUIDED_THREE). Order is the order
# the phone shows them.
GUIDED_KEYS: list[tuple[str, str]] = [("fight", "A fight"), ("flirt", "A flirt"), ("confession", "A confession")]


def guided_scene(db: Session) -> Optional[Scene]:
    """The one scene of the one is_guided script, or None if nothing is seeded."""
    return (
        db.query(Scene)
        .join(UserScript, Scene.user_script_id == UserScript.id)
        .filter(UserScript.is_guided.is_(True))
        .order_by(Scene.id)
        .first()
    )


def guided_scenes(db: Session) -> list[tuple[str, Scene, UserScript]]:
    """The keyed first scenes that are seeded, in the phone's order: (key, scene, script)."""
    out: list[tuple[str, Scene, UserScript]] = []
    for key, title in GUIDED_KEYS:
        row = (
            db.query(Scene, UserScript)
            .join(UserScript, Scene.user_script_id == UserScript.id)
            .filter(UserScript.is_guided.is_(True), UserScript.title == title)
            .order_by(Scene.id)
            .first()
        )
        if row is not None:
            out.append((key, row[0], row[1]))
    return out


def guided_script_of(db: Session, scene_id: int) -> Optional[UserScript]:
    """The guided script a scene belongs to, or None: a scene the guided run may start."""
    scene = db.get(Scene, scene_id)
    if scene is None or scene.user_script_id is None:
        return None
    script = db.get(UserScript, scene.user_script_id)
    return script if script is not None and script.is_guided else None
