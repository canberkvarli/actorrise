"""
Result feedback API (e.g. thumbs up/down on search results, scene extraction reports).
Stores in DB for product insight. Auth optional; anonymous feedback allowed.
"""

import os
from app.core.database import get_db
from app.models.feedback import ResultFeedback
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.security import verify_supabase_token
from app.models.user import User

router = APIRouter(prefix="/api/feedback", tags=["feedback"])
security_optional = HTTPBearer(auto_error=False)

ALLOWED_CONTEXTS = {"search", "film_tv_search", "script_source", "scene_extraction"}
ALLOWED_RATINGS = {"positive", "negative"}

# Categories for scene extraction feedback
SCENE_FEEDBACK_CATEGORIES = {
    "missing_lines", "wrong_character", "missing_scene",
    "wrong_metadata", "other",
}


class FeedbackRequest(BaseModel):
    context: str = Field(..., min_length=1, max_length=64, description="e.g. search")
    rating: str = Field(..., description="positive | negative")
    comment: str | None = Field(None, max_length=500, description="Optional free-text feedback")
    # Scene extraction specific (optional)
    scene_id: int | None = Field(None, description="Scene ID for scene_extraction feedback")
    script_id: int | None = Field(None, description="Script ID for scene_extraction feedback")
    category: str | None = Field(None, description="Feedback category for scene_extraction")


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


def _send_scene_feedback_email(
    user_email: str | None,
    scene_id: int | None,
    script_id: int | None,
    category: str | None,
    comment: str | None,
):
    """Send email notification for scene extraction feedback."""
    try:
        from app.services.email.resend_client import ResendEmailClient
        client = ResendEmailClient()

        user_line = f"<b>User:</b> {user_email}" if user_email else "<b>User:</b> anonymous"
        category_label = (category or "other").replace("_", " ").title()

        html = f"""
        <div style="font-family: sans-serif; max-width: 500px;">
            <h2 style="color: #CB4B00;">Scene Extraction Feedback</h2>
            <p>{user_line}</p>
            <p><b>Script ID:</b> {script_id or 'N/A'}</p>
            <p><b>Scene ID:</b> {scene_id or 'N/A'}</p>
            <p><b>Category:</b> {category_label}</p>
            <p><b>Comment:</b> {comment or '(none)'}</p>
        </div>
        """

        client.send_email(
            to="canberk@actorrise.com",
            subject=f"Scene feedback: {category_label} (script {script_id})",
            html=html,
        )
    except Exception as e:
        print(f"Failed to send scene feedback email: {e}")


@router.post("")
def submit_feedback(
    body: FeedbackRequest,
    background_tasks: BackgroundTasks,
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

    # Require comment for negative feedback (except scene_extraction which has structured fields)
    if body.rating == "negative" and body.context != "scene_extraction":
        if not body.comment or not body.comment.strip():
            raise HTTPException(
                status_code=400,
                detail="Please tell us what you were looking for so we can improve.",
            )

    # For scene_extraction, prefix comment with structured metadata
    stored_comment = body.comment or ""
    if body.context == "scene_extraction":
        category = body.category if body.category in SCENE_FEEDBACK_CATEGORIES else "other"
        prefix = f"[script={body.script_id},scene={body.scene_id},cat={category}]"
        stored_comment = f"{prefix} {stored_comment}".strip()

    row = ResultFeedback(
        context=body.context,
        rating=body.rating,
        comment=stored_comment or None,
        user_id=user.id if user else None,
    )
    db.add(row)
    db.commit()

    # Send email notification for scene extraction feedback
    if body.context == "scene_extraction":
        background_tasks.add_task(
            _send_scene_feedback_email,
            user_email=user.email if user else None,
            scene_id=body.scene_id,
            script_id=body.script_id,
            category=body.category,
            comment=body.comment,
        )

    return {"ok": True}
