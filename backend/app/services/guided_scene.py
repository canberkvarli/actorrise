"""The guided first scene: one real rehearsal session, no meter, no tier check.

The hub starts this at an actor who has never rehearsed. It is the same
RehearsalSession the rest of the engine uses, so deliver, abandon, telemetry
and the win screen all work unchanged. What it skips is require_scene_partner
(the 3-a-month meter and the free-tier "sample only" rule): a six-line scene is
not worth metering, and a run that failed on the mic must be retryable.

Spec: docs/superpowers/specs/2026-09-26-guided-first-scene-design.md
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.actor import RehearsalSession, Scene, UserScript
from app.models.user import User
from app.services.rehearsal_client import client_browser, client_platform

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


def start_guided_session(
    db: Session, user: User, user_agent: Optional[str]
) -> Tuple[RehearsalSession, Optional[str]]:
    """Create the session and return it with the actor's first line.

    Also flips users.has_seen_first_rehearsal, which is what stops the hub
    inviting again: has_ever_rehearsed is computed from the meter this
    endpoint deliberately does not touch.
    """
    scene = guided_scene(db)
    if scene is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The guided scene is not seeded",
        )

    lines = sorted(scene.lines, key=lambda l: l.line_order)
    cue_names = [l.character_name for l in lines]
    if GUIDED_ACTOR not in cue_names:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"The guided scene has no lines for {GUIDED_ACTOR}",
        )
    partner = next(name for name in cue_names if name != GUIDED_ACTOR)

    session = RehearsalSession(
        user_id=user.id,
        scene_id=scene.id,
        user_character=GUIDED_ACTOR,
        user_characters=[GUIDED_ACTOR],
        ai_character=partner,
        status="in_progress",
        current_line_index=0,
        max_lines=None,
        started_at=datetime.now(timezone.utc),
        client_platform=client_platform(user_agent),
        client_browser=client_browser(user_agent),
    )
    db.add(session)
    user.has_seen_first_rehearsal = True
    db.commit()
    db.refresh(session)

    first_line = next((l.text for l in lines if l.character_name == GUIDED_ACTOR), None)
    return session, first_line
