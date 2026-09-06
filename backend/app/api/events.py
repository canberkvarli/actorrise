"""POST /api/events: the browser's way to record a product event.

Only the names in services/events.CLIENT_EVENT_NAMES are accepted. Anything
else is a 204 no-op rather than a 400, because a stale bundle after a deploy
must not fill the console with errors over instrumentation.
"""

from typing import Any

from app.api.auth import get_current_user
from app.models.user import User
from app.services.events import CLIENT_EVENT_NAMES, record_user_event
from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/events", tags=["events"])


class EventIn(BaseModel):
    event_name: str = Field(min_length=1, max_length=48)
    properties: dict[str, Any] | None = None


@router.post("", status_code=204)
def post_event(
    body: EventIn,
    current_user: User = Depends(get_current_user),
):
    if body.event_name in CLIENT_EVENT_NAMES:
        record_user_event(int(current_user.id), body.event_name, body.properties)
    return Response(status_code=204)
