"""
API routes for the monologue "work" flow.

Meters the start of a rehearsal session and enforces the free-tier cap; the
frontend catches the 403 and shows the upgrade paywall.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.middleware.rate_limiting import require_monologue_work

router = APIRouter(prefix="/api/monologue-work", tags=["monologue-work"])


class StartSessionRequest(BaseModel):
    monologue_id: int


@router.post("/start")
def start_session(
    request: StartSessionRequest,
    _gate: bool = Depends(require_monologue_work(increment=True)),
):
    """
    Meter the start of a monologue-work session and enforce the free-tier cap.
    The gate raises 403 (with limit/used detail) when the cap is hit; the
    frontend catches that and shows the upgrade paywall.
    """
    return {"ok": True}
