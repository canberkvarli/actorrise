"""
API endpoints for ScenePartner - AI Scene Rehearsal feature
"""

from datetime import datetime
from typing import List, Optional

from app.api.auth import get_current_user
from app.core.database import get_db
from app.models.actor import (RehearsalLineDelivery, RehearsalSession, Scene,
                              SceneFavorite, UserScript)
from app.models.user import User
from app.services.ai.langchain.scene_partner import (ScenePartnerGraph,
                                                     ScenePartnerState)
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

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
    first_line_for_user: Optional[str] = None  # User's first line to deliver (when first in scene)
    current_line_for_user: Optional[str] = None  # User's next line to deliver (for GET session)

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
    play_id: Optional[int] = None,
    character_gender: Optional[str] = None,
    user_scripts_only: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get list of available scenes with filters.

    Filters:
    - play_id: Filter by specific play
    - character_gender: male, female, any
    - user_scripts_only: if True, only return scenes from the current user's uploaded scripts
    """
    query = db.query(Scene)

    if user_scripts_only:
        query = query.filter(Scene.user_script_id.isnot(None)).join(
            UserScript, Scene.user_script_id == UserScript.id
        ).filter(UserScript.user_id == current_user.id)

    if play_id:
        query = query.filter(Scene.play_id == play_id)

    if character_gender:
        query = query.filter(
            (Scene.character_1_gender == character_gender) |
            (Scene.character_2_gender == character_gender)
        )

    scenes = query.offset(skip).limit(limit).all()
    
    # Debug logging
    total_count = db.query(Scene).count()
    print(f"Scenes API: Total scenes={total_count}, Returning={len(scenes)}")

    # Check which scenes are favorited by this user
    favorited_ids = {
        fav.scene_id for fav in
        db.query(SceneFavorite).filter_by(user_id=current_user.id).all()
    }

    # Convert to response models
    results = []
    for scene in scenes:
        try:
            scene_dict = {
                **scene.__dict__,
                "play_title": scene.play.title if scene.play else "Unknown Play",
                "play_author": scene.play.author if scene.play else "Unknown Author",
                "is_favorited": scene.id in favorited_ids,
                "primary_emotions": scene.primary_emotions or []
            }
            results.append(SceneResponse(**scene_dict))
        except Exception as e:
            # Log error but continue processing other scenes
            print(f"Error processing scene {scene.id}: {e}")
            continue

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
        current_count = int(scene.favorite_count) if scene.favorite_count is not None else 0  # type: ignore
        scene.favorite_count = max(0, current_count - 1)  # type: ignore
        db.commit()
        return {"favorited": False}
    else:
        # Add to favorites
        favorite = SceneFavorite(
            user_id=current_user.id,
            scene_id=scene_id
        )
        db.add(favorite)
        current_count = int(scene.favorite_count) if scene.favorite_count is not None else 0  # type: ignore
        scene.favorite_count = current_count + 1  # type: ignore
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
    """Start a new rehearsal session. Only scenes from the user's own scripts can be rehearsed."""
    scene = db.query(Scene).filter_by(id=request.scene_id).first()

    if not scene:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scene not found"
        )

    # Enforce custom-script-only: rehearsal only for scenes from user's scripts
    if not scene.user_script_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Rehearsal is only available for scenes from your own scripts. Upload or paste a script in My Scripts first."
        )
    script = db.query(UserScript).filter(
        UserScript.id == scene.user_script_id,
        UserScript.user_id == current_user.id
    ).first()
    if not script:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Rehearsal is only available for scenes from your own scripts."
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
    current_count = int(scene.rehearsal_count) if scene.rehearsal_count is not None else 0  # type: ignore
    scene.rehearsal_count = current_count + 1  # type: ignore
    db.commit()
    db.refresh(session)

    # First line for user: when the first line in the scene is the user's character
    ordered_lines = sorted(scene.lines, key=lambda l: l.line_order)
    first_line_for_user = None
    for line in ordered_lines:
        if line.character_name == request.user_character:
            first_line_for_user = line.text
            break

    out = {**session.__dict__, "first_line_for_user": first_line_for_user}
    return RehearsalSessionResponse(**out)


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

    session_status_val = str(session.status) if session.status is not None else ""
    if session_status_val != "in_progress":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session is not in progress"
        )

    # Get scene and lines
    scene = session.scene
    all_lines = scene.lines

    current_index = int(session.current_line_index) if session.current_line_index is not None else 0  # type: ignore
    if current_index >= len(all_lines):
        # Scene complete
        session.status = "completed"  # type: ignore
        session.completion_percentage = 100.0  # type: ignore
        session.completed_at = datetime.utcnow()  # type: ignore
        db.commit()

        return DeliverLineResponse(
            ai_response="Scene complete! Great work!",
            feedback=None,
            next_line_preview=None,
            session_status="completed",
            completion_percentage=100.0
        )

    current_line = all_lines[current_index]

    # Record the delivery
    total_delivered = int(session.total_lines_delivered) if session.total_lines_delivered is not None else 0  # type: ignore
    scene_line_id_val = int(current_line.id) if current_line.id is not None else 0  # type: ignore
    session_id_val = int(session.id) if session.id is not None else 0  # type: ignore
    delivery = RehearsalLineDelivery(
        session_id=session_id_val,
        scene_line_id=scene_line_id_val,
        delivery_order=total_delivered,
        user_input=request.user_input,
        was_retry=request.request_retry
    )

    # Build state for AI scene partner
    state: ScenePartnerState = {
        "scene_title": str(scene.title) if scene.title is not None else "",  # type: ignore
        "play_title": str(scene.play.title) if scene.play.title is not None else "",  # type: ignore
        "playwright": str(scene.play.author) if scene.play.author is not None else "",  # type: ignore
        "setting": str(scene.setting) if scene.setting is not None else "",  # type: ignore
        "relationship_dynamic": str(scene.relationship_dynamic) if scene.relationship_dynamic is not None else "",  # type: ignore
        "user_character": str(session.user_character) if session.user_character is not None else "",  # type: ignore
        "ai_character": str(session.ai_character) if session.ai_character is not None else "",  # type: ignore
        "user_character_description": "",
        "ai_character_description": "",
        "all_lines": [
            {
                "character": str(line.character_name) if line.character_name is not None else "",
                "text": str(line.text) if line.text is not None else "",
                "order": int(line.line_order) if line.line_order is not None else 0
            }
            for line in all_lines
        ],
        "current_line_index": current_index,
        "messages": [],
        "dialogue_history": [],
        "feedback_notes": [],
        "strengths": [],
        "areas_to_improve": [],
        "mode": "rehearsing",
        "should_continue": True
    }
    
    # Add user input to state (needed by _respond_as_character)
    state["last_user_input"] = request.user_input  # type: ignore

    # Get AI response using LangGraph scene partner
    partner = ScenePartnerGraph(temperature=0.7)
    result_state = partner._respond_as_character(state)

    # Extract AI response
    ai_message = result_state["messages"][-1] if result_state["messages"] else {}
    ai_response_text = ai_message.get("content", "")

    delivery.ai_response = ai_response_text  # type: ignore

    # Simple feedback if requested
    if request.request_feedback:
        delivery.feedback = "Good delivery! Try varying your pace for more emotional impact."  # type: ignore

    db.add(delivery)

    # Update session
    new_total_delivered = total_delivered + 1
    session.total_lines_delivered = new_total_delivered  # type: ignore
    
    if request.request_retry:
        current_retried = int(session.lines_retried) if session.lines_retried is not None else 0  # type: ignore
        session.lines_retried = current_retried + 1  # type: ignore
    else:
        session.current_line_index = current_index + 1  # type: ignore

    # Calculate completion
    new_index = current_index + 1 if not request.request_retry else current_index
    completion_pct = (new_index / len(all_lines)) * 100 if all_lines else 0.0
    session.completion_percentage = completion_pct  # type: ignore

    # Get next line preview (user's next line)
    next_user_line = None
    user_char = str(session.user_character) if session.user_character is not None else ""
    for i in range(new_index, len(all_lines)):
        line_char = str(all_lines[i].character_name) if all_lines[i].character_name is not None else ""
        if line_char == user_char:
            next_user_line = str(all_lines[i].text) if all_lines[i].text is not None else None
            break

    db.commit()

    feedback_text = str(delivery.feedback) if delivery.feedback is not None else None  # type: ignore
    session_status_str = str(session.status) if session.status is not None else "in_progress"  # type: ignore

    return DeliverLineResponse(
        ai_response=ai_response_text,
        feedback=feedback_text,
        next_line_preview=next_user_line,
        session_status=session_status_str,
        completion_percentage=completion_pct
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
    user_char = str(session.user_character) if session.user_character is not None else ""
    ai_char = str(session.ai_character) if session.ai_character is not None else ""
    for delivery in deliveries:
        user_input_val = str(delivery.user_input) if delivery.user_input is not None else ""
        transcript_lines.append(f"{user_char}: {user_input_val}")
        ai_response_val = str(delivery.ai_response) if delivery.ai_response is not None else None
        if ai_response_val:
            transcript_lines.append(f"{ai_char}: {ai_response_val}")

    transcript = "\n\n".join(transcript_lines)

    # If we don't have cached feedback, generate it
    overall_feedback_val = str(session.overall_feedback) if session.overall_feedback is not None else None  # type: ignore
    if not overall_feedback_val:
        # Use LangGraph to generate feedback
        partner = ScenePartnerGraph(temperature=0.7)
        state: ScenePartnerState = {
            "scene_title": str(session.scene.title) if session.scene.title is not None else "",  # type: ignore
            "play_title": str(session.scene.play.title) if session.scene.play.title is not None else "",  # type: ignore
            "playwright": str(session.scene.play.author) if session.scene.play.author is not None else "",  # type: ignore
            "setting": str(session.scene.setting) if session.scene.setting is not None else "",  # type: ignore
            "relationship_dynamic": str(session.scene.relationship_dynamic) if session.scene.relationship_dynamic is not None else "",  # type: ignore
            "user_character": str(session.user_character) if session.user_character is not None else "",  # type: ignore
            "ai_character": str(session.ai_character) if session.ai_character is not None else "",  # type: ignore
            "user_character_description": "",
            "ai_character_description": "",
            "all_lines": [],
            "current_line_index": 0,
            "messages": [],
            "dialogue_history": [
                {
                    "user_character": str(session.user_character) if session.user_character is not None else "",
                    "user_line": str(d.user_input) if d.user_input is not None else "",
                    "ai_character": str(session.ai_character) if session.ai_character is not None else "",
                    "ai_response": str(d.ai_response) if d.ai_response is not None else "",
                    "line_index": int(d.delivery_order) if d.delivery_order is not None else 0
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

        feedback_content = feedback_message.get("content", "Great work on the scene!")
        session.overall_feedback = feedback_content  # type: ignore
        session.strengths = ["Emotional authenticity", "Good pacing"]  # type: ignore
        session.areas_to_improve = ["Try varying vocal dynamics"]  # type: ignore
        session.overall_rating = 4.0  # type: ignore

        db.commit()
        overall_feedback_val = feedback_content

    strengths_val = session.strengths  # type: ignore
    strengths_list = list(strengths_val) if strengths_val is not None else []  # type: ignore
    areas_val = session.areas_to_improve  # type: ignore
    areas_list = list(areas_val) if areas_val is not None else []  # type: ignore
    rating_val = float(session.overall_rating) if session.overall_rating is not None else None  # type: ignore

    return SessionFeedbackResponse(
        overall_feedback=overall_feedback_val or "",
        strengths=strengths_list,
        areas_to_improve=areas_list,
        overall_rating=rating_val,
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


@router.get("/rehearse/sessions/{session_id}", response_model=RehearsalSessionResponse)
async def get_rehearsal_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a rehearsal session with the user's current line to deliver (for rehearsal UI)."""
    session = db.query(RehearsalSession).filter_by(
        id=session_id,
        user_id=current_user.id
    ).first()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rehearsal session not found"
        )

    out = {**session.__dict__}
    out["first_line_for_user"] = None
    out["current_line_for_user"] = None

    if session.status == "in_progress" and session.scene:
        ordered_lines = sorted(session.scene.lines, key=lambda l: l.line_order)
        user_char = str(session.user_character) if session.user_character else ""
        current_idx = int(session.current_line_index) if session.current_line_index is not None else 0
        for i in range(current_idx, len(ordered_lines)):
            if ordered_lines[i].character_name == user_char:
                out["current_line_for_user"] = ordered_lines[i].text
                if i == 0:
                    out["first_line_for_user"] = ordered_lines[i].text
                break

    return RehearsalSessionResponse(**out)


# ============================================================================
# Scene Upload
# ============================================================================

class SceneLineUpload(BaseModel):
    """Schema for uploading a scene line"""
    character_name: str
    text: str
    stage_direction: Optional[str] = None


class SceneUpload(BaseModel):
    """Schema for uploading a custom scene"""
    title: str
    play_title: str
    author: str
    description: Optional[str] = None
    character_1_name: str
    character_2_name: str
    character_1_gender: Optional[str] = None
    character_2_gender: Optional[str] = None
    character_1_age_range: Optional[str] = None
    character_2_age_range: Optional[str] = None
    setting: Optional[str] = None
    context_before: Optional[str] = None
    context_after: Optional[str] = None
    lines: List[SceneLineUpload]  # All the dialogue lines


@router.post("/upload", response_model=SceneDetailResponse)
async def upload_scene(
    upload: SceneUpload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Upload a custom scene from user's own script.

    This allows users to upload their own scripts and rehearse with Scene Partner.
    """
    from app.models.actor import Play, SceneLine

    try:
        # Validate that we have at least 2 lines
        if len(upload.lines) < 2:
            raise HTTPException(
                status_code=400,
                detail="Scene must have at least 2 lines"
            )

        # Validate that both characters appear in the lines
        character_names = {upload.character_1_name, upload.character_2_name}
        line_characters = {line.character_name for line in upload.lines}

        if not character_names.issubset(line_characters):
            missing = character_names - line_characters
            raise HTTPException(
                status_code=400,
                detail=f"Characters {missing} must have lines in the scene"
            )

        # Check if play exists (user-uploaded custom play)
        play = db.query(Play).filter(
            Play.title == upload.play_title,
            Play.author == upload.author,
            Play.copyright_status == 'user_uploaded'
        ).first()

        if not play:
            # Create a custom play record for user uploads
            play = Play(
                title=upload.play_title,
                author=upload.author,
                year_written=None,
                genre='Custom',
                category='contemporary',
                copyright_status='user_uploaded',
                license_type='user_content',
                source_url=None,
                full_text=None,
                text_format='plain'
            )
            db.add(play)
            db.commit()
            db.refresh(play)

        # Calculate scene metadata
        total_words = sum(len(line.text.split()) for line in upload.lines)
        estimated_duration = int((total_words / 150) * 60)  # ~150 words per minute

        # Create scene record
        scene = Scene(
            play_id=play.id,
            title=upload.title,
            act=None,  # User scenes don't have act/scene numbers
            scene_number=None,
            description=upload.description,
            character_1_name=upload.character_1_name,
            character_2_name=upload.character_2_name,
            character_1_gender=upload.character_1_gender,
            character_2_gender=upload.character_2_gender,
            character_1_age_range=upload.character_1_age_range,
            character_2_age_range=upload.character_2_age_range,
            line_count=len(upload.lines),
            estimated_duration_seconds=estimated_duration,
            difficulty_level='intermediate',  # Default for user uploads
            primary_emotions=[],  # Could enhance with AI analysis
            relationship_dynamic=None,
            tone=None,
            context_before=upload.context_before,
            context_after=upload.context_after,
            setting=upload.setting,
            rehearsal_count=0,
            favorite_count=0,
            is_verified=False  # Mark as user content
        )

        db.add(scene)
        db.commit()
        db.refresh(scene)

        # Add scene lines
        scene_lines = []
        for idx, line_data in enumerate(upload.lines):
            scene_line = SceneLine(
                scene_id=scene.id,
                line_order=idx,
                character_name=line_data.character_name,
                text=line_data.text,
                stage_direction=line_data.stage_direction,
                word_count=len(line_data.text.split()),
                primary_emotion=None  # Could enhance with AI analysis
            )
            db.add(scene_line)
            scene_lines.append(scene_line)

        db.commit()

        # Refresh to get IDs
        for line in scene_lines:
            db.refresh(line)

        # Automatically favorite the uploaded scene for the user
        favorite = SceneFavorite(
            user_id=current_user.id,
            scene_id=scene.id
        )
        db.add(favorite)
        scene.favorite_count += 1
        db.commit()

        # Return the complete scene with lines
        return SceneDetailResponse(
            id=scene.id,
            play_id=play.id,
            play_title=play.title,
            play_author=play.author,
            title=scene.title,
            act=scene.act,
            scene_number=scene.scene_number,
            description=scene.description,
            character_1_name=scene.character_1_name,
            character_2_name=scene.character_2_name,
            character_1_gender=scene.character_1_gender,
            character_2_gender=scene.character_2_gender,
            character_1_age_range=scene.character_1_age_range,
            character_2_age_range=scene.character_2_age_range,
            line_count=scene.line_count,
            estimated_duration_seconds=scene.estimated_duration_seconds,
            primary_emotions=scene.primary_emotions or [],
            relationship_dynamic=scene.relationship_dynamic,
            tone=scene.tone,
            setting=scene.setting,
            context_before=scene.context_before,
            context_after=scene.context_after,
            rehearsal_count=scene.rehearsal_count,
            favorite_count=scene.favorite_count,
            is_favorited=True,
            lines=[
                SceneLineResponse(
                    id=line.id,
                    line_order=line.line_order,
                    character_name=line.character_name,
                    text=line.text,
                    stage_direction=line.stage_direction,
                    word_count=line.word_count,
                    primary_emotion=line.primary_emotion
                )
                for line in scene_lines
            ]
        )

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload scene: {str(e)}"
        )
