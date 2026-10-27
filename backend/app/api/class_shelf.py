"""The class shelf (services/class_shelf.py): a teacher's scripts for their class."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.database import get_db
from app.models.actor import UserScript
from app.models.user import User
from app.services import class_shelf

router = APIRouter(prefix="/api/class-shelf", tags=["class-shelf"])


@router.get("")
def read_class_shelves(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """What this person's teachers shared with them, one shelf per teacher."""
    return {"shelves": class_shelf.shelves(db, current_user)}


@router.get("/mine")
def read_my_sharing(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """The teacher's side: may they share, and how many scripts they have."""
    return {
        "can_share": class_shelf.can_share(db, current_user),
        "shared": class_shelf.shared_count(db, current_user),
    }


class ShareIn(BaseModel):
    on: bool
    # Several at once, for a teacher who just brought in a folder of scenes.
    script_ids: list[int] = Field(default_factory=list, max_length=1000)


def _owned(db: Session, user: User, script_id: int) -> UserScript:
    script = db.query(UserScript).filter(UserScript.id == script_id, UserScript.user_id == user.id).first()
    if script is None:
        raise HTTPException(status_code=404, detail="Script not found")
    return script


@router.put("/scripts/{script_id}")
def share_script(
    script_id: int,
    body: ShareIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The "Share with my class" switch on one script."""
    script = _owned(db, current_user, script_id)
    try:
        class_shelf.set_shared(db, current_user, script, body.on)
    except class_shelf.ShareRefused as e:
        raise HTTPException(status_code=403, detail=str(e))
    return {"id": script.id, "class_share": script.class_share}


@router.put("/scripts")
def share_scripts(body: ShareIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """The same switch on many scripts. Skips any it may not change (another
    account's, one taken down) and says how many it did."""
    if body.on and not class_shelf.can_share(db, current_user):
        raise HTTPException(status_code=403, detail="Sharing is for teacher accounts with a class link.")
    changed = 0
    for script in (
        db.query(UserScript)
        .filter(UserScript.id.in_(body.script_ids), UserScript.user_id == current_user.id)
        .all()
    ):
        try:
            class_shelf.set_shared(db, current_user, script, body.on)
            changed += 1
        except class_shelf.ShareRefused:
            continue
    return {"changed": changed, "shared": class_shelf.shared_count(db, current_user)}


class StatusIn(BaseModel):
    status: str


@router.patch("/scripts/{script_id}/status")
def moderate_script(
    script_id: int,
    body: StatusIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """A moderator takes a shared script down ("hidden") or puts it back
    ("live"). A takedown request lands here."""
    if not current_user.is_moderator:
        raise HTTPException(status_code=403, detail="Moderators only")
    if body.status not in (class_shelf.LIVE, class_shelf.HIDDEN):
        raise HTTPException(status_code=400, detail="status is live or hidden")
    script = db.get(UserScript, script_id)
    if script is None or script.class_share is None:
        raise HTTPException(status_code=404, detail="Not found")
    script.class_share = body.status
    db.commit()
    return {"id": script.id, "class_share": script.class_share}
