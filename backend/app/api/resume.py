"""Actor résumé endpoints — credits CRUD (Increment 1).

The résumé itself is composed from the actor's profile + these credits.
PDF export + gating land in Increment 2.
"""

import re
from typing import List, Optional

from app.api.auth import get_current_user
from app.core.database import get_db
from app.models.actor import ActorCredit, ActorProfile
from app.models.user import User
from app.services.resume.pdf import render_resume_pdf
from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/resume", tags=["resume"])

VALID_CATEGORIES = {"theatre", "film", "tv", "commercial", "other"}


class CreditIn(BaseModel):
    category: str = "theatre"
    production: str
    role: Optional[str] = None
    company: Optional[str] = None
    director: Optional[str] = None
    year: Optional[str] = None


class CreditOut(BaseModel):
    id: int
    category: str
    production: str
    role: Optional[str] = None
    company: Optional[str] = None
    director: Optional[str] = None
    year: Optional[str] = None
    sort_order: int

    class Config:
        from_attributes = True


class ReorderRequest(BaseModel):
    ordered_ids: List[int]


def _normalize_category(category: str) -> str:
    c = (category or "").strip().lower()
    return c if c in VALID_CATEGORIES else "other"


def _owned_credit(credit_id: int, user: User, db: Session) -> ActorCredit:
    credit = (
        db.query(ActorCredit)
        .filter(ActorCredit.id == credit_id, ActorCredit.user_id == user.id)
        .first()
    )
    if not credit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Credit not found")
    return credit


@router.get("/credits", response_model=List[CreditOut])
def list_credits(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return (
        db.query(ActorCredit)
        .filter(ActorCredit.user_id == current_user.id)
        .order_by(ActorCredit.sort_order, ActorCredit.id)
        .all()
    )


@router.post("/credits", response_model=CreditOut, status_code=status.HTTP_201_CREATED)
def create_credit(
    body: CreditIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not body.production or not body.production.strip():
        raise HTTPException(status_code=422, detail="Production is required")
    # New credits go to the end of the list.
    max_order = (
        db.query(ActorCredit.sort_order)
        .filter(ActorCredit.user_id == current_user.id)
        .order_by(ActorCredit.sort_order.desc())
        .first()
    )
    next_order = (max_order[0] + 1) if max_order else 0
    credit = ActorCredit(
        user_id=current_user.id,
        category=_normalize_category(body.category),
        production=body.production.strip(),
        role=(body.role or "").strip() or None,
        company=(body.company or "").strip() or None,
        director=(body.director or "").strip() or None,
        year=(body.year or "").strip() or None,
        sort_order=next_order,
    )
    db.add(credit)
    db.commit()
    db.refresh(credit)
    return credit


@router.put("/credits/reorder", response_model=List[CreditOut])
def reorder_credits(
    body: ReorderRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Defined BEFORE /credits/{credit_id} so "reorder" isn't parsed as an id.
    credits = {
        c.id: c
        for c in db.query(ActorCredit).filter(ActorCredit.user_id == current_user.id).all()
    }
    order = 0
    for cid in body.ordered_ids:
        c = credits.get(cid)
        if c is not None:  # silently skip ids that aren't the user's
            c.sort_order = order
            order += 1
    db.commit()
    return (
        db.query(ActorCredit)
        .filter(ActorCredit.user_id == current_user.id)
        .order_by(ActorCredit.sort_order, ActorCredit.id)
        .all()
    )


@router.put("/credits/{credit_id}", response_model=CreditOut)
def update_credit(
    credit_id: int,
    body: CreditIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    credit = _owned_credit(credit_id, current_user, db)
    credit.category = _normalize_category(body.category)
    credit.production = (body.production or "").strip() or credit.production
    credit.role = (body.role or "").strip() or None
    credit.company = (body.company or "").strip() or None
    credit.director = (body.director or "").strip() or None
    credit.year = (body.year or "").strip() or None
    db.commit()
    db.refresh(credit)
    return credit


@router.delete("/credits/{credit_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_credit(
    credit_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    credit = _owned_credit(credit_id, current_user, db)
    db.delete(credit)
    db.commit()


def _safe_filename(name: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "_", (name or "").strip()).strip("_") or "actor"
    return f"{slug}_resume.pdf"


@router.get("/download")
def download_resume(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Render the actor's résumé to PDF. Free tier gets a watermark; paid = clean."""
    profile = (
        db.query(ActorProfile).filter(ActorProfile.user_id == current_user.id).first()
    )
    credits = (
        db.query(ActorCredit)
        .filter(ActorCredit.user_id == current_user.id)
        .order_by(ActorCredit.sort_order, ActorCredit.id)
        .all()
    )

    sub = current_user.subscription
    is_paid = bool(sub and sub.is_active and sub.is_paid_tier)

    name = (profile.name if profile else None) or current_user.name or "Your Name"
    stats = [
        v
        for v in (
            profile.age_range if profile else None,
            profile.height if profile else None,
            profile.union_status if profile else None,
        )
        if v
    ]
    skills = list(profile.special_skills) if profile and profile.special_skills else []
    training = profile.training_background if profile else None
    credit_dicts = [
        {
            "category": c.category,
            "production": c.production,
            "role": c.role,
            "company": c.company,
            "director": c.director,
            "year": c.year,
        }
        for c in credits
    ]

    try:
        pdf_bytes = render_resume_pdf(
            name=name,
            contact=current_user.email,
            stats=stats,
            credits=credit_dicts,
            training=training,
            skills=skills,
            watermark=not is_paid,
        )
    except Exception as e:  # WeasyPrint / system-lib failure — surface cleanly
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Résumé PDF generation is temporarily unavailable.",
        ) from e

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{_safe_filename(name)}"'},
    )
