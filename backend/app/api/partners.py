"""Public: the organizations that agreed, in writing, to appear on the landing page.

Read by the landing's partner strip alongside data/partners.ts. Nothing is
returned unless partner_status is "yes", partner_show is set and
partner_approval says who agreed (app/models/organization.py).
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.organization import Organization

router = APIRouter(prefix="/api/partners", tags=["partners"])


def approved_partners(db: Session) -> list[dict]:
    rows = (
        db.query(Organization)
        .filter(
            Organization.partner_status == "yes",
            Organization.partner_show.isnot(None),
            Organization.partner_approval.isnot(None),
            Organization.partner_approval != "",
        )
        .order_by(Organization.partner_updated_at.asc().nullslast(), Organization.id)
        .all()
    )
    out = []
    for org in rows:
        # A logo with no file falls back to the name rather than vanishing.
        show = "logo" if org.partner_show == "logo" and org.partner_logo_url else "name"
        out.append(
            {
                "name": org.partner_display_name or org.name,
                "kind": org.kind,
                "url": org.partner_url,
                "logo": org.partner_logo_url if show == "logo" else None,
                "show": show,
            }
        )
    return out


@router.get("")
def list_partners(db: Session = Depends(get_db)):
    return {"partners": approved_partners(db)}
