"""
API endpoints for user script management - upload, edit, manage scripts
"""

import asyncio
import json as _json
from datetime import datetime
from queue import Queue, Empty
from typing import List, Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.database import SessionLocal, get_db
from app.middleware.rate_limiting import require_script_upload
from app.models.actor import (
    ExtractionCache,
    Play,
    RehearsalLineDelivery,
    RehearsalSession,
    Scene,
    SceneFavorite,
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
    description: Optional[str] = None
    character_1_name: str
    character_2_name: str
    line_count: int
    estimated_duration_seconds: int
    act: Optional[str] = None
    scene_number: Optional[str] = None

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


class AddSceneToScriptRequest(BaseModel):
    """Add a manually-entered scene to an existing script"""
    title: str = Field(..., max_length=200)
    description: Optional[str] = Field(None, max_length=500)
    act: Optional[str] = Field(None, max_length=100)
    scene_number: Optional[str] = Field(None, max_length=50)
    body: str = Field(..., min_length=10)  # "CHARACTER: line" format, one per line


class SceneLineUpdate(BaseModel):
    """Update a scene line"""
    character_name: Optional[str] = Field(None, max_length=80)
    text: Optional[str] = Field(None, max_length=2000)
    stage_direction: Optional[str] = Field(None, max_length=120)


class LineReorderRequest(BaseModel):
    """Reorder scene lines"""
    line_ids: List[int]


class SceneUpdate(BaseModel):
    """Update scene metadata"""
    title: Optional[str] = None
    description: Optional[str] = Field(None, max_length=500)
    character_1_name: Optional[str] = Field(None, max_length=80)
    character_2_name: Optional[str] = Field(None, max_length=80)
    setting: Optional[str] = Field(None, max_length=200)
    context_before: Optional[str] = Field(None, max_length=1000)
    context_after: Optional[str] = Field(None, max_length=1000)
    play_title: Optional[str] = Field(None, max_length=200)
    play_author: Optional[str] = Field(None, max_length=200)


class CreateSceneLineRequest(BaseModel):
    """Create a new scene line"""
    character_name: str = Field(..., max_length=80)
    text: str = Field(..., max_length=2000)
    stage_direction: Optional[str] = Field(None, max_length=120)
    insert_after_line_id: Optional[int] = None


class CreateScriptFromTextRequest(BaseModel):
    """Create a script from pasted text (no file upload)"""
    body: str
    title: Optional[str] = None
    author: Optional[str] = None
    description: Optional[str] = None


class BulkResetLineData(BaseModel):
    """Line data for bulk reset"""
    character_name: str
    text: str
    stage_direction: Optional[str] = None
    line_order: int


class BulkResetRequest(BaseModel):
    """Bulk reset: replace all scene data with provided snapshot"""
    title: str
    description: Optional[str] = None
    play_title: Optional[str] = None
    play_author: Optional[str] = None
    character_1_name: str
    character_2_name: str
    setting: Optional[str] = None
    context_before: Optional[str] = None
    context_after: Optional[str] = None
    lines: List[BulkResetLineData]


class ScriptScanResponse(BaseModel):
    """Quick scan results for pre-extraction choice dialog"""
    page_count: int
    has_structure: bool
    num_acts: int
    num_sections: int
    show_mode_choice: bool
    estimated_quick_seconds: int
    estimated_full_seconds: int


# ============================================================================
# Script Scan (instant, no AI)
# ============================================================================

@router.post("/scan", response_model=ScriptScanResponse)
async def scan_script(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """
    Quick scan: extract text + detect structure. No AI, no DB writes, no quota.
    Returns info for the pre-extraction choice dialog.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    file_ext = file.filename.split(".")[-1].lower()
    if file_ext not in ["pdf", "txt", "text"]:
        raise HTTPException(status_code=400, detail="Only PDF and TXT files are supported")

    file_content = await file.read()
    if len(file_content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")

    # Extract text (no AI needed)
    import io
    import pdfplumber as _pdfplumber

    actual_pdf_pages = 0
    try:
        if file_ext == "pdf":
            pdf_file = io.BytesIO(file_content)
            raw_text = ""
            with _pdfplumber.open(pdf_file) as pdf:
                actual_pdf_pages = len(pdf.pages)
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        raw_text += page_text + "\n\n"
            raw_text = raw_text.strip()
        else:
            try:
                raw_text = file_content.decode("utf-8")
            except UnicodeDecodeError:
                raw_text = file_content.decode("latin-1")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {e}")

    if not raw_text or len(raw_text) < 100:
        raise HTTPException(status_code=400, detail="File appears to be empty or too short")

    # Detect structure (pure regex, instant)
    from app.services.script_structure import detect_structure
    from app.services.script_parser import parse_dialogue

    chunks = detect_structure(raw_text)
    has_structure = len(chunks) > 1 or (len(chunks) == 1 and chunks[0].act_label is not None)
    num_acts = len(set(c.act_label for c in chunks if c.act_label))

    # Count chunks that have dialogue (for time estimates)
    dialogue_chunks = 0
    for c in chunks:
        if c.char_count >= 200:
            sections = parse_dialogue(c.text)
            if any(len(s["characters"]) >= 2 for s in sections):
                dialogue_chunks += 1

    page_count = actual_pdf_pages if actual_pdf_pages > 0 else max(1, len(raw_text) // 3000)

    # Time estimates
    if page_count <= 5:
        # Small scripts: single combined AI call (~5-10s)
        est_quick = 8
        est_full = 10
    else:
        base_time = 10  # metadata extraction
        est_quick = base_time + max(10, dialogue_chunks * 3)
        est_full = base_time + max(15, dialogue_chunks * 10)

    return ScriptScanResponse(
        page_count=page_count,
        has_structure=has_structure,
        num_acts=num_acts,
        num_sections=dialogue_chunks,
        show_mode_choice=has_structure and dialogue_chunks >= 8,
        estimated_quick_seconds=est_quick,
        estimated_full_seconds=est_full,
    )


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
    current_user: User = Depends(get_current_user),
    _gate: bool = Depends(require_script_upload()),
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

    # ---- Phase 1: Extract everything BEFORE touching DB ----
    # This avoids DB connection timeouts during long AI extraction.
    try:
        parser = ScriptParser()
        result = parser.parse_script(file_content, file_ext, file.filename)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to extract script: {str(e)}"
        )

    # ---- Phase 2: All DB writes happen quickly together ----
    # Close the stale session (idle during extraction) and get a fresh one.
    try:
        db.close()
    except Exception:
        pass  # Connection already gone — that's fine
    db = SessionLocal()

    metadata = result["metadata"]
    resolved_title = title or metadata.get("title", "Untitled Script")
    resolved_author = author or metadata.get("author", "Unknown")
    resolved_description = description or metadata.get("synopsis")

    user_script = UserScript(
        user_id=current_user.id,
        title=resolved_title,
        author=resolved_author,
        description=resolved_description,
        original_filename=file.filename,
        file_type=file_ext,
        file_size_bytes=file_size,
        processing_status="processing",
        raw_text=result["raw_text"],
        characters=metadata.get("characters", []),
        genre=metadata.get("genre"),
        estimated_length_minutes=metadata.get("estimated_length_minutes"),
        num_characters=len(metadata.get("characters", [])),
    )

    db.add(user_script)

    # Increment monotonic upload counter (survives deletes for free-tier gating)
    current_user_fresh = db.query(User).filter(User.id == current_user.id).first()
    if current_user_fresh:
        current_user_fresh.total_scripts_uploaded = (current_user_fresh.total_scripts_uploaded or 0) + 1

    db.commit()
    db.refresh(user_script)

    try:
        play = Play(
            title=resolved_title,
            author=resolved_author,
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
            from app.utils.duration import estimate_duration_seconds
            lines_count = len(scene_data.get("lines", []))
            all_line_text = "\n".join(line.get("text", "") for line in scene_data.get("lines", []))
            total_words = len(all_line_text.split())
            duration_seconds = estimate_duration_seconds(all_line_text)

            # Find character metadata
            char1_info = next(
                (c for c in user_script.characters if c.get("name") == scene_data.get("character_1")),
                {}
            )
            char2_info = next(
                (c for c in user_script.characters if c.get("name") == scene_data.get("character_2")),
                {}
            )

            # Sanitize setting — AI sometimes returns "Unknown"
            raw_setting = scene_data.get("setting")
            clean_setting = None if not raw_setting or raw_setting.strip().lower() == "unknown" else raw_setting

            scene = Scene(
                play_id=play.id,
                user_script_id=user_script.id,
                title=scene_data.get("title", "Untitled Scene"),
                description=scene_data.get("description"),
                act=scene_data.get("act"),
                scene_number=scene_data.get("scene_number"),
                character_1_name=scene_data.get("character_1", "Character 1"),
                character_2_name=scene_data.get("character_2", "Character 2"),
                character_1_gender=char1_info.get("gender"),
                character_2_gender=char2_info.get("gender"),
                character_1_age_range=char1_info.get("age_range"),
                character_2_age_range=char2_info.get("age_range"),
                line_count=lines_count,
                estimated_duration_seconds=duration_seconds,
                setting=clean_setting,
                difficulty_level="intermediate",
                tone=scene_data.get("tone"),
                primary_emotions=scene_data.get("primary_emotions", []),
                relationship_dynamic=scene_data.get("relationship_dynamic"),
                is_verified=False
            )

            db.add(scene)
            db.flush()  # Get scene ID

            # Add scene lines + build original snapshot
            original_lines = []
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
                original_lines.append({
                    "line_order": idx,
                    "character_name": line_data.get("character", "Unknown"),
                    "text": line_data.get("text", ""),
                    "stage_direction": line_data.get("stage_direction"),
                })

            # Store original snapshot for "Reset to original" feature
            scene.original_snapshot = {
                "character_1_name": scene_data.get("character_1", "Character 1"),
                "character_2_name": scene_data.get("character_2", "Character 2"),
                "description": scene.description,
                "lines": original_lines,
            }

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


# ============================================================================
# SSE Streaming Upload — real-time progress
# ============================================================================

@router.post("/upload-stream")
async def upload_script_stream(
    request: Request,
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    author: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    mode: Optional[str] = Form("full"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _gate: bool = Depends(require_script_upload()),
):
    """
    Upload a script file with SSE progress streaming.
    mode: "quick" (regex + batch AI, 2-person only) or "full" (AI per chunk, all scenes).
    Sends progress events as `data: {"step": "...", "type": "progress"}` lines,
    then a final `data: {"type": "done", ...}` or `data: {"type": "error", ...}`.
    """
    extraction_mode = mode if mode in ("quick", "full") else "full"
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    file_ext = file.filename.split(".")[-1].lower()
    if file_ext not in ["pdf", "txt", "text"]:
        raise HTTPException(status_code=400, detail="Only PDF and TXT files are supported")

    file_content = await file.read()
    file_size = len(file_content)
    if file_size > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")

    # Compute file hash for extraction cache
    import hashlib
    file_hash = hashlib.sha256(file_content).hexdigest()

    filename = file.filename
    user_id = current_user.id  # capture before closing db
    progress_queue: Queue = Queue()
    import threading
    cancel_event = threading.Event()

    # Check extraction cache before releasing DB
    cached_result = None
    try:
        cache_entry = db.query(ExtractionCache).filter(
            ExtractionCache.file_hash == file_hash
        ).first()
        if cache_entry:
            cached_result = cache_entry.extraction_result
    except Exception:
        pass  # Cache miss on error is fine

    # Release the DB connection immediately — extraction takes minutes
    # and holding a connection during that time exhausts PgBouncer's pool.
    try:
        db.close()
    except Exception:
        pass

    def on_progress(msg: str):
        progress_queue.put(msg)

    # Monitor client disconnect in a separate asyncio task (more reliable
    # than checking inside the generator, which depends on yield/consume timing)
    async def monitor_disconnect():
        while not cancel_event.is_set():
            if await request.is_disconnected():
                cancel_event.set()
                print("Client disconnected, cancelling extraction")
                return
            await asyncio.sleep(0.3)

    monitor_task = asyncio.create_task(monitor_disconnect())

    async def event_stream():
        # If we have a cached result, skip extraction entirely
        if cached_result:
            event = _json.dumps({"type": "progress", "step": "Found cached extraction, restoring..."})
            yield f"data: {event}\n\n"
            monitor_task.cancel()
            result = cached_result
        else:
            # Run extraction in a thread so we can stream progress
            extraction_result = {}
            extraction_error = {}

            def run_extraction():
                try:
                    parser = ScriptParser()
                    extraction_result["data"] = parser.parse_script(
                        file_content, file_ext, filename,
                        on_progress=on_progress, cancel_event=cancel_event,
                        mode=extraction_mode,
                    )
                except InterruptedError:
                    extraction_error["msg"] = "cancelled"
                except Exception as e:
                    extraction_error["msg"] = str(e)
                finally:
                    progress_queue.put(None)  # sentinel

            thread = threading.Thread(target=run_extraction, daemon=True)
            thread.start()

            # Stream progress events
            try:
                while True:
                    if cancel_event.is_set():
                        thread.join(timeout=10)
                        return

                    # Poll queue with async sleep to avoid blocking the event loop
                    try:
                        msg = progress_queue.get_nowait()
                    except Empty:
                        await asyncio.sleep(0.2)
                        continue

                    if msg is None:
                        break  # extraction done

                    event = _json.dumps({"type": "progress", "step": msg})
                    yield f"data: {event}\n\n"
            except (asyncio.CancelledError, GeneratorExit):
                cancel_event.set()
                print("SSE generator killed, cancelling extraction")
                thread.join(timeout=10)
                return
            finally:
                monitor_task.cancel()

            thread.join(timeout=5)

            # Check for errors or cancellation
            if extraction_error:
                if extraction_error["msg"] == "cancelled":
                    return  # Client already gone, no point sending error
                event = _json.dumps({"type": "error", "detail": extraction_error["msg"]})
                yield f"data: {event}\n\n"
                return

            result = extraction_result["data"]

            # Store in extraction cache for future re-uploads
            try:
                cache_db = SessionLocal()
                cache_db.add(ExtractionCache(
                    file_hash=file_hash,
                    extraction_result=result,
                ))
                cache_db.commit()
                cache_db.close()
            except Exception:
                pass  # Non-critical — extraction still succeeds

        # ---- Phase 2: DB writes (fresh connection with retry) ----
        # Abort if client disconnected during extraction
        if cancel_event.is_set():
            return

        # Supabase PgBouncer can be temporarily overloaded after long extractions.
        fresh_db = None
        for attempt in range(3):
            try:
                fresh_db = SessionLocal()
                # Test the connection is alive
                fresh_db.execute(text("SELECT 1"))
                break
            except Exception as db_err:
                if fresh_db:
                    try:
                        fresh_db.close()
                    except Exception:
                        pass
                    fresh_db = None
                if attempt < 2:
                    import time as _time
                    wait = 2 ** (attempt + 1)  # 2s, 4s
                    print(f"DB connect failed (attempt {attempt+1}/3), retrying in {wait}s: {db_err}")
                    await asyncio.sleep(wait)
                else:
                    event = _json.dumps({"type": "error", "detail": "Database temporarily unavailable. Your extraction completed — please try uploading again."})
                    yield f"data: {event}\n\n"
                    return

        try:
            metadata = result["metadata"]
            resolved_title = title or metadata.get("title", "Untitled Script")
            resolved_author = author or metadata.get("author", "Unknown")
            resolved_description = description or metadata.get("synopsis")

            user_script = UserScript(
                user_id=user_id,
                title=resolved_title,
                author=resolved_author,
                description=resolved_description,
                original_filename=filename,
                file_type=file_ext,
                file_size_bytes=file_size,
                processing_status="processing",
                raw_text=result["raw_text"],
                characters=metadata.get("characters", []),
                genre=metadata.get("genre"),
                estimated_length_minutes=metadata.get("estimated_length_minutes"),
                num_characters=len(metadata.get("characters", [])),
            )
            fresh_db.add(user_script)

            # Increment monotonic upload counter (survives deletes for free-tier gating)
            user_row = fresh_db.query(User).filter(User.id == user_id).first()
            if user_row:
                user_row.total_scripts_uploaded = (user_row.total_scripts_uploaded or 0) + 1

            fresh_db.commit()
            fresh_db.refresh(user_script)

            play = Play(
                title=resolved_title,
                author=resolved_author,
                year_written=None,
                genre=user_script.genre or "Drama",
                category="contemporary",
                copyright_status="user_uploaded",
                license_type="user_content",
                source_url=None,
                full_text=result["raw_text"],
                text_format="plain"
            )
            fresh_db.add(play)
            fresh_db.commit()
            fresh_db.refresh(play)

            scenes_created = []
            for scene_data in result["scenes"]:
                from app.utils.duration import estimate_duration_seconds
                lines_count = len(scene_data.get("lines", []))
                all_line_text = "\n".join(line.get("text", "") for line in scene_data.get("lines", []))
                duration_seconds = estimate_duration_seconds(all_line_text)

                char1_info = next(
                    (c for c in user_script.characters if c.get("name") == scene_data.get("character_1")), {}
                )
                char2_info = next(
                    (c for c in user_script.characters if c.get("name") == scene_data.get("character_2")), {}
                )

                raw_setting = scene_data.get("setting")
                clean_setting = None if not raw_setting or raw_setting.strip().lower() == "unknown" else raw_setting

                scene = Scene(
                    play_id=play.id,
                    user_script_id=user_script.id,
                    title=scene_data.get("title", "Untitled Scene"),
                    description=scene_data.get("description"),
                    act=scene_data.get("act"),
                    scene_number=scene_data.get("scene_number"),
                    character_1_name=scene_data.get("character_1", "Character 1"),
                    character_2_name=scene_data.get("character_2", "Character 2"),
                    character_1_gender=char1_info.get("gender"),
                    character_2_gender=char2_info.get("gender"),
                    character_1_age_range=char1_info.get("age_range"),
                    character_2_age_range=char2_info.get("age_range"),
                    line_count=lines_count,
                    estimated_duration_seconds=duration_seconds,
                    setting=clean_setting,
                    difficulty_level="intermediate",
                    tone=scene_data.get("tone"),
                    primary_emotions=scene_data.get("primary_emotions", []),
                    relationship_dynamic=scene_data.get("relationship_dynamic"),
                    is_verified=False
                )
                fresh_db.add(scene)
                fresh_db.flush()

                original_lines = []
                for idx, line_data in enumerate(scene_data.get("lines", [])):
                    scene_line = SceneLine(
                        scene_id=scene.id,
                        line_order=idx,
                        character_name=line_data.get("character", "Unknown"),
                        text=line_data.get("text", ""),
                        stage_direction=line_data.get("stage_direction"),
                        word_count=len(line_data.get("text", "").split())
                    )
                    fresh_db.add(scene_line)
                    original_lines.append({
                        "line_order": idx,
                        "character_name": line_data.get("character", "Unknown"),
                        "text": line_data.get("text", ""),
                        "stage_direction": line_data.get("stage_direction"),
                    })

                scene.original_snapshot = {
                    "character_1_name": scene_data.get("character_1", "Character 1"),
                    "character_2_name": scene_data.get("character_2", "Character 2"),
                    "description": scene.description,
                    "lines": original_lines,
                }
                scenes_created.append(scene)

            user_script.num_scenes_extracted = len(scenes_created)
            user_script.processing_status = "completed"
            user_script.ai_extraction_completed = True
            fresh_db.commit()
            fresh_db.refresh(user_script)

            response_data = UserScriptDetailResponse(
                **UserScriptResponse.model_validate(user_script).model_dump(),
                scenes=[SceneInScriptResponse.model_validate(s) for s in scenes_created],
            ).model_dump()

            # Convert datetimes to strings for JSON serialization
            for key in ("created_at", "updated_at"):
                if response_data.get(key) and hasattr(response_data[key], "isoformat"):
                    response_data[key] = response_data[key].isoformat()

            event = _json.dumps({"type": "done", "data": response_data})
            yield f"data: {event}\n\n"

        except Exception as e:
            try:
                user_script.processing_status = "failed"
                user_script.processing_error = str(e)
                fresh_db.commit()
            except Exception:
                pass

            event = _json.dumps({"type": "error", "detail": str(e)})
            yield f"data: {event}\n\n"
        finally:
            fresh_db.close()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/from-text", response_model=UserScriptDetailResponse)
async def create_script_from_text(
    request: CreateScriptFromTextRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _gate: bool = Depends(require_script_upload()),
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

    # ---- Phase 1: Extract everything BEFORE touching DB ----
    try:
        parser = ScriptParser()
        result = parser.parse_script(text_bytes, "txt", "Pasted script.txt")
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to extract script: {str(e)}"
        )

    # ---- Phase 2: All DB writes happen quickly together ----
    # Close the stale session (idle during extraction) and get a fresh one.
    try:
        db.close()
    except Exception:
        pass  # Connection already gone — that's fine
    db = SessionLocal()

    metadata = result["metadata"]
    resolved_title = request.title or metadata.get("title", "Pasted Script")
    resolved_author = request.author or metadata.get("author", "Unknown")
    resolved_description = request.description or metadata.get("synopsis")

    user_script = UserScript(
        user_id=current_user.id,
        title=resolved_title,
        author=resolved_author,
        description=resolved_description,
        original_filename="Pasted script",
        file_type="txt",
        file_size_bytes=len(text_bytes),
        file_path=None,
        processing_status="processing",
        raw_text=result["raw_text"],
        characters=metadata.get("characters", []),
        genre=metadata.get("genre"),
        estimated_length_minutes=metadata.get("estimated_length_minutes"),
        num_characters=len(metadata.get("characters", [])),
    )
    db.add(user_script)

    # Increment monotonic upload counter (survives deletes for free-tier gating)
    current_user_fresh2 = db.query(User).filter(User.id == current_user.id).first()
    if current_user_fresh2:
        current_user_fresh2.total_scripts_uploaded = (current_user_fresh2.total_scripts_uploaded or 0) + 1

    db.commit()
    db.refresh(user_script)

    try:
        play = Play(
            title=resolved_title,
            author=resolved_author,
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
            from app.utils.duration import estimate_duration_seconds
            lines_count = len(scene_data.get("lines", []))
            all_line_text = "\n".join(line.get("text", "") for line in scene_data.get("lines", []))
            total_words = len(all_line_text.split())
            duration_seconds = estimate_duration_seconds(all_line_text)
            char1_info = next(
                (c for c in user_script.characters if c.get("name") == scene_data.get("character_1")),
                {},
            )
            char2_info = next(
                (c for c in user_script.characters if c.get("name") == scene_data.get("character_2")),
                {},
            )
            raw_setting = scene_data.get("setting")
            clean_setting = None if not raw_setting or raw_setting.strip().lower() == "unknown" else raw_setting

            scene = Scene(
                play_id=play.id,
                user_script_id=user_script.id,
                title=scene_data.get("title", "Untitled Scene"),
                description=scene_data.get("description"),
                act=scene_data.get("act"),
                scene_number=scene_data.get("scene_number"),
                character_1_name=scene_data.get("character_1", "Character 1"),
                character_2_name=scene_data.get("character_2", "Character 2"),
                character_1_gender=char1_info.get("gender"),
                character_2_gender=char2_info.get("gender"),
                character_1_age_range=char1_info.get("age_range"),
                character_2_age_range=char2_info.get("age_range"),
                line_count=lines_count,
                estimated_duration_seconds=duration_seconds,
                setting=clean_setting,
                difficulty_level="intermediate",
                tone=scene_data.get("tone"),
                primary_emotions=scene_data.get("primary_emotions", []),
                relationship_dynamic=scene_data.get("relationship_dynamic"),
                is_verified=False,
            )
            db.add(scene)
            db.flush()
            original_lines = []
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
                original_lines.append({
                    "line_order": idx,
                    "character_name": line_data.get("character", "Unknown"),
                    "text": line_data.get("text", ""),
                    "stage_direction": line_data.get("stage_direction"),
                })
            scene.original_snapshot = {
                "character_1_name": scene_data.get("character_1", "Character 1"),
                "character_2_name": scene_data.get("character_2", "Character 2"),
                "description": scene.description,
                "lines": original_lines,
            }
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
    from app.utils.duration import estimate_duration_seconds
    line_count = len(lines_list)
    all_line_text = "\n".join(l.get("text", "") for l in lines_list)
    total_words = len(all_line_text.split())
    duration_seconds = max(30, estimate_duration_seconds(all_line_text))

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

    original_lines = []
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
        original_lines.append({
            "line_order": idx,
            "character_name": line_data.get("character", "Unknown"),
            "text": text,
            "stage_direction": line_data.get("stage_direction"),
        })
    scene.original_snapshot = {
        "character_1_name": scene_data.get("character_1", "Character 1"),
        "character_2_name": scene_data.get("character_2", "Character 2"),
        "description": scene.description,
        "lines": original_lines,
    }

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

    if not scripts:
        return []

    # Batch-load all scenes in one query instead of N+1
    script_ids = [s.id for s in scripts]
    all_scenes = (
        db.query(Scene)
        .filter(Scene.user_script_id.in_(script_ids))
        .order_by(Scene.id)
        .all()
    )
    scenes_by_script: dict[int, list[Scene]] = {}
    for sc in all_scenes:
        scenes_by_script.setdefault(sc.user_script_id, []).append(sc)

    result = []
    for s in scripts:
        data = UserScriptResponse.model_validate(s).model_dump()
        scenes = scenes_by_script.get(s.id, [])
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

    # Delete all associated scenes and their dependencies
    scenes = db.query(Scene).filter(Scene.user_script_id == script_id).all()
    for scene in scenes:
        # Delete rehearsal line deliveries, then rehearsal sessions
        session_ids = [s.id for s in db.query(RehearsalSession).filter(RehearsalSession.scene_id == scene.id).all()]
        if session_ids:
            db.query(RehearsalLineDelivery).filter(RehearsalLineDelivery.session_id.in_(session_ids)).delete(synchronize_session=False)
            db.query(RehearsalSession).filter(RehearsalSession.scene_id == scene.id).delete(synchronize_session=False)
        # Delete scene favorites
        db.query(SceneFavorite).filter(SceneFavorite.scene_id == scene.id).delete(synchronize_session=False)
        # Delete scene lines
        db.query(SceneLine).filter(SceneLine.scene_id == scene.id).delete(synchronize_session=False)
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
    if update.play_title is not None and scene.play:
        scene.play.title = update.play_title
    if update.play_author is not None and scene.play:
        scene.play.author = update.play_author

    db.commit()

    return {"message": "Scene updated successfully"}


@router.patch("/{script_id}/scenes/{scene_id}/lines/reorder")
async def reorder_scene_lines(
    script_id: int,
    scene_id: int,
    request: LineReorderRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Reorder scene lines by providing the new order of line IDs"""
    script = db.query(UserScript).filter(
        UserScript.id == script_id,
        UserScript.user_id == current_user.id
    ).first()
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")

    lines = db.query(SceneLine).filter(SceneLine.scene_id == scene_id).all()
    line_map = {l.id: l for l in lines}

    for line_id in request.line_ids:
        if line_id not in line_map:
            raise HTTPException(status_code=400, detail=f"Line {line_id} not found in scene")

    for idx, line_id in enumerate(request.line_ids):
        line_map[line_id].line_order = idx

    db.commit()
    return {"message": "Lines reordered successfully"}


@router.post("/{script_id}/scenes/{scene_id}/lines/bulk-reset")
async def bulk_reset_scene(
    script_id: int,
    scene_id: int,
    request: BulkResetRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Reset a scene to a snapshot in a single transaction — replaces all scene data and lines."""
    script = db.query(UserScript).filter(
        UserScript.id == script_id,
        UserScript.user_id == current_user.id
    ).first()
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")

    scene = db.query(Scene).filter(Scene.id == scene_id, Scene.user_script_id == script_id).first()
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")

    # Update scene fields
    scene.title = request.title
    scene.description = request.description
    scene.character_1_name = request.character_1_name
    scene.character_2_name = request.character_2_name
    scene.setting = request.setting
    scene.context_before = request.context_before
    scene.context_after = request.context_after
    if request.play_title is not None and scene.play:
        scene.play.title = request.play_title
    if request.play_author is not None and scene.play:
        scene.play.author = request.play_author

    # Delete rehearsal line deliveries that reference these scene lines (FK constraint)
    line_ids = [row[0] for row in db.query(SceneLine.id).filter(SceneLine.scene_id == scene_id).all()]
    if line_ids:
        db.query(RehearsalLineDelivery).filter(
            RehearsalLineDelivery.scene_line_id.in_(line_ids)
        ).delete(synchronize_session=False)

    # Delete all existing lines
    db.query(SceneLine).filter(SceneLine.scene_id == scene_id).delete(synchronize_session=False)

    # Create new lines from snapshot
    for line_data in request.lines:
        db.add(SceneLine(
            scene_id=scene_id,
            line_order=line_data.line_order,
            character_name=line_data.character_name,
            text=line_data.text,
            stage_direction=line_data.stage_direction,
            word_count=len(line_data.text.split()),
        ))

    scene.line_count = len(request.lines)
    db.commit()

    return {"message": "Scene reset successfully"}


@router.post("/{script_id}/scenes/{scene_id}/reset-to-original")
async def reset_scene_to_original(
    script_id: int,
    scene_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reset a scene back to its original state (when first extracted/uploaded)."""
    script = db.query(UserScript).filter(
        UserScript.id == script_id,
        UserScript.user_id == current_user.id,
    ).first()
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")

    scene = db.query(Scene).filter(Scene.id == scene_id, Scene.user_script_id == script_id).first()
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")

    if not scene.original_snapshot:
        raise HTTPException(status_code=400, detail="No original snapshot available for this scene")

    snapshot = scene.original_snapshot

    # Restore character names and description
    scene.character_1_name = snapshot["character_1_name"]
    scene.character_2_name = snapshot["character_2_name"]
    scene.description = snapshot.get("description")  # None for old snapshots = clears AI-generated description

    # Delete rehearsal line deliveries that reference these scene lines (FK constraint)
    line_ids = [row[0] for row in db.query(SceneLine.id).filter(SceneLine.scene_id == scene_id).all()]
    if line_ids:
        db.query(RehearsalLineDelivery).filter(
            RehearsalLineDelivery.scene_line_id.in_(line_ids)
        ).delete(synchronize_session=False)

    # Delete all existing lines
    db.query(SceneLine).filter(SceneLine.scene_id == scene_id).delete(synchronize_session=False)

    # Recreate lines from snapshot
    for line_data in snapshot["lines"]:
        db.add(SceneLine(
            scene_id=scene_id,
            line_order=line_data["line_order"],
            character_name=line_data["character_name"],
            text=line_data["text"],
            stage_direction=line_data.get("stage_direction"),
            word_count=len(line_data["text"].split()),
        ))

    scene.line_count = len(snapshot["lines"])
    db.commit()

    return {"message": "Scene reset to original"}


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


@router.post("/{script_id}/scenes/{scene_id}/lines")
async def create_scene_line(
    script_id: int,
    scene_id: int,
    request: CreateSceneLineRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new line in a scene"""
    script = db.query(UserScript).filter(
        UserScript.id == script_id,
        UserScript.user_id == current_user.id
    ).first()
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")

    scene = db.query(Scene).filter(
        Scene.id == scene_id,
        Scene.user_script_id == script_id
    ).first()
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")

    existing_lines = db.query(SceneLine).filter(
        SceneLine.scene_id == scene_id
    ).order_by(SceneLine.line_order).all()

    # Determine insertion position
    if request.insert_after_line_id is not None:
        insert_idx = None
        for i, line in enumerate(existing_lines):
            if line.id == request.insert_after_line_id:
                insert_idx = i + 1
                break
        if insert_idx is None:
            raise HTTPException(status_code=400, detail="insert_after_line_id not found in scene")
        # Bump subsequent lines
        for line in existing_lines[insert_idx:]:
            line.line_order += 1
        new_order = insert_idx
    else:
        new_order = len(existing_lines)

    word_count = len(request.text.split())
    new_line = SceneLine(
        scene_id=scene_id,
        line_order=new_order,
        character_name=request.character_name,
        text=request.text,
        stage_direction=request.stage_direction,
        word_count=word_count,
    )
    db.add(new_line)

    # Update scene line_count
    scene.line_count = len(existing_lines) + 1

    db.commit()
    db.refresh(new_line)

    return {
        "id": new_line.id,
        "line_order": new_line.line_order,
        "character_name": new_line.character_name,
        "text": new_line.text,
        "stage_direction": new_line.stage_direction,
        "word_count": new_line.word_count,
        "primary_emotion": new_line.primary_emotion,
    }


@router.delete("/{script_id}/scenes/{scene_id}/lines/{line_id}")
async def delete_scene_line(
    script_id: int,
    scene_id: int,
    line_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a line from a scene"""
    script = db.query(UserScript).filter(
        UserScript.id == script_id,
        UserScript.user_id == current_user.id
    ).first()
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")

    line = db.query(SceneLine).filter(
        SceneLine.id == line_id,
        SceneLine.scene_id == scene_id
    ).first()
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")

    deleted_order = line.line_order
    db.delete(line)

    # Re-number subsequent lines
    subsequent = db.query(SceneLine).filter(
        SceneLine.scene_id == scene_id,
        SceneLine.line_order > deleted_order
    ).all()
    for sl in subsequent:
        sl.line_order -= 1

    # Update scene line_count
    scene = db.query(Scene).filter(Scene.id == scene_id).first()
    if scene:
        remaining = db.query(SceneLine).filter(SceneLine.scene_id == scene_id).count()
        scene.line_count = remaining

    db.commit()
    return {"message": "Line deleted successfully"}


@router.post("/{script_id}/scenes/{scene_id}/suggest-synopsis")
async def suggest_synopsis(
    script_id: int,
    scene_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Generate a synopsis suggestion for a scene using AI"""
    script = db.query(UserScript).filter(
        UserScript.id == script_id,
        UserScript.user_id == current_user.id
    ).first()
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")

    scene = db.query(Scene).filter(
        Scene.id == scene_id,
        Scene.user_script_id == script_id
    ).first()
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")

    sorted_lines = sorted(scene.lines, key=lambda l: l.line_order)
    script_text = "\n".join(
        [f"{l.character_name}{f' ({l.stage_direction})' if l.stage_direction else ''}: {l.text}" for l in sorted_lines[:20]]
    )

    from app.services.ai.langchain.config import get_llm
    from langchain_core.prompts import ChatPromptTemplate
    from langchain_core.output_parsers import StrOutputParser

    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are a theater expert. Write a brief, compelling synopsis for this scene. STRICT RULES: 1-2 sentences max, under 250 characters total. Be concise and evocative. Do not use quotes."),
        ("human", "Scene: {title}\nFrom: {play_title} by {author}\nCharacters: {char1} and {char2}\n\nDialogue:\n{script_text}")
    ])

    llm = get_llm(temperature=0.7)
    chain = prompt | llm | StrOutputParser()

    try:
        synopsis = chain.invoke({
            "title": scene.title,
            "play_title": (scene.play.title if scene.play else None) or script.title,
            "author": (scene.play.author if scene.play else None) or script.author,
            "char1": scene.character_1_name,
            "char2": scene.character_2_name,
            "script_text": script_text,
        })
        result = synopsis.strip()[:300]
        return {"synopsis": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate synopsis: {str(e)}")


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

    # Delete scene favorites
    db.query(SceneFavorite).filter(SceneFavorite.scene_id == scene_id).delete(synchronize_session=False)
    # Delete scene lines
    db.query(SceneLine).filter(SceneLine.scene_id == scene_id).delete(synchronize_session=False)

    # Delete scene
    db.delete(scene)

    # Update script scene count
    script.num_scenes_extracted -= 1

    db.commit()

    return {"message": "Scene deleted successfully"}


# ============================================================================
# Add Scene to Existing Script
# ============================================================================

@router.post("/{script_id}/scenes", response_model=SceneInScriptResponse)
async def add_scene_to_script(
    script_id: int,
    request: AddSceneToScriptRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Add a manually-entered scene to an existing script.
    Body format: one line per row, each as "CHARACTER: dialogue text".
    """
    import re

    # Verify ownership
    script = db.query(UserScript).filter(
        UserScript.id == script_id,
        UserScript.user_id == current_user.id
    ).first()
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")

    # Find the associated Play
    play = db.query(Play).filter(Play.id == db.query(Scene.play_id).filter(
        Scene.user_script_id == script_id
    ).limit(1).scalar_subquery()).first()

    # If no play exists yet (edge case: script with 0 scenes), create one
    if not play:
        play = Play(
            title=script.title,
            author=script.author,
            genre=script.genre or "Drama",
            category="contemporary",
            copyright_status="user_uploaded",
            license_type="user_content",
            text_format="plain",
        )
        db.add(play)
        db.commit()
        db.refresh(play)

    # Parse lines from body: "CHARACTER: text" format
    line_pattern = re.compile(r"^([A-Za-z][A-Za-z\s'.\-]*?):\s*(.+)$")
    parsed_lines = []
    for raw_line in request.body.strip().split("\n"):
        raw_line = raw_line.strip()
        if not raw_line:
            continue
        m = line_pattern.match(raw_line)
        if m:
            char_name = m.group(1).strip()
            text = m.group(2).strip()
            if text:
                parsed_lines.append({"character": char_name, "text": text})

    if len(parsed_lines) < 2:
        raise HTTPException(
            status_code=400,
            detail="Need at least 2 dialogue lines in CHARACTER: text format"
        )

    # Determine character_1 and character_2 (most frequent speakers)
    from collections import Counter
    char_counts = Counter(l["character"] for l in parsed_lines)

    if len(char_counts) < 2:
        raise HTTPException(
            status_code=400,
            detail="A scene needs at least 2 characters"
        )
    top_two = [name for name, _ in char_counts.most_common(2)]
    char_1 = top_two[0] if len(top_two) > 0 else "Character 1"
    char_2 = top_two[1] if len(top_two) > 1 else "Character 2"

    # Look up character info from script metadata
    char1_info = next((c for c in (script.characters or []) if c.get("name") == char_1), {})
    char2_info = next((c for c in (script.characters or []) if c.get("name") == char_2), {})

    # Estimate duration
    from app.utils.duration import estimate_duration_seconds
    all_text = "\n".join(l["text"] for l in parsed_lines)
    duration_seconds = estimate_duration_seconds(all_text)

    scene = Scene(
        play_id=play.id,
        user_script_id=script.id,
        title=request.title,
        description=request.description,
        act=request.act if request.act else None,
        scene_number=request.scene_number if request.scene_number else None,
        character_1_name=char_1,
        character_2_name=char_2,
        character_1_gender=char1_info.get("gender"),
        character_2_gender=char2_info.get("gender"),
        character_1_age_range=char1_info.get("age_range"),
        character_2_age_range=char2_info.get("age_range"),
        line_count=len(parsed_lines),
        estimated_duration_seconds=duration_seconds,
        setting=None,
        difficulty_level="intermediate",
        is_verified=False,
    )
    db.add(scene)
    db.flush()

    # Create scene lines
    original_lines = []
    for idx, line_data in enumerate(parsed_lines):
        scene_line = SceneLine(
            scene_id=scene.id,
            line_order=idx,
            character_name=line_data["character"],
            text=line_data["text"],
            word_count=len(line_data["text"].split()),
        )
        db.add(scene_line)
        original_lines.append({
            "line_order": idx,
            "character_name": line_data["character"],
            "text": line_data["text"],
        })

    scene.original_snapshot = {
        "character_1_name": char_1,
        "character_2_name": char_2,
        "description": scene.description,
        "lines": original_lines,
    }

    # Update script scene count
    script.num_scenes_extracted = (script.num_scenes_extracted or 0) + 1

    db.commit()
    db.refresh(scene)

    return SceneInScriptResponse.model_validate(scene)
