"""Admin organizations API: group users into schools/studios and read activity.

Answers the question the admin could not answer before: is Northern Michigan
University actually using this, or did seven people sign up and vanish? The
teacher route is the channel that converts, so a cluster that goes quiet is worth
knowing about while it is still warm.

Read-only by design. No roles, no teacher portal, no seat limits: that is a
multi-tenant permissions system, and today this serves four clusters and about
thirteen people. See docs/plans/2026-09-05-organizations-admin-design.md.
"""

from datetime import date, timedelta
from typing import Any, Optional

from app.api.admin.stats import require_moderator
from app.core.database import get_db
from app.models.billing import UsageMetrics, UserSubscription
from app.models.organization import ORGANIZATION_KINDS, Organization
from app.models.user import User
from app.services.admin_filters import test_user_filter
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/admin/organizations", tags=["admin", "organizations"])

ACTIVE_WINDOW_DAYS = 30

# "Did anything at all", across the three things a user can actually do. Kept as
# one expression so activated and active-30d cannot drift apart in what counts.
_DID_SOMETHING = or_(
    UsageMetrics.total_searches_count > 0,
    UsageMetrics.monologue_sessions > 0,
    UsageMetrics.scene_partner_sessions > 0,
)


class OrganizationIn(BaseModel):
    name: str
    kind: str = "school"
    notes: Optional[str] = None


class AttachIn(BaseModel):
    user_ids: list[int]


def _clean_name(raw: str) -> str:
    name = (raw or "").strip()[:200]
    if not name:
        raise HTTPException(status_code=400, detail="Organization needs a name")
    return name


def _check_kind(kind: str) -> str:
    if kind not in ORGANIZATION_KINDS:
        raise HTTPException(
            status_code=400,
            detail=f"kind must be one of {', '.join(ORGANIZATION_KINDS)}",
        )
    return kind


def _metrics_for(db: Session, org_ids: list[int]) -> dict[int, dict[str, Any]]:
    """Per-org counts, in four queries rather than four per organization.

    Staff are excluded everywhere via test_user_filter. /admin/sessions once
    reported 21.9% completion against a real 27.7% because it counted internal
    accounts, and an org page is far smaller, so one test account inside a
    seven-person school would swing it wildly.
    """
    if not org_ids:
        return {}

    real = ~test_user_filter()
    base = and_(User.organization_id.in_(org_ids), real)
    out: dict[int, dict[str, Any]] = {
        oid: {
            "members": 0,
            "by_type": {},
            "activated": 0,
            "active_30d": 0,
            "comped": 0,
            "next_comp_expiry": None,
            "first_joined": None,
            "top_referral": None,
        }
        for oid in org_ids
    }

    # Members, split by account_type. NULL becomes "unknown" rather than being
    # dropped, because 804 of 829 accounts have never set one.
    rows = (
        db.query(User.organization_id, User.account_type, func.count(User.id), func.min(User.created_at))
        .filter(base)
        .group_by(User.organization_id, User.account_type)
        .all()
    )
    for oid, acct, count, first in rows:
        rec = out[oid]
        rec["members"] += count
        rec["by_type"][acct or "unknown"] = count
        if first and (rec["first_joined"] is None or first < rec["first_joined"]):
            rec["first_joined"] = first

    # Activated: has ever done one of the three things.
    for oid, count in (
        db.query(User.organization_id, func.count(func.distinct(User.id)))
        .join(UsageMetrics, UsageMetrics.user_id == User.id)
        .filter(base, _DID_SOMETHING)
        .group_by(User.organization_id)
        .all()
    ):
        out[oid]["activated"] = count

    since = date.today() - timedelta(days=ACTIVE_WINDOW_DAYS)
    for oid, count in (
        db.query(User.organization_id, func.count(func.distinct(User.id)))
        .join(UsageMetrics, UsageMetrics.user_id == User.id)
        .filter(base, _DID_SOMETHING, UsageMetrics.date >= since)
        .group_by(User.organization_id)
        .all()
    ):
        out[oid]["active_30d"] = count

    # Comps are subscriptions with no Stripe id: that is what a granted account
    # looks like, and counting them as paid is how admin MRR got inflated before.
    for oid, count, soonest in (
        db.query(
            User.organization_id,
            func.count(func.distinct(User.id)),
            func.min(UserSubscription.current_period_end),
        )
        .join(UserSubscription, UserSubscription.user_id == User.id)
        .filter(
            base,
            UserSubscription.stripe_subscription_id.is_(None),
            UserSubscription.status == "active",
        )
        .group_by(User.organization_id)
        .all()
    ):
        out[oid]["comped"] = count
        out[oid]["next_comp_expiry"] = soonest.isoformat() if soonest else None

    # Where they came from: the most common non-empty referral_source.
    for oid, source, _count in (
        db.query(User.organization_id, User.referral_source, func.count(User.id).label("c"))
        .filter(base, User.referral_source.isnot(None), User.referral_source != "")
        .group_by(User.organization_id, User.referral_source)
        .order_by(User.organization_id, func.count(User.id).desc())
        .all()
    ):
        if out[oid]["top_referral"] is None:
            out[oid]["top_referral"] = source

    return out


def _serialize(org: Organization, metrics: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": org.id,
        "name": org.name,
        "kind": org.kind,
        "notes": org.notes,
        "created_at": org.created_at.isoformat() if org.created_at else None,
        **metrics,
    }


@router.get("")
def list_organizations(
    _user: User = Depends(require_moderator),
    db: Session = Depends(get_db),
):
    """Every organization with its numbers.

    Sorted by nearest comp expiry so the page opens as a worklist: these classes
    lapse soonest, write to their teacher. Orgs with no comp sort last.
    """
    orgs = db.query(Organization).all()
    metrics = _metrics_for(db, [o.id for o in orgs])
    rows = [_serialize(o, metrics.get(o.id, {})) for o in orgs]
    rows.sort(key=lambda r: (r.get("next_comp_expiry") is None, r.get("next_comp_expiry") or "", r["name"].lower()))
    return {"organizations": rows, "total": len(rows)}


@router.post("", status_code=201)
def create_organization(
    body: OrganizationIn,
    _user: User = Depends(require_moderator),
    db: Session = Depends(get_db),
):
    name = _clean_name(body.name)
    _check_kind(body.kind)
    existing = db.query(Organization).filter(func.lower(Organization.name) == name.lower()).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"'{existing.name}' already exists")
    org = Organization(name=name, kind=body.kind, notes=(body.notes or "").strip() or None)
    db.add(org)
    db.commit()
    db.refresh(org)
    return _serialize(org, _metrics_for(db, [org.id]).get(org.id, {}))


@router.patch("/{org_id}")
def update_organization(
    org_id: int,
    body: OrganizationIn,
    _user: User = Depends(require_moderator),
    db: Session = Depends(get_db),
):
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    org.name = _clean_name(body.name)
    org.kind = _check_kind(body.kind)
    org.notes = (body.notes or "").strip() or None
    db.commit()
    db.refresh(org)
    return _serialize(org, _metrics_for(db, [org.id]).get(org.id, {}))


@router.delete("/{org_id}")
def delete_organization(
    org_id: int,
    _user: User = Depends(require_moderator),
    db: Session = Depends(get_db),
):
    """Delete the grouping, never the people. Members are detached by the
    ON DELETE SET NULL on users.organization_id."""
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    db.query(User).filter(User.organization_id == org_id).update({"organization_id": None})
    db.delete(org)
    db.commit()
    return {"ok": True}


@router.get("/{org_id}")
def get_organization(
    org_id: int,
    _user: User = Depends(require_moderator),
    db: Session = Depends(get_db),
):
    """One organization, its members, and the two attach suggestions."""
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    since = date.today() - timedelta(days=ACTIVE_WINDOW_DAYS)
    members = []
    for u in (
        db.query(User)
        .filter(User.organization_id == org_id)
        .order_by(User.created_at.desc())
        .all()
    ):
        last_active = (
            db.query(func.max(UsageMetrics.date))
            .filter(UsageMetrics.user_id == u.id, _DID_SOMETHING)
            .scalar()
        )
        comp = (
            db.query(UserSubscription)
            .filter(
                UserSubscription.user_id == u.id,
                UserSubscription.stripe_subscription_id.is_(None),
                UserSubscription.status == "active",
            )
            .first()
        )
        members.append({
            "id": u.id,
            "email": u.email,
            "name": u.name,
            "account_type": u.account_type,
            "typed_organization": u.organization,
            "joined": u.created_at.isoformat() if u.created_at else None,
            "last_active": last_active.isoformat() if last_active else None,
            "active_30d": bool(last_active and last_active >= since),
            "comp_expires": comp.current_period_end.isoformat() if comp and comp.current_period_end else None,
            "is_staff": bool(u.exclude_from_stats),
        })

    # `members` stays the count on both list and detail, so the two views never
    # disagree about what the word means. The rows are `people`.
    return {
        **_serialize(org, _metrics_for(db, [org_id]).get(org_id, {})),
        "people": members,
        "suggestions": _suggestions(db, org),
    }


def _suggestions(db: Session, org: Organization) -> dict[str, list[dict[str, Any]]]:
    """Unattached accounts that look like they belong to this org.

    Two weak signals, never applied automatically. Email domain finds the staff
    and anyone on a school address; the user's own typed `organization` string
    finds the rest. Neither can find a student on gmail who never typed anything,
    which is why attaching stays a human decision.
    """
    attached = db.query(User.id).filter(User.organization_id.isnot(None))

    # Domain: derived from members already attached, so it only fires once the
    # org has one member and cannot guess from the name alone.
    domains = {
        (e or "").split("@")[-1].lower()
        for (e,) in db.query(User.email).filter(User.organization_id == org.id).all()
        if e and "@" in e and not e.endswith("@anon.actorrise.com")
    }
    generic = {"gmail.com", "icloud.com", "hotmail.com", "yahoo.com", "outlook.com", "proton.me", "privaterelay.appleid.com"}
    domains -= generic

    by_domain = []
    if domains:
        clauses = [User.email.ilike(f"%@{d}") for d in domains]
        by_domain = [
            {"id": u.id, "email": u.email, "name": u.name, "why": u.email.split("@")[-1]}
            for u in db.query(User).filter(or_(*clauses), User.id.notin_(attached)).limit(50).all()
        ]

    # Typed name: match in either direction, so the org "Northern Michigan
    # University" finds someone who typed "nmu" and someone who typed the full
    # name. Done in Python rather than SQL because the reverse direction (org
    # name contains the user's string) is awkward to express and there are only
    # a couple of dozen rows with anything typed in at all.
    needle = org.name.lower()
    candidates = (
        db.query(User)
        .filter(User.organization.isnot(None), User.organization != "", User.id.notin_(attached))
        .all()
    )
    by_name = [
        {"id": u.id, "email": u.email, "name": u.name, "why": u.organization}
        for u in candidates
        if (typed := (u.organization or "").strip().lower())
        and (typed in needle or needle in typed)
    ][:50]

    seen = {r["id"] for r in by_domain}
    by_name = [r for r in by_name if r["id"] not in seen]
    return {"by_domain": by_domain, "by_typed_name": by_name}


@router.post("/{org_id}/members")
def attach_members(
    org_id: int,
    body: AttachIn,
    _user: User = Depends(require_moderator),
    db: Session = Depends(get_db),
):
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    if not body.user_ids:
        raise HTTPException(status_code=400, detail="No users given")
    updated = (
        db.query(User)
        .filter(User.id.in_(body.user_ids))
        .update({"organization_id": org_id}, synchronize_session=False)
    )
    db.commit()
    return {"attached": updated}


@router.delete("/{org_id}/members/{user_id}")
def detach_member(
    org_id: int,
    user_id: int,
    _user: User = Depends(require_moderator),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id, User.organization_id == org_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Not a member of this organization")
    user.organization_id = None
    db.commit()
    return {"ok": True}
