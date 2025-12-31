from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=True)  # User's display name
    supabase_id = Column(String, unique=True, index=True, nullable=True)  # Supabase user UUID
    hashed_password = Column(String, nullable=True)  # Optional, auth handled by Supabase
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationship to actor profile
    actor_profile = relationship("ActorProfile", back_populates="user", uselist=False)



