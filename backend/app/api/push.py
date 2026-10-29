"""A phone's push token, handed over once the actor says yes to notifications.

Registering is idempotent and moves a token to whoever is signed in on that
phone now; forgetting it (sign out) switches it off. The zone rides along so
tonight's knock comes at seven on the actor's own clock (services/push.py).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.database import get_db
from app.middleware.rate_limiting import normalise_tz
from app.models.push import PushToken
from app.models.user import User

router = APIRouter(prefix="/api/push", tags=["push"])


class TokenIn(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    tz: Optional[str] = None


@router.post("/token", status_code=204)
async def register_token(body: TokenIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    tz = normalise_tz(body.tz)
    row = db.query(PushToken).filter(PushToken.token == body.token).first()
    if row is None:
        db.add(PushToken(user_id=current_user.id, token=body.token, tz=tz))
    else:
        row.user_id = current_user.id  # type: ignore[assignment]
        row.tz = tz or row.tz  # type: ignore[assignment]
        row.disabled_at = None  # type: ignore[assignment]
        row.updated_at = datetime.now(timezone.utc)  # type: ignore[assignment]
    db.commit()


@router.post("/token/forget", status_code=204)
async def forget_token(body: TokenIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    row = db.query(PushToken).filter(PushToken.token == body.token, PushToken.user_id == current_user.id).first()
    if row is not None and row.disabled_at is None:
        row.disabled_at = datetime.now(timezone.utc)  # type: ignore[assignment]
        db.commit()
