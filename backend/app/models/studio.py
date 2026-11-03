"""The Studio notebook: one row a role an actor is working on (CAN-17).

The role itself (its name, the answers to the questions, the moments pinned in
the effort cube) is one JSON document the client owns; the server keeps it so
the work follows the actor to any device. `client_updated_at` is the client's
own clock in ms, and the newer write wins. A delete leaves a tombstone so it
reaches the actor's other devices instead of being re-uploaded by them.
"""

from sqlalchemy import JSON, BigInteger, Boolean, Column, DateTime, ForeignKey, Integer, String, text
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


#: The table and its RLS, in one go. Run at API startup before create_all (so the
#: table never exists without RLS, even for a moment) and by
#: scripts/add_studio_roles_table.py. RLS on with no policies: actors' private
#: notes, reached only by the API over the service connection, never by the
#: Supabase data API.
DDL = [
    text(
        """
        CREATE TABLE IF NOT EXISTS studio_roles (
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role_id VARCHAR(40) NOT NULL,
            data JSONB,
            client_updated_at BIGINT NOT NULL,
            deleted BOOLEAN NOT NULL DEFAULT FALSE,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            PRIMARY KEY (user_id, role_id)
        )
        """
    ),
    text("ALTER TABLE studio_roles ENABLE ROW LEVEL SECURITY"),
]
