"""Organizations: schools, studios, chapters and companies an actor belongs to.

Deliberately separate from `users.organization`, which is free text the user
types about themselves on their own profile and which we never overwrite. The
same institution shows up there as "Northern Michigan University" and as
"nmu.edu", so it cannot group anything. This table is the canonical name we
control; `users.organization_id` is our judgment about who belongs.

See docs/plans/2026-09-05-organizations-admin-design.md.
"""

from app.core.database import Base
from sqlalchemy import Column, DateTime, Integer, String, Text, func, text

# What kind of thing this is. Not an enum in the database on purpose: the list
# will grow (conservatory, festival, agency) and a CHECK constraint would mean a
# migration every time Canberk meets a new sort of organization.
ORGANIZATION_KINDS = ("school", "studio", "chapter", "company")

# Partner pipeline, 2026-10-25. An org that used ActorRise gets asked to link to
# it, and may agree to appear on the landing page. "yes" alone shows nothing:
# the landing reads only rows with partner_show set AND partner_approval filled
# in (who said yes, when, in their words), the same written-yes rule as
# data/partners.ts. A teacher cannot approve a district's logo, so a school
# normally appears by name ("name"), and only an org that owns its mark
# (studio, chapter, theatre) as a logo.
PARTNER_STATUSES = ("none", "asked", "yes", "no")
PARTNER_SHOWS = ("name", "logo")
# Students joined before a class counts as having used it enough to ask.
PARTNER_READY_STUDENTS = 10


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

    # See PARTNER_STATUSES above.
    partner_status = Column(String(16), nullable=False, default="none", server_default=text("'none'"))
    # What they agreed to on OUR page: None (nothing), "name", or "logo".
    partner_show = Column(String(8), nullable=True)
    # How they read on our page, e.g. "Gilroy High School drama". Defaults to name.
    partner_display_name = Column(String(200), nullable=True)
    partner_url = Column(String(500), nullable=True)
    partner_logo_url = Column(String(500), nullable=True)
    # The page on THEIR site that links to us, once it exists.
    partner_links_us_at = Column(String(500), nullable=True)
    # Who said yes, when, and their words. Required before anything shows.
    partner_approval = Column(Text, nullable=True)
    partner_updated_at = Column(DateTime(timezone=True), nullable=True)
