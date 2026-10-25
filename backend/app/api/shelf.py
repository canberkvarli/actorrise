"""The scene shelf: browse two-person scenes, share one of yours, take one into rehearsal.

Rows are pointers (app/models/shelf.py). A public-domain scene's lines are cut
from the play only when an actor presses Rehearse, and copied into that actor's
own scripts, where the rehearsal room already knows how to read them. A shared
scene's text never leaves the script it came from: another actor brings their
own copy.
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session, undefer

from app.api.auth import get_current_user
from app.core.database import get_db
from app.models.actor import Play, Scene, UserScript
from app.models.shelf import ShelfScene, WORK_KINDS
from app.models.user import User
from app.services import shelf_labels

router = APIRouter(prefix="/api/shelf", tags=["shelf"])

PAIRINGS = {"mf": ("male", "female"), "ff": ("female", "female"), "mm": ("male", "male")}
#: Seconds. short is a class exercise, long is a showcase scene.
LENGTHS = {"short": (0, 120), "medium": (120, 210), "long": (210, 100_000)}
#: The filename a shelf copy carries in the actor's scripts, so a second press
#: of Rehearse finds the first copy instead of making another.
COPY_FILENAME = "shelf-{id}.txt"


def _first_name(user: Optional[User]) -> Optional[str]:
    name = (getattr(user, "name", None) or "").strip()
    return name.split()[0] if name else None


def serialize(row: ShelfScene, viewer: User, sharer: Optional[User] = None) -> dict:
    mine = row.shared_by_user_id is not None and row.shared_by_user_id == viewer.id
    return {
        "id": row.id,
        "kind": row.kind,
        "status": row.status,
        "title": row.title,
        "description": row.description,
        "work_title": row.work_title,
        "work_kind": row.work_kind,
        "author": row.author,
        "year": row.year,
        "era": row.era,
        "where": row.where_in_work,
        "characters": [
            {"name": row.character_1_name, "gender": row.character_1_gender, "age": row.character_1_age_range},
            {"name": row.character_2_name, "gender": row.character_2_gender, "age": row.character_2_age_range},
        ],
        "duration_seconds": row.duration_seconds,
        "line_count": row.line_count,
        "tone": row.tone,
        "open_count": row.open_count or 0,
        "shared_by": _first_name(sharer) if (sharer and row.show_name) else None,
        "is_mine": mine,
    }


def _pairing_filter(query, pairing: str):
    a, b = PAIRINGS[pairing]

    def g(col, want):
        return or_(col == want, col == "any", col.is_(None))

    return query.filter(or_(
        (g(ShelfScene.character_1_gender, a)) & (g(ShelfScene.character_2_gender, b)),
        (g(ShelfScene.character_1_gender, b)) & (g(ShelfScene.character_2_gender, a)),
    ))


@router.get("")
def list_shelf(
    pairing: Optional[str] = None,
    age: Optional[str] = None,
    length: Optional[str] = None,
    tone: Optional[str] = None,
    era: Optional[str] = None,
    kind: Optional[str] = None,
    q: Optional[str] = None,
    offset: int = 0,
    limit: int = 30,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(ShelfScene).filter(ShelfScene.status == "live")
    if pairing in PAIRINGS:
        query = _pairing_filter(query, pairing)
    if age in shelf_labels.AGES and age != "any":
        query = query.filter(or_(
            ShelfScene.character_1_age_range.in_([age, "any"]),
            ShelfScene.character_2_age_range.in_([age, "any"]),
        ))
    if length in LENGTHS:
        lo, hi = LENGTHS[length]
        query = query.filter(ShelfScene.duration_seconds >= lo, ShelfScene.duration_seconds < hi)
    if tone in shelf_labels.TONES:
        query = query.filter(ShelfScene.tone == tone)
    if era in ("classical", "modern"):
        query = query.filter(ShelfScene.era == era)
    if kind in ("public_domain", "shared"):
        query = query.filter(ShelfScene.kind == kind)
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(or_(
            ShelfScene.title.ilike(like),
            ShelfScene.work_title.ilike(like),
            ShelfScene.author.ilike(like),
            ShelfScene.character_1_name.ilike(like),
            ShelfScene.character_2_name.ilike(like),
        ))
    total = query.count()
    limit = max(1, min(limit, 60))
    # Shared scenes first: what actors brought is the reason the shelf grows.
    rows = (
        query.order_by(
            (ShelfScene.kind == "shared").desc(),
            ShelfScene.open_count.desc(),
            ShelfScene.id,
        )
        .offset(max(0, offset))
        .limit(limit)
        .all()
    )
    sharer_ids = {r.shared_by_user_id for r in rows if r.shared_by_user_id}
    sharers = {u.id: u for u in db.query(User).filter(User.id.in_(sharer_ids)).all()} if sharer_ids else {}
    return {
        "items": [serialize(r, current_user, sharers.get(r.shared_by_user_id)) for r in rows],
        "total": total,
    }


def _my_scenes(db: Session, user: User):
    return (
        db.query(Scene, UserScript)
        .join(UserScript, Scene.user_script_id == UserScript.id)
        .filter(
            UserScript.user_id == user.id,
            UserScript.is_sample.is_(False),
            UserScript.is_guided.is_(False),
            # A copy taken from the shelf is the shelf's already.
            ~UserScript.original_filename.like("shelf-%"),
        )
    )


@router.get("/shareable")
def shareable(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Scenes from the actor's own uploads, and which of them are on the shelf."""
    shared = {
        r.source_scene_id
        for r in db.query(ShelfScene.source_scene_id).filter(ShelfScene.shared_by_user_id == current_user.id)
    }
    out = []
    for scene, script in _my_scenes(db, current_user).order_by(Scene.id.desc()).limit(200):
        out.append({
            "scene_id": scene.id,
            "title": scene.title,
            "script_title": script.title,
            "characters": [
                {"name": scene.character_1_name, "gender": scene.character_1_gender, "age": scene.character_1_age_range},
                {"name": scene.character_2_name, "gender": scene.character_2_gender, "age": scene.character_2_age_range},
            ],
            "duration_seconds": scene.estimated_duration_seconds,
            "line_count": scene.line_count,
            "tone": scene.tone,
            "description": scene.description,
            "already_shared": scene.id in shared,
        })
    return {"items": out}


class ShareIn(BaseModel):
    scene_id: int
    work_title: str = Field(min_length=1, max_length=200)
    work_kind: str = "play"
    author: Optional[str] = Field(default=None, max_length=200)
    year: Optional[int] = None
    where: str = Field(min_length=1, max_length=200)
    title: Optional[str] = Field(default=None, max_length=200)
    description: Optional[str] = Field(default=None, max_length=600)
    tone: Optional[str] = None
    genders: Optional[List[str]] = None
    ages: Optional[List[str]] = None
    show_name: bool = False


def _two(values, allowed, fallback):
    values = list(values or [])[:2]
    while len(values) < 2:
        values.append(None)
    return [v if v in allowed else f for v, f in zip(values, fallback)]


@router.post("/share")
def share(body: ShareIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Put a pointer to one of the actor's own scenes on the shelf. No text is copied."""
    found = _my_scenes(db, current_user).filter(Scene.id == body.scene_id).first()
    if not found:
        raise HTTPException(status_code=404, detail="That scene isn't one of yours.")
    scene, _script = found
    if body.work_kind not in WORK_KINDS:
        raise HTTPException(status_code=400, detail="work_kind is play, film or tv.")
    existing = db.query(ShelfScene).filter(ShelfScene.source_scene_id == scene.id).first()
    if existing:
        return serialize(existing, current_user, current_user)

    genders = _two(body.genders, shelf_labels.GENDERS, [scene.character_1_gender or "any", scene.character_2_gender or "any"])
    ages = _two(body.ages, shelf_labels.AGES, [scene.character_1_age_range or "any", scene.character_2_age_range or "any"])
    tone = body.tone if body.tone in shelf_labels.TONES else (scene.tone if scene.tone in shelf_labels.TONES else None)
    row = ShelfScene(
        kind="shared",
        status="live",
        work_title=body.work_title.strip(),
        work_kind=body.work_kind,
        author=(body.author or "").strip() or None,
        year=body.year,
        era="modern" if body.work_kind != "play" or not body.year or body.year >= shelf_labels.MODERN_FROM else "classical",
        shared_by_user_id=current_user.id,
        source_scene_id=scene.id,
        show_name=body.show_name,
        where_in_work=body.where.strip(),
        title=(body.title or scene.title or "Untitled scene").strip()[:200],
        description=(body.description or scene.description or "").strip() or None,
        character_1_name=scene.character_1_name[:80],
        character_2_name=scene.character_2_name[:80],
        character_1_gender=genders[0],
        character_2_gender=genders[1],
        character_1_age_range=ages[0],
        character_2_age_range=ages[1],
        duration_seconds=scene.estimated_duration_seconds,
        line_count=scene.line_count,
        tone=tone,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return serialize(row, current_user, current_user)


@router.get("/mine")
def mine(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """What the actor has shared, and how many actors opened it. One share makes a contributor."""
    rows = (
        db.query(ShelfScene)
        .filter(ShelfScene.shared_by_user_id == current_user.id)
        .order_by(ShelfScene.id.desc())
        .all()
    )
    return {
        "contributor": bool(rows),
        "opens": sum(r.open_count or 0 for r in rows),
        "items": [serialize(r, current_user, current_user) for r in rows],
    }


@router.delete("/{shelf_id}")
def withdraw(shelf_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.query(ShelfScene).get(shelf_id)
    if not row or (row.shared_by_user_id != current_user.id and not current_user.is_moderator):
        raise HTTPException(status_code=404, detail="Not found")
    if row.kind != "shared":
        raise HTTPException(status_code=400, detail="Library scenes are hidden, not withdrawn.")
    db.delete(row)
    db.commit()
    return {"ok": True}


class StatusIn(BaseModel):
    status: str


@router.patch("/{shelf_id}/status")
def set_status(shelf_id: int, body: StatusIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not current_user.is_moderator:
        raise HTTPException(status_code=403, detail="Moderators only")
    if body.status not in ("live", "hidden"):
        raise HTTPException(status_code=400, detail="status is live or hidden")
    row = db.query(ShelfScene).get(shelf_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    row.status = body.status
    db.commit()
    return serialize(row, current_user)


def _copy_for(db: Session, user: User, row: ShelfScene) -> Optional[Scene]:
    return (
        db.query(Scene)
        .join(UserScript, Scene.user_script_id == UserScript.id)
        .filter(UserScript.user_id == user.id, UserScript.original_filename == COPY_FILENAME.format(id=row.id))
        .order_by(Scene.id)
        .first()
    )


def copy_public_domain(db: Session, user: User, row: ShelfScene) -> Scene:
    """Cut the scene's lines from the play and put them in the actor's scripts."""
    from app.api.scripts import _build_scenes
    from app.services.extraction import scene_cutter

    play = db.query(Play).options(undefer(Play.full_text)).filter(Play.id == row.play_id).first()
    if not play or not play.full_text:
        raise HTTPException(status_code=409, detail="This scene's play isn't available right now.")
    text = scene_cutter.play_text(play.full_text, play.text_format)
    if row.text_hash and scene_cutter.span_hash(text, row.start_offset, row.end_offset) != row.text_hash:
        raise HTTPException(status_code=409, detail="This scene's play text changed; it needs cutting again.")
    lines = scene_cutter.lines_between(text, row.start_offset, row.end_offset)
    if len(lines) < 2:
        raise HTTPException(status_code=409, detail="This scene couldn't be read.")

    # The copy gets a play row of its own, like an upload. Pointing it at the
    # real play would let ScenePartner's "edit play title" (scripts.py, scene
    # edit) rename that play for every monologue it holds.
    own_play = Play(
        title=play.title,
        author=play.author,
        year_written=play.year_written,
        genre=play.genre or "drama",
        category=play.category or "classical",
        copyright_status="user_uploaded",
        source_url=play.source_url,
    )
    db.add(own_play)
    db.flush()

    script = UserScript(
        user_id=user.id,
        title=f"{row.work_title}: {row.title}"[:200],
        author=row.author or play.author or "Unknown",
        description=row.description,
        original_filename=COPY_FILENAME.format(id=row.id),
        file_type="txt",
        raw_text="\n".join(f"{l['character']}: {l['text']}" for l in lines),
        characters=[
            {"name": row.character_1_name, "gender": row.character_1_gender, "age_range": row.character_1_age_range},
            {"name": row.character_2_name, "gender": row.character_2_gender, "age_range": row.character_2_age_range},
        ],
        processing_status="completed",
        ai_extraction_completed=True,
        num_characters=2,
        num_scenes_extracted=1,
    )
    db.add(script)
    db.flush()
    created = _build_scenes(db, script, own_play.id, [{
        "title": row.title,
        "description": row.description,
        "character_1": row.character_1_name,
        "character_2": row.character_2_name,
        "tone": row.tone,
        "lines": lines,
    }])
    return created[0]


@router.post("/{shelf_id}/rehearse")
def rehearse(shelf_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Where Rehearse goes: a scene id for the rehearsal room, or "bring your copy"."""
    row = db.query(ShelfScene).get(shelf_id)
    if not row or (row.status != "live" and not current_user.is_moderator):
        raise HTTPException(status_code=404, detail="Not found")

    if row.kind == "shared":
        if row.shared_by_user_id == current_user.id and row.source_scene_id:
            return {"scene_id": row.source_scene_id, "bring_your_own": False}
        row.open_count = (row.open_count or 0) + 1
        db.commit()
        return {"scene_id": None, "bring_your_own": True, "work_title": row.work_title, "where": row.where_in_work}

    scene = _copy_for(db, current_user, row)
    if scene is None:
        scene = copy_public_domain(db, current_user, row)
        row.open_count = (row.open_count or 0) + 1
    db.commit()
    return {"scene_id": scene.id, "bring_your_own": False}

