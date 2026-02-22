"""
API endpoints for user script management - upload, edit, manage scripts
"""

from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.database import get_db
from app.models.actor import (
    Play,
    RehearsalLineDelivery,
    RehearsalSession,
    Scene,
    SceneLine,
    UserScript,
)
from app.models.user import User
from app.services.script_parser import ScriptParser

router = APIRouter(prefix="/api/scripts", tags=["scripts"])


# ============================================================================
# Request/Response Models
# ============================================================================

class UserScriptResponse(BaseModel):
    """User script data for API responses"""
    id: int
    title: str
    author: str
    description: Optional[str]
    original_filename: str
    file_type: str
    file_size_bytes: Optional[int]
    processing_status: str
    processing_error: Optional[str]
    ai_extraction_completed: bool
    genre: Optional[str]
    estimated_length_minutes: Optional[int]
    num_characters: int
    num_scenes_extracted: int
    characters: List[dict]
    created_at: datetime
    updated_at: Optional[datetime]
    first_scene_title: Optional[str] = None
    first_scene_description: Optional[str] = None
    scene_titles: List[str] = []

    class Config:
        from_attributes = True


class SceneInScriptResponse(BaseModel):
    """Minimal scene data for script listing"""
    id: int
    title: str
    character_1_name: str
    character_2_name: str
    line_count: int
    estimated_duration_seconds: int

    class Config:
        from_attributes = True


class UserScriptDetailResponse(UserScriptResponse):
    """Detailed script with all scenes"""
    scenes: List[SceneInScriptResponse]


class ScriptMetadataUpdate(BaseModel):
    """Update script metadata"""
    title: Optional[str] = None
    author: Optional[str] = None
    description: Optional[str] = None
    genre: Optional[str] = None


class SceneLineUpdate(BaseModel):
    """Update a scene line"""
    character_name: Optional[str] = None
    text: Optional[str] = None
    stage_direction: Optional[str] = None


class SceneUpdate(BaseModel):
    """Update scene metadata"""
    title: Optional[str] = None
    description: Optional[str] = None
    character_1_name: Optional[str] = None
    character_2_name: Optional[str] = None
    setting: Optional[str] = None
    context_before: Optional[str] = None
    context_after: Optional[str] = None


class CreateScriptFromTextRequest(BaseModel):
    """Create a script from pasted text (no file upload)"""
    body: str
    title: Optional[str] = None
    author: Optional[str] = None
    description: Optional[str] = None


# ============================================================================
# Script Upload & Management
# ============================================================================

@router.post("/upload", response_model=UserScriptDetailResponse)
async def upload_script(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    author: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Upload a script file (PDF/TXT) and automatically extract characters and scenes.

    The AI will:
    1. Extract text from the file
    2. Identify characters, title, author
    3. Extract all two-person scenes
    4. Create Scene records ready for ScenePartner
    """
    # Validate file type
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    file_ext = file.filename.split(".")[-1].lower()
    if file_ext not in ["pdf", "txt", "text"]:
        raise HTTPException(
            status_code=400,
            detail="Only PDF and TXT files are supported"
        )

    # Read file content
    file_content = await file.read()
    file_size = len(file_content)

    if file_size > 10 * 1024 * 1024:  # 10MB limit
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")

    # Create script record
    user_script = UserScript(
        user_id=current_user.id,
        title=title or "Untitled Script",
        author=author or "Unknown",
        description=description,
        original_filename=file.filename,
        file_type=file_ext,
        file_size_bytes=file_size,
        processing_status="processing"
    )

    db.add(user_script)
    db.commit()
    db.refresh(user_script)

    try:
        # Parse script with AI
        parser = ScriptParser()
        result = parser.parse_script(file_content, file_ext, file.filename)

        # Update script with extracted data
        metadata = result["metadata"]
        user_script.raw_text = result["raw_text"]
        user_script.title = title or metadata.get("title", "Untitled Script")
        user_script.author = author or metadata.get("author", "Unknown")
        user_script.characters = metadata.get("characters", [])
        user_script.genre = metadata.get("genre")
        user_script.estimated_length_minutes = metadata.get("estimated_length_minutes")
        user_script.num_characters = len(metadata.get("characters", []))

        # Create Play record for the script
        play = Play(
            title=user_script.title,
            author=user_script.author,
            year_written=None,
            genre=user_script.genre or "Drama",
            category="contemporary",
            copyright_status="user_uploaded",
            license_type="user_content",
            source_url=None,
            full_text=result["raw_text"],
            text_format="plain"
        )
        db.add(play)
        db.commit()
        db.refresh(play)

        # Create Scene records for extracted scenes
        scenes_created = []
        for scene_data in result["scenes"]:
            # Calculate metadata
            lines_count = len(scene_data.get("lines", []))
            total_words = sum(len(line.get("text", "").split()) for line in scene_data.get("lines", []))
            duration_seconds = int((total_words / 150) * 60)

            # Find character metadata
            char1_info = next(
                (c for c in user_script.characters if c.get("name") == scene_data.get("character_1")),
                {}
            )
            char2_info = next(
                (c for c in user_script.characters if c.get("name") == scene_data.get("character_2")),
                {}
            )

            scene = Scene(
                play_id=play.id,
                user_script_id=user_script.id,
                title=scene_data.get("title", "Untitled Scene"),
                description=scene_data.get("description"),
                character_1_name=scene_data.get("character_1", "Character 1"),
                character_2_name=scene_data.get("character_2", "Character 2"),
                character_1_gender=char1_info.get("gender"),
                character_2_gender=char2_info.get("gender"),
                character_1_age_range=char1_info.get("age_range"),
                character_2_age_range=char2_info.get("age_range"),
                line_count=lines_count,
                estimated_duration_seconds=duration_seconds,
                setting=scene_data.get("setting"),
                difficulty_level="intermediate",
                primary_emotions=[],
                is_verified=False
            )

            db.add(scene)
            db.flush()  # Get scene ID

            # Add scene lines
            for idx, line_data in enumerate(scene_data.get("lines", [])):
                scene_line = SceneLine(
                    scene_id=scene.id,
                    line_order=idx,
                    character_name=line_data.get("character", "Unknown"),
                    text=line_data.get("text", ""),
                    stage_direction=line_data.get("stage_direction"),
                    word_count=len(line_data.get("text", "").split())
                )
                db.add(scene_line)

            scenes_created.append(scene)

        user_script.num_scenes_extracted = len(scenes_created)
        user_script.processing_status = "completed"
        user_script.ai_extraction_completed = True

        db.commit()
        db.refresh(user_script)

        # Return detailed response (use model_validate so ORM instances serialize correctly)
        return UserScriptDetailResponse(
            **UserScriptResponse.model_validate(user_script).model_dump(),
            scenes=[SceneInScriptResponse.model_validate(s) for s in scenes_created],
        )

    except Exception as e:
        # Update script with error
        user_script.processing_status = "failed"
        user_script.processing_error = str(e)
        db.commit()

        raise HTTPException(
            status_code=500,
            detail=f"Failed to process script: {str(e)}"
        )


@router.post("/from-text", response_model=UserScriptDetailResponse)
async def create_script_from_text(
    request: CreateScriptFromTextRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Create a script from pasted text. AI extracts title, author, characters,
    and two-person scenes (same as file upload). Use this to rehearse without uploading a file.
    """
    body = request.body.strip()
    if len(body) < 100:
        raise HTTPException(
            status_code=400,
            detail="Text is too short. Paste at least a few lines of dialogue to extract a scene."
        )
    text_bytes = body.encode("utf-8")
    if len(text_bytes) > 10 * 1024 * 1024:  # 10MB
        raise HTTPException(status_code=400, detail="Text too long (max 10MB)")

    user_script = UserScript(
        user_id=current_user.id,
        title=request.title or "Pasted Script",
        author=request.author or "Unknown",
        description=request.description,
        original_filename="Pasted script",
        file_type="txt",
        file_size_bytes=len(text_bytes),
        file_path=None,
        processing_status="processing",
    )
    db.add(user_script)
    db.commit()
    db.refresh(user_script)

    try:
        parser = ScriptParser()
        result = parser.parse_script(text_bytes, "txt", "Pasted script.txt")

        metadata = result["metadata"]
        user_script.raw_text = result["raw_text"]
        user_script.title = request.title or metadata.get("title", "Pasted Script")
        user_script.author = request.author or metadata.get("author", "Unknown")
        user_script.characters = metadata.get("characters", [])
        user_script.genre = metadata.get("genre")
        user_script.estimated_length_minutes = metadata.get("estimated_length_minutes")
        user_script.num_characters = len(metadata.get("characters", []))

        play = Play(
            title=user_script.title,
            author=user_script.author,
            year_written=None,
            genre=user_script.genre or "Drama",
            category="contemporary",
            copyright_status="user_uploaded",
            license_type="user_content",
            source_url=None,
            full_text=result["raw_text"],
            text_format="plain",
        )
        db.add(play)
        db.commit()
        db.refresh(play)

        scenes_created = []
        for scene_data in result["scenes"]:
            lines_count = len(scene_data.get("lines", []))
            total_words = sum(len(line.get("text", "").split()) for line in scene_data.get("lines", []))
            duration_seconds = int((total_words / 150) * 60)
            char1_info = next(
                (c for c in user_script.characters if c.get("name") == scene_data.get("character_1")),
                {},
            )
            char2_info = next(
                (c for c in user_script.characters if c.get("name") == scene_data.get("character_2")),
                {},
            )
            scene = Scene(
                play_id=play.id,
                user_script_id=user_script.id,
                title=scene_data.get("title", "Untitled Scene"),
                description=scene_data.get("description"),
                character_1_name=scene_data.get("character_1", "Character 1"),
                character_2_name=scene_data.get("character_2", "Character 2"),
                character_1_gender=char1_info.get("gender"),
                character_2_gender=char2_info.get("gender"),
                character_1_age_range=char1_info.get("age_range"),
                character_2_age_range=char2_info.get("age_range"),
                line_count=lines_count,
                estimated_duration_seconds=duration_seconds,
                setting=scene_data.get("setting"),
                difficulty_level="intermediate",
                primary_emotions=[],
                is_verified=False,
            )
            db.add(scene)
            db.flush()
            for idx, line_data in enumerate(scene_data.get("lines", [])):
                scene_line = SceneLine(
                    scene_id=scene.id,
                    line_order=idx,
                    character_name=line_data.get("character", "Unknown"),
                    text=line_data.get("text", ""),
                    stage_direction=line_data.get("stage_direction"),
                    word_count=len(line_data.get("text", "").split()),
                )
                db.add(scene_line)
            scenes_created.append(scene)

        user_script.num_scenes_extracted = len(scenes_created)
        user_script.processing_status = "completed"
        user_script.ai_extraction_completed = True
        db.commit()
        db.refresh(user_script)

        return UserScriptDetailResponse(
            **UserScriptResponse.model_validate(user_script).model_dump(),
            scenes=[SceneInScriptResponse.model_validate(s) for s in scenes_created],
        )
    except Exception as e:
        user_script.processing_status = "failed"
        user_script.processing_error = str(e)
        db.commit()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process script: {str(e)}",
        )


# Example script content for first-time users (minimal two-person scene)
EXAMPLE_SCRIPT = {
    "title": "Example: The Proposal",
    "author": "ScenePartner",
    "characters": [
        {"name": "Alex", "gender": None, "age_range": None, "description": None},
        {"name": "Jordan", "gender": None, "age_range": None, "description": None},
    ],
    "scenes": [
        {
            "title": "The Proposal",
            "character_1": "Alex",
            "character_2": "Jordan",
            "lines": [
                {"character": "Alex", "text": "I need to tell you something.", "stage_direction": None},
                {"character": "Jordan", "text": "What is it?", "stage_direction": None},
                {"character": "Alex", "text": "I've been thinking about us. A lot.", "stage_direction": None},
                {"character": "Jordan", "text": "And?", "stage_direction": None},
                {"character": "Alex", "text": "I want to do this properly. Will you stay?", "stage_direction": None},
                {"character": "Jordan", "text": "Yes.", "stage_direction": None},
            ],
        }
    ],
}


@router.post("/ensure-example", response_model=Optional[UserScriptDetailResponse])
async def ensure_example_script(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    If the user has no scripts, create one example script with one scene so they can try ScenePartner immediately.
    Idempotent: only creates when script count is 0.
    """
    existing = db.query(UserScript).filter(UserScript.user_id == current_user.id).count()
    if existing > 0:
        return None

    metadata = EXAMPLE_SCRIPT
    user_script = UserScript(
        user_id=current_user.id,
        title=metadata["title"],
        author=metadata["author"],
        description="A short example scene. Edit it or add your own script.",
        original_filename="example.txt",
        file_type="text",
        processing_status="completed",
        ai_extraction_completed=True,
        characters=metadata["characters"],
        num_characters=len(metadata["characters"]),
        num_scenes_extracted=1,
    )
    db.add(user_script)
    db.commit()
    db.refresh(user_script)

    play = Play(
        title=user_script.title,
        author=user_script.author,
        year_written=None,
        genre="Drama",
        category="contemporary",
        copyright_status="user_uploaded",
        license_type="user_content",
        source_url=None,
        full_text="",
        text_format="plain",
    )
    db.add(play)
    db.commit()
    db.refresh(play)

    scene_data = metadata["scenes"][0]
    lines_list = scene_data.get("lines", [])
    line_count = len(lines_list)
    total_words = sum(len(l.get("text", "").split()) for l in lines_list)
    duration_seconds = max(30, int((total_words / 150) * 60))

    scene = Scene(
        play_id=play.id,
        user_script_id=user_script.id,
        title=scene_data.get("title", "Untitled Scene"),
        description=None,
        character_1_name=scene_data.get("character_1", "Character 1"),
        character_2_name=scene_data.get("character_2", "Character 2"),
        line_count=line_count,
        estimated_duration_seconds=duration_seconds,
        setting=None,
        difficulty_level="beginner",
        is_verified=False,
    )
    db.add(scene)
    db.flush()

    for idx, line_data in enumerate(lines_list):
        text = line_data.get("text", "")
        scene_line = SceneLine(
            scene_id=scene.id,
            line_order=idx,
            character_name=line_data.get("character", "Unknown"),
            text=text,
            stage_direction=line_data.get("stage_direction"),
            word_count=len(text.split()),
        )
        db.add(scene_line)

    user_script.num_scenes_extracted = 1
    db.commit()
    db.refresh(user_script)
    db.refresh(scene)

    scenes = db.query(Scene).filter(Scene.user_script_id == user_script.id).all()
    return UserScriptDetailResponse(
        **UserScriptResponse.model_validate(user_script).model_dump(),
        scenes=[SceneInScriptResponse.model_validate(s) for s in scenes],
    )


@router.get("/", response_model=List[UserScriptResponse])
async def list_user_scripts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all scripts uploaded by the current user"""
    scripts = db.query(UserScript).filter(
        UserScript.user_id == current_user.id
    ).order_by(UserScript.created_at.desc()).all()

    result = []
    for s in scripts:
        data = UserScriptResponse.model_validate(s).model_dump()
        scenes = db.query(Scene).filter(Scene.user_script_id == s.id).order_by(Scene.id).all()
        first_scene = scenes[0] if scenes else None
        data["first_scene_title"] = first_scene.title if first_scene else None
        data["first_scene_description"] = (first_scene.description if first_scene and first_scene.description else None)
        data["scene_titles"] = [sc.title for sc in scenes]
        result.append(UserScriptResponse(**data))
    return result


@router.get("/{script_id}", response_model=UserScriptDetailResponse)
async def get_script(
    script_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get detailed script with all scenes"""
    script = db.query(UserScript).filter(
        UserScript.id == script_id,
        UserScript.user_id == current_user.id
    ).first()

    if not script:
        raise HTTPException(status_code=404, detail="Script not found")

    # Get scenes
    scenes = db.query(Scene).filter(Scene.user_script_id == script_id).all()

    return UserScriptDetailResponse(
        **UserScriptResponse.model_validate(script).model_dump(),
        scenes=[SceneInScriptResponse.model_validate(s) for s in scenes],
    )


@router.patch("/{script_id}", response_model=UserScriptResponse)
async def update_script_metadata(
    script_id: int,
    update: ScriptMetadataUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update script metadata (title, author, description, genre)"""
    script = db.query(UserScript).filter(
        UserScript.id == script_id,
        UserScript.user_id == current_user.id
    ).first()

    if not script:
        raise HTTPException(status_code=404, detail="Script not found")

    # Update fields if provided
    if update.title is not None:
        script.title = update.title
    if update.author is not None:
        script.author = update.author
    if update.description is not None:
        script.description = update.description
    if update.genre is not None:
        script.genre = update.genre

    db.commit()
    db.refresh(script)

    return UserScriptResponse.model_validate(script)


@router.delete("/{script_id}")
async def delete_script(
    script_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a script and all its scenes"""
    script = db.query(UserScript).filter(
        UserScript.id == script_id,
        UserScript.user_id == current_user.id
    ).first()

    if not script:
        raise HTTPException(status_code=404, detail="Script not found")

    # Delete all associated scenes and their lines
    scenes = db.query(Scene).filter(Scene.user_script_id == script_id).all()
    for scene in scenes:
        # Delete scene lines
        db.query(SceneLine).filter(SceneLine.scene_id == scene.id).delete()
        # Delete scene
        db.delete(scene)

    # Delete script
    db.delete(script)
    db.commit()

    return {"message": "Script deleted successfully"}


# ============================================================================
# Scene Editing within Scripts
# ============================================================================

@router.patch("/{script_id}/scenes/{scene_id}", response_model=dict)
async def update_scene(
    script_id: int,
    scene_id: int,
    update: SceneUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update scene metadata (inline editing)"""
    # Verify script ownership
    script = db.query(UserScript).filter(
        UserScript.id == script_id,
        UserScript.user_id == current_user.id
    ).first()

    if not script:
        raise HTTPException(status_code=404, detail="Script not found")

    # Get scene
    scene = db.query(Scene).filter(
        Scene.id == scene_id,
        Scene.user_script_id == script_id
    ).first()

    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")

    # Update fields
    if update.title is not None:
        scene.title = update.title
    if update.description is not None:
        scene.description = update.description
    if update.character_1_name is not None:
        scene.character_1_name = update.character_1_name
    if update.character_2_name is not None:
        scene.character_2_name = update.character_2_name
    if update.setting is not None:
        scene.setting = update.setting
    if update.context_before is not None:
        scene.context_before = update.context_before
    if update.context_after is not None:
        scene.context_after = update.context_after

    db.commit()

    return {"message": "Scene updated successfully"}


@router.patch("/{script_id}/scenes/{scene_id}/lines/{line_id}")
async def update_scene_line(
    script_id: int,
    scene_id: int,
    line_id: int,
    update: SceneLineUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a scene line (inline editing)"""
    # Verify script ownership
    script = db.query(UserScript).filter(
        UserScript.id == script_id,
        UserScript.user_id == current_user.id
    ).first()

    if not script:
        raise HTTPException(status_code=404, detail="Script not found")

    # Get line
    line = db.query(SceneLine).filter(SceneLine.id == line_id).first()

    if not line or line.scene_id != scene_id:
        raise HTTPException(status_code=404, detail="Line not found")

    # Update fields
    if update.character_name is not None:
        line.character_name = update.character_name
    if update.text is not None:
        line.text = update.text
        line.word_count = len(update.text.split())
    if update.stage_direction is not None:
        line.stage_direction = update.stage_direction

    db.commit()

    return {"message": "Line updated successfully"}


@router.delete("/{script_id}/scenes/{scene_id}")
async def delete_scene(
    script_id: int,
    scene_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a scene from a script"""
    # Verify script ownership
    script = db.query(UserScript).filter(
        UserScript.id == script_id,
        UserScript.user_id == current_user.id
    ).first()

    if not script:
        raise HTTPException(status_code=404, detail="Script not found")

    # Get scene
    scene = db.query(Scene).filter(
        Scene.id == scene_id,
        Scene.user_script_id == script_id
    ).first()

    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")

    # Delete rehearsal data that references this scene (session.scene_id is NOT NULL)
    session_ids = [r[0] for r in db.query(RehearsalSession.id).filter(RehearsalSession.scene_id == scene_id).all()]
    if session_ids:
        db.query(RehearsalLineDelivery).filter(RehearsalLineDelivery.session_id.in_(session_ids)).delete(
            synchronize_session=False
        )
        db.query(RehearsalSession).filter(RehearsalSession.scene_id == scene_id).delete(synchronize_session=False)

    # Delete scene lines
    db.query(SceneLine).filter(SceneLine.scene_id == scene_id).delete(synchronize_session=False)

    # Delete scene
    db.delete(scene)

    # Update script scene count
    script.num_scenes_extracted -= 1

    db.commit()

    return {"message": "Scene deleted successfully"}
