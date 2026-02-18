from app.core.database import get_db
from app.core.security import verify_supabase_token
from app.models.user import User
from app.services.email.notifications import send_welcome_email
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/auth", tags=["auth"])
security = HTTPBearer()
security_optional = HTTPBearer(auto_error=False)


class UpdateMeRequest(BaseModel):
    name: str | None = None
    marketing_opt_in: bool | None = None


class UpdateOnboardingRequest(BaseModel):
    has_seen_welcome: bool | None = None
    has_seen_search_tour: bool | None = None


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """Dependency to get the current authenticated user.
    
    Extracts the Supabase JWT token from the Authorization header,
    verifies it, and returns the corresponding User from the database.
    Creates the user if it doesn't exist yet.
    """
    token = credentials.credentials
    token_data = verify_supabase_token(token)
    
    if not token_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    supabase_id = token_data.get("sub")
    email = token_data.get("email")

    # Extract name and marketing preference from token metadata
    user_metadata = token_data.get("user_metadata", {}) or {}
    name = user_metadata.get("name") or user_metadata.get("full_name")
    marketing_opt_in = user_metadata.get("marketing_opt_in") is True

    if not supabase_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: missing user ID",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Get or create user
    user = db.query(User).filter(User.supabase_id == supabase_id).first()

    if not user:
        # Create new user if it doesn't exist
        if not email:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing email",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Check if user with this email already exists (shouldn't happen, but handle it)
        existing_user = db.query(User).filter(User.email == email).first()
        if existing_user:
            # Update existing user with supabase_id and name
            existing_user.supabase_id = supabase_id
            if name:
                existing_user.name = name
            db.commit()
            db.refresh(existing_user)
            return existing_user

        # Create new user (marketing_opt_in: explicit opt-in only, never default True)
        user = User(
            email=email,
            supabase_id=supabase_id,
            name=name,
            marketing_opt_in=marketing_opt_in,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        # Send welcome email (fire-and-forget; don't block auth response)
        try:
            send_welcome_email(user_email=user.email, user_name=user.name)
        except Exception:
            pass  # Logged inside send_welcome_email
    else:
        # Update name if it's in the token and different from stored value
        if name and user.name != name:
            user.name = name
            db.commit()
            db.refresh(user)
    
    return user


def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(security_optional),
    db: Session = Depends(get_db),
) -> User | None:
    """Same as get_current_user but returns None when no token or invalid token (for optional auth)."""
    if not credentials:
        return None
    token = credentials.credentials
    token_data = verify_supabase_token(token)
    if not token_data:
        return None
    supabase_id = token_data.get("sub")
    email = token_data.get("email")
    user_metadata = token_data.get("user_metadata", {}) or {}
    name = user_metadata.get("name") or user_metadata.get("full_name")
    if not supabase_id:
        return None
    user = db.query(User).filter(User.supabase_id == supabase_id).first()
    if not user and email:
        existing_user = db.query(User).filter(User.email == email).first()
        if existing_user:
            existing_user.supabase_id = supabase_id
            if name:
                existing_user.name = name
            db.commit()
            db.refresh(existing_user)
            return existing_user
    return user


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    """Get current user information."""
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "supabase_id": current_user.supabase_id,
        "marketing_opt_in": current_user.marketing_opt_in,
        "has_seen_welcome": current_user.has_seen_welcome,
        "has_seen_search_tour": current_user.has_seen_search_tour,
    }


@router.patch("/me")
def update_me(
    body: UpdateMeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update current user name and/or marketing preference."""
    if body.name is not None:
        current_user.name = body.name
    if body.marketing_opt_in is not None:
        current_user.marketing_opt_in = body.marketing_opt_in
    db.commit()
    db.refresh(current_user)
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "supabase_id": current_user.supabase_id,
        "marketing_opt_in": current_user.marketing_opt_in,
    }


@router.patch("/onboarding")
def update_onboarding(
    body: UpdateOnboardingRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark onboarding steps as seen."""
    if body.has_seen_welcome is not None:
        current_user.has_seen_welcome = body.has_seen_welcome
    if body.has_seen_search_tour is not None:
        current_user.has_seen_search_tour = body.has_seen_search_tour
    db.commit()
    db.refresh(current_user)
    return {
        "has_seen_welcome": current_user.has_seen_welcome,
        "has_seen_search_tour": current_user.has_seen_search_tour,
    }
