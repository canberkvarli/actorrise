from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, JSON, Boolean, Float, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base, is_postgres

# Conditionally import pgvector
if is_postgres:
    try:
        from pgvector.sqlalchemy import Vector
        HAS_PGVECTOR = True
    except ImportError:
        HAS_PGVECTOR = False
        print("Warning: pgvector not installed. Install with: pip install pgvector")
else:
    HAS_PGVECTOR = False


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
    comfort_with_difficult_material = Column(String, default="moderate")
    overdone_alert_sensitivity = Column(Float, default=0.5)
    profile_bias_enabled = Column(Boolean, default=True)
    
    # Headshot
    headshot_url = Column(String, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

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
    difficulty = Column(String)
    excerpt = Column(String)
    full_text_url = Column(String, nullable=True)
    source_url = Column(String, nullable=True)
    # Use Vector type for PostgreSQL with pgvector, fallback to Text for SQLite
    embedding = Column(
        Vector(1536) if (is_postgres and HAS_PGVECTOR) else Text,
        nullable=True
    )  # Vector for PostgreSQL, JSON string for SQLite
    created_at = Column(DateTime(timezone=True), server_default=func.now())

