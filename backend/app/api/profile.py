from typing import List, Optional, cast

from app.api.auth import get_current_user
from app.core.database import get_db
from app.models.actor import ActorProfile
from app.models.user import User
from app.services.storage import delete_headshot, upload_headshot
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/profile", tags=["profile"])


class ActorProfileCreate(BaseModel):
    name: str
    age_range: str
    gender: str
    ethnicity: Optional[str] = None
    height: Optional[str] = None
    build: Optional[str] = None
    location: str
    experience_level: str
    type: str
    training_background: Optional[str] = None
    union_status: str
    preferred_genres: List[str] = []
    overdone_alert_sensitivity: float = 0.5
    profile_bias_enabled: bool = True
    headshot_url: Optional[str] = None


class ActorProfileResponse(BaseModel):
    id: int
    user_id: int
    name: Optional[str] = None
    age_range: Optional[str] = None
    gender: Optional[str] = None
    ethnicity: Optional[str] = None
    height: Optional[str] = None
    build: Optional[str] = None
    location: Optional[str] = None
    experience_level: Optional[str] = None
    type: Optional[str] = None
    training_background: Optional[str] = None
    union_status: Optional[str] = None
    preferred_genres: List[str] = []
    overdone_alert_sensitivity: float = 0.5
    profile_bias_enabled: bool = True
    headshot_url: Optional[str] = None

    class Config:
        from_attributes = True


@router.get("", response_model=ActorProfileResponse)
def get_profile(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    try:
        profile = db.query(ActorProfile).filter(ActorProfile.user_id == current_user.id).first()
    except OperationalError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable. Please try again later.",
        ) from e
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found",
        )
    return profile


@router.post("", response_model=ActorProfileResponse, status_code=status.HTTP_201_CREATED)
@router.put("", response_model=ActorProfileResponse)
def create_or_update_profile(
    profile_data: ActorProfileCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        existing_profile = db.query(ActorProfile).filter(ActorProfile.user_id == current_user.id).first()

        if existing_profile:
            # Update existing profile
            for key, value in profile_data.model_dump().items():
                setattr(existing_profile, key, value)
            db.commit()
            db.refresh(existing_profile)
            return existing_profile
        else:
            # Create new profile
            new_profile = ActorProfile(
                user_id=current_user.id,
                **profile_data.model_dump()
            )
            db.add(new_profile)
            db.commit()
            db.refresh(new_profile)
            return new_profile
    except OperationalError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable. Please try again later.",
        ) from e


class ProfileStatsResponse(BaseModel):
    completion_percentage: float
    has_headshot: bool
    preferred_genres_count: int
    profile_bias_enabled: bool


@router.get("/stats", response_model=ProfileStatsResponse)
def get_profile_stats(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    try:
        profile = db.query(ActorProfile).filter(ActorProfile.user_id == current_user.id).first()
    except OperationalError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable. Please try again later.",
        ) from e
    
    if not profile:
        return ProfileStatsResponse(
            completion_percentage=0.0,
            has_headshot=False,
            preferred_genres_count=0,
            profile_bias_enabled=True
        )
    
    # Calculate completion percentage
    required_fields = [
        profile.name,
        profile.age_range,
        profile.gender,
        profile.location,
        profile.experience_level,
        profile.type,
        profile.union_status,
    ]
    optional_fields = [
        profile.ethnicity,
        profile.height,
        profile.build,
        profile.training_background,
        profile.headshot_url,
    ]
    
    required_count = sum(1 for field in required_fields if field is not None)
    optional_count = sum(1 for field in optional_fields if field is not None)
    
    # Required fields are 70% of completion, optional are 30%
    completion_percentage = min(100.0, (required_count / 7) * 70 + (optional_count / 5) * 30)
    
    preferred_genres_list = cast(List[str], profile.preferred_genres) if profile.preferred_genres is not None else []
    return ProfileStatsResponse(
        completion_percentage=round(completion_percentage, 1),
        has_headshot=profile.headshot_url is not None,
        preferred_genres_count=len(preferred_genres_list),
        profile_bias_enabled=bool(cast(bool, profile.profile_bias_enabled))
    )


class HeadshotUploadRequest(BaseModel):
    image: str  # Base64 encoded image


class HeadshotUploadResponse(BaseModel):
    headshot_url: str


@router.post("/headshot", response_model=HeadshotUploadResponse)
def upload_headshot_endpoint(
    request: HeadshotUploadRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Upload a headshot image to Supabase Storage.
    Accepts base64 encoded image and returns the public URL.
    """
    try:
        # Upload to Supabase Storage
        user_id = cast(int, current_user.id)
        headshot_url = upload_headshot(request.image, user_id)
        
        # Update profile with new headshot URL
        try:
            profile = db.query(ActorProfile).filter(ActorProfile.user_id == user_id).first()
            if profile:
                # Delete old headshot if it exists and is from Supabase
                if profile.headshot_url is not None and "supabase.co" in profile.headshot_url:
                    delete_headshot(user_id)
                setattr(profile, 'headshot_url', headshot_url)
                db.commit()
            else:
                # Create profile if it doesn't exist yet
                profile = ActorProfile(
                    user_id=user_id,
                    headshot_url=headshot_url
                )
                db.add(profile)
                db.commit()
        except OperationalError as e:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Database connection unavailable. Please try again later.",
            ) from e
        
        return HeadshotUploadResponse(headshot_url=headshot_url)
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        ) from e
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload headshot: {str(e)}"
        ) from e

