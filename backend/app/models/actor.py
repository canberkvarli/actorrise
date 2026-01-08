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
    scenes = relationship("Scene", back_populates="play")


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


# ============================================================================
# ScenePartner Models - AI Scene Practice Feature
# ============================================================================

class Scene(Base):
    """Two-person scene extracted from a play"""
    __tablename__ = "scenes"

    id = Column(Integer, primary_key=True, index=True)
    play_id = Column(Integer, ForeignKey("plays.id"), nullable=False, index=True)

    # Scene Info
    title = Column(String, nullable=False)  # "Romeo & Juliet Balcony Scene"
    act = Column(String, nullable=True)  # "Act 2"
    scene_number = Column(String, nullable=True)  # "Scene 2"
    description = Column(Text, nullable=True)  # Brief description of what happens

    # Characters
    character_1_name = Column(String, nullable=False, index=True)
    character_2_name = Column(String, nullable=False, index=True)
    character_1_gender = Column(String, nullable=True)
    character_2_gender = Column(String, nullable=True)
    character_1_age_range = Column(String, nullable=True)
    character_2_age_range = Column(String, nullable=True)

    # Scene Metadata
    line_count = Column(Integer, nullable=False)  # Total number of lines
    estimated_duration_seconds = Column(Integer, nullable=False)
    difficulty_level = Column(String, nullable=True, index=True)  # beginner, intermediate, advanced

    # Emotional Arc
    primary_emotions = Column(ARRAY(String), nullable=True)  # ["love", "tension", "desperation"]
    relationship_dynamic = Column(String, nullable=True)  # "romantic", "adversarial", "familial"
    tone = Column(String, nullable=True)  # "romantic", "comedic", "tragic", "tense"

    # Context
    context_before = Column(Text, nullable=True)  # What happens before
    context_after = Column(Text, nullable=True)  # What happens after
    setting = Column(String, nullable=True)  # "Capulet's orchard at night"

    # Analytics
    rehearsal_count = Column(Integer, default=0)  # How many times rehearsed
    favorite_count = Column(Integer, default=0)
    average_rating = Column(Float, nullable=True)

    # Quality Control
    is_verified = Column(Boolean, default=False)
    quality_score = Column(Float, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=sql_text('now()'))
    updated_at = Column(DateTime(timezone=True), onupdate=sql_text('now()'))

    # Relationships
    play = relationship("Play", backref="scenes")
    lines = relationship("SceneLine", back_populates="scene", order_by="SceneLine.line_order")
    rehearsal_sessions = relationship("RehearsalSession", back_populates="scene")


class SceneLine(Base):
    """Individual line of dialogue in a scene"""
    __tablename__ = "scene_lines"

    id = Column(Integer, primary_key=True, index=True)
    scene_id = Column(Integer, ForeignKey("scenes.id"), nullable=False, index=True)

    # Line Info
    line_order = Column(Integer, nullable=False, index=True)  # Order in the scene (0, 1, 2, ...)
    character_name = Column(String, nullable=False)  # Which character speaks
    text = Column(Text, nullable=False)  # The actual line
    stage_direction = Column(Text, nullable=True)  # "[aside]" or "[laughing]"

    # Line Metadata
    word_count = Column(Integer, nullable=False)
    primary_emotion = Column(String, nullable=True)  # Emotion for this line

    created_at = Column(DateTime(timezone=True), server_default=sql_text('now()'))

    # Relationships
    scene = relationship("Scene", back_populates="lines")


class RehearsalSession(Base):
    """A practice session with AI scene partner"""
    __tablename__ = "rehearsal_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    scene_id = Column(Integer, ForeignKey("scenes.id"), nullable=False, index=True)

    # Session Config
    user_character = Column(String, nullable=False)  # Which character the user is playing
    ai_character = Column(String, nullable=False)  # Which character the AI is playing

    # Session Status
    status = Column(String, nullable=False, default="in_progress")  # in_progress, completed, abandoned
    current_line_index = Column(Integer, default=0)  # Where they left off

    # Performance Metrics
    total_lines_delivered = Column(Integer, default=0)
    lines_retried = Column(Integer, default=0)  # How many times user asked to retry
    completion_percentage = Column(Float, default=0.0)

    # AI Feedback Summary
    overall_feedback = Column(Text, nullable=True)  # AI's overall assessment
    strengths = Column(ARRAY(String), nullable=True)  # What user did well
    areas_to_improve = Column(ARRAY(String), nullable=True)  # What to work on
    overall_rating = Column(Float, nullable=True)  # 1-5 stars

    # Session Metadata
    duration_seconds = Column(Integer, nullable=True)  # How long the session took
    started_at = Column(DateTime(timezone=True), server_default=sql_text('now()'))
    completed_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=sql_text('now()'))
    updated_at = Column(DateTime(timezone=True), onupdate=sql_text('now()'))

    # Relationships
    scene = relationship("Scene", back_populates="rehearsal_sessions")
    line_deliveries = relationship("RehearsalLineDelivery", back_populates="session", order_by="RehearsalLineDelivery.delivery_order")


class RehearsalLineDelivery(Base):
    """Record of a single line delivery during rehearsal"""
    __tablename__ = "rehearsal_line_deliveries"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("rehearsal_sessions.id"), nullable=False, index=True)
    scene_line_id = Column(Integer, ForeignKey("scene_lines.id"), nullable=False)

    # Delivery Info
    delivery_order = Column(Integer, nullable=False)  # Order in this session
    user_input = Column(Text, nullable=False)  # What the user typed/said
    ai_response = Column(Text, nullable=True)  # AI's line in response

    # AI Feedback
    feedback = Column(Text, nullable=True)  # Feedback on this specific delivery
    emotion_detected = Column(String, nullable=True)  # What emotion AI detected
    pacing_feedback = Column(String, nullable=True)  # "good", "too_fast", "too_slow"
    was_retry = Column(Boolean, default=False)  # Did user retry this line?

    # Metadata
    delivered_at = Column(DateTime(timezone=True), server_default=sql_text('now()'))

    # Relationships
    session = relationship("RehearsalSession", back_populates="line_deliveries")


class SceneFavorite(Base):
    """User favorites for scenes"""
    __tablename__ = "scene_favorites"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    scene_id = Column(Integer, ForeignKey("scenes.id"), nullable=False, index=True)
    notes = Column(Text, nullable=True)  # User's notes about this scene
    created_at = Column(DateTime(timezone=True), server_default=sql_text('now()'))

