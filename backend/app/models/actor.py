from app.core.database import Base
from sqlalchemy import (JSON, Boolean, Column, DateTime, Float, ForeignKey,
                        Integer, String, text)
from sqlalchemy.orm import relationship

# Import pgvector for PostgreSQL vector support
try:
    from pgvector.sqlalchemy import Vector
except ImportError as exc:
    raise ImportError("pgvector is required. Install with: pip install pgvector") from exc


class ActorProfile(Base):
    __tablename__ = "actor_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    
    # Basic Info
    name = Column(String)
    age_range = Column(String)
    gender = Column(String)
    ethnicity = Column(String, nullable=True)
    height = Column(String, nullable=True)
    build = Column(String, nullable=True)
    location = Column(String)
    
    # Acting Info
    experience_level = Column(String)
    type = Column(String)
    training_background = Column(String, nullable=True)
    union_status = Column(String)
    
    # Search Preferences
    preferred_genres = Column(JSON, default=list)
    overdone_alert_sensitivity = Column(Float, default=0.5)
    profile_bias_enabled = Column(Boolean, default=True)
    
    # Headshot
    headshot_url = Column(String, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=text('now()'))
    updated_at = Column(DateTime(timezone=True), onupdate=text('now()'))

    # Relationship to user
    user = relationship("User", back_populates="actor_profile")


class Monologue(Base):
    __tablename__ = "monologues"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    author = Column(String, nullable=False)
    age_range = Column(String)
    gender = Column(String)
    genre = Column(String)
    theme = Column(String, nullable=True)
    category = Column(String, nullable=True)  # Contemporary or Classical
    excerpt = Column(String)
    full_text_url = Column(String, nullable=True)
    source_url = Column(String, nullable=True)
    # Vector embedding for semantic search (pgvector)
    embedding = Column(Vector(1536), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=text('now()'))

