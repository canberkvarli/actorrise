"""Cue, Canberk's in-app assistant. prompt.md and facts.md are what it knows."""

import os
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session


def trim_old(db: Session) -> int:
    """Delete conversations older than CUE_RETENTION_DAYS (default 90). Messages cascade."""
    from app.models.cue import CueConversation, CueMessage

    cutoff = datetime.now(timezone.utc) - timedelta(days=int(os.getenv("CUE_RETENTION_DAYS", "90")))
    ids = [i for (i,) in db.query(CueConversation.id).filter(CueConversation.last_at < cutoff).all()]
    if not ids:
        return 0
    db.query(CueMessage).filter(CueMessage.conversation_id.in_(ids)).delete(synchronize_session=False)
    db.query(CueConversation).filter(CueConversation.id.in_(ids)).delete(synchronize_session=False)
    db.commit()
    return len(ids)
