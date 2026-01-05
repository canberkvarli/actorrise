from app.core.database import Base
from sqlalchemy import (JSON, Boolean, Column, DateTime, Float, ForeignKey,
                        Integer, String, Text, text as sql_text, ARRAY)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship


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

    created_at = Column(DateTime(timezone=True), server_default=sql_text('now()'))
    updated_at = Column(DateTime(timezone=True), onupdate=sql_text('now()'))

    # Relationship to user
    user = relationship("User", back_populates="actor_profile")


class Play(Base):
    """Source play/script metadata"""
    __tablename__ = "plays"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False, index=True)
    author = Column(String, nullable=False, index=True)
    year_written = Column(Integer, nullable=True)
    genre = Column(String, nullable=False)  # tragedy, comedy, drama, etc.
    category = Column(String, nullable=False, index=True)  # classical, contemporary

    # Legal & Source Info
    copyright_status = Column(String, nullable=False)  # public_domain, copyrighted, unknown
    license_type = Column(String, nullable=True)  # cc_by, fair_use, licensed, etc.
    source_url = Column(String, nullable=True)
    purchase_url = Column(String, nullable=True)  # Link to buy full script
    publisher = Column(String, nullable=True)

    # Full text storage (public domain only)
    full_text = Column(Text, nullable=True)  # Only for public domain
    full_text_url = Column(String, nullable=True)  # External link
    text_format = Column(String, nullable=True)  # plain, tei_xml, html

    # Metadata
    language = Column(String, default="en")
    setting = Column(String, nullable=True)
    time_period = Column(String, nullable=True)
    themes = Column(ARRAY(String), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=sql_text('now()'))
    updated_at = Column(DateTime(timezone=True), onupdate=sql_text('now()'))

    # Relationships
    monologues = relationship("Monologue", back_populates="play")


class Monologue(Base):
    """Individual monologue with AI-analyzed metadata"""
    __tablename__ = "monologues"

    id = Column(Integer, primary_key=True, index=True)
    play_id = Column(Integer, ForeignKey("plays.id"), nullable=False, index=True)

    # Basic Info
    title = Column(String, nullable=False)
    character_name = Column(String, nullable=False, index=True)
    text = Column(Text, nullable=False)  # The actual monologue text
    stage_directions = Column(Text, nullable=True)  # Extracted stage directions

    # Character Requirements (AI-extracted + manual curation)
    character_gender = Column(String, nullable=True, index=True)  # male, female, non-binary, any
    character_age_range = Column(String, nullable=True, index=True)  # 20s, 30-40, 50+, etc.
    character_description = Column(Text, nullable=True)

    # Performance Metadata
    word_count = Column(Integer, nullable=False)
    estimated_duration_seconds = Column(Integer, nullable=False)  # At ~150 wpm
    difficulty_level = Column(String, nullable=True, index=True)  # beginner, intermediate, advanced

    # AI-Analyzed Content
    primary_emotion = Column(String, nullable=True, index=True)  # joy, sadness, anger, fear, etc.
    emotion_scores = Column(JSONB, nullable=True)  # {"joy": 0.2, "sadness": 0.7, "anger": 0.1}
    themes = Column(ARRAY(String), nullable=True)  # love, death, betrayal, identity
    tone = Column(String, nullable=True)  # dramatic, comedic, sarcastic, philosophical

    # Contextual Info
    context_before = Column(Text, nullable=True)  # What happens before this speech
    context_after = Column(Text, nullable=True)
    scene_description = Column(Text, nullable=True)  # Setting and situation

    # Search & Discovery
    embedding = Column(Text, nullable=True)  # Vector embedding as JSON string (will add pgvector later)
    search_tags = Column(ARRAY(String), nullable=True)  # Searchable keywords

    # Usage Analytics
    view_count = Column(Integer, default=0)
    favorite_count = Column(Integer, default=0)
    overdone_score = Column(Float, default=0.0)  # 0.0 = fresh, 1.0 = extremely overdone

    # Quality Control
    is_verified = Column(Boolean, default=False)  # Manual verification
    quality_score = Column(Float, nullable=True)  # AI quality assessment

    created_at = Column(DateTime(timezone=True), server_default=sql_text('now()'))
    updated_at = Column(DateTime(timezone=True), onupdate=sql_text('now()'))

    # Relationships
    play = relationship("Play", back_populates="monologues")
    favorites = relationship("MonologueFavorite", back_populates="monologue")


class MonologueFavorite(Base):
    """User favorites tracking"""
    __tablename__ = "monologue_favorites"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    monologue_id = Column(Integer, ForeignKey("monologues.id"), nullable=False, index=True)
    notes = Column(Text, nullable=True)  # User's performance notes
    created_at = Column(DateTime(timezone=True), server_default=sql_text('now()'))

    # Relationships
    monologue = relationship("Monologue", back_populates="favorites")


class SearchHistory(Base):
    """Track searches for analytics and recommendations"""
    __tablename__ = "search_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    query = Column(String, nullable=False)
    filters = Column(JSONB, nullable=True)  # Applied filters
    result_count = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=sql_text('now()'))

