"""Organizations: schools, studios, chapters and companies an actor belongs to.

Deliberately separate from `users.organization`, which is free text the user
types about themselves on their own profile and which we never overwrite. The
same institution shows up there as "Northern Michigan University" and as
"nmu.edu", so it cannot group anything. This table is the canonical name we
control; `users.organization_id` is our judgment about who belongs.

See docs/plans/2026-09-05-organizations-admin-design.md.
"""

from app.core.database import Base
from sqlalchemy import Column, DateTime, Integer, String, Text, func

# What kind of thing this is. Not an enum in the database on purpose: the list
# will grow (conservatory, festival, agency) and a CHECK constraint would mean a
# migration every time Canberk meets a new sort of organization.
ORGANIZATION_KINDS = ("school", "studio", "chapter", "company")


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True, index=True)
    # Canonical display name. Unique case-insensitively via
    # uq_organizations_name_lower, so "Parkway Schools" and "parkway schools"
    # cannot both exist and re-create the grouping problem this table solves.
    name = Column(String, nullable=False)
    kind = Column(String, nullable=False, default="school")
    # Free notes: who the contact is, how they were found, what was promised.
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
