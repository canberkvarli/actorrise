"""
API endpoints for ScenePartner - AI Scene Rehearsal feature
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from app.core.database import get_db
from app.models.actor import (
    Scene, SceneLine, RehearsalSession, RehearsalLineDelivery, SceneFavorite
)
from app.models.user import User
from app.api.auth import get_current_user
from app.services.ai.langchain.scene_partner import (
    ScenePartnerGraph, ScenePartnerState, create_scene_partner
)


router = APIRouter(prefix="/api/scenes", tags=["scenes"])


# ============================================================================
# Request/Response Models
# ============================================================================

class SceneResponse(BaseModel):
    """Scene data for API responses"""
    id: int
    play_id: int
    play_title: str
    play_author: str
    title: str
    act: Optional[str]
    scene_number: Optional[str]
    description: Optional[str]

    character_1_name: str
    character_2_name: str
    character_1_gender: Optional[str]
    character_2_gender: Optional[str]
    character_1_age_range: Optional[str]
    character_2_age_range: Optional[str]

    line_count: int
    estimated_duration_seconds: int
    difficulty_level: Optional[str]

    primary_emotions: List[str]
    relationship_dynamic: Optional[str]
    tone: Optional[str]
    setting: Optional[str]

    context_before: Optional[str]
    context_after: Optional[str]

    rehearsal_count: int
    favorite_count: int
    is_favorited: bool = False

    class Config:
        from_attributes = True


class SceneLineResponse(BaseModel):
    """Scene line for API responses"""
    id: int
    line_order: int
    character_name: str
    text: str
    stage_direction: Optional[str]
    word_count: int
    primary_emotion: Optional[str]

    class Config:
        from_attributes = True


class SceneDetailResponse(SceneResponse):
    """Detailed scene with all lines"""
    lines: List[SceneLineResponse]


class StartRehearsalRequest(BaseModel):
    """Request to start a rehearsal session"""
    scene_id: int
    user_character: str  # Which character the user wants to play


class RehearsalSessionResponse(BaseModel):
    """Rehearsal session data"""
    id: int
    scene_id: int
    user_character: str
    ai_character: str
    status: str
    current_line_index: int
    total_lines_delivered: int
    completion_percentage: float
    started_at: datetime

    class Config:
        from_attributes = True


class DeliverLineRequest(BaseModel):
    """Request to deliver a line in rehearsal"""
    session_id: int
    user_input: str
    request_feedback: bool = False  # User wants feedback on this line
    request_retry: bool = False  # User wants to retry this line


class DeliverLineResponse(BaseModel):
    """Response after delivering a line"""
    ai_response: str  # AI's next line
    feedback: Optional[str]  # Feedback on user's delivery
    next_line_preview: Optional[str]  # User's next line to prepare
    session_status: str
    completion_percentage: float


class SessionFeedbackResponse(BaseModel):
    """Overall session feedback"""
    overall_feedback: str
    strengths: List[str]
    areas_to_improve: List[str]
    overall_rating: Optional[float]
    transcript: str


# ============================================================================
# Scene Browse & Discovery
# ============================================================================

@router.get("/", response_model=List[SceneResponse])
async def list_scenes(
    skip: int = 0,
    limit: int = 20,
    difficulty: Optional[str] = None,
    play_id: Optional[int] = None,
    character_gender: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get list of available scenes with filters.

    Filters:
    - difficulty: beginner, intermediate, advanced
    - play_id: Filter by specific play
    - character_gender: male, female, any
    """
    query = db.query(Scene)

    if difficulty:
        query = query.filter(Scene.difficulty_level == difficulty)

    if play_id:
        query = query.filter(Scene.play_id == play_id)

    if character_gender:
        query = query.filter(
            (Scene.character_1_gender == character_gender) |
            (Scene.character_2_gender == character_gender)
        )

    scenes = query.offset(skip).limit(limit).all()

    # Check which scenes are favorited by this user
    favorited_ids = {
        fav.scene_id for fav in
        db.query(SceneFavorite).filter_by(user_id=current_user.id).all()
    }

    # Convert to response models
    results = []
    for scene in scenes:
        scene_dict = {
            **scene.__dict__,
            "play_title": scene.play.title,
            "play_author": scene.play.author,
            "is_favorited": scene.id in favorited_ids,
            "primary_emotions": scene.primary_emotions or []
        }
        results.append(SceneResponse(**scene_dict))

    return results


@router.get("/{scene_id}", response_model=SceneDetailResponse)
async def get_scene_detail(
    scene_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get detailed scene information including all lines"""
    scene = db.query(Scene).filter_by(id=scene_id).first()

    if not scene:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scene not found"
        )

    # Check if favorited
    is_favorited = db.query(SceneFavorite).filter_by(
        user_id=current_user.id,
        scene_id=scene_id
    ).first() is not None

    # Build response
    scene_dict = {
        **scene.__dict__,
        "play_title": scene.play.title,
        "play_author": scene.play.author,
        "is_favorited": is_favorited,
        "primary_emotions": scene.primary_emotions or [],
        "lines": [SceneLineResponse(**line.__dict__) for line in scene.lines]
    }

    return SceneDetailResponse(**scene_dict)


@router.post("/{scene_id}/favorite")
async def toggle_favorite(
    scene_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Add or remove scene from favorites"""
    scene = db.query(Scene).filter_by(id=scene_id).first()

    if not scene:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scene not found"
        )

    existing = db.query(SceneFavorite).filter_by(
        user_id=current_user.id,
        scene_id=scene_id
    ).first()

    if existing:
        # Remove from favorites
        db.delete(existing)
        scene.favorite_count = max(0, scene.favorite_count - 1)
        db.commit()
        return {"favorited": False}
    else:
        # Add to favorites
        favorite = SceneFavorite(
            user_id=current_user.id,
            scene_id=scene_id
        )
        db.add(favorite)
        scene.favorite_count += 1
        db.commit()
        return {"favorited": True}


# ============================================================================
# Rehearsal Session Management
# ============================================================================

@router.post("/rehearse/start", response_model=RehearsalSessionResponse)
async def start_rehearsal(
    request: StartRehearsalRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Start a new rehearsal session"""
    scene = db.query(Scene).filter_by(id=request.scene_id).first()

    if not scene:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scene not found"
        )

    # Validate character choice
    if request.user_character not in [scene.character_1_name, scene.character_2_name]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid character choice"
        )

    # Determine AI character
    ai_character = (
        scene.character_2_name
        if request.user_character == scene.character_1_name
        else scene.character_1_name
    )

    # Create session
    session = RehearsalSession(
        user_id=current_user.id,
        scene_id=request.scene_id,
        user_character=request.user_character,
        ai_character=ai_character,
        status="in_progress",
        current_line_index=0
    )

    db.add(session)
    scene.rehearsal_count += 1
    db.commit()
    db.refresh(session)

    return RehearsalSessionResponse(**session.__dict__)


@router.post("/rehearse/deliver", response_model=DeliverLineResponse)
async def deliver_line(
    request: DeliverLineRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Deliver a line during rehearsal and get AI response"""
    session = db.query(RehearsalSession).filter_by(
        id=request.session_id,
        user_id=current_user.id
    ).first()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rehearsal session not found"
        )

    if session.status != "in_progress":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session is not in progress"
        )

    # Get scene and lines
    scene = session.scene
    all_lines = scene.lines

    if session.current_line_index >= len(all_lines):
        # Scene complete
        session.status = "completed"
        session.completion_percentage = 100.0
        session.completed_at = datetime.utcnow()
        db.commit()

        return DeliverLineResponse(
            ai_response="Scene complete! Great work!",
            feedback=None,
            next_line_preview=None,
            session_status="completed",
            completion_percentage=100.0
        )

    current_line = all_lines[session.current_line_index]

    # Record the delivery
    delivery = RehearsalLineDelivery(
        session_id=session.id,
        scene_line_id=current_line.id,
        delivery_order=session.total_lines_delivered,
        user_input=request.user_input,
        was_retry=request.request_retry
    )

    # Build state for AI scene partner
    state: ScenePartnerState = {
        "scene_title": scene.title,
        "play_title": scene.play.title,
        "playwright": scene.play.author,
        "setting": scene.setting or "",
        "relationship_dynamic": scene.relationship_dynamic or "",
        "user_character": session.user_character,
        "ai_character": session.ai_character,
        "user_character_description": "",
        "ai_character_description": "",
        "all_lines": [
            {
                "character": line.character_name,
                "text": line.text,
                "order": line.line_order
            }
            for line in all_lines
        ],
        "current_line_index": session.current_line_index,
        "messages": [],
        "dialogue_history": [],
        "feedback_notes": [],
        "strengths": [],
        "areas_to_improve": [],
        "mode": "rehearsing",
        "should_continue": True,
        "last_user_input": request.user_input
    }

    # Get AI response using LangGraph scene partner
    partner = ScenePartnerGraph(temperature=0.7)
    result_state = partner._respond_as_character(state)

    # Extract AI response
    ai_message = result_state["messages"][-1] if result_state["messages"] else {}
    ai_response_text = ai_message.get("content", "")

    delivery.ai_response = ai_response_text

    # Simple feedback if requested
    if request.request_feedback:
        delivery.feedback = "Good delivery! Try varying your pace for more emotional impact."

    db.add(delivery)

    # Update session
    session.total_lines_delivered += 1
    if request.request_retry:
        session.lines_retried += 1
    else:
        session.current_line_index += 1

    # Calculate completion
    session.completion_percentage = (session.current_line_index / len(all_lines)) * 100

    # Get next line preview (user's next line)
    next_user_line = None
    for i in range(session.current_line_index, len(all_lines)):
        if all_lines[i].character_name == session.user_character:
            next_user_line = all_lines[i].text
            break

    db.commit()

    return DeliverLineResponse(
        ai_response=ai_response_text,
        feedback=delivery.feedback,
        next_line_preview=next_user_line,
        session_status=session.status,
        completion_percentage=session.completion_percentage
    )


@router.get("/rehearse/{session_id}/feedback", response_model=SessionFeedbackResponse)
async def get_session_feedback(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get overall feedback for a completed session"""
    session = db.query(RehearsalSession).filter_by(
        id=session_id,
        user_id=current_user.id
    ).first()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )

    # Build transcript
    deliveries = session.line_deliveries
    transcript_lines = []
    for delivery in deliveries:
        transcript_lines.append(f"{session.user_character}: {delivery.user_input}")
        if delivery.ai_response:
            transcript_lines.append(f"{session.ai_character}: {delivery.ai_response}")

    transcript = "\n\n".join(transcript_lines)

    # If we don't have cached feedback, generate it
    if not session.overall_feedback:
        # Use LangGraph to generate feedback
        partner = ScenePartnerGraph(temperature=0.7)
        state: ScenePartnerState = {
            "scene_title": session.scene.title,
            "play_title": session.scene.play.title,
            "playwright": session.scene.play.author,
            "setting": session.scene.setting or "",
            "relationship_dynamic": session.scene.relationship_dynamic or "",
            "user_character": session.user_character,
            "ai_character": session.ai_character,
            "user_character_description": "",
            "ai_character_description": "",
            "all_lines": [],
            "current_line_index": 0,
            "messages": [],
            "dialogue_history": [
                {
                    "user_character": session.user_character,
                    "user_line": d.user_input,
                    "ai_character": session.ai_character,
                    "ai_response": d.ai_response or "",
                    "line_index": d.delivery_order
                }
                for d in deliveries
            ],
            "feedback_notes": [],
            "strengths": [],
            "areas_to_improve": [],
            "mode": "coaching",
            "should_continue": False
        }

        feedback_state = partner._provide_coaching(state)
        feedback_message = feedback_state["messages"][-1] if feedback_state["messages"] else {}

        session.overall_feedback = feedback_message.get("content", "Great work on the scene!")
        session.strengths = ["Emotional authenticity", "Good pacing"]
        session.areas_to_improve = ["Try varying vocal dynamics"]
        session.overall_rating = 4.0

        db.commit()

    return SessionFeedbackResponse(
        overall_feedback=session.overall_feedback or "",
        strengths=session.strengths or [],
        areas_to_improve=session.areas_to_improve or [],
        overall_rating=session.overall_rating,
        transcript=transcript
    )


@router.get("/rehearse/sessions", response_model=List[RehearsalSessionResponse])
async def list_rehearsal_sessions(
    skip: int = 0,
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get user's rehearsal session history"""
    sessions = db.query(RehearsalSession).filter_by(
        user_id=current_user.id
    ).order_by(
        RehearsalSession.created_at.desc()
    ).offset(skip).limit(limit).all()

    return [RehearsalSessionResponse(**s.__dict__) for s in sessions]
