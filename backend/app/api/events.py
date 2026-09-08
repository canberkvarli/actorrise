"""POST /api/events: the browser's way to record a product event.

Only the names in services/events.CLIENT_EVENT_NAMES are accepted. Anything
else is a 204 no-op rather than a 400, because a stale bundle after a deploy
must not fill the console with errors over instrumentation.

Every event carries the device it came from. Rehearsal sessions started
recording platform and browser on 2026-09-07, which makes "does speech die on
iOS" answerable — but scene rehearsals run at about two a week, so it answers
slowly. Product events are where the volume is, and they all arrive here with a
User-Agent already on them, so one change covers every flow at once. It also
says whether the onboarding fall after 2026-08-19 landed evenly across devices,
which nothing currently can.
"""

from typing import Any

from app.api.auth import get_current_user
from app.models.user import User
from app.services.events import CLIENT_EVENT_NAMES, record_user_event
from app.services.rehearsal_client import client_browser, client_platform
from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/events", tags=["events"])


class EventIn(BaseModel):
    event_name: str = Field(min_length=1, max_length=48)
    properties: dict[str, Any] | None = None


def with_device(properties: dict[str, Any] | None, user_agent: str | None) -> dict[str, Any]:
    """The caller's properties, with the machine they came from in front.

    In front on purpose: sanitize_properties keeps the first twelve keys, and a
    caller with a lot to say must not cost us the one field this is for. A
    User-Agent that says nothing adds nothing — an absent key is honest, an
    "unknown" bucket is a number people go on to divide by.
    """
    device: dict[str, Any] = {}
    platform = client_platform(user_agent)
    if platform:
        device["client_platform"] = platform
    browser = client_browser(user_agent)
    if browser:
        device["client_browser"] = browser
    device.update(properties or {})
    return device


@router.post("", status_code=204)
def post_event(
    body: EventIn,
    http_request: Request,
    current_user: User = Depends(get_current_user),
):
    if body.event_name in CLIENT_EVENT_NAMES:
        record_user_event(
            int(current_user.id),
            body.event_name,
            with_device(body.properties, http_request.headers.get("user-agent")),
        )
    return Response(status_code=204)
