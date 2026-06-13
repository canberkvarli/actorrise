"""
API endpoints for ScenePartner - AI Scene Rehearsal feature
"""

from datetime import datetime, timezone
from typing import List, Optional

from app.api.auth import get_current_user
from app.core.database import get_db
from app.middleware.burst_limiter import BurstLimiter
from app.middleware.rate_limiting import require_scene_partner
from app.models.actor import (Play, RehearsalLineDelivery, RehearsalSession,
                              Scene, SceneFavorite, UserScript)
from app.models.billing import UserSubscription
from app.models.user import User
from app.services.ai.langchain.scene_partner import (ScenePartnerGraph,
                                                     ScenePartnerState)
from app.services.benefits import get_effective_benefits
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
    difficulty_level: Optional[str] = None
    is_library: bool = False
    is_free_library: bool = False

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


# Curated free-tier library scenes (matched by title — stable across
# environments, unlike ids). Free actors can rehearse these in full; the rest
# of the library is a Plus perk. Spread across tone + difficulty so the free
# taste feels generous, not stingy.
FREE_LIBRARY_SCENE_TITLES = {
    "Romeo and Juliet — The Balcony",
    "The Importance of Being Earnest — Gwendolen and Cecily at Tea",
    "A Midsummer Night's Dream — Helena Pursues Demetrius",
    "Trifles — Mrs. Hale and Mrs. Peters",
}


def _is_free_library_scene(scene) -> bool:
    """A library scene that free-tier actors can rehearse in full."""
    return bool(scene.is_library) and scene.title in FREE_LIBRARY_SCENE_TITLES


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
    has_original_snapshot: bool = False


class StartRehearsalRequest(BaseModel):
    """Request to start a rehearsal session"""
    scene_id: int
    user_character: str  # Which character the user wants to play
    start_from_line_index: Optional[int] = None  # Start rehearsal from a specific line


class RehearsalSessionResponse(BaseModel):
    """Rehearsal session data"""
    id: int
    scene_id: int
    user_character: str
    ai_character: str
    status: str
    current_line_index: int
    total_lines_delivered: int
    max_lines: Optional[int] = None  # Per-session line cap (None = unlimited)
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
    ai_response: str  # AI's next line (backward compat: full response)
    line_text: Optional[str] = None  # Clean dialogue line only (for TTS)
    tts_instructions: Optional[str] = None  # How to deliver vocally (auto-generated)
    ai_voice_id: Optional[str] = None  # OpenAI TTS voice for this character
    feedback: Optional[str]  # Feedback on user's delivery
    next_line_preview: Optional[str]  # User's next line to prepare
    session_status: str
    completion_percentage: float
    lines_remaining: Optional[int] = None  # Lines left before cap (None = unlimited)


class SessionFeedbackResponse(BaseModel):
    """Overall session feedback"""
    overall_feedback: str
    strengths: List[str]
    areas_to_improve: List[str]
    overall_rating: Optional[float]
    transcript: str


# ============================================================================
# Helpers
# ============================================================================

def _get_ai_voice_id(scene, ai_character_name: str) -> str:
    """Resolve OpenAI TTS voice for the AI character based on gender + tone."""
    from app.services.tts_service import get_voice_for_character

    gender = None
    if str(scene.character_1_name) == ai_character_name:
        gender = str(scene.character_1_gender) if scene.character_1_gender else None
    elif str(scene.character_2_name) == ai_character_name:
        gender = str(scene.character_2_gender) if scene.character_2_gender else None

    tone = str(scene.tone) if scene.tone else None
    return get_voice_for_character(ai_character_name, gender, tone)


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
    library_only: bool = False,
    difficulty: Optional[str] = None,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get list of available scenes with filters.

    Filters:
    - play_id: Filter by specific play
    - character_gender: male, female, any
    - user_scripts_only: if True, only return scenes from the current user's uploaded scripts
    - library_only: if True, only return curated public-domain library scenes
    - difficulty: beginner, intermediate, advanced
    - q: case-insensitive search over scene title, play title, and author
    """
    query = db.query(Scene)

    if user_scripts_only:
        query = query.filter(Scene.user_script_id.isnot(None)).join(
            UserScript, Scene.user_script_id == UserScript.id
        ).filter(UserScript.user_id == current_user.id)

    if library_only:
        query = query.filter(Scene.is_library.is_(True))

    if play_id:
        query = query.filter(Scene.play_id == play_id)

    if character_gender:
        query = query.filter(
            (Scene.character_1_gender == character_gender) |
            (Scene.character_2_gender == character_gender)
        )

    if difficulty:
        query = query.filter(Scene.difficulty_level == difficulty)

    if q:
        like = f"%{q.strip()}%"
        query = query.join(Play, Scene.play_id == Play.id).filter(
            (Scene.title.ilike(like)) |
            (Play.title.ilike(like)) |
            (Play.author.ilike(like))
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
                "is_free_library": _is_free_library_scene(scene),
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
        "is_free_library": _is_free_library_scene(scene),
        "primary_emotions": scene.primary_emotions or [],
        "has_original_snapshot": scene.original_snapshot is not None,
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


@router.get("/favorites/my", response_model=List[SceneResponse])
async def list_my_favorite_scenes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List the current user's bookmarked scenes (newest first)."""
    favorites = (
        db.query(SceneFavorite)
        .filter(SceneFavorite.user_id == current_user.id)
        .order_by(SceneFavorite.created_at.desc())
        .all()
    )
    fav_scene_ids = [f.scene_id for f in favorites]
    if not fav_scene_ids:
        return []

    scenes_by_id = {
        s.id: s for s in db.query(Scene).filter(Scene.id.in_(fav_scene_ids)).all()
    }
    results = []
    for sid in fav_scene_ids:  # preserve favorite ordering (newest first)
        scene = scenes_by_id.get(sid)
        if not scene:
            continue
        try:
            results.append(SceneResponse(**{
                **scene.__dict__,
                "play_title": scene.play.title if scene.play else "Unknown Play",
                "play_author": scene.play.author if scene.play else "Unknown Author",
                "is_favorited": True,
                "is_free_library": _is_free_library_scene(scene),
                "primary_emotions": scene.primary_emotions or [],
            }))
        except Exception as e:
            print(f"Error processing favorite scene {sid}: {e}")
            continue
    return results


# ============================================================================
# Rehearsal Session Management
# ============================================================================

@router.post("/rehearse/start", response_model=RehearsalSessionResponse)
async def start_rehearsal(
    request: StartRehearsalRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _gate: bool = Depends(require_scene_partner(increment=True)),
    _burst: bool = Depends(BurstLimiter("scene_partner")),
):
    """Start a new rehearsal session. Only scenes from the user's own scripts can be rehearsed."""
    scene = db.query(Scene).filter_by(id=request.scene_id).first()

    if not scene:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scene not found"
        )

    # Curated library scenes (public-domain) are rehearsable by everyone, like
    # the built-in sample scripts — no upload required. User-uploaded scenes
    # still require ownership (or the shared sample script).
    script = None
    if not scene.is_library:
        if not scene.user_script_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Rehearsal is only available for scenes from your own scripts. Upload or paste a script in My Scripts first."
            )
        from sqlalchemy import or_
        script = db.query(UserScript).filter(
            UserScript.id == scene.user_script_id,
            or_(
                UserScript.user_id == current_user.id,
                UserScript.is_sample == True,
            )
        ).first()
        if not script:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Rehearsal is only available for scenes from your own scripts."
            )

    # Free tier: only allow rehearsal with the example/sample script or the
    # curated library (the free "try it" surface that fixes cold-start).
    subscription = (
        db.query(UserSubscription)
        .filter(UserSubscription.user_id == current_user.id)
        .first()
    )
    benefits = get_effective_benefits(db, current_user.id, subscription)
    if benefits.get("scene_partner_trial_only", False):
        library_allowed = _is_free_library_scene(scene)
        sample_allowed = script is not None and (
            script.is_sample or script.title.startswith("Example:")
        )
        if not (library_allowed or sample_allowed):
            if scene.is_library:
                # A library scene that's outside the free starter set.
                detail = {
                    "error": "library_upgrade_required",
                    "message": "This scene is part of the full library. Your free plan includes a starter set of scenes to rehearse — upgrade to Plus for the whole catalog.",
                    "upgrade_url": "/pricing",
                }
            else:
                detail = {
                    "error": "trial_example_only",
                    "message": "Free trial rehearsal is limited to the example script. Upgrade to Plus to rehearse your own scripts.",
                    "upgrade_url": "/pricing",
                }
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)

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
    start_index = request.start_from_line_index if request.start_from_line_index is not None else 0
    lines_per_session = benefits.get("scene_partner_lines_per_session")
    session = RehearsalSession(
        user_id=current_user.id,
        scene_id=request.scene_id,
        user_character=request.user_character,
        ai_character=ai_character,
        status="in_progress",
        current_line_index=start_index,
        max_lines=lines_per_session if lines_per_session and lines_per_session != -1 else None,
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


def _duration_seconds(started_at, ended_at) -> Optional[int]:
    """Whole seconds between two timestamps, tolerant of naive/aware mismatch.

    started_at comes from a timezone-aware column; ended_at may be naive
    (datetime.utcnow()). Normalize both to UTC before subtracting so we never
    raise on a naive/aware comparison.
    """
    if started_at is None or ended_at is None:
        return None
    s = started_at if started_at.tzinfo else started_at.replace(tzinfo=timezone.utc)
    e = ended_at if ended_at.tzinfo else ended_at.replace(tzinfo=timezone.utc)
    return max(0, int((e - s).total_seconds()))


def _compute_completion(total_delivered: int, user_line_count: int) -> tuple[float, bool]:
    """Completion measured against the actor's OWN lines, not the whole scene.

    A user only delivers their character's lines (~half a scene), so dividing by
    the total line count capped completion near 50% and made "completed"
    unreachable. Delivering every one of your lines means the scene is finished.

    Returns (completion_percentage 0..100, is_complete).
    """
    if user_line_count <= 0:
        return 0.0, False
    pct = min(100.0, total_delivered / user_line_count * 100.0)
    return pct, total_delivered >= user_line_count


@router.post("/rehearse/deliver", response_model=DeliverLineResponse)
async def deliver_line(
    request: DeliverLineRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _burst: bool = Depends(BurstLimiter("scene_partner")),
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

    # Enforce per-session line cap
    if session.max_lines is not None:
        total_delivered = int(session.total_lines_delivered) if session.total_lines_delivered else 0
        if total_delivered >= session.max_lines:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": "lines_per_session_limit_exceeded",
                    "message": f"You've reached your {session.max_lines} lines limit for this session. Start a new session or upgrade your plan.",
                    "limit": session.max_lines,
                    "used": total_delivered,
                    "upgrade_url": "/pricing",
                },
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
        "tone": str(scene.tone) if scene.tone is not None else "",  # type: ignore
        "primary_emotions": list(scene.primary_emotions) if scene.primary_emotions else [],  # type: ignore
        "user_character": str(session.user_character) if session.user_character is not None else "",  # type: ignore
        "ai_character": str(session.ai_character) if session.ai_character is not None else "",  # type: ignore
        "user_character_description": "",
        "ai_character_description": "",
        "all_lines": [
            {
                "character": str(line.character_name) if line.character_name is not None else "",
                "text": str(line.text) if line.text is not None else "",
                "order": int(line.line_order) if line.line_order is not None else 0,
                "stage_direction": str(line.stage_direction) if line.stage_direction else "",
                "primary_emotion": str(line.primary_emotion) if line.primary_emotion else "",
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

    # Extract structured AI response
    ai_message = result_state["messages"][-1] if result_state["messages"] else {}
    ai_response_text = ai_message.get("content", "")
    line_text = ai_message.get("line_text", ai_response_text)
    feedback_from_ai = ai_message.get("feedback", "")
    tts_instructions = ai_message.get("tts_instructions", "")

    delivery.ai_response = line_text  # type: ignore

    # Use AI-generated feedback, or simple fallback if manually requested
    if feedback_from_ai:
        delivery.feedback = feedback_from_ai  # type: ignore
    elif request.request_feedback:
        delivery.feedback = "Good delivery! Try varying your pace for more emotional impact."  # type: ignore

    # Determine voice for AI character
    ai_voice_id = _get_ai_voice_id(scene, str(session.ai_character) if session.ai_character else "")

    db.add(delivery)

    # Update session
    new_total_delivered = total_delivered + 1
    session.total_lines_delivered = new_total_delivered  # type: ignore
    
    if request.request_retry:
        current_retried = int(session.lines_retried) if session.lines_retried is not None else 0  # type: ignore
        session.lines_retried = current_retried + 1  # type: ignore
    else:
        session.current_line_index = current_index + 1  # type: ignore

    # Completion is measured against the user's OWN lines (see _compute_completion):
    # delivering every line of your character means the scene is finished. Dividing
    # by len(all_lines) (user + AI lines) used to cap completion near 50% and made
    # "completed" unreachable. new_index counts non-retry deliveries (= user turns).
    new_index = current_index + 1 if not request.request_retry else current_index
    user_char = str(session.user_character) if session.user_character is not None else ""
    user_line_count = sum(
        1 for line in all_lines
        if (str(line.character_name) if line.character_name is not None else "") == user_char
    )
    completion_pct, is_complete = _compute_completion(new_index, user_line_count)
    session.completion_percentage = completion_pct  # type: ignore
    if is_complete and str(session.status) == "in_progress":
        completed_at = datetime.now(timezone.utc)
        session.status = "completed"  # type: ignore
        session.completed_at = completed_at  # type: ignore
        session.duration_seconds = _duration_seconds(session.started_at, completed_at)  # type: ignore

    # Get next line preview (user's next line)
    next_user_line = None
    for i in range(new_index, len(all_lines)):
        line_char = str(all_lines[i].character_name) if all_lines[i].character_name is not None else ""
        if line_char == user_char:
            next_user_line = str(all_lines[i].text) if all_lines[i].text is not None else None
            break

    db.commit()

    feedback_text = str(delivery.feedback) if delivery.feedback is not None else None  # type: ignore
    session_status_str = str(session.status) if session.status is not None else "in_progress"  # type: ignore

    # Calculate lines remaining (None = unlimited)
    lines_remaining = None
    if session.max_lines is not None:
        lines_remaining = max(0, session.max_lines - new_total_delivered)

    return DeliverLineResponse(
        ai_response=line_text,
        line_text=line_text,
        tts_instructions=tts_instructions,
        ai_voice_id=ai_voice_id,
        feedback=feedback_text,
        next_line_preview=next_user_line,
        session_status=session_status_str,
        completion_percentage=completion_pct,
        lines_remaining=lines_remaining,
    )


@router.post("/rehearse/{session_id}/abandon")
async def abandon_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark an in-progress session as abandoned (e.g. user navigated away)."""
    session = db.query(RehearsalSession).filter_by(
        id=session_id,
        user_id=current_user.id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if str(session.status) != "in_progress":
        return {"ok": True, "status": str(session.status)}
    ended_at = datetime.now(timezone.utc)
    session.status = "abandoned"  # type: ignore
    session.completed_at = ended_at  # type: ignore
    session.duration_seconds = _duration_seconds(session.started_at, ended_at)  # type: ignore
    db.commit()
    return {"ok": True, "status": "abandoned"}


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

        feedback_content = feedback_message.get("content", "")

        # Parse structured JSON from AI response
        import json as _json
        try:
            parsed = _json.loads(feedback_content)
            session.overall_feedback = parsed.get("overall_feedback", feedback_content)  # type: ignore
            session.strengths = parsed.get("strengths", [])  # type: ignore
            session.areas_to_improve = parsed.get("areas_to_improve", [])  # type: ignore
        except (ValueError, _json.JSONDecodeError):
            # Fallback: store raw text, no fake bullet points
            session.overall_feedback = feedback_content  # type: ignore
            session.strengths = []  # type: ignore
            session.areas_to_improve = []  # type: ignore
        session.overall_rating = None  # type: ignore

        db.commit()
        overall_feedback_val = str(session.overall_feedback) if session.overall_feedback else ""

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


@router.get("/rehearse/stats")
async def rehearsal_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Aggregate rehearsal stats for the Progress page (streaks, ratings, focus areas)."""
    from collections import Counter
    from datetime import datetime as _dt
    from datetime import timedelta, timezone

    sessions = db.query(RehearsalSession).filter_by(user_id=current_user.id).all()

    total = len(sessions)
    completed = sum(1 for s in sessions if s.status == "completed")
    rated = [float(s.overall_rating) for s in sessions if s.overall_rating is not None]
    avg_rating = round(sum(rated) / len(rated), 2) if rated else None

    def _session_dt(s):
        return s.created_at or s.started_at

    def _as_date(ts):
        return ts.astimezone(timezone.utc).date() if ts.tzinfo else ts.date()

    # Streaks: consecutive calendar days (UTC) with at least one session.
    day_set = {_as_date(ts) for s in sessions if (ts := _session_dt(s)) is not None}
    longest = current = 0
    if day_set:
        days = sorted(day_set)
        run = longest = 1
        for i in range(1, len(days)):
            run = run + 1 if (days[i] - days[i - 1]).days == 1 else 1
            longest = max(longest, run)
        today = _dt.now(timezone.utc).date()
        anchor = today if today in day_set else (
            today - timedelta(days=1) if (today - timedelta(days=1)) in day_set else None
        )
        while anchor is not None and anchor in day_set:
            current += 1
            anchor -= timedelta(days=1)

    # Rating trend: most recent 10 rated sessions, oldest-first (for a sparkline).
    rated_sessions = sorted(
        (s for s in sessions if s.overall_rating is not None),
        key=lambda s: _session_dt(s) or _dt.min.replace(tzinfo=timezone.utc),
    )[-10:]
    rating_trend = [
        {
            "date": _session_dt(s).isoformat() if _session_dt(s) else None,
            "rating": float(s.overall_rating),
        }
        for s in rated_sessions
    ]

    # Most common "areas to improve" across all sessions.
    counter: Counter = Counter()
    for s in sessions:
        for area in (s.areas_to_improve or []):
            counter[area] += 1
    top_areas = [{"area": a, "count": c} for a, c in counter.most_common(5)]

    return {
        "total_sessions": total,
        "completed_sessions": completed,
        "average_rating": avg_rating,
        "current_streak": current,
        "longest_streak": longest,
        "rating_trend": rating_trend,
        "top_areas_to_improve": top_areas,
    }


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
        from app.utils.duration import estimate_duration_seconds
        total_words = sum(len(line.text.split()) for line in upload.lines)
        all_line_text = "\n".join(line.text for line in upload.lines)
        estimated_duration = estimate_duration_seconds(all_line_text)

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

        # Add scene lines + build original snapshot
        scene_lines = []
        original_lines = []
        for idx, line_data in enumerate(upload.lines):
            scene_line = SceneLine(
                scene_id=scene.id,
                line_order=idx,
                character_name=line_data.character_name,
                text=line_data.text,
                stage_direction=line_data.stage_direction,
                word_count=len(line_data.text.split()),
                primary_emotion=None
            )
            db.add(scene_line)
            scene_lines.append(scene_line)
            original_lines.append({
                "line_order": idx,
                "character_name": line_data.character_name,
                "text": line_data.text,
                "stage_direction": line_data.stage_direction,
            })

        scene.original_snapshot = {
            "character_1_name": upload.character_1_name,
            "character_2_name": upload.character_2_name,
            "lines": original_lines,
        }
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
