"""Class links: one per comped teacher, handed to their students.

A student who signs up (or signs in) through actorrise.com/join/<code> gets the
student month on Plus and is tied to that teacher. It replaces the class-list
step, where the teacher had to collect addresses and email them in, and the
grant waited on Canberk doing it by hand (services/class_links.py).

Only Canberk makes a link (scripts/class_link.py), so ticking "student" at
signup still gives nobody anything. A link that leaks is switched off with
`active = false`, and `max_uses` caps what a leak can cost before anyone looks.
"""

from datetime import datetime, timezone

from app.core.database import Base
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, UniqueConstraint, func


def _now() -> datetime:
    return datetime.now(timezone.utc)


class ClassLink(Base):
    __tablename__ = "class_links"

    id = Column(Integer, primary_key=True, index=True)
    # What goes in the URL. Lowercase letters, digits and hyphens.
    code = Column(String(64), nullable=False, unique=True, index=True)
    teacher_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True)
    # Shown on the join page: "Bobby's class at NMU". Public, so a first name
    # and a school, nothing more.
    teacher_label = Column(String(80), nullable=False)
    school_label = Column(String(120), nullable=True)
    days = Column(Integer, nullable=False, default=30)
    # Grants, not visits: a student who was already paying does not use one up.
    max_uses = Column(Integer, nullable=False, default=60)
    active = Column(Boolean, nullable=False, default=True)
    # A paid class plan: every student on the link is on Plus until this date,
    # however late they joined. Null is the free month (`days` from joining).
    plan_ends_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), default=_now, nullable=False)


class ClassLinkJoin(Base):
    """One row per person who came in through a link, granted or not.

    `outcome` says what happened: granted, paying (already on a paid plan, left
    alone), already (a longer comp was running, left alone), full. One row per
    person per link, so opening the link twice cannot grant twice.
    """

    __tablename__ = "class_link_joins"
    __table_args__ = (UniqueConstraint("class_link_id", "user_id", name="uq_class_link_joins_link_user"),)

    id = Column(Integer, primary_key=True, index=True)
    class_link_id = Column(Integer, ForeignKey("class_links.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    outcome = Column(String(16), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), default=_now, nullable=False)


class ClassLinkInvite(Base):
    """An address the teacher already sent, approved before it has an account.

    When an account with this email is created, it joins the link's class by
    itself (services/class_links.claim_invites), so a teacher who sent a class
    list does nothing more: no link to pass on. Lowercased on the way in.
    """

    __tablename__ = "class_link_invites"
    __table_args__ = (UniqueConstraint("class_link_id", "email", name="uq_class_link_invites_link_email"),)

    id = Column(Integer, primary_key=True, index=True)
    class_link_id = Column(Integer, ForeignKey("class_links.id", ondelete="CASCADE"), nullable=False, index=True)
    email = Column(String, nullable=False, index=True)
    claimed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), default=_now, nullable=False)
