"""
Email open/click tracking endpoints.

Self-hosted tracking that works with any email provider (SMTP, Resend, etc.).
- Open tracking: 1x1 transparent pixel served as PNG
- Click tracking: redirects through our server, records the click
"""

import base64
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from fastapi.responses import RedirectResponse, Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.email_tracking import EmailSend

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/t", tags=["tracking"])

# 1x1 transparent PNG (smallest valid PNG, 68 bytes)
_PIXEL = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAB"
    "Nl7BcQAAAABJRU5ErkJggg=="
)


@router.get("/o/{send_id}.png")
def track_open(send_id: int, db: Session = Depends(get_db)):
    """Record an email open via tracking pixel."""
    try:
        send = db.query(EmailSend).filter(EmailSend.id == send_id).first()
        if send and not send.opened_at:
            send.opened_at = datetime.utcnow()
            if send.status in ("queued", "sent", "delivered"):
                send.status = "opened"
            db.commit()
    except Exception:
        logger.exception("Error recording open for send %s", send_id)

    return Response(
        content=_PIXEL,
        media_type="image/png",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
        },
    )


@router.get("/c/{send_id}")
def track_click(
    send_id: int,
    url: str = Query(..., description="The destination URL"),
    db: Session = Depends(get_db),
):
    """Record an email click and redirect to the real URL."""
    try:
        send = db.query(EmailSend).filter(EmailSend.id == send_id).first()
        if send:
            now = datetime.utcnow()
            if not send.clicked_at:
                send.clicked_at = now
            if not send.opened_at:
                send.opened_at = now
            if send.status in ("queued", "sent", "delivered", "opened"):
                send.status = "clicked"
            db.commit()
    except Exception:
        logger.exception("Error recording click for send %s", send_id)

    # Always redirect even if tracking fails
    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    return RedirectResponse(url=url, status_code=302)
