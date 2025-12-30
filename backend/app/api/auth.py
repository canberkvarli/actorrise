"""Authentication API endpoints using Supabase Auth."""
from app.core.database import get_db
from app.core.security import verify_supabase_token
from app.models.user import User
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/auth", tags=["auth"])
security = HTTPBearer()




class UserResponse(BaseModel):
    """Pydantic model for user response data."""

    id: int
    email: str

    class Config:
        """Pydantic configuration."""

        from_attributes = True


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """Get the current authenticated user from Supabase JWT token.

    Args:
        credentials: HTTP Bearer token credentials
        db: Database session

    Returns:
        User: The authenticated user object

    Raises:
        HTTPException: If token is invalid, expired, or user not found
    """
    token = credentials.credentials
    
    # Verify Supabase token
    payload = verify_supabase_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )
    
    # Get Supabase user ID (UUID format)
    supabase_user_id = payload.get("sub")
    if not supabase_user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )
    
    # Get email from token
    email = payload.get("email")
    
    try:
        # Look up user by Supabase ID (stored in email field or we need to add supabase_id)
        # For now, we'll use email to find the user
        # TODO: Add supabase_id column to User model for better mapping
        if email:
            user = db.query(User).filter(User.email == email).first()
        else:
            # Fallback: try to find by any matching criteria
            user = None
        
        # If user doesn't exist in our DB, create it (first time login after Supabase signup)
        if user is None and email:
            user = User(
                email=email,
                supabase_id=supabase_user_id,
                hashed_password=None  # No password needed, auth handled by Supabase
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        elif user and not user.supabase_id:
            # Update existing user with Supabase ID if missing
            user.supabase_id = supabase_user_id
            db.commit()
            db.refresh(user)
        
    except OperationalError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable. Please try again later.",
        ) from e
    
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    
    return user


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Get the current authenticated user's profile.
    
    Authentication is handled by Supabase Auth on the frontend.
    This endpoint verifies the Supabase JWT token and returns the user.

    Args:
        current_user: The authenticated user (from dependency)

    Returns:
        UserResponse: The current user's profile data
    """
    return current_user
