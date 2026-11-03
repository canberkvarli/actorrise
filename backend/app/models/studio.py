"""The Studio notebook: one row a role an actor is working on (CAN-17).

The role itself (its name, the answers to the questions, the moments pinned in
the effort cube) is one JSON document the client owns; the server keeps it so
the work follows the actor to any device. `client_updated_at` is the client's
own clock in ms, and the newer write wins. A delete leaves a tombstone so it
reaches the actor's other devices instead of being re-uploaded by them.
"""

from sqlalchemy import JSON, BigInteger, Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func

from app.core.database import Base


class StudioRole(Base):
    __tablename__ = "studio_roles"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    role_id = Column(String(40), primary_key=True)
    data = Column(JSON().with_variant(JSONB(), "postgresql"), nullable=True)
    client_updated_at = Column(BigInteger, nullable=False)
    deleted = Column(Boolean, nullable=False, default=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
