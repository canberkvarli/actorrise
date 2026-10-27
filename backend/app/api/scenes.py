"""
Scenes: browse, detail, favourites, what's next, the first-rehearsal pick, and
upload. Rehearsing a scene lives in api/rehearsal.py (ScenePartner v2).
"""

from typing import List, Optional

from app.api.auth import get_current_user
from app.core.database import get_db
from app.models.actor import (Play, Scene, SceneFavorite, SceneLine,
                              UserScript)
from app.models.user import User
from app.services import class_shelf
from app.services.rehearsal import journal
from app.services.rehearsal.access import (FREE_LIBRARY_SCENE_TITLES,
                                           is_free_library_scene as _is_free_library_scene)
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
    # False on a teacher's scene a student opens: read and rehearse, not rewrite.
    can_edit: bool = True


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


# The single scene every new actor is dropped into for the zero-setup first
# rehearsal. Matched by title (stable across environments, unlike ids). Comedic
# two-hander, both parts meaty, accessible language — a strong first taste.
FIRST_REHEARSAL_SCENE_TITLE = (
    "The Importance of Being Earnest — Gwendolen and Cecily at Tea"
)


class FirstRehearsalSceneResponse(BaseModel):
    """The scene to drop a brand-new user into, pre-cast."""
    scene_id: int
    user_character: str
    ai_character: str
    title: str
    play_title: Optional[str] = None


def _line_payload(db: Session, scene_id: int, index: int) -> Optional[dict]:
    """One line of the scene, as words rather than a number."""
    line = (
        db.query(SceneLine)
        .filter(SceneLine.scene_id == scene_id)
        .order_by(SceneLine.line_order)
        .offset(max(0, index))
        .first()
    )
    if line is None:  # index past the end, or a scene with no lines
        line = (
            db.query(SceneLine)
            .filter(SceneLine.scene_id == scene_id)
            .order_by(SceneLine.line_order)
            .first()
        )
    if line is None:
        return None
    return {"character": line.character_name, "text": line.text}


def _rung(rung: str, script, scene=None, line=None, character=None,
          progress=None, line_index=None) -> dict:
    return {
        "rung": rung,
        "script": {"id": script.id, "title": script.title, "genre": script.genre,
                   "is_sample": bool(script.is_sample)} if script else None,
        "scene": {"id": scene.id, "title": scene.title, "act": scene.act,
                  "scene_number": scene.scene_number} if scene else None,
        "character": character,
        "line": line,
        "progress": progress,
        "line_index": line_index,
    }


def whats_next(db: Session, user_id: int) -> Optional[dict]:
    """The next real thing to do, for the top of the rehearsal room.

    /practice opened on the most recently *uploaded* script, which is a filing
    order rather than a working one; the page carried a FUTURE note admitting
    it. This answers the question the actor actually has when they walk in.

    A ladder, best rung first. Every rung that can carry a line of dialogue
    does, because the screen should always show a piece of writing and never a
    status message. Most accounts have never rehearsed, so `start` is the common
    rung and gets the same treatment as `resume`.
    """
    # 1. Unfinished work: the newest open run in the journal, inside the resume
    #    window. The Curtain on the scene page re-reads the same journal and
    #    offers "pick up at line N", so only the scene and the line travel.
    open_run = journal.latest_resumable(db, user_id)
    if open_run is not None:
        scene = db.query(Scene).filter(Scene.id == open_run["scene_id"]).first()
        run = journal.db_run(db, open_run["run_id"])
        if scene is not None and run is not None:
            script = (
                db.query(UserScript).filter(UserScript.id == scene.user_script_id).first()
                if scene.user_script_id else None
            )
            at = open_run["line_index"]
            total = scene.line_count or db.query(SceneLine).filter(SceneLine.scene_id == scene.id).count()
            return _rung(
                "resume", script, scene,
                line=_line_payload(db, scene.id, at),
                character=run.character,
                progress={"current": at, "total": total},
                line_index=at,
            )

    # Recently deleted is not on the shelf, so not on the stage either.
    on_shelf = (UserScript.user_id == user_id, UserScript.processing_status != "deleted")

    # 2. Nothing open, but something ready to start: the newest script that has
    #    scenes, opened on its first line. One query, not one per script: a
    #    teacher who brought in 500 files has 500 to look through.
    found = (
        db.query(UserScript, Scene)
        .join(Scene, Scene.user_script_id == UserScript.id)
        .filter(*on_shelf)
        .order_by(UserScript.created_at.desc(), UserScript.id.desc(), Scene.id.asc())
        .first()
    )
    if found is not None:
        script, scene = found
        return _rung(
            "start", script, scene,
            line=_line_payload(db, scene.id, 0),
            character=scene.character_1_name,
            progress={"current": 0, "total": scene.line_count or 0},
        )

    # 3. A script arrived and has no scenes to rehearse yet. Not one still
    #    being read: the shelf says "reading…" on it, and "nobody has cut it,
    #    cut the scenes" over a read in progress started a second one.
    waiting = (
        db.query(UserScript)
        .filter(*on_shelf, UserScript.processing_status.notin_(("processing", "pending")))
        .order_by(UserScript.created_at.desc(), UserScript.id.desc())
        .first()
    )
    if waiting is not None:
        return _rung("cut", waiting)

    # 4. Nothing of their own. The sample play speaks first — a real line of
    #    Shakespeare is a better welcome than an empty shelf.
    demo_scene = (
        db.query(Scene)
        .join(UserScript, Scene.user_script_id == UserScript.id)
        .filter(UserScript.is_sample.is_(True), UserScript.is_guided.is_(False))
        .order_by(UserScript.id, Scene.id)
        .first()
    )
    if demo_scene is not None:
        script = db.query(UserScript).filter(
            UserScript.id == demo_scene.user_script_id
        ).first()
        return _rung(
            "demo", script, demo_scene,
            line=_line_payload(db, demo_scene.id, 0),
            character=demo_scene.character_1_name,
            progress={"current": 0, "total": demo_scene.line_count or 0},
        )

    return None


# NOTE: must be declared BEFORE "/{scene_id}" or FastAPI matches
# "whats-next" as a scene_id and 422s on int parsing.
@router.get("/whats-next")
def get_whats_next(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """What the rehearsal room should put in front of this actor."""
    return {"next": whats_next(db, current_user.id)}


# NOTE: must be declared BEFORE "/{scene_id}" or FastAPI matches
# "first-rehearsal" as a scene_id and 422s on int parsing.
@router.get("/first-rehearsal", response_model=FirstRehearsalSceneResponse)
def get_first_rehearsal_scene(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the hero scene + a guaranteed-valid casting for first-run.

    Falls back to any free-tier library scene if the hero scene isn't seeded
    in this environment, so the activation flow degrades gracefully.
    """
    scene = (
        db.query(Scene)
        .filter(Scene.is_library.is_(True), Scene.title == FIRST_REHEARSAL_SCENE_TITLE)
        .first()
    )
    if scene is None:
        scene = (
            db.query(Scene)
            .filter(Scene.is_library.is_(True), Scene.title.in_(FREE_LIBRARY_SCENE_TITLES))
            .first()
        )
    if scene is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No first-rehearsal scene is available",
        )
    play_title = (
        db.query(Play.title).filter(Play.id == scene.play_id).scalar()
        if scene.play_id
        else None
    )
    return FirstRehearsalSceneResponse(
        scene_id=scene.id,
        user_character=scene.character_1_name,
        ai_character=scene.character_2_name,
        title=scene.title,
        play_title=play_title,
    )


@router.get("/{scene_id}", response_model=SceneDetailResponse)
async def get_scene_detail(
    scene_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get detailed scene information including all lines"""
    scene = db.query(Scene).filter_by(id=scene_id).first()

    script = db.get(UserScript, scene.user_script_id) if scene and scene.user_script_id else None
    owns = script is not None and script.user_id == current_user.id
    # Someone else's upload is theirs alone: a sample, a library scene, a
    # moderator, or a student in the class it was shared with may read it, and
    # anyone else is told it does not exist. Before 2026-10-27 this route read
    # any scene to anyone who knew its id.
    if not scene or (
        script is not None
        and not owns
        and not script.is_sample
        and not scene.is_library
        and not current_user.is_moderator
        and not class_shelf.can_read(db, current_user, script)
    ):
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
        "can_edit": script is None or owns,
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
