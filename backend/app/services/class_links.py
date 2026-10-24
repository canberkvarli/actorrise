"""Joining a teacher's class through their link (app/models/class_link.py).

The grant goes through grant_admin_user_membership, the same function as the
admin card and scripts/grant_comp.py, so it writes the same audit row and sends
the same "you have Plus" email. It is recorded against Canberk's account
because he made the link; the note names the link.

Three people are left alone rather than granted:
- someone paying (Stripe or the app). The comp grant detaches the Stripe
  subscription, so granting over a payer would quietly stop their billing.
- someone whose comp already runs past what the link would give. A link must
  never shorten a teacher's or a student's existing month.
- the teacher, opening their own link to see what students see.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.billing import PricingTier, UserSubscription
from app.models.class_link import ClassLink, ClassLinkInvite, ClassLinkJoin
from app.models.user import User
from app.services.email.school_address import is_district_address

ADMIN_EMAIL = "canberk@actorrise.com"
CODE_RE = re.compile(r"^[a-z0-9][a-z0-9-]{2,63}$")


@dataclass
class JoinResult:
    # granted | paying | already | full | own_link | joined (seen before)
    outcome: str
    until: datetime | None = None


def find_link(db: Session, code: str) -> ClassLink | None:
    code = (code or "").strip().lower()
    if not CODE_RE.match(code):
        return None
    return db.query(ClassLink).filter(ClassLink.code == code).first()


def _aware(dt: datetime | None) -> datetime | None:
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _is_paying(sub: UserSubscription | None) -> bool:
    if sub is None or not sub.is_active:
        return False
    return bool(sub.stripe_subscription_id) or sub.source in ("stripe", "revenuecat")


def _comp_runs_past(sub: UserSubscription | None, end: datetime) -> bool:
    if sub is None or not sub.is_active or not sub.is_paid_tier:
        return False
    current = _aware(sub.trial_end)
    return current is None or current >= end


def join(db: Session, link: ClassLink, user: User) -> JoinResult:
    """Put `user` in `link`'s class. Safe to call twice: the second is a no-op."""
    seen = (
        db.query(ClassLinkJoin)
        .filter(ClassLinkJoin.class_link_id == link.id, ClassLinkJoin.user_id == user.id)
        .first()
    )
    sub = db.query(UserSubscription).filter(UserSubscription.user_id == user.id).first()
    if seen is not None:
        return JoinResult("joined", _aware(sub.trial_end) if sub else None)
    if user.id == link.teacher_user_id:
        return JoinResult("own_link")

    end = datetime.now(timezone.utc) + timedelta(days=link.days)
    if _is_paying(sub):
        outcome = "paying"
    elif _comp_runs_past(sub, end):
        outcome = "already"
    else:
        granted = (
            db.query(ClassLinkJoin)
            .filter(ClassLinkJoin.class_link_id == link.id, ClassLinkJoin.outcome == "granted")
            .count()
        )
        outcome = "full" if granted >= link.max_uses else "granted"

    db.add(ClassLinkJoin(class_link_id=link.id, user_id=user.id, outcome=outcome))
    if link.organization_id and not user.organization_id:
        user.organization_id = link.organization_id
    try:
        db.commit()
    except IntegrityError:
        # The same person in two tabs at once: the other request won.
        db.rollback()
        return JoinResult("joined")

    if outcome == "granted":
        _grant(db, link, user)
        sub = db.query(UserSubscription).filter(UserSubscription.user_id == user.id).first()

    from app.services.events import record_user_event

    record_user_event(user.id, "class_link_joined", {"class_link_id": link.id, "outcome": outcome})
    return JoinResult(outcome, _aware(sub.trial_end) if sub else None)


def invite(db: Session, link: ClassLink, emails: list[str]) -> dict[str, str]:
    """Approve a teacher's class list ahead of time. Returns {email: outcome}.

    An address that already has an account joins now; the rest are held as
    invites and join the moment that account is created (claim_invites).
    """
    out: dict[str, str] = {}
    for raw in emails:
        email = raw.strip().lower()
        if "@" not in email or email in out:
            continue
        user = db.query(User).filter(User.email.ilike(email)).first()
        if user is not None:
            out[email] = join(db, link, user).outcome
            continue
        held = (
            db.query(ClassLinkInvite)
            .filter(ClassLinkInvite.class_link_id == link.id, ClassLinkInvite.email == email)
            .first()
        )
        if held is None:
            db.add(ClassLinkInvite(class_link_id=link.id, email=email))
            db.commit()
        out[email] = "invited"
    return out


def claim_invites(db: Session, user: User) -> list[JoinResult]:
    """Join every class that invited this address. Called once, at signup."""
    email = (user.email or "").strip().lower()
    if not email or email.endswith("@anon.actorrise.com"):
        return []
    held = (
        db.query(ClassLinkInvite)
        .filter(ClassLinkInvite.email == email, ClassLinkInvite.claimed_at.is_(None))
        .all()
    )
    results = []
    for inv in held:
        link = db.get(ClassLink, inv.class_link_id)
        inv.claimed_at = datetime.now(timezone.utc)
        db.commit()
        if link is not None and link.active:
            results.append(join(db, link, user))
    return results


def claim_signup_code(db: Session, user: User, code: object) -> JoinResult | None:
    """Join the class whose code rode in on the signup itself (Supabase
    user_metadata.class_code, set by lib/auth.tsx). The browser also holds the
    code, but only the browser that opened the link: a student who confirms
    their email somewhere else arrives without it. Gilroy, 2026-10-22, lost two
    students that way. None when there is no usable, live link."""
    if not isinstance(code, str):
        return None
    link = find_link(db, code)
    if link is None or not link.active:
        return None
    return join(db, link, user)


def _grant(db: Session, link: ClassLink, user: User) -> None:
    from app.api.admin.users import AdminGrantRequest, grant_admin_user_membership

    admin = db.query(User).filter(User.email == ADMIN_EMAIL).first()
    plus = db.query(PricingTier).filter(PricingTier.name == "plus").first()
    if admin is None or plus is None:
        raise RuntimeError("admin account or plus tier missing")
    grant_admin_user_membership(
        user.id,
        AdminGrantRequest(
            tier_id=plus.id,
            duration_days=link.days,
            account_type="student",
            # A district inbox turns the email away; see school_address.py.
            notify=not is_district_address(user.email),
            note=f"class link {link.code}",
        ),
        admin=admin,
        db=db,
    )
