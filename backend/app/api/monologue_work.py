"""
API routes for the monologue "work" flow.

Meters the start of a rehearsal session and enforces the free-tier cap; the
frontend catches the 403 and shows the upgrade paywall.

It also records that the rehearsal happened. Until 2026-09-07 it did not, and
this is the flow most people are on: of the 242 users who searched in the last
30 days, 240 opened a monologue and 17 rehearsed a scene. "Activation" was
being read off `rehearsal_sessions` alone, which covers the two-person
ScenePartner and nothing else, so working a monologue was invisible.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.auth import get_current_user
from app.middleware.rate_limiting import require_monologue_work
from app.models.user import User
from app.services.events import record_user_event

router = APIRouter(prefix="/api/monologue-work", tags=["monologue-work"])


class StartSessionRequest(BaseModel):
    monologue_id: int


@router.post("/start")
def start_session(
    request: StartSessionRequest,
    current_user: User = Depends(get_current_user),
    _gate: bool = Depends(require_monologue_work(increment=True)),
):
    """
    Meter the start of a monologue-work session and enforce the free-tier cap.
    The gate raises 403 (with limit/used detail) when the cap is hit; the
    frontend catches that and shows the upgrade paywall.

    The event is written after the gate, so a paywalled attempt is not counted
    as a rehearsal — it would inflate the one number this exists to measure.
    """
    try:
        record_user_event(
            int(current_user.id),
            "monologue_work_started",
            {"monologue_id": request.monologue_id},
        )
    except Exception:
        # record_user_event swallows its own errors; this is belt and braces so
        # instrumentation can never be what fails an actor's rehearsal.
        pass
    return {"ok": True}
