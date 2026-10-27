"""actorrise.com/join/<code>: a teacher's class link (services/class_links.py)."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.services import class_links

router = APIRouter(prefix="/api/class-links", tags=["class-links"])


class MakeLinkRequest(BaseModel):
    school: str | None = Field(default=None, max_length=120)


def _teacher(user: User) -> User:
    if user.account_type != "educator":
        raise HTTPException(status_code=403, detail="Class links are for teacher accounts")
    return user


# Declared before /{code}, which would otherwise take "mine" as a code.
@router.get("/mine")
def read_my_class_link(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """The teacher's own link and how many students came in, or null."""
    link = class_links.own_link(db, _teacher(current_user))
    return {"link": class_links.link_summary(db, link) if link else None}


@router.post("/mine")
def make_my_class_link(
    body: MakeLinkRequest | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Make the teacher's link (or return the one they have)."""
    link = class_links.make_own_link(db, _teacher(current_user), school=body.school if body else None)
    return {"link": class_links.link_summary(db, link)}


@router.get("/{code}")
def read_class_link(code: str, db: Session = Depends(get_db)):
    """What the join page shows. Public: a first name and a school, nothing else."""
    link = class_links.find_link(db, code)
    if link is None:
        raise HTTPException(status_code=404, detail="No such class link")
    return {
        "teacher": link.teacher_label,
        "school": link.school_label,
        "days": link.days,
        "active": bool(link.active),
    }


@router.post("/{code}/join")
def join_class_link(
    code: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    link = class_links.find_link(db, code)
    if link is None:
        raise HTTPException(status_code=404, detail="No such class link")
    if not link.active:
        raise HTTPException(status_code=410, detail="This class link is switched off")
    result = class_links.join(db, link, current_user)
    return {
        "outcome": result.outcome,
        "until": result.until.isoformat() if result.until else None,
        "teacher": link.teacher_label,
    }
