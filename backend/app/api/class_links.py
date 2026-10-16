"""actorrise.com/join/<code>: a teacher's class link (services/class_links.py)."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.services import class_links

router = APIRouter(prefix="/api/class-links", tags=["class-links"])


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
