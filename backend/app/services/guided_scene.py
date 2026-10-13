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


def guided_scene(db: Session) -> Optional[Scene]:
    """The one scene of the one is_guided script, or None if nothing is seeded."""
    return (
        db.query(Scene)
        .join(UserScript, Scene.user_script_id == UserScript.id)
        .filter(UserScript.is_guided.is_(True))
        .order_by(Scene.id)
        .first()
    )
