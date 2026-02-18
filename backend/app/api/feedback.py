"""
Result feedback API (e.g. thumbs up/down on search results).
Stores in DB for product insight. Auth optional — anonymous feedback allowed.
"""

from app.core.database import get_db
from app.models.feedback import ResultFeedback
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.security import verify_supabase_token
from app.models.user import User

router = APIRouter(prefix="/api/feedback", tags=["feedback"])
security_optional = HTTPBearer(auto_error=False)

ALLOWED_CONTEXTS = {"search"}
ALLOWED_RATINGS = {"positive", "negative"}


class FeedbackRequest(BaseModel):
    context: str = Field(..., min_length=1, max_length=64, description="e.g. search")
    rating: str = Field(..., description="positive | negative")


def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(security_optional),
    db: Session = Depends(get_db),
) -> User | None:
    if not credentials:
        return None
    token_data = verify_supabase_token(credentials.credentials)
    if not token_data:
        return None
    supabase_id = token_data.get("sub")
    if not supabase_id:
        return None
    user = db.query(User).filter(User.supabase_id == supabase_id).first()
    return user


@router.post("")
def submit_feedback(
    body: FeedbackRequest,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
) -> dict:
    """
    Submit contextual feedback (e.g. thumbs up/down on search results).
    No auth required; if authenticated, user_id is stored for analytics.
    """
    if body.context not in ALLOWED_CONTEXTS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid context. Must be one of: {', '.join(sorted(ALLOWED_CONTEXTS))}",
        )
    if body.rating not in ALLOWED_RATINGS:
        raise HTTPException(
            status_code=400,
            detail="Invalid rating. Must be 'positive' or 'negative'.",
        )

    row = ResultFeedback(
        context=body.context,
        rating=body.rating,
        user_id=user.id if user else None,
    )
    db.add(row)
    db.commit()
    return {"ok": True}
