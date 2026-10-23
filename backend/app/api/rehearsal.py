"""ScenePartner v2. Three jobs, none in the loop: hand out the scene and its
audio, start a run, take the journal. Nothing here is called between one line
and the next; see docs/superpowers/specs/2026-10-12-scenepartner-v2-design.md.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.config import settings
from app.core.database import SessionLocal, get_db
from app.middleware.burst_limiter import BurstLimiter
from app.middleware.rate_limiting import require_scene_partner
from app.models.actor import Scene, UserScript
from app.models.rehearsal import PartnerAudio
from app.models.user import User
from app.services.events import record_user_event
from app.services.guided_scene import GUIDED_ACTOR, guided_scene
from app.services.rehearsal import journal, partner_audio
from app.services.rehearsal.access import assert_can_rehearse, can_direct_partner
from app.services.rehearsal.contract import RehearsalLine, lines_for, same_character
from app.services.rehearsal.delivery import MAX_DIRECTOR_NOTE, LineVoice, SceneVoicing, clean_note, scene_voicing
from app.services.rehearsal.voices import VOICES, default_voices, voice_by_id

router = APIRouter(prefix="/api/rehearsal", tags=["rehearsal"])

# require_scene_partner is a factory. Build the gate once so a test can
# override this one object the way scenes.py's callers cannot.
SCENE_PARTNER_GATE = require_scene_partner(increment=True)


# ── scene ────────────────────────────────────────────────────────────────────

def _load_scene(db: Session, scene_id: int, user: User) -> tuple[Scene, UserScript | None]:
    scene = db.get(Scene, scene_id)
    if scene is None:
        raise HTTPException(status_code=404, detail="Scene not found")
    script = db.get(UserScript, scene.user_script_id) if scene.user_script_id else None
    if script is not None and script.user_id != user.id and not script.is_sample:
        raise HTTPException(status_code=404, detail="Scene not found")
    return scene, script


def _voicing(db: Session, scene: Scene, lines: list[RehearsalLine], enrich: bool = False) -> SceneVoicing:
    """The acting notes and character readings the partner's voice is built
    from. Only opening the scene (GET /scenes, GET /scenes/{id}/voices) may
    make them, one model call stored on the scene; every other route reads
    what is there. POST /audio comes in four at a time per line, and four
    parallel model calls for one scene (or forty, if the model were down) is
    exactly what the notes were stored to avoid."""
    return scene_voicing(db, scene, lines, enrich=enrich)


def _audio_plan(lines: list[RehearsalLine], actor: str, voices: dict[str, str],
                voicing: SceneVoicing) -> list[tuple[int, str, LineVoice]]:
    """(line index, voice, what to say and how) for every partner line, in order."""
    out = []
    for line in lines:
        if same_character(line.character, actor):
            continue
        voice = next((v for c, v in voices.items() if same_character(c, line.character)), None) or VOICES[0].id
        out.append((line.index, voice, voicing.line_voice(line)))
    return out


def schedule_synthesis(keys: list[str], line_for: dict[str, LineVoice]) -> None:
    """Runs in a BackgroundTask with its own session: the request is long gone."""
    db = SessionLocal()
    try:
        partner_audio.synthesise_pending(db, keys, line_for)
    finally:
        db.close()


def _wants_synthesis(row: PartnerAudio, now: datetime) -> bool:
    """Pending rows always; failed rows once FAILED_RETRY has passed. A fresh
    failure waits, or for the admin regenerate path."""
    return row.status == "pending" or partner_audio.retryable(row, now)


@router.get("/scenes/{scene_id}")
def get_rehearsal_scene(
    scene_id: int,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    scene, script = _load_scene(db, scene_id, user)
    lines = lines_for(db, scene.id)
    characters = []
    for line in lines:
        if not any(same_character(line.character, c) for c in characters):
            characters.append(line.character)

    # Defaults for whichever part the actor picks, and the audio slots for the
    # part the extractor calls character 1 (the common pick). Audio for another
    # pick, or another voice, comes through GET /audio/{key} as it is needed.
    voicing = _voicing(db, scene, lines, enrich=True)
    defaults = {c: default_voices(scene, lines, c, voicing.characters) for c in characters}
    first = scene.character_1_name if any(same_character(scene.character_1_name or "", c) for c in characters) else characters[0] if characters else ""
    plan = _audio_plan(lines, first, defaults.get(first, {}), voicing) if first else []

    # One pass over the lines to make sure every row exists, one query for the
    # rows, one storage call for the URLs. A scene used to sign each ready
    # line on its own round trip, which is what made a long scene slow to open.
    # The cap is read once for the whole scene, not once a line.
    capped = partner_audio.over_cap(db) if plan else False
    key_for: dict[int, str] = {}
    line_for: dict[str, LineVoice] = {}
    for index, voice, spec in plan:
        key = partner_audio.ensure_for(db, voice, spec, capped)
        key_for[index] = key
        line_for[key] = spec
    db.commit()
    keys = list(dict.fromkeys(key_for.values()))  # two identical lines share a key
    rows = {r.key: r for r in db.query(PartnerAudio).filter(PartnerAudio.key.in_(keys))} if keys else {}
    ready_paths = list(dict.fromkeys(r.storage_path for r in rows.values() if r.status == "ready" and r.storage_path))
    urls = partner_audio.signed_urls(ready_paths) if ready_paths else {}
    audio: dict[str, dict[str, Any]] = {}
    for index, key in key_for.items():
        row = rows.get(key)
        path = row.storage_path if row is not None and row.status == "ready" else None
        audio[str(index)] = {"key": key, "url": urls.get(path) if path else None}
    now = datetime.now(timezone.utc)
    missing = [k for k in keys if k in rows and _wants_synthesis(rows[k], now)]
    if missing:
        background.add_task(schedule_synthesis, missing, {k: line_for[k] for k in missing})

    return {
        "scene": {
            "id": scene.id, "title": scene.title, "act": scene.act, "scene_number": scene.scene_number,
            "play_title": scene.play.title if scene.play else (script.title if script else None),
            "is_library": bool(scene.is_library),
        },
        "lines": [l.model_dump() for l in lines],
        "characters": characters,
        "voices": _voice_list(),
        "defaults": defaults,
        "vendor": settings.partner_tts_vendor,
        # The actor's own note on a part ("make him meaner") is Plus. The
        # field shows for everyone; this says whether it is open.
        "can_direct": can_direct_partner(db, user),
        "note_max": MAX_DIRECTOR_NOTE,
        "audio": audio,
        "resume": journal.resumable(db, user.id, scene.id),
    }


def _voice_list() -> list[dict[str, Any]]:
    """The voices, each with the static sample the run setup plays (a few
    seconds, made once by scripts/make_voice_samples.py, in public/voices)."""
    return [
        {"id": v.id, "label": v.label, "gender": v.gender,
         "sample": f"/voices/{v.id.lower()}.mp3" if v.vendor == "gemini" else None}
        for v in VOICES
    ]


@router.get("/scenes/{scene_id}/voices")
def get_scene_voices(scene_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """The voices and every part's default voice, without the audio. The
    scene preview casts from this, so the voice it shows is the one the run
    will use (the defaults come from the character reading)."""
    scene, _ = _load_scene(db, scene_id, user)
    lines = lines_for(db, scene.id)
    voicing = _voicing(db, scene, lines, enrich=True)
    characters: list[str] = []
    for line in lines:
        if not any(same_character(line.character, c) for c in characters):
            characters.append(line.character)
    return {
        "voices": _voice_list(),
        "defaults": {c: default_voices(scene, lines, c, voicing.characters) for c in characters},
        "can_direct": can_direct_partner(db, user),
        "note_max": MAX_DIRECTOR_NOTE,
    }


# ── audio ────────────────────────────────────────────────────────────────────

class AudioFor(BaseModel):
    scene_id: int
    line_index: int
    voice: str
    # The actor's note for this line's character. Plus only: from anyone else
    # it is dropped here, so the line is voiced (and cached) without it.
    note: str | None = Field(default=None, max_length=1000)


def _known_voices(scene, lines, actor: str, chosen: dict, db: Session) -> dict:
    """The part defaults, with the actor's choices laid over them where the
    choice is still a voice we have. A run opened before the partner moved to
    Gemini carries OpenAI ids, and so does a browser that remembers them; those
    fall back to the default rather than failing the run."""
    voices = default_voices(scene, lines, actor, _voicing(db, scene, lines).characters)
    voices.update({c: v for c, v in (chosen or {}).items() if voice_by_id(v) is not None})
    return voices


@router.post("/audio")
def audio_for_line(
    req: AudioFor,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """The key (and URL if ready) for one line in one voice. Used after a voice
    switch, with a note, or for a part other than character 1. Queues
    synthesis if missing."""
    scene, _ = _load_scene(db, req.scene_id, user)
    lines = lines_for(db, scene.id)
    if not 0 <= req.line_index < len(lines):
        raise HTTPException(status_code=404, detail="No such line")
    line = lines[req.line_index]
    voice = req.voice
    if voice_by_id(voice) is None:
        # A voice from before the vendor changed ("ash", "coral"), kept in the
        # browser or on an open run. Refusing it stopped the whole run on
        # "A partner line could not load"; the part's own default is better.
        voice = _known_voices(scene, lines, "", {}, db).get(line.character) or VOICES[0].id
    note = clean_note(req.note)
    if note and not can_direct_partner(db, user):
        note = ""
    spec = _voicing(db, scene, lines).line_voice(line, note)
    key = partner_audio.ensure_for(db, voice, spec, partner_audio.over_cap(db))
    db.commit()
    row = db.get(PartnerAudio, key)
    if row.status == "ready" and row.storage_path:
        return {"key": key, "url": partner_audio.signed_url(row.storage_path)}
    if _wants_synthesis(row, datetime.now(timezone.utc)):
        background.add_task(schedule_synthesis, [key], {key: spec})
    return {"key": key, "url": None}


@router.get("/audio/{key}")
def get_audio(key: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    row = db.get(PartnerAudio, key)
    if row is None:
        raise HTTPException(status_code=404, detail="Unknown line")
    if row.status == "ready" and row.storage_path:
        return {"key": key, "url": partner_audio.signed_url(row.storage_path)}
    if row.status == "failed":
        raise HTTPException(status_code=502, detail="This line could not be synthesised")
    return Response(status_code=202)


# ── runs ─────────────────────────────────────────────────────────────────────

class StartRun(BaseModel):
    scene_id: int
    character: str
    voices: dict[str, str] = Field(default_factory=dict)


@router.post("/runs")
def start_run(
    req: StartRun,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _meter: bool = Depends(SCENE_PARTNER_GATE),
    _burst: bool = Depends(BurstLimiter("scene_partner")),
):
    """A metered, tier-checked run. Whether a run is guided is never the
    client's call: that is POST /runs/guided."""
    scene, script = _load_scene(db, req.scene_id, user)
    assert_can_rehearse(db, user, scene, script)
    lines = lines_for(db, scene.id)
    if not any(same_character(l.character, req.character) for l in lines):
        raise HTTPException(status_code=422, detail="That character has no lines in this scene")
    voices = _known_voices(scene, lines, req.character, req.voices, db)
    run = journal.create_run(db, user.id, scene.id, req.character, voices, is_guided=False)
    return {"run_id": run.id, "voices": voices}


@router.post("/runs/guided")
def start_guided_run(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _burst: bool = Depends(BurstLimiter("scene_partner")),
):
    """The guided first run: the server picks the scene and the part. No meter
    and no tier check, like the start-guided route it replaces."""
    scene = guided_scene(db)
    if scene is None:
        raise HTTPException(status_code=404, detail="The guided scene is not seeded")
    lines = lines_for(db, scene.id)
    voices = default_voices(scene, lines, GUIDED_ACTOR, _voicing(db, scene, lines).characters)
    run = journal.create_run(db, user.id, scene.id, GUIDED_ACTOR, voices, is_guided=True)
    # Answering IS seeing the first rehearsal. This flag is what stops the hub
    # inviting again (lib/guided-invite reads it); has_ever_rehearsed is
    # computed from the meter, which this route deliberately does not touch.
    user.has_seen_first_rehearsal = True
    db.commit()
    record_user_event(user.id, "guided_scene_started", {"platform": "web"})
    return {"run_id": run.id, "scene_id": scene.id, "character": GUIDED_ACTOR, "voices": voices}


@router.post("/runs/{run_id}/resume")
def resume_run(
    run_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _burst: bool = Depends(BurstLimiter("scene_partner")),
):
    """Pick an open run up where it stopped. The run was paid for when it was
    opened, so there is no meter and no tier check here: resuming is not a
    second session. 404 for a run that is not the actor's, is closed, or is
    older than the resume window (the same tests GET /scenes applies before
    it offers the run)."""
    run = journal.db_run(db, run_id)
    if run is None or run.user_id != user.id or journal.is_closed(db, run_id) or not journal.in_resume_window(run):
        raise HTTPException(status_code=404, detail="Run not found")
    scene, _ = _load_scene(db, run.scene_id, user)
    voices = _known_voices(scene, lines_for(db, scene.id), run.character, run.voices or {}, db)
    return {
        "run_id": run.id, "scene_id": run.scene_id, "character": run.character, "voices": voices,
        "line_index": journal.furthest_line(db, run_id) or 0,
    }


@router.post("/runs/{run_id}/events", status_code=204)
async def append_events(
    run_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Fire-and-forget from the client. Parses the raw body so sendBeacon's
    text/plain is accepted. Never returns a body: the client never reads it."""
    raw = await request.body()
    try:
        body = json.loads(raw or b"{}")
    except ValueError:
        return Response(status_code=204)
    events = body.get("events") if isinstance(body, dict) else None
    if not isinstance(events, list):
        return Response(status_code=204)
    events = events[:500]
    try:
        journal.append(db, run_id, user.id, events)
    except PermissionError:
        raise HTTPException(status_code=404, detail="Run not found")
    if any(isinstance(e, dict) and e.get("type") == "completed" for e in events):
        run = journal.db_run(db, run_id)
        if run is not None and run.is_guided:
            record_user_event(user.id, "guided_scene_finished", {"lines_heard": journal.furthest_line(db, run_id)})
    return Response(status_code=204)


@router.get("/runs")
def list_runs(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return journal.summaries(db, user.id)


@router.get("/stats")
def run_stats(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return journal.stats(db, user.id)


@router.get("/guided")
def guided(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Which scene and which part the guided first run uses."""
    scene = guided_scene(db)
    if scene is None:
        raise HTTPException(status_code=404, detail="The guided scene is not seeded")
    return {"scene_id": scene.id, "character": GUIDED_ACTOR}
