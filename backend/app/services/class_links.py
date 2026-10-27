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

import logging
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
logger = logging.getLogger(__name__)
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


# A domain only a school hands out: a college (.edu, edu.au, ac.uk) or a
# district (school_address.py). Anything else, a mail provider, an ISP, a
# studio, vouches for nobody, so a link on it never matches by domain.
_COLLEGE = re.compile(r"(^|\.)(edu(\.[a-z]{2})?|ac\.[a-z]{2})$")


def _is_school_domain(domain: str) -> bool:
    return bool(_COLLEGE.search(domain)) or is_district_address("x@" + domain)


def _domain(email: str | None) -> str:
    return (email or "").rsplit("@", 1)[-1].strip().lower() if "@" in (email or "") else ""


def claim_school_domain(db: Session, user: User, provider: object = None) -> JoinResult | None:
    """Join the class of a live link whose teacher is on this new account's
    school domain (or a subdomain of it, students.nmu.edu under nmu.edu).
    For the student who signs up on a machine that never opened the link:
    Gilroy, 2026-10-26, 4 of 14 came in through Google on a Chromebook with no
    code held anywhere. Only for a Google signup: Google has proven the
    address is theirs, an email signup has not, and anyone could type
    made-up@gilroyunified.org. Only on a school's domain (_is_school_domain),
    never for someone already in a class. The newest live link wins when a
    school has two."""
    domain = _domain(user.email)
    if provider != "google" or not _is_school_domain(domain):
        return None
    if db.query(ClassLinkJoin).filter(ClassLinkJoin.user_id == user.id).first() is not None:
        return None
    links = (
        db.query(ClassLink, User.email)
        .join(User, User.id == ClassLink.teacher_user_id)
        .filter(ClassLink.active.is_(True), ClassLink.teacher_user_id != user.id)
        .order_by(ClassLink.created_at.desc(), ClassLink.id.desc())
        .all()
    )
    for link, teacher_email in links:
        school = _domain(teacher_email)
        if _is_school_domain(school) and (domain == school or domain.endswith("." + school)):
            return join(db, link, user)
    return None


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


# --- A teacher makes their own link -----------------------------------------
#
# Until 2026-10-27 only Canberk made links (scripts/class_link.py), so every
# class waited on him reading an email and writing back. The one class that
# came in (Gilroy, 36 students) did it the day the teacher had the link. Now a
# teacher account makes its own from the library.
#
# A school address (a college or a district domain) gets a link that works at
# once. Any other address gets one that waits switched off until Canberk turns
# it on (`class_link.py on <code>`), because "Teacher" is one tap at signup and
# a working link hands out Plus. He is emailed about every link made, either way.

SELF_SERVE_MAX_USES = 40
_SLUG = re.compile(r"[^a-z0-9]+")


def _slug(text: str | None, limit: int = 24) -> str:
    return _SLUG.sub("-", (text or "").lower()).strip("-")[:limit].strip("-")


def own_link(db: Session, user: User) -> ClassLink | None:
    """The teacher's own link, newest first if Canberk ever made them two."""
    return (
        db.query(ClassLink)
        .filter(ClassLink.teacher_user_id == user.id)
        .order_by(ClassLink.created_at.desc(), ClassLink.id.desc())
        .first()
    )


def _free_code(db: Session, base: str) -> str:
    base = base if CODE_RE.match(base) else f"class-{base}".strip("-")
    if not CODE_RE.match(base):
        base = "class"
    code, n = base, 2
    while db.query(ClassLink.id).filter(ClassLink.code == code).first() is not None:
        code, n = f"{base}-{n}", n + 1
    return code


def make_own_link(db: Session, user: User, school: str | None = None) -> ClassLink:
    """The teacher's link, made now if they have none. Safe to call twice."""
    existing = own_link(db, user)
    if existing is not None:
        return existing

    first = (user.name or "").strip().split(" ")[0] or (user.email or "").split("@")[0]
    school_label = (school or user.organization or "").strip()[:120] or None
    code = _free_code(db, "-".join(p for p in (_slug(school_label, 20), _slug(first, 16)) if p) or _slug(first))
    link = ClassLink(
        code=code,
        teacher_user_id=user.id,
        organization_id=user.organization_id,
        teacher_label=first[:80],
        school_label=school_label,
        days=30,
        max_uses=SELF_SERVE_MAX_USES,
        active=_is_school_domain(_domain(user.email)),
    )
    db.add(link)
    try:
        db.commit()
    except IntegrityError:
        # The same teacher tapping twice at once: the other request made it.
        db.rollback()
        made = own_link(db, user)
        if made is None:
            raise
        return made
    db.refresh(link)
    _tell_founder(link, user)
    return link


def _tell_founder(link: ClassLink, user: User) -> None:
    try:
        from app.services.email.resend_client import ResendEmailClient

        state = (
            "It works now (school address)."
            if link.active
            else f"It is OFF until you turn it on: <code>uv run python scripts/class_link.py on {link.code}</code>"
        )
        ResendEmailClient().send_email(
            to=ADMIN_EMAIL,
            subject=f"A teacher made a class link: {link.code}",
            html=(
                f"<p>{user.email} (user {user.id}) made actorrise.com/join/{link.code}"
                f" for {link.school_label or 'no school given'}.</p><p>{state}</p>"
                f"<p>Up to {link.max_uses} students, {link.days} days each. Switch it off with"
                f" <code>class_link.py off {link.code}</code>.</p>"
            ),
        )
    except Exception:
        logger.exception("class link: founder email failed for %s", link.code)


def link_summary(db: Session, link: ClassLink) -> dict:
    granted = (
        db.query(ClassLinkJoin)
        .filter(ClassLinkJoin.class_link_id == link.id, ClassLinkJoin.outcome == "granted")
        .count()
    )
    joined = db.query(ClassLinkJoin).filter(ClassLinkJoin.class_link_id == link.id).count()
    return {
        "code": link.code,
        "active": bool(link.active),
        "school": link.school_label,
        "days": link.days,
        "max_uses": link.max_uses,
        "granted": granted,
        "joined": joined,
    }
