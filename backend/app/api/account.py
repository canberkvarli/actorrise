"""
Account management API endpoints.

Endpoints for user account operations including account deletion.
"""

import logging

from app.api.auth import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.services.user_deletion import delete_user_completely
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/account", tags=["account"])

logger = logging.getLogger(__name__)


@router.post("/delete", status_code=status.HTTP_200_OK)
def delete_account(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Permanently delete the current user's account and all associated data.

    Returns 200 on success. User should be signed out client-side after this.
    """
    user_id = current_user.id

    try:
        delete_user_completely(db, user_id)
        db.commit()
        logger.info(f"Successfully deleted account for user {user_id}")
        return {"message": "Account deleted successfully"}

    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete account for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete account. Please try again or contact support.",
        )
