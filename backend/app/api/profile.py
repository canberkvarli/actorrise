from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from app.core.database import get_db
from app.api.auth import get_current_user
from app.models.user import User
from app.models.actor import ActorProfile, Monologue
from app.services.storage import upload_headshot, delete_headshot

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
    comfort_with_difficult_material: str = "moderate"
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
    comfort_with_difficult_material: str = "moderate"
    overdone_alert_sensitivity: float = 0.5
    profile_bias_enabled: bool = True
    headshot_url: Optional[str] = None

    class Config:
        from_attributes = True


@router.get("", response_model=ActorProfileResponse)
def get_profile(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    profile = db.query(ActorProfile).filter(ActorProfile.user_id == current_user.id).first()
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


class ProfileStatsResponse(BaseModel):
    completion_percentage: float
    has_headshot: bool
    preferred_genres_count: int
    profile_bias_enabled: bool


@router.get("/stats", response_model=ProfileStatsResponse)
def get_profile_stats(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    profile = db.query(ActorProfile).filter(ActorProfile.user_id == current_user.id).first()
    
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
    
    required_count = sum(1 for field in required_fields if field)
    optional_count = sum(1 for field in optional_fields if field)
    
    # Required fields are 70% of completion, optional are 30%
    completion_percentage = min(100.0, (required_count / 7) * 70 + (optional_count / 5) * 30)
    
    return ProfileStatsResponse(
        completion_percentage=round(completion_percentage, 1),
        has_headshot=bool(profile.headshot_url),
        preferred_genres_count=len(profile.preferred_genres or []),
        profile_bias_enabled=profile.profile_bias_enabled
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
        headshot_url = upload_headshot(request.image, current_user.id)
        
        # Update profile with new headshot URL
        profile = db.query(ActorProfile).filter(ActorProfile.user_id == current_user.id).first()
        if profile:
            # Delete old headshot if it exists and is from Supabase
            if profile.headshot_url and "supabase.co" in profile.headshot_url:
                delete_headshot(current_user.id)
            profile.headshot_url = headshot_url
            db.commit()
        else:
            # Create profile if it doesn't exist yet
            profile = ActorProfile(
                user_id=current_user.id,
                headshot_url=headshot_url
            )
            db.add(profile)
            db.commit()
        
        return HeadshotUploadResponse(headshot_url=headshot_url)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload headshot: {str(e)}"
        )

