from app.core.database import Base
from sqlalchemy import (
    Boolean, Column, DateTime, ForeignKey, Integer, String, Text,
)
from sqlalchemy import text as sql_text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship


class FoundingActor(Base):
    """Public-facing founding actor profile.

    Separate from ActorProfile: this is marketing content (bio, social links,
    multiple headshots) while ActorProfile is private search/match data.
    """

    __tablename__ = "founding_actors"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id"), nullable=True, unique=True, index=True,
    )

    # Identity
    name = Column(String, nullable=False)
    slug = Column(String, nullable=False, unique=True, index=True)
    descriptor = Column(String, nullable=True)

    # Content
    bio = Column(Text, nullable=True)
    quote = Column(Text, nullable=True)

    # Social links as JSON: {"imdb": "...", "website": "...", "instagram": "...", "x": "..."}
    social_links = Column(JSONB, default=dict, nullable=False, server_default="{}")

    # Headshots as JSON array: [{"url": "...", "is_primary": true, "caption": "..."}]
    # Max 3 headshots enforced at API level.
    headshots = Column(JSONB, default=list, nullable=False, server_default="[]")

    # Display ordering on listing page (lower = first)
    display_order = Column(Integer, default=0, nullable=False)

    # Publishing
    is_published = Column(Boolean, default=False, nullable=False)

    # Source tracking (migrated from testimonials.ts)
    source = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=sql_text("now()"))
    updated_at = Column(DateTime(timezone=True), onupdate=sql_text("now()"))

    # Relationship
    user = relationship("User", backref="founding_actor", uselist=False)
