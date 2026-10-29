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
import math
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

    end = link_end(link)
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

    if outcome == "full" and _first_full(db, link):
        _tell_founder_full(link)
    if outcome == "granted":
        _grant(db, link, user, until=end)
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


def link_end(link: ClassLink, now: datetime | None = None) -> datetime:
    """When a student joining now is on Plus until: the paid plan's end date
    when the link has one still to come, otherwise `days` from now."""
    now = now or datetime.now(timezone.utc)
    plan = _aware(link.plan_ends_at)
    if plan is not None and plan > now:
        return plan
    return now + timedelta(days=link.days)


def _days_until(until: datetime, now: datetime | None = None) -> int:
    now = now or datetime.now(timezone.utc)
    return max(1, math.ceil((until - now).total_seconds() / 86400))


def _grant(db: Session, link: ClassLink, user: User, until: datetime | None = None) -> None:
    from app.api.admin.users import AdminGrantRequest, grant_admin_user_membership

    admin = db.query(User).filter(User.email == ADMIN_EMAIL).first()
    plus = db.query(PricingTier).filter(PricingTier.name == "plus").first()
    if admin is None or plus is None:
        raise RuntimeError("admin account or plus tier missing")
    grant_admin_user_membership(
        user.id,
        AdminGrantRequest(
            tier_id=plus.id,
            duration_days=_days_until(until) if until else link.days,
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
# A teacher on a school address often has several classes (Gilroy: four, 90
# students in a week, 2026-10-27), so their link starts far higher.
SCHOOL_MAX_USES = 150
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
        max_uses=SCHOOL_MAX_USES if _is_school_domain(_domain(user.email)) else SELF_SERVE_MAX_USES,
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


def _first_full(db: Session, link: ClassLink) -> bool:
    return (
        db.query(ClassLinkJoin)
        .filter(ClassLinkJoin.class_link_id == link.id, ClassLinkJoin.outcome == "full")
        .count()
        == 1
    )


def _tell_founder_full(link: ClassLink) -> None:
    """The first student a link turns away. A full link is silent otherwise: the
    student just meets the paywall. Gilroy hit its cap mid-class on 2026-10-27 and
    29 students were refused before anyone noticed."""
    try:
        from app.services.email.resend_client import ResendEmailClient

        ResendEmailClient().send_email(
            to=ADMIN_EMAIL,
            subject=f"Class link full: {link.code} is turning students away",
            html=(
                f"<p>actorrise.com/join/{link.code} has given out all {link.max_uses} of its grants, and a student"
                " just joined and got nothing. Everyone after them will too.</p>"
                f"<p>Raise the cap: <code>UPDATE class_links SET max_uses = {link.max_uses * 2} WHERE code ="
                f" '{link.code}';</code> then grant the students marked full (the 2026-10-27 Gilroy fix is the"
                " pattern).</p>"
            ),
        )
    except Exception:
        logger.exception("class link: full email failed for %s", link.code)


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
        "plan_ends_at": _aware(link.plan_ends_at).isoformat() if link.plan_ends_at else None,
    }


# --- A paid class plan ---------------------------------------------------------


def apply_plan(db: Session, link: ClassLink, until: datetime, max_uses: int) -> int:
    """A school paid: every student on the link is on Plus until `until`.

    Sets the link's end date and seat count, then brings everyone already in the
    class up to that date, including anyone the link turned away as full while
    there are seats. A payer is left alone (granting over them would stop their
    billing), and a comp that already runs longer is never shortened. No email:
    most of these are district inboxes. Returns how many students it moved."""
    until = _aware(until)
    link.plan_ends_at = until
    link.max_uses = max_uses
    db.commit()

    moved = 0
    joins = (
        db.query(ClassLinkJoin)
        .filter(ClassLinkJoin.class_link_id == link.id, ClassLinkJoin.outcome.in_(("granted", "full")))
        .order_by(ClassLinkJoin.created_at)
        .all()
    )
    granted = sum(1 for j in joins if j.outcome == "granted")
    for j in joins:
        if j.outcome == "full" and granted >= max_uses:
            continue
        user = db.get(User, j.user_id)
        sub = db.query(UserSubscription).filter(UserSubscription.user_id == j.user_id).first()
        if user is None or _is_paying(sub) or _comp_runs_past(sub, until):
            continue
        _grant_quiet(db, link, user, until)
        if j.outcome == "full":
            j.outcome = "granted"
            granted += 1
            db.commit()
        moved += 1
    return moved


def _grant_quiet(db: Session, link: ClassLink, user: User, until: datetime) -> None:
    from app.api.admin.users import AdminGrantRequest, grant_admin_user_membership

    admin = db.query(User).filter(User.email == ADMIN_EMAIL).first()
    plus = db.query(PricingTier).filter(PricingTier.name == "plus").first()
    if admin is None or plus is None:
        raise RuntimeError("admin account or plus tier missing")
    grant_admin_user_membership(
        user.id,
        AdminGrantRequest(
            tier_id=plus.id,
            duration_days=_days_until(until),
            account_type="student",
            notify=False,
            note=f"class plan {link.code} until {until.date().isoformat()}",
        ),
        admin=admin,
        db=db,
    )


# --- The teacher's view of their class ------------------------------------------


def _display_name(user: User) -> str:
    """What the teacher sees for a student: their name, or the part of their
    address before the @ (a school student id, often)."""
    name = (user.name or "").strip()
    return name or (user.email or "").split("@")[0]


def class_roster(db: Session, teacher: User) -> list[dict]:
    """Every student who joined the teacher's links, with what they have done.

    Counts only. A teacher sees that a student searched 12 times, never what
    for: the searches are the student's, the class is the teacher's."""
    from sqlalchemy import func

    from app.models.rehearsal import RehearsalRun
    from app.models.search_log import SearchLog
    from app.models.user_event import UserEvent

    links = db.query(ClassLink).filter(ClassLink.teacher_user_id == teacher.id).all()
    if not links:
        return []
    by_link = {l.id: l for l in links}
    joins = (
        db.query(ClassLinkJoin)
        .filter(ClassLinkJoin.class_link_id.in_(by_link), ClassLinkJoin.user_id != teacher.id)
        .order_by(ClassLinkJoin.created_at.desc())
        .all()
    )
    ids = list({j.user_id for j in joins})
    if not ids:
        return []

    def counts(q) -> dict[int, int]:
        return {uid: n for uid, n in q.all()}

    searches = counts(
        db.query(SearchLog.user_id, func.count(SearchLog.id)).filter(SearchLog.user_id.in_(ids)).group_by(SearchLog.user_id)
    )

    def events(name: str) -> dict[int, int]:
        return counts(
            db.query(UserEvent.user_id, func.count(UserEvent.id))
            .filter(UserEvent.user_id.in_(ids), UserEvent.event_name == name)
            .group_by(UserEvent.user_id)
        )

    practised = events("monologue_work_started")
    finished = events("monologue_work_finished")
    scenes = counts(
        db.query(RehearsalRun.user_id, func.count(RehearsalRun.id))
        .filter(RehearsalRun.user_id.in_(ids), RehearsalRun.is_guided.isnot(True))
        .group_by(RehearsalRun.user_id)
    )
    last_seen = {
        uid: ts
        for uid, ts in db.query(UserEvent.user_id, func.max(UserEvent.created_at))
        .filter(UserEvent.user_id.in_(ids))
        .group_by(UserEvent.user_id)
        .all()
    }
    users = {u.id: u for u in db.query(User).filter(User.id.in_(ids)).all()}
    subs = {s.user_id: s for s in db.query(UserSubscription).filter(UserSubscription.user_id.in_(ids)).all()}

    out, seen = [], set()
    for j in joins:
        if j.user_id in seen or j.user_id not in users:
            continue
        seen.add(j.user_id)
        u, sub = users[j.user_id], subs.get(j.user_id)
        on_plus = bool(sub and sub.is_active and sub.is_paid_tier)
        last = _aware(last_seen.get(j.user_id))
        out.append(
            {
                "name": _display_name(u),
                "joined_at": _aware(j.created_at).isoformat(),
                "plus_until": _aware(sub.trial_end).isoformat() if on_plus and sub.trial_end else None,
                "on_plus": on_plus,
                "searches": searches.get(j.user_id, 0),
                "monologues_practised": practised.get(j.user_id, 0),
                "monologues_finished": finished.get(j.user_id, 0),
                "scenes_run": scenes.get(j.user_id, 0),
                "last_active": last.isoformat() if last else None,
                "link": by_link[j.class_link_id].code,
            }
        )
    return out
