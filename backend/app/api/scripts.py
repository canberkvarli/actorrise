"""
API endpoints for user script management - upload, edit, manage scripts
"""

import asyncio
import json as _json
import threading
from datetime import datetime, timedelta
from queue import Queue, Empty
from typing import List, Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, text
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
    ScriptTag,
    ScriptTagVote,
    UserScript,
)
from app.services.script_tags import normalize_tag_list
from app.models.user import User
from app.services.character_names import canonicalize_scene_characters
from app.services.script_parser import PARSER_VERSION, ScriptParser

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
    is_sample: bool = False
    shared_with_community: bool = False
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
    # Screenplay action lands in this field now, and action runs long: the
    # montage opening Heidi Marshall's side is ~350 characters. At 120 an edit
    # to any such line was rejected outright.
    stage_direction: Optional[str] = Field(None, max_length=600)


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
    # Screenplay action lands in this field now, and action runs long: the
    # montage opening Heidi Marshall's side is ~350 characters. At 120 an edit
    # to any such line was rejected outright.
    stage_direction: Optional[str] = Field(None, max_length=600)
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


class ScannedScene(BaseModel):
    """One row of the scene map — what the picker is built from."""
    index: int
    act_label: Optional[str] = None
    scene_label: Optional[str] = None
    title: Optional[str] = None
    characters: List[str] = []
    line_count: int = 0
    char_start: int
    char_end: int
    page_start: Optional[int] = None
    page_end: Optional[int] = None


class ScriptScanResponse(BaseModel):
    """Quick scan results for pre-extraction choice dialog"""
    page_count: int
    has_structure: bool
    num_acts: int
    num_sections: int
    show_mode_choice: bool
    estimated_quick_seconds: int
    estimated_full_seconds: int
    # The map. Every scene in the file, whether or not it will be extracted —
    # what gets built is a separate, metered decision.
    scenes: List[ScannedScene] = []


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

    # Off the event loop. This function used to open the PDF inline in an
    # `async def`, which blocks the worker: nothing else was served, health
    # checks included, for as long as the parse took. On 2026-09-04 a full play
    # blocked it for 42 seconds, Render concluded the service was dead and
    # restarted the instance, and the upload died with it — reaching the browser
    # as "Failed to fetch". One person uploading Hamlet took the whole API down.
    return await run_in_threadpool(_scan_file, file_content, file_ext)


def _scan_file(file_content: bytes, file_ext: str) -> ScriptScanResponse:
    """The scan itself. Synchronous, and called from a worker thread."""
    from app.services.scene_map import build_scene_map, pages_for_span

    client = None
    try:
        from app.services.script_parser import ScriptParser

        client = ScriptParser().client
    except Exception:
        # No key, no client, no enrichment. The regex map still stands.
        client = None

    try:
        spans, offsets, raw_text = build_scene_map(file_content, file_ext, client=client)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {e}")

    if not raw_text or len(raw_text.strip()) < 100:
        raise HTTPException(status_code=400, detail="File appears to be empty or too short")

    scenes: List[ScannedScene] = []
    for i, span in enumerate(spans):
        page_start, page_end = pages_for_span(offsets, span.char_start, span.char_end)
        scenes.append(ScannedScene(
            index=i,
            act_label=span.act_label,
            scene_label=span.scene_label,
            title=span.title,
            characters=span.characters,
            line_count=span.line_count,
            char_start=span.char_start,
            char_end=span.char_end,
            page_start=page_start,
            page_end=page_end,
        ))

    has_structure = any(s.act_label or s.scene_label for s in spans)
    num_acts = len({s.act_label for s in spans if s.act_label})

    # Scenes worth extracting: two speakers and enough text to be a scene. The
    # count drives the time estimate; the full map above is what gets shown.
    dialogue_scenes = sum(
        1 for s in spans if len(s.characters) >= 2 and s.char_count >= 200
    )

    page_count = len(offsets.starts) if offsets.starts else max(1, len(raw_text) // 3000)

    if page_count <= 5:
        # Small scripts: single combined AI call (~5-10s)
        est_quick = 8
        est_full = 10
    else:
        base_time = 10  # metadata extraction
        est_quick = base_time + max(10, dialogue_scenes * 3)
        est_full = base_time + max(15, dialogue_scenes * 10)

    return ScriptScanResponse(
        page_count=page_count,
        has_structure=has_structure,
        num_acts=num_acts,
        num_sections=dialogue_scenes,
        show_mode_choice=has_structure and dialogue_scenes >= 8,
        estimated_quick_seconds=est_quick,
        estimated_full_seconds=est_full,
        scenes=scenes,
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
        # In a thread: parse_script is minutes of blocking work, and running it
        # inside the coroutine stops this worker serving anything else at all.
        result = await run_in_threadpool(
            parser.parse_script, file_content, file_ext, file.filename
        )
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
            # One person can be cued two ways in a script, and the declared name may
            # never appear as a cue at all. Reconcile before the scene is stored.
            scene_data = canonicalize_scene_characters(scene_data)
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
    extraction_completed = [False]  # flag to suppress false-positive disconnect log after success

    # Check extraction cache before releasing DB. A row from an older parser is
    # a miss — otherwise a deploy that fixes extraction keeps handing back the
    # results of the parser it replaced.
    cached_result = None
    try:
        cache_entry = db.query(ExtractionCache).filter(
            ExtractionCache.file_hash == file_hash,
            ExtractionCache.parser_version == PARSER_VERSION,
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
                if not extraction_completed[0]:
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

            # Store in extraction cache for future re-uploads. file_hash is
            # unique, so a stale row from an older parser is replaced rather
            # than left to collide.
            try:
                cache_db = SessionLocal()
                cache_db.query(ExtractionCache).filter(
                    ExtractionCache.file_hash == file_hash
                ).delete()
                cache_db.add(ExtractionCache(
                    file_hash=file_hash,
                    extraction_result=result,
                    parser_version=PARSER_VERSION,
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
                # One person can be cued two ways in a script, and the declared name may
                # never appear as a cue at all. Reconcile before the scene is stored.
                scene_data = canonicalize_scene_characters(scene_data)
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

            extraction_completed[0] = True
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
        result = await run_in_threadpool(
            parser.parse_script, text_bytes, "txt", "Pasted script.txt"
        )
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
            # One person can be cued two ways in a script, and the declared name may
            # never appear as a cue at all. Reconcile before the scene is stored.
            scene_data = canonicalize_scene_characters(scene_data)
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
    # See the loop sites above — same reconciliation for the single-scene path.
    scene_data = canonicalize_scene_characters(scene_data)
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


# A background extraction runs on a thread in the web process, so a deploy or a
# restart kills it and leaves the script reading itself forever. Nothing sweeps
# up after that, so the shelf does it on the way past. The row keeps its
# raw_text, which means "Redo scenes" finishes the job — no new machinery.
ABANDONED_EXTRACTION_MINUTES = 20


def _fail_abandoned_extractions(db: Session, user_id: int) -> None:
    stale = datetime.utcnow() - timedelta(minutes=ABANDONED_EXTRACTION_MINUTES)
    abandoned = db.query(UserScript).filter(
        UserScript.user_id == user_id,
        UserScript.processing_status == "processing",
        UserScript.created_at < stale,
    ).all()
    if not abandoned:
        return
    for script in abandoned:
        script.processing_status = "failed"
        script.processing_error = (
            "Reading this script stopped before it finished. Hit Redo scenes to pick it back up."
        )
    try:
        db.commit()
    except Exception:
        db.rollback()


@router.get("/", response_model=List[UserScriptResponse])
async def list_user_scripts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all scripts uploaded by the current user, plus sample scripts"""
    from sqlalchemy import or_
    _fail_abandoned_extractions(db, current_user.id)
    scripts = db.query(UserScript).filter(
        or_(
            UserScript.user_id == current_user.id,
            UserScript.is_sample == True,
        )
    ).order_by(UserScript.is_sample.desc(), UserScript.created_at.desc()).all()

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
    from sqlalchemy import or_
    script = db.query(UserScript).filter(
        UserScript.id == script_id,
        or_(
            UserScript.user_id == current_user.id,
            UserScript.is_sample == True,
        )
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


class ShareScriptRequest(BaseModel):
    shared: bool


@router.patch("/{script_id}/share", response_model=UserScriptResponse)
async def set_script_shared(
    script_id: int,
    body: ShareScriptRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Share/unshare an uploaded script with the Green Room community library.

    Sharing requires at least one scene — a room needs something to rehearse.
    Unshare is retroactive: it drops out of the community library immediately.
    """
    script = db.query(UserScript).filter(
        UserScript.id == script_id,
        UserScript.user_id == current_user.id,
    ).first()
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")

    if body.shared:
        scene_count = db.query(Scene).filter(Scene.user_script_id == script_id).count()
        if scene_count == 0:
            raise HTTPException(
                status_code=400,
                detail="This script has no scenes yet, so there's nothing to rehearse. Add a scene first.",
            )

    script.shared_with_community = bool(body.shared)
    db.commit()
    db.refresh(script)

    # Green Room → Callboard: "Maya shared a script with the community."
    if body.shared:
        from app.services.community import record_event
        record_event(int(current_user.id), "shared", title=script.title)

    return UserScriptResponse.model_validate(script)


# ---------------------------------------------------------------------------
# Tags on shared scripts — owner writes, community votes.
# See app/services/script_tags.py for why it is not an open folksonomy.
# ---------------------------------------------------------------------------


class ScriptTagResponse(BaseModel):
    id: int
    tag: str
    votes: int
    voted_by_me: bool = False


class SetTagsRequest(BaseModel):
    tags: List[str]


def _tags_for_scripts(
    db: Session, script_ids: List[int], viewer_id: Optional[int]
) -> dict[int, List[ScriptTagResponse]]:
    """Load tags + vote counts for many scripts in one pass.

    Batched deliberately: the community library renders a list, and a per-card
    query here would be an N+1 straight onto the hot path.
    """
    if not script_ids:
        return {}

    rows = (
        db.query(
            ScriptTag.id,
            ScriptTag.user_script_id,
            ScriptTag.tag,
            func.count(ScriptTagVote.id).label("votes"),
        )
        .outerjoin(ScriptTagVote, ScriptTagVote.script_tag_id == ScriptTag.id)
        .filter(ScriptTag.user_script_id.in_(script_ids))
        .group_by(ScriptTag.id, ScriptTag.user_script_id, ScriptTag.tag)
        .all()
    )

    mine: set[int] = set()
    if viewer_id:
        mine = {
            v.script_tag_id
            for v in db.query(ScriptTagVote.script_tag_id)
            .join(ScriptTag, ScriptTag.id == ScriptTagVote.script_tag_id)
            .filter(
                ScriptTagVote.user_id == viewer_id,
                ScriptTag.user_script_id.in_(script_ids),
            )
            .all()
        }

    out: dict[int, List[ScriptTagResponse]] = {}
    for tag_id, script_id, tag, votes in rows:
        out.setdefault(script_id, []).append(
            ScriptTagResponse(
                id=tag_id, tag=tag, votes=int(votes or 0),
                voted_by_me=tag_id in mine,
            )
        )
    # Most-upvoted first; ties alphabetical so ordering is stable between loads.
    for tags in out.values():
        tags.sort(key=lambda t: (-t.votes, t.tag))
    return out


@router.put("/{script_id}/tags", response_model=List[ScriptTagResponse])
async def set_script_tags(
    script_id: int,
    body: SetTagsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Replace the tags on your own script (owner only, max 8).

    Votes on tags that survive the edit are preserved — retagging shouldn't
    silently discard the community's signal. Votes on removed tags go with them.
    """
    script = db.query(UserScript).filter(
        UserScript.id == script_id,
        UserScript.user_id == current_user.id,
    ).first()
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")

    wanted = set(normalize_tag_list(body.tags))
    existing = db.query(ScriptTag).filter(ScriptTag.user_script_id == script_id).all()
    by_name = {t.tag: t for t in existing}

    for tag in existing:
        if tag.tag not in wanted:
            db.delete(tag)          # cascade drops its votes
    for name in wanted:
        if name not in by_name:
            db.add(ScriptTag(user_script_id=script_id, tag=name))

    db.commit()
    return _tags_for_scripts(db, [script_id], int(current_user.id)).get(script_id, [])


@router.post("/{script_id}/tags/{tag_id}/vote", response_model=ScriptTagResponse)
async def toggle_tag_vote(
    script_id: int,
    tag_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Toggle your upvote on a tag. Only on scripts shared with the community."""
    tag = db.query(ScriptTag).filter(
        ScriptTag.id == tag_id,
        ScriptTag.user_script_id == script_id,
    ).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    script = db.query(UserScript).filter(UserScript.id == script_id).first()
    if not script or not script.shared_with_community:
        # Not shared means not public, so its tags aren't votable either.
        raise HTTPException(status_code=404, detail="Tag not found")

    existing = db.query(ScriptTagVote).filter(
        ScriptTagVote.script_tag_id == tag_id,
        ScriptTagVote.user_id == current_user.id,
    ).first()
    if existing:
        db.delete(existing)
    else:
        db.add(ScriptTagVote(script_tag_id=tag_id, user_id=int(current_user.id)))
    db.commit()

    tags = _tags_for_scripts(db, [script_id], int(current_user.id)).get(script_id, [])
    found = next((t for t in tags if t.id == tag_id), None)
    if not found:
        raise HTTPException(status_code=404, detail="Tag not found")
    return found


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


def _build_scenes(db: Session, user_script, play_id: int, scenes_data: list) -> list:
    """Turn extracted scene dicts into Scene + SceneLine rows.

    Same shape as the block in the upload paths; those predate this helper and
    still carry their own copy.
    """
    from app.utils.duration import estimate_duration_seconds

    created = []
    for scene_data in scenes_data:
        # One person can be cued two ways in a script, and the declared name may
        # never appear as a cue at all. Reconcile before the scene is stored.
        scene_data = canonicalize_scene_characters(scene_data)
        lines = scene_data.get("lines", [])
        characters = user_script.characters or []

        def info(name):
            return next((c for c in characters if c.get("name") == name), {})

        char1 = info(scene_data.get("character_1"))
        char2 = info(scene_data.get("character_2"))
        raw_setting = scene_data.get("setting")
        clean_setting = (
            None if not raw_setting or raw_setting.strip().lower() == "unknown" else raw_setting
        )

        scene = Scene(
            play_id=play_id,
            user_script_id=user_script.id,
            title=scene_data.get("title", "Untitled Scene"),
            description=scene_data.get("description"),
            act=scene_data.get("act"),
            scene_number=scene_data.get("scene_number"),
            character_1_name=scene_data.get("character_1", "Character 1"),
            character_2_name=scene_data.get("character_2", "Character 2"),
            character_1_gender=char1.get("gender"),
            character_2_gender=char2.get("gender"),
            character_1_age_range=char1.get("age_range"),
            character_2_age_range=char2.get("age_range"),
            line_count=len(lines),
            estimated_duration_seconds=estimate_duration_seconds(
                "\n".join(l.get("text", "") for l in lines)
            ),
            setting=clean_setting,
            difficulty_level="intermediate",
            tone=scene_data.get("tone"),
            primary_emotions=scene_data.get("primary_emotions", []),
            relationship_dynamic=scene_data.get("relationship_dynamic"),
            is_verified=False,
        )
        db.add(scene)
        db.flush()

        snapshot = []
        for idx, line_data in enumerate(lines):
            db.add(SceneLine(
                scene_id=scene.id,
                line_order=idx,
                character_name=line_data.get("character", "Unknown"),
                text=line_data.get("text", ""),
                stage_direction=line_data.get("stage_direction"),
                word_count=len(line_data.get("text", "").split()),
            ))
            snapshot.append({
                "line_order": idx,
                "character_name": line_data.get("character", "Unknown"),
                "text": line_data.get("text", ""),
                "stage_direction": line_data.get("stage_direction"),
            })

        scene.original_snapshot = {
            "character_1_name": scene_data.get("character_1", "Character 1"),
            "character_2_name": scene_data.get("character_2", "Character 2"),
            "description": scene.description,
            "lines": snapshot,
        }
        created.append(scene)

    return created


# Background extractions that can still be stopped, by script id.
#
# The streaming upload has had a cancel_event since it was written — it notices
# the client going away and stops. The background path never had one, so Cancel
# on a full-length script was a button that did nothing: the request had already
# returned, and the thread behind it ran to completion no matter what. One
# instance, so a module-level registry is enough; a restart loses the handles,
# and a restart has already stopped the threads.
_EXTRACTION_CANCELS: dict = {}
_EXTRACTION_CANCELS_LOCK = threading.Lock()


def cancel_background_extraction(script_id: int) -> bool:
    """Ask a running extraction to stop. True if one was listening."""
    with _EXTRACTION_CANCELS_LOCK:
        event = _EXTRACTION_CANCELS.get(script_id)
    if event is None:
        return False
    event.set()
    return True


def extraction_outcome(created: list) -> tuple:
    """What a finished extraction should say about itself.

    A script with no scenes is not a finished script, and marking it "completed"
    is the difference between an actor who taps Redo and an actor who thinks the
    upload they paid for silently ate their play. Prod 2026-09-04: script 106
    came back empty, said completed, and offered nothing to do about it.

    The message points at Redo rather than re-uploading because the text is
    already stored — /reextract re-cuts from it for free.
    """
    if created:
        return ("completed", None)
    return (
        "failed",
        "I couldn't find any dialogue to cut into scenes. Try again, "
        "the script is saved so it costs you nothing.",
    )


def _extract_in_background(script_id: int, user_id: int, file_content: bytes,
                           file_ext: str, filename: str, mode: str, file_hash: str) -> None:
    """Finish reading a script after the request that uploaded it has gone."""
    db = SessionLocal()
    cancel_event = threading.Event()
    with _EXTRACTION_CANCELS_LOCK:
        _EXTRACTION_CANCELS[script_id] = cancel_event
    try:
        parser = ScriptParser()
        result = parser.parse_script(
            file_content, file_ext, filename, mode=mode, cancel_event=cancel_event
        )

        script = db.query(UserScript).filter(UserScript.id == script_id).first()
        if not script:
            return  # deleted while we were reading it

        # Cancelled while we were reading. Nothing is written: a half-read script
        # on the shelf is worse than no script, because it looks finished.
        if cancel_event.is_set():
            db.delete(script)
            db.commit()
            return

        metadata = result.get("metadata", {})
        script.raw_text = result.get("raw_text") or script.raw_text
        script.characters = metadata.get("characters", [])
        script.num_characters = len(script.characters or [])
        script.genre = metadata.get("genre") or script.genre
        script.estimated_length_minutes = metadata.get("estimated_length_minutes")
        if not script.description:
            script.description = metadata.get("synopsis")

        play = Play(
            title=script.title,
            author=script.author or "Unknown",
            genre=script.genre or "Drama",
            category="contemporary",
            copyright_status="user_uploaded",
            license_type="user_content",
            full_text=script.raw_text,
            text_format="plain",
        )
        db.add(play)
        db.flush()

        created = _build_scenes(db, script, play.id, result.get("scenes", []))
        script.num_scenes_extracted = len(created)
        script.ai_extraction_completed = True
        script.processing_status, script.processing_error = extraction_outcome(created)
        db.commit()

        try:
            db.query(ExtractionCache).filter(ExtractionCache.file_hash == file_hash).delete()
            db.add(ExtractionCache(
                file_hash=file_hash,
                extraction_result=result,
                parser_version=PARSER_VERSION,
            ))
            db.commit()
        except Exception:
            db.rollback()  # the script is safe; only the cache missed out
    except Exception as e:
        db.rollback()
        # A cancelled parse raises on its way out. That is not a failure the
        # actor needs told about — they asked for it — so the row goes rather
        # than sitting on the shelf marked "failed".
        try:
            script = db.query(UserScript).filter(UserScript.id == script_id).first()
            if script and cancel_event.is_set():
                db.delete(script)
                db.commit()
            elif script:
                script.processing_status = "failed"
                script.processing_error = str(e)[:500]
                db.commit()
        except Exception:
            pass
    finally:
        with _EXTRACTION_CANCELS_LOCK:
            _EXTRACTION_CANCELS.pop(script_id, None)
        db.close()


@router.post("/{script_id}/cancel-extraction")
async def cancel_extraction(
    script_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Stop reading a script, and take it back off the shelf.

    Cancel used to be wired to an AbortController that the background path never
    set, so on exactly the scripts long enough to want cancelling — the ones
    routed to background because they take minutes — the button did nothing and
    the work carried on.

    Deleting the row is the point. The actor cancelled: they should not be left
    with a half-read script that looks like a finished one.
    """
    script = db.query(UserScript).filter(
        UserScript.id == script_id,
        UserScript.user_id == current_user.id,
    ).first()
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")

    if script.processing_status not in ("processing", "pending", None):
        raise HTTPException(
            status_code=400,
            detail="That script has finished reading. Delete it instead.",
        )

    was_running = cancel_background_extraction(script_id)

    # Give back the upload the actor never got to keep.
    if (current_user.total_scripts_uploaded or 0) > 0:
        current_user.total_scripts_uploaded -= 1

    # Nothing has written scenes yet — extraction commits them in one go at the
    # end — so the row is all there is to remove. If the thread is mid-parse it
    # sees the cancel and stops; if it is between the parse and the commit, it
    # finds the row gone and bails on its own.
    db.delete(script)
    db.commit()

    return {"cancelled": True, "was_running": was_running}


@router.post("/upload-background", response_model=UserScriptDetailResponse)
async def upload_script_background(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    author: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    mode: Optional[str] = Form("full"),
    scenes: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _gate: bool = Depends(require_script_upload()),
):
    """Take the script now, read it after.

    A feature-length script takes minutes, and the streaming upload dies with
    the connection — refresh the tab and the work is gone. This stores the
    script's text, hands back a row that is visibly still being read, and
    finishes on a worker thread while the actor gets on with something else.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")
    file_ext = file.filename.split(".")[-1].lower()
    if file_ext not in ["pdf", "txt", "text"]:
        raise HTTPException(status_code=400, detail="Only PDF and TXT files are supported")

    file_content = await file.read()
    file_size = len(file_content)
    if file_size > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")

    import hashlib
    import threading

    # What the actor ticked in the picker. Absent means the whole file, which is
    # what an upload with no picker still sends.
    from app.services.scene_map import pages_for_selection

    picked_pages = None
    if scenes:
        try:
            picked = _json.loads(scenes)
            found = pages_for_selection(picked if isinstance(picked, list) else [])
            # An empty set means the scenes carried no page numbers — a TXT
            # upload — not that nothing was picked. Reading nothing would hand
            # back an empty script.
            picked_pages = found or None
        except (ValueError, TypeError):
            picked_pages = None

    parser = ScriptParser()
    try:
        # In a thread, like the others. This one was missed in the first pass and
        # is the same defect: pdfplumber over a full-length script, inline in an
        # `async def`, blocking every other request on the worker while it runs.
        raw_text = await run_in_threadpool(
            (lambda c: parser.extract_text_from_pdf(c, only_pages=picked_pages))
            if file_ext == "pdf"
            else parser.extract_text_from_txt,
            file_content,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {e}")
    if not raw_text or len(raw_text) < 100:
        raise HTTPException(status_code=400, detail="File appears to be empty or too short")

    from app.services.script_parser import _title_from_filename

    user_script = UserScript(
        user_id=current_user.id,
        title=title or _title_from_filename(file.filename),
        author=author or "Unknown",
        description=description,
        original_filename=file.filename,
        file_type=file_ext,
        file_size_bytes=file_size,
        processing_status="processing",
        raw_text=raw_text,
        characters=[],
        num_characters=0,
    )
    db.add(user_script)
    current_user.total_scripts_uploaded = (current_user.total_scripts_uploaded or 0) + 1
    db.commit()
    db.refresh(user_script)

    # Hand the thread the text we already read, not the file. Reading the PDF a
    # second time was pure waste — the same pdfplumber pass, over the same pages,
    # for the same result — and on a picked upload it would also have undone the
    # picking by reading the whole book again.
    threading.Thread(
        target=_extract_in_background,
        args=(user_script.id, current_user.id, raw_text.encode("utf-8"), "txt", file.filename,
              mode if mode in ("quick", "full") else "full",
              hashlib.sha256(file_content).hexdigest()),
        daemon=True,
    ).start()

    return UserScriptDetailResponse(
        **UserScriptResponse.model_validate(user_script).model_dump(),
        scenes=[],
    )


@router.post("/{script_id}/reextract", response_model=UserScriptDetailResponse)
async def reextract_script(
    script_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Have another go at the scenes.

    Scene division is the part of extraction that varies run to run, so an actor
    who gets a bad split has somewhere to go other than emailing us. This works
    from the stored text — the original upload isn't kept — so it re-cuts the
    scenes but can't re-read the PDF. A file that came out wrong at the page
    level needs re-uploading, which the parser-versioned cache now allows.

    Deliberately free: charging an upload for our bad extraction is the wrong
    signal, and the scenes it replaces were already paid for.
    """
    user_script = db.query(UserScript).filter(
        UserScript.id == script_id,
        UserScript.user_id == current_user.id,
    ).first()
    if not user_script:
        raise HTTPException(status_code=404, detail="Script not found")
    if not user_script.raw_text or len(user_script.raw_text) < 100:
        raise HTTPException(
            status_code=400,
            detail="There's no stored text for this script. Upload the file again instead.",
        )

    try:
        parser = ScriptParser()
        result = await run_in_threadpool(
            parser.parse_script,
            user_script.raw_text.encode("utf-8"),
            "txt",
            user_script.original_filename or f"script-{script_id}",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Re-extraction failed: {e}")

    old_scenes = db.query(Scene).filter(Scene.user_script_id == script_id).all()
    if not result.get("scenes"):
        # "the old ones were kept" is only true when there were old ones. Said to
        # someone retrying an empty script, it claims a safety net that isn't
        # there and hides the fact that nothing changed.
        raise HTTPException(
            status_code=422,
            detail=(
                "That pass found no rehearsable scenes, so the old ones were kept."
                if old_scenes
                else "That pass found no dialogue to cut. The script is still saved, "
                     "so you can try once more."
            ),
        )

    play_id = old_scenes[0].play_id if old_scenes else None
    if play_id is None:
        play = Play(
            title=user_script.title,
            author=user_script.author or "Unknown",
            genre=user_script.genre or "Drama",
            category="contemporary",
            copyright_status="user_uploaded",
            license_type="user_content",
            full_text=user_script.raw_text,
            text_format="plain",
        )
        db.add(play)
        db.flush()
        play_id = play.id

    scene_ids = [s.id for s in old_scenes]
    if scene_ids:
        db.query(SceneLine).filter(SceneLine.scene_id.in_(scene_ids)).delete(
            synchronize_session=False
        )
        db.query(Scene).filter(Scene.id.in_(scene_ids)).delete(
            synchronize_session=False
        )

    metadata = result.get("metadata", {})
    user_script.characters = metadata.get("characters", user_script.characters)
    user_script.num_characters = len(user_script.characters or [])
    created = _build_scenes(db, user_script, play_id, result["scenes"])
    user_script.num_scenes_extracted = len(created)
    # A re-cut that works has to clear the mark the failure left, or the script
    # stays branded "failed" on the shelf while its scenes sit underneath, and
    # the actor keeps being offered a retry for a problem they already solved.
    user_script.processing_status, user_script.processing_error = extraction_outcome(created)
    db.commit()
    db.refresh(user_script)

    scenes = db.query(Scene).filter(Scene.user_script_id == script_id).all()
    return UserScriptDetailResponse(
        **UserScriptResponse.model_validate(user_script).model_dump(),
        scenes=[SceneInScriptResponse.model_validate(s) for s in scenes],
    )


@router.delete("/dev/clear-extraction-cache")
async def dev_clear_extraction_cache(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """DEV ONLY: Clears the entire extraction cache so scripts get re-extracted on next upload."""
    deleted = db.query(ExtractionCache).delete()
    db.commit()
    return {"deleted": deleted}
