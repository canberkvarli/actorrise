from app.core.database import Base
from pgvector.sqlalchemy import Vector
from sqlalchemy import (ARRAY, JSON, Boolean, Column, DateTime, Float,
                        ForeignKey, Integer, String, Text, UniqueConstraint)
from sqlalchemy import text as sql_text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import deferred, relationship


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
    hair_color = Column(String, nullable=True)  # résumé header stat
    eye_color = Column(String, nullable=True)  # résumé header stat
    location = Column(String)

    # Acting Info
    experience_level = Column(String)
    type = Column(JSON, default=list)  # Can be array of types or single type for backward compatibility
    training_background = Column(String, nullable=True)
    union_status = Column(String)
    special_skills = Column(JSON, default=list)  # résumé: list of skill strings

    # Search Preferences
    preferred_genres = Column(JSON, default=list)
    preferred_mediums = Column(JSON, default=list)  # ["theatre","film","tv"] -> Play.source_type
    overdone_alert_sensitivity = Column(Float, default=0.5)
    profile_bias_enabled = Column(Boolean, default=True)

    # Headshot
    headshot_url = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=sql_text('now()'))
    updated_at = Column(DateTime(timezone=True), onupdate=sql_text('now()'))

    # Relationship to user
    user = relationship("User", back_populates="actor_profile")


class ActorCredit(Base):
    """A single résumé credit (one past role). Grouped by category on the résumé."""

    __tablename__ = "actor_credits"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # theatre | film | tv | commercial | other  (drives résumé grouping)
    category = Column(String, nullable=False, default="theatre")
    production = Column(String, nullable=False)  # show / film / series title
    role = Column(String, nullable=True)
    company = Column(String, nullable=True)  # theatre, studio, network, or production co.
    director = Column(String, nullable=True)
    year = Column(String, nullable=True)  # free-text ("2024", "2023–24") — kept as string
    sort_order = Column(Integer, nullable=False, default=0)

    created_at = Column(DateTime(timezone=True), server_default=sql_text('now()'))
    updated_at = Column(DateTime(timezone=True), onupdate=sql_text('now()'))


class ActorLane(Base):
    """The casting lane read off an actor's credits.

    One row per actor. `credits_hash` is a digest of the credit set that
    produced it, so an edit invalidates the row and a revisit costs nothing.
    `tags` drives the monologue search; `line` and `blurb` are the prose shown
    to the actor and are never used to select anything.
    """

    __tablename__ = "actor_lane"

    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    credits_hash = Column(String, nullable=False)
    line = Column(String, nullable=False)
    blurb = Column(String, nullable=True)
    tags = Column(JSONB(none_as_null=True), nullable=False, default=dict)
    # The picks, cached with the lane that produced them. Same credits, same
    # tags, same corpus, same answer: recomputing meant a pgvector scan on
    # every profile load for a result that had not changed.
    piece_ids = Column(ARRAY(Integer), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=sql_text('now()'))
    updated_at = Column(DateTime(timezone=True), onupdate=sql_text('now()'))


class Play(Base):
    """Source play/script metadata — also used for film & TV screenplays."""
    __tablename__ = "plays"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False, index=True)
    author = Column(String, nullable=False, index=True)
    year_written = Column(Integer, nullable=True)
    genre = Column(String, nullable=False)  # tragedy, comedy, drama, etc.
    category = Column(String, nullable=False, index=True)  # classical, contemporary

    # Source type: "play" (default) | "film" | "tv"
    source_type = Column(String, nullable=False, server_default="play", index=True)
    # Link to film_tv_references for poster, IMDb rating, etc. (NULL for plays)
    film_tv_reference_id = Column(Integer, ForeignKey("film_tv_references.id"), nullable=True, index=True)

    # Legal & Source Info
    copyright_status = Column(String, nullable=False)  # public_domain, copyrighted, unknown
    license_type = Column(String, nullable=True)  # cc_by, fair_use, licensed, etc.
    source_url = Column(String, nullable=True)
    purchase_url = Column(String, nullable=True)  # Link to buy full script
    publisher = Column(String, nullable=True)
    translator = Column(String, nullable=True)  # Translator/adaptor — important for translated classical work

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
    scenes = relationship("Scene", backref="play", lazy="select")
    film_tv_reference = relationship("FilmTvReference", backref="plays")


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
    # Structured render segments: [{type, speaker?, text}, ...]
    #
    # none_as_null is load-bearing. SQLAlchemy's default turns a Python None into
    # the JSON scalar `null`, which is NOT SQL NULL: `text_segments IS NULL` does
    # not match it. Every backfill and audit selects unsegmented rows with that
    # predicate, so 2,331 rows that had been assigned None were invisible to
    # `segment_monologues.py --write` — they read as segmented, were never
    # re-segmented, and were counted as covered.
    text_segments = Column(JSONB(none_as_null=True), nullable=True)

    # Location in play (for classical works)
    # Deferred so DBs without these columns still load; add columns via add_act_scene_columns.py
    act = deferred(Column(Integer, nullable=True, index=True))  # Act number (1, 2, 3, etc.)
    scene = deferred(Column(Integer, nullable=True, index=True))  # Scene number within act

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
    # none_as_null: see text_segments above. Python None must land as SQL NULL,
    # or `IS NULL` silently stops matching the rows that were cleared.
    emotion_scores = Column(JSONB(none_as_null=True), nullable=True)  # {"joy": 0.2, "sadness": 0.7}
    themes = Column(ARRAY(String), nullable=True)  # love, death, betrayal, identity
    tone = Column(String, nullable=True)  # dramatic, comedic, sarcastic, philosophical

    # Contextual Info
    context_before = Column(Text, nullable=True)  # What happens before this speech
    context_after = Column(Text, nullable=True)
    scene_description = Column(Text, nullable=True)  # Setting and situation

    # Search & Discovery
    # Embedding: text-embedding-3-large (1536 dims for pgvector HNSW indexing)
    embedding_vector = deferred(Column(Vector(1536), nullable=True))
    search_tags = Column(ARRAY(String), nullable=True)  # Searchable keywords

    # Usage Analytics
    view_count = Column(Integer, default=0)
    favorite_count = Column(Integer, default=0)
    overdone_score = Column(Float, default=0.0)  # 0.0 = fresh, 1.0 = extremely overdone
    used_in_recent_major_production = Column(Boolean, default=False)  # True if used in major film/TV/theatre (e.g. last 10y)

    # Quality Control
    is_verified = Column(Boolean, default=False)  # Manual verification
    quality_score = Column(Float, nullable=True)  # AI quality assessment

    # Repair / review queue (deferred so DBs without these columns still load;
    # add columns via add_review_columns.py). Set by scripts/repair_monologues.py
    # when a broken monologue cannot be auto-fixed and needs a human decision.
    review_status = deferred(Column(String, nullable=True, index=True))  # None | "pending"
    review_reasons = deferred(Column(ARRAY(String), nullable=True))  # residual quality-gate reasons
    proposed_text = deferred(Column(Text, nullable=True))  # AI's best attempt, awaiting approval

    # Overdone scoring (deferred; add columns via add_overdone_columns.py).
    # overdone_score above is the numeric 0..1 signal; these explain + timestamp it.
    # Set by scripts/score_overdone.py --apply.
    overdone_reason = deferred(Column(Text, nullable=True))  # one-line "why" from the scorer
    overdone_scored_at = deferred(Column(DateTime(timezone=True), nullable=True))  # when scored (idempotency guard)

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
    memorized = Column(Boolean, default=False, nullable=False)  # Actor marked this off-book
    last_studied_at = Column(DateTime(timezone=True), nullable=True)  # Last time the memorize screen was opened
    cut_start_line = Column(Integer, nullable=True)  # Audition cut: first line index (over split text)
    cut_end_line = Column(Integer, nullable=True)  # Audition cut: last line index (inclusive)
    removed_at = Column(DateTime(timezone=True), nullable=True)  # Soft-delete: in "Recently removed", restorable
    reminder_sent_at = Column(DateTime(timezone=True), nullable=True)  # Day-1 "you saved this" nudge sent; claimed atomically so it sends at most once
    created_at = Column(DateTime(timezone=True), server_default=sql_text('now()'))

    # Relationships
    monologue = relationship("Monologue", back_populates="favorites")


class SearchHistory(Base):
    """Track searches for analytics and recommendations"""
    __tablename__ = "search_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    query = Column(String, nullable=False)
    filters = Column(JSONB(none_as_null=True), nullable=True)  # Applied filters
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
    user_script_id = Column(Integer, ForeignKey("user_scripts.id"), nullable=True, index=True)  # Link to user's uploaded script
    is_library = Column(Boolean, default=False, nullable=False, index=True)  # Curated public-domain scene available to all users

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

    # Original snapshot for "Reset to original" (set once on creation, never modified)
    original_snapshot = Column(JSON, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=sql_text('now()'))
    updated_at = Column(DateTime(timezone=True), onupdate=sql_text('now()'))

    # Relationships
    # Play relationship is defined via backref in Play.scenes
    # play = relationship("Play", back_populates="scenes", lazy="select")
    user_script = relationship("UserScript", back_populates="scenes", foreign_keys=[user_script_id])
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
    user_character = Column(String, nullable=False)  # Primary character the user is playing
    # Every character the user speaks for. NULL on sessions created before
    # multi-role existed — read it through session_user_characters(), which falls
    # back to [user_character].
    user_characters = Column(ARRAY(String), nullable=True)
    ai_character = Column(String, nullable=False)  # Which character the AI is playing

    # Session Status
    # in_progress | completed | abandoned (they left, client told us) |
    # timed_out (they vanished; the hourly sweep closed it). abandoned and
    # timed_out both mean "didn't finish" — see services/rehearsal_cleanup.
    status = Column(String, nullable=False, default="in_progress")
    current_line_index = Column(Integer, default=0)  # Where they left off

    # Line Cap (resolved from tier at session start; NULL = unlimited)
    max_lines = Column(Integer, nullable=True)

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


class ExtractionCache(Base):
    """Cache AI extraction results by file content hash to skip re-extraction on re-upload"""
    __tablename__ = "extraction_cache"

    id = Column(Integer, primary_key=True, index=True)
    file_hash = Column(String, nullable=False, unique=True, index=True)  # SHA256 of file content
    extraction_result = Column(JSON, nullable=False)  # Full extraction result (metadata + scenes)
    created_at = Column(DateTime(timezone=True), server_default=sql_text('now()'))


class UserScript(Base):
    """User-uploaded scripts (PDF/text files)"""
    __tablename__ = "user_scripts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)  # NULL for sample scripts
    is_sample = Column(Boolean, default=False, nullable=False)  # True for system sample scripts
    # Green Room: owner opted to share this script with the community library so
    # other actors can rehearse its scenes. Explicit opt-in; unshareable retroactively.
    shared_with_community = Column(
        Boolean, default=False, nullable=False, server_default=sql_text("false"), index=True
    )

    # Script Info
    title = Column(String, nullable=False)  # Script title
    author = Column(String, nullable=False)  # Script author
    description = Column(Text, nullable=True)  # User's description

    # File Info
    original_filename = Column(String, nullable=False)  # "my_script.pdf"
    file_path = Column(String, nullable=True)  # Path to stored file
    file_type = Column(String, nullable=False)  # "pdf", "txt", "docx"
    file_size_bytes = Column(Integer, nullable=True)

    # Extracted Content
    raw_text = Column(Text, nullable=True)  # Full extracted text
    characters = Column(JSON, default=list)  # [{"name": "Sarah", "gender": "female", "description": "..."}, ...]

    # Processing Status
    processing_status = Column(String, default="pending")  # pending, processing, completed, failed
    processing_error = Column(Text, nullable=True)  # Error message if failed
    ai_extraction_completed = Column(Boolean, default=False)

    # Metadata
    genre = Column(String, nullable=True)
    estimated_length_minutes = Column(Integer, nullable=True)
    num_characters = Column(Integer, default=0)
    num_scenes_extracted = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), server_default=sql_text('now()'))
    updated_at = Column(DateTime(timezone=True), onupdate=sql_text('now()'))

    # Relationships
    scenes = relationship("Scene", back_populates="user_script", foreign_keys="Scene.user_script_id")
    tags = relationship(
        "ScriptTag", back_populates="script", cascade="all, delete-orphan"
    )


class ScriptTag(Base):
    """A tag on a shared script. Written by the OWNER only.

    Deliberately not a folksonomy: letting any actor write free text onto
    someone else's upload creates a moderation queue and an abuse surface for a
    solo-run product. The community's voice comes through votes instead (see
    :class:`ScriptTagVote`) — strangers can amplify a tag but never author one,
    so popular tags still rise without anyone policing stranger-written text.
    """
    __tablename__ = "script_tags"
    __table_args__ = (
        UniqueConstraint("user_script_id", "tag", name="uq_script_tag"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_script_id = Column(
        Integer, ForeignKey("user_scripts.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    tag = Column(String(32), nullable=False, index=True)  # normalised, lowercase
    created_at = Column(DateTime(timezone=True), server_default=sql_text("now()"))

    script = relationship("UserScript", back_populates="tags")
    votes = relationship(
        "ScriptTagVote", back_populates="tag", cascade="all, delete-orphan"
    )


class ScriptTagVote(Base):
    """One actor's upvote on one tag. Unique per (tag, user), so it toggles."""
    __tablename__ = "script_tag_votes"
    __table_args__ = (
        UniqueConstraint("script_tag_id", "user_id", name="uq_script_tag_vote"),
    )

    id = Column(Integer, primary_key=True, index=True)
    script_tag_id = Column(
        Integer, ForeignKey("script_tags.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    created_at = Column(DateTime(timezone=True), server_default=sql_text("now()"))

    tag = relationship("ScriptTag", back_populates="votes")


# ============================================================================
# Film/TV Monologue Reference (metadata-only, no script text stored)
# ============================================================================



class FilmTvReference(Base):
    """Film/TV title metadata seeded from IMDb + OMDb. Used for semantic film/TV search."""
    __tablename__ = "film_tv_references"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False, index=True)
    year = Column(Integer, nullable=True, index=True)
    type = Column(String, nullable=True, index=True)  # "movie" or "tvSeries"
    genre = Column(ARRAY(String), nullable=True)
    plot = Column(Text, nullable=True)
    director = Column(String, nullable=True, index=True)
    actors = Column(ARRAY(String), nullable=True)
    runtime_minutes = Column(Integer, nullable=True)
    imdb_id = Column(String, nullable=False, unique=True, index=True)
    imdb_rating = Column(Float, nullable=True, index=True)
    poster_url = Column(String, nullable=True)
    imsdb_url = Column(String, nullable=True)
    # Embedding: text-embedding-3-large (1536 dims for pgvector HNSW indexing).
    # deferred() so the ~20KB/row vector is never shipped to the backend on a
    # normal query — it's only used server-side in pgvector ORDER BY (cosine).
    # Loading it on every film/TV search/browse was burning Supabase egress.
    embedding = deferred(Column(Vector(1536), nullable=True))
    created_at = Column(DateTime(timezone=True), server_default=sql_text("now()"))

    # Relationships
    favorites = relationship("FilmTvFavorite", back_populates="film_tv_reference")


class FilmTvFavorite(Base):
    """User favorites for film/TV references (saved scripts)."""
    __tablename__ = "film_tv_favorites"
    __table_args__ = (UniqueConstraint("user_id", "film_tv_reference_id", name="uq_film_tv_favorites_user_reference"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    film_tv_reference_id = Column(Integer, ForeignKey("film_tv_references.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=sql_text("now()"))

    # Relationships
    film_tv_reference = relationship("FilmTvReference", back_populates="favorites")
