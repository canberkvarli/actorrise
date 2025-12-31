from app.core.database import get_db
from app.core.security import verify_supabase_token
from app.models.user import User
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/auth", tags=["auth"])
security = HTTPBearer()


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

    # Extract name from token metadata if available
    user_metadata = token_data.get("user_metadata", {})
    name = user_metadata.get("name") or user_metadata.get("full_name")

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

        # Create new user
        user = User(
            email=email,
            supabase_id=supabase_id,
            name=name
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        # Update name if it's in the token and different from stored value
        if name and user.name != name:
            user.name = name
            db.commit()
            db.refresh(user)
    
    return user


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    """Get current user information."""
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "supabase_id": current_user.supabase_id,
    }
