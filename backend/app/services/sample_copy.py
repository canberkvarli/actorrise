"""A sample made the actor's own, so it can be edited (copy on edit).

The samples (`UserScript.is_sample`) are one set of rows every actor sees.
Editing one in place would change it for everyone, so the first edit makes
the actor a deep copy instead: the script, a play row of its own for each play
its scenes sit on, the scenes and their lines. The copy is an ordinary script
of theirs from then on, and the sample steps off their shelf so the copy takes
its place.

How a copy is known, with no new column (a prod migration needs the founder):
`file_type = "sample"` and `original_filename = "sample-<sample id>.txt"`.
The file type is the mark that cannot be faked: an upload's file type is what
`normalize_upload` makes of the bytes ("pdf" or "txt"), the example script is
"text" and a Community library copy is "shelf", so nothing else ever writes
"sample". The filename names which sample it came from. Neither column is read
for anything a copy would mind: the filename is shown nowhere for a script
that is not reading, and the only file type checks are the upload counter
(which leaves copies out, like library copies) and the parser (which only
reads new uploads).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, Iterable, List, Optional, Set, Tuple

from sqlalchemy import inspect as sa_inspect
from sqlalchemy.orm import Session

from app.models.actor import Play, Scene, SceneLine, UserScript

COPY_FILE_TYPE = "sample"
COPY_FILENAME = "sample-{id}.txt"
_PREFIX, _SUFFIX = "sample-", ".txt"
DELETED = "deleted"

# Never carried over: the row's identity, who it belongs to, and anything that
# makes a row shared (a sample, the community, a class) or places it on a shelf.
_SCRIPT_SKIP = {
    "id", "user_id", "is_sample", "shared_with_community", "class_share", "is_guided",
    "original_filename", "file_type", "file_path", "file_size_bytes", "shelf_order",
    "created_at", "updated_at",
}
_PLAY_SKIP = {"id", "created_at", "updated_at"}
# A scene's counters are the sample's audience, not this actor's.
_SCENE_SKIP = {
    "id", "play_id", "user_script_id", "is_library", "rehearsal_count", "favorite_count",
    "average_rating", "created_at", "updated_at",
}
_LINE_SKIP = {"id", "scene_id", "created_at"}


def _columns(model, skip: Set[str]) -> List[str]:
    return [a.key for a in sa_inspect(model).column_attrs if a.key not in skip]


def _clone(model, row, skip: Set[str], **overrides):
    values = {k: getattr(row, k) for k in _columns(model, skip)}
    values.update(overrides)
    return model(**values)


def is_copy(script: Optional[UserScript]) -> bool:
    return script is not None and script.file_type == COPY_FILE_TYPE


def sample_id_of(script: UserScript) -> Optional[int]:
    """Which sample this copy came from, or None if it is not a copy."""
    if not is_copy(script):
        return None
    name = script.original_filename or ""
    if not (name.startswith(_PREFIX) and name.endswith(_SUFFIX)):
        return None
    try:
        return int(name[len(_PREFIX):-len(_SUFFIX)])
    except ValueError:
        return None


def _live_copies(db: Session, user_id: int):
    return db.query(UserScript).filter(
        UserScript.user_id == user_id,
        UserScript.is_sample.is_(False),
        UserScript.file_type == COPY_FILE_TYPE,
        UserScript.original_filename.like(f"{_PREFIX}%"),
        # A copy in Recently deleted is not on the shelf: the sample comes back.
        (UserScript.processing_status.is_(None)) | (UserScript.processing_status != DELETED),
    )


def copied_sample_ids(db: Session, user_id: Optional[int]) -> Set[int]:
    """The samples this actor has a copy of on their shelf, to leave off it."""
    if user_id is None:
        return set()
    out = set()
    for script in _live_copies(db, user_id).all():
        sid = sample_id_of(script)
        if sid is not None:
            out.add(sid)
    return out


def copy_of(db: Session, user_id: int, sample_id: int) -> Optional[UserScript]:
    return (
        _live_copies(db, user_id)
        .filter(UserScript.original_filename == COPY_FILENAME.format(id=sample_id))
        .order_by(UserScript.id.asc())
        .first()
    )


def _scenes(db: Session, script_id: int) -> List[Scene]:
    return db.query(Scene).filter(Scene.user_script_id == script_id).order_by(Scene.id.asc()).all()


def scene_map(db: Session, sample: UserScript, copy: UserScript) -> Dict[int, int]:
    """Sample scene id -> the copy's scene id.

    Copies are made in the sample's scene order, so a fresh copy lines up one
    to one. A copy the actor has since changed (a scene taken off, one added)
    is matched by title first, then by place, and a scene that is gone from
    the copy is left out.
    """
    old, new = _scenes(db, sample.id), _scenes(db, copy.id)
    out: Dict[int, int] = {}
    used: Set[int] = set()
    for sc in old:
        twin = next((n for n in new if n.id not in used and n.title == sc.title), None)
        if twin is not None:
            out[sc.id] = twin.id
            used.add(twin.id)
    for i, sc in enumerate(old):
        if sc.id in out or i >= len(new) or new[i].id in used:
            continue
        out[sc.id] = new[i].id
        used.add(new[i].id)
    return out


def make_copy(db: Session, user_id: int, sample: UserScript) -> Tuple[UserScript, Dict[int, int]]:
    """Deep copy a sample into the actor's scripts. Flushes; the caller commits."""
    copy = _clone(
        UserScript, sample, _SCRIPT_SKIP,
        user_id=user_id,
        is_sample=False,
        is_guided=False,
        shared_with_community=False,
        class_share=None,
        original_filename=COPY_FILENAME.format(id=sample.id),
        file_type=COPY_FILE_TYPE,
        # Brought in now, so it sits where a new script does on the shelf.
        created_at=datetime.now(timezone.utc),
    )
    db.add(copy)
    db.flush()

    # A play row of its own for each play the scenes sit on, as a library
    # copy gets (shelf.copy_public_domain): editing the play's title from a
    # scene of the copy must not rename the sample's play for everyone.
    old_scenes = _scenes(db, sample.id)
    plays: Dict[int, int] = {}
    for play_id in dict.fromkeys(sc.play_id for sc in old_scenes):
        play = db.get(Play, play_id)
        if play is None:
            continue
        own = _clone(Play, play, _PLAY_SKIP)
        db.add(own)
        db.flush()
        plays[play_id] = own.id

    mapping: Dict[int, int] = {}
    for sc in old_scenes:
        new = _clone(
            Scene, sc, _SCENE_SKIP,
            play_id=plays.get(sc.play_id, sc.play_id),
            user_script_id=copy.id,
            is_library=False,
        )
        db.add(new)
        db.flush()
        mapping[sc.id] = new.id
        lines: Iterable[SceneLine] = (
            db.query(SceneLine).filter(SceneLine.scene_id == sc.id).order_by(SceneLine.line_order.asc(), SceneLine.id.asc()).all()
        )
        for line in lines:
            db.add(_clone(SceneLine, line, _LINE_SKIP, scene_id=new.id))
    db.flush()
    return copy, mapping
