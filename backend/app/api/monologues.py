"""API endpoints for monologue search and discovery."""

from typing import List, Optional, cast

from app.api.auth import get_current_user
from app.core.database import get_db
from app.middleware.rate_limiting import require_ai_search_when_query
from app.models.actor import Monologue, MonologueFavorite, Play
from app.models.user import User
from app.services.search.recommender import Recommender
from app.services.search.semantic_search import SemanticSearch
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/monologues", tags=["monologues"])


# Pydantic schemas
class MonologueResponse(BaseModel):
    id: int
    title: str
    character_name: str
    text: str
    stage_directions: Optional[str]
    play_title: str
    play_id: int
    author: str
    category: str
    character_gender: Optional[str]
    character_age_range: Optional[str]
    primary_emotion: Optional[str]
    emotion_scores: Optional[dict]
    themes: Optional[List[str]]
    tone: Optional[str]
    difficulty_level: Optional[str]
    word_count: int
    estimated_duration_seconds: int
    view_count: int
    favorite_count: int
    is_favorited: bool = False
    overdone_score: float
    scene_description: Optional[str]
    act: Optional[int] = None  # Act number (for classical plays)
    scene: Optional[int] = None  # Scene number (for classical plays)
    relevance_score: Optional[float] = None  # Similarity score from search (0.0-1.0)
    match_type: Optional[str] = None  # "exact_quote" | "fuzzy_quote" when this monologue is the actual quote match
    source_url: Optional[str] = None  # Link to original source (e.g. Project Gutenberg) for attribution

    class Config:
        from_attributes = True


class SearchResponse(BaseModel):
    """Standardized search response with pagination metadata."""

    results: List[MonologueResponse]
    total: int
    page: int
    page_size: int


class PlayResponse(BaseModel):
    id: int
    title: str
    author: str
    year_written: Optional[int]
    genre: str
    category: str
    source_url: Optional[str]

    class Config:
        from_attributes = True


class FavoriteNoteUpdate(BaseModel):
    notes: Optional[str] = None


def _monologue_to_response(
    m: Monologue,
    is_favorited: bool = False,
    relevance_score: Optional[float] = None,
    match_type: Optional[str] = None,
) -> MonologueResponse:
    """Build MonologueResponse from ORM instance with correct types for the type checker."""
    play = m.play
    return MonologueResponse(
        id=cast(int, m.id),
        title=cast(str, m.title),
        character_name=cast(str, m.character_name),
        text=cast(str, m.text),
        stage_directions=cast(Optional[str], m.stage_directions),
        play_title=cast(str, play.title),
        play_id=cast(int, play.id),
        author=cast(str, play.author),
        category=cast(str, play.category),
        character_gender=cast(Optional[str], m.character_gender),
        character_age_range=cast(Optional[str], m.character_age_range),
        primary_emotion=cast(Optional[str], m.primary_emotion),
        emotion_scores=cast(Optional[dict], m.emotion_scores),
        themes=(list(cast(list, m.themes)) if m.themes is not None else []) or [],
        tone=cast(Optional[str], m.tone),
        difficulty_level=cast(Optional[str], m.difficulty_level),
        word_count=cast(int, m.word_count),
        estimated_duration_seconds=cast(int, m.estimated_duration_seconds),
        view_count=cast(int, m.view_count),
        favorite_count=cast(int, m.favorite_count),
        is_favorited=is_favorited,
        overdone_score=cast(float, m.overdone_score),
        scene_description=cast(Optional[str], m.scene_description),
        act=cast(Optional[int], m.act),
        scene=cast(Optional[int], m.scene),
        relevance_score=relevance_score,
        match_type=match_type,
        source_url=cast(Optional[str], play.source_url),
    )


def _play_to_response(p: Play) -> PlayResponse:
    """Build PlayResponse from ORM instance with correct types for the type checker."""
    return PlayResponse(
        id=cast(int, p.id),
        title=cast(str, p.title),
        author=cast(str, p.author),
        year_written=cast(Optional[int], p.year_written),
        genre=cast(str, p.genre),
        category=cast(str, p.category),
        source_url=cast(Optional[str], p.source_url),
    )


@router.get("/search", response_model=SearchResponse)
async def search_monologues(
    q: Optional[str] = Query(None, max_length=500, description="Search query (omit for discover/random)"),
    gender: Optional[str] = None,
    age_range: Optional[str] = None,
    emotion: Optional[str] = None,
    theme: Optional[str] = None,
    difficulty: Optional[str] = None,
    category: Optional[str] = None,
    author: Optional[str] = None,
    act: Optional[int] = Query(None, ge=1, le=10, description="Act number (1-10)"),
    scene: Optional[int] = Query(None, ge=1, le=20, description="Scene number (1-20)"),
    max_duration: Optional[int] = None,
    limit: int = Query(20, le=100),
    page: int = Query(1, ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _ai_search_gate: bool = Depends(require_ai_search_when_query),
):
    """
    Semantic search for monologues. Same contract for dashboard and /search page.

    When q is provided: hybrid semantic + keyword search.
    When q is omitted or empty: returns discover (random) monologues with filters.

    Example queries:
    - "sad monologue about loss"
    - "funny piece for young woman"
    - "shakespearean tragedy about revenge"
    """

    # Build filters
    filters = {}
    if gender:
        filters['gender'] = gender
    if age_range:
        filters['age_range'] = age_range
    if emotion:
        filters['emotion'] = emotion
    if theme:
        filters['theme'] = theme
    if difficulty:
        filters['difficulty'] = difficulty
    if category:
        filters['category'] = category
    if author:
        filters['author'] = author
    if act:
        filters['act'] = act
    if scene:
        filters['scene'] = scene
    if max_duration:
        filters['max_duration'] = max_duration

    search_service = SemanticSearch(db)
    # Fetch more results than requested to get accurate total for pagination
    fetch_limit = max(limit * 3, 100)  # Fetch 3x or at least 100 to get better total estimate

    # Track whether we have relevance scores (semantic search vs random/discover)
    has_scores = False
    all_results_with_scores: list[tuple[Monologue, float]] = []

    quote_match_types: dict[int, str] = {}
    actor_profile_for_search: dict | None = None
    if current_user.actor_profile:
        ap = current_user.actor_profile
        actor_profile_for_search = {
            "gender": (ap.gender or "").strip(),
            "age_range": (ap.age_range or "").strip(),
            "profile_bias_enabled": getattr(ap, "profile_bias_enabled", True),
        }
    if q and q.strip():
        # Semantic search returns (list of (Monologue, score), quote_match_types)
        all_results_with_scores, quote_match_types = search_service.search(
            q.strip(),
            limit=fetch_limit,
            filters=filters,
            user_id=cast(int, current_user.id),
            actor_profile=actor_profile_for_search,
        )
        has_scores = True
    else:
        # Random/discover returns just Monologues, wrap with None score
        random_results = search_service.get_random_monologues(limit=fetch_limit, filters=filters)
        all_results_with_scores = [(m, 0.0) for m in random_results]

    # Apply pagination
    offset = (page - 1) * limit
    results_with_scores = all_results_with_scores[offset:offset + limit]
    total = len(all_results_with_scores)

    # Get user's favorites - OPTIMIZED: only for result set (not all favorites)
    result_ids = [m.id for m, _ in results_with_scores]
    favorites = db.query(MonologueFavorite.monologue_id).filter(
        MonologueFavorite.user_id == current_user.id,
        MonologueFavorite.monologue_id.in_(result_ids)  # Only fetch for these results
    ).all()
    favorite_ids = {f[0] for f in favorites}

    # Format response with relevance scores and quote match type (only for semantic search)
    monologue_responses = [
        _monologue_to_response(
            m,
            is_favorited=(m.id in favorite_ids),
            relevance_score=score if has_scores else None,
            match_type=quote_match_types.get(m.id) if has_scores else None,
        )
        for m, score in results_with_scores
    ]

    return SearchResponse(
        results=monologue_responses,
        total=total,
        page=page,
        page_size=limit,
    )


@router.get("/recommendations", response_model=List[MonologueResponse])
async def get_recommendations(
    limit: int = Query(20, le=100),
    fast: bool = Query(False, description="Use SQL-only for faster response (e.g. dashboard)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get personalized monologue recommendations based on actor profile"""

    # Get actor profile
    actor_profile = current_user.actor_profile

    if not actor_profile:
        raise HTTPException(
            status_code=400,
            detail="Actor profile not found. Please complete your profile first."
        )

    # Get recommendations (fast=True skips semantic search for quicker dashboard load)
    recommender = Recommender(db)
    results = recommender.recommend_for_actor(actor_profile, limit=limit, fast=fast)

    # Get favorites - OPTIMIZED: only for result set
    result_ids = [m.id for m in results]
    favorites = db.query(MonologueFavorite.monologue_id).filter(
        MonologueFavorite.user_id == current_user.id,
        MonologueFavorite.monologue_id.in_(result_ids)
    ).all()
    favorite_ids = {f[0] for f in favorites}

    # Format response
    return [
        _monologue_to_response(m, is_favorited=(m.id in favorite_ids))
        for m in results
    ]


@router.get("/discover", response_model=List[MonologueResponse])
async def discover_monologues(
    limit: int = Query(10, le=50),
    category: Optional[str] = None,
    difficulty: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get random monologues for discovery"""

    filters = {}
    if category:
        filters['category'] = category
    if difficulty:
        filters['difficulty'] = difficulty

    search_service = SemanticSearch(db)
    results = search_service.get_random_monologues(limit=limit, filters=filters)

    # Get favorites - OPTIMIZED: only for result set
    result_ids = [m.id for m in results]
    favorites = db.query(MonologueFavorite.monologue_id).filter(
        MonologueFavorite.user_id == current_user.id,
        MonologueFavorite.monologue_id.in_(result_ids)
    ).all()
    favorite_ids = {f[0] for f in favorites}

    return [
        _monologue_to_response(m, is_favorited=(m.id in favorite_ids))
        for m in results
    ]


@router.get("/trending", response_model=List[MonologueResponse])
async def get_trending(
    limit: int = Query(20, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get trending monologues"""

    recommender = Recommender(db)
    results = recommender.get_trending_monologues(limit=limit)

    # Get favorites - OPTIMIZED: only for result set
    result_ids = [m.id for m in results]
    favorites = db.query(MonologueFavorite.monologue_id).filter(
        MonologueFavorite.user_id == current_user.id,
        MonologueFavorite.monologue_id.in_(result_ids)
    ).all()
    favorite_ids = {f[0] for f in favorites}

    return [
        _monologue_to_response(m, is_favorited=(m.id in favorite_ids))
        for m in results
    ]


@router.get("/{monologue_id}", response_model=MonologueResponse)
async def get_monologue(
    monologue_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get detailed monologue information"""

    monologue = db.query(Monologue).filter(Monologue.id == monologue_id).first()

    if not monologue:
        raise HTTPException(status_code=404, detail="Monologue not found")

    # Increment view count
    monologue.view_count = int(monologue.view_count) + 1  # type: ignore[assignment]
    db.commit()

    # Check if favorited
    is_favorited = db.query(MonologueFavorite).filter(
        MonologueFavorite.user_id == current_user.id,
        MonologueFavorite.monologue_id == monologue_id
    ).first() is not None

    return _monologue_to_response(monologue, is_favorited=is_favorited)


@router.post("/{monologue_id}/favorite")
async def favorite_monologue(
    monologue_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Add monologue to favorites"""

    # Check if monologue exists
    monologue = db.query(Monologue).filter(Monologue.id == monologue_id).first()
    if not monologue:
        raise HTTPException(status_code=404, detail="Monologue not found")

    # Check if already favorited
    existing = db.query(MonologueFavorite).filter(
        MonologueFavorite.user_id == current_user.id,
        MonologueFavorite.monologue_id == monologue_id
    ).first()

    if existing:
        return {"message": "Already favorited", "id": existing.id}

    # Create favorite
    favorite = MonologueFavorite(
        user_id=current_user.id,
        monologue_id=monologue_id
    )
    db.add(favorite)

    # Update favorite count
    monologue.favorite_count = int(monologue.favorite_count) + 1  # type: ignore[assignment]

    db.commit()

    return {"message": "Favorited successfully", "id": favorite.id}


@router.delete("/{monologue_id}/favorite")
async def unfavorite_monologue(
    monologue_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Remove monologue from favorites"""

    favorite = db.query(MonologueFavorite).filter(
        MonologueFavorite.user_id == current_user.id,
        MonologueFavorite.monologue_id == monologue_id
    ).first()

    if not favorite:
        raise HTTPException(status_code=404, detail="Favorite not found")

    db.delete(favorite)

    # Update favorite count
    monologue = db.query(Monologue).get(monologue_id)
    if monologue and int(monologue.favorite_count) > 0:
        monologue.favorite_count = int(monologue.favorite_count) - 1  # type: ignore[assignment]

    db.commit()

    return {"message": "Unfavorited successfully"}


@router.patch("/{monologue_id}/favorite/notes")
async def update_favorite_notes(
    monologue_id: int,
    data: FavoriteNoteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update performance notes for a favorited monologue"""

    favorite = db.query(MonologueFavorite).filter(
        MonologueFavorite.user_id == current_user.id,
        MonologueFavorite.monologue_id == monologue_id
    ).first()

    if not favorite:
        raise HTTPException(status_code=404, detail="Favorite not found")

    setattr(favorite, "notes", data.notes)
    db.commit()

    return {"message": "Notes updated successfully"}


@router.get("/{monologue_id}/similar", response_model=List[MonologueResponse])
async def get_similar_monologues(
    monologue_id: int,
    limit: int = Query(10, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get similar monologues"""

    # Check if monologue exists
    monologue = db.query(Monologue).filter(Monologue.id == monologue_id).first()
    if not monologue:
        raise HTTPException(status_code=404, detail="Monologue not found")

    recommender = Recommender(db)
    results = recommender.get_similar_monologues(monologue_id, limit=limit)

    # Get favorites - OPTIMIZED: only for result set
    result_ids = [m.id for m in results]
    favorites = db.query(MonologueFavorite.monologue_id).filter(
        MonologueFavorite.user_id == current_user.id,
        MonologueFavorite.monologue_id.in_(result_ids)
    ).all()
    favorite_ids = {f[0] for f in favorites}

    return [
        _monologue_to_response(m, is_favorited=(m.id in favorite_ids))
        for m in results
    ]


@router.get("/favorites/my", response_model=List[MonologueResponse])
async def get_my_favorites(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get user's favorited monologues, ordered by last added first."""

    favorites = (
        db.query(MonologueFavorite)
        .filter(MonologueFavorite.user_id == current_user.id)
        .order_by(MonologueFavorite.created_at.desc())
        .all()
    )

    if not favorites:
        return []

    monologues = (
        db.query(Monologue)
        .filter(Monologue.id.in_([f.monologue_id for f in favorites]))
        .all()
    )
    mono_by_id = {m.id: m for m in monologues}

    # Preserve order: last added first
    return [
        _monologue_to_response(mono_by_id[f.monologue_id], is_favorited=True)
        for f in favorites
        if f.monologue_id in mono_by_id
    ]


@router.get("/plays/all", response_model=List[PlayResponse])
async def get_all_plays(
    category: Optional[str] = None,
    author: Optional[str] = None,
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user)
):
    """Get all plays in the database"""

    query = db.query(Play)

    if category:
        query = query.filter(Play.category == category)

    if author:
        query = query.filter(Play.author.ilike(f'%{author}%'))

    plays = query.order_by(Play.author, Play.title).limit(limit).all()

    return [_play_to_response(p) for p in plays]


@router.get("/stats/database", )
async def get_database_stats(
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user)
):
    """Get database statistics"""

    total_plays = db.query(Play).count()
    total_monologues = db.query(Monologue).count()
    classical_plays = db.query(Play).filter(Play.category == 'classical').count()
    contemporary_plays = db.query(Play).filter(Play.category == 'contemporary').count()

    analyzed_monologues = db.query(Monologue).filter(
        Monologue.embedding.isnot(None)
    ).count()

    return {
        "total_plays": total_plays,
        "total_monologues": total_monologues,
        "classical_plays": classical_plays,
        "contemporary_plays": contemporary_plays,
        "analyzed_monologues": analyzed_monologues,
        "analysis_completion": round(analyzed_monologues / total_monologues * 100, 1) if total_monologues > 0 else 0
    }


@router.get("/performance-metrics")
async def get_performance_metrics(
    _db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user)
):
    """
    Get search optimization performance metrics.

    Returns:
        - Cost savings vs baseline
        - Tier distribution (keyword-only, keyword+embedding, full AI)
        - Cache performance statistics
        - Monthly cost projections

    Note: This endpoint is a placeholder. In production, metrics should be
    tracked globally across all requests and stored in a metrics service.
    """
    # TODO: Implement metrics tracking
    # For now, return placeholder data
    return {
        "cost_savings_percent": 0.0,
        "tier_distribution": {
            "keyword_only": 0,
            "keyword_embedding": 0,
            "full_ai": 0
        },
        "cache_hit_rate": 0.0,
        "monthly_cost_projection": 0.0
    }


@router.get("/debug/author-distribution")
async def get_author_distribution(db: Session = Depends(get_db)):
    """
    Debug endpoint: Get distribution of monologues by author.
    This helps diagnose if only certain authors are in the database.

    Access via: http://localhost:8000/api/monologues/debug/author-distribution
    """
    from sqlalchemy import func as sql_func

    # Get count of monologues by author (sql_func.count is SQLAlchemy's count generator)
    author_counts = db.query(
        Play.author,
        sql_func.count(Monologue.id).label('monologue_count'),  # pylint: disable=not-callable
        sql_func.count(Monologue.embedding).label('with_embedding'),  # pylint: disable=not-callable
    ).join(
        Monologue, Monologue.play_id == Play.id
    ).group_by(
        Play.author
    ).order_by(
        sql_func.count(Monologue.id).desc()  # pylint: disable=not-callable
    ).all()

    total_monologues = db.query(Monologue).count()
    total_with_embeddings = db.query(Monologue).filter(
        Monologue.embedding.isnot(None)
    ).count()

    result = {
        "total_monologues": total_monologues,
        "total_with_embeddings": total_with_embeddings,
        "embedding_completion": round(total_with_embeddings / total_monologues * 100, 1) if total_monologues > 0 else 0,
        "authors": [
            {
                "author": author,
                "monologue_count": count,
                "with_embedding": with_emb,
                "embedding_percentage": round(with_emb / count * 100, 1) if count > 0 else 0
            }
            for author, count, with_emb in author_counts
        ]
    }

    # Also print to console for easy debugging
    print("\n" + "="*70)
    print("DATABASE AUTHOR DISTRIBUTION")
    print("="*70)
    print(f"Total monologues: {result['total_monologues']}")
    print(f"With embeddings: {result['total_with_embeddings']} ({result['embedding_completion']}%)")
    print(f"\n{'Author':<30} {'Count':>8} {'w/Embed':>10} {'%':>6}")
    print(f"{'-'*70}")
    for author_data in result['authors']:
        print(f"{author_data['author']:<30} {author_data['monologue_count']:>8} "
              f"{author_data['with_embedding']:>10} {author_data['embedding_percentage']:>5.1f}%")
    print(f"{'='*70}\n")

    return result


class MonologueUpload(BaseModel):
    """Schema for uploading a custom monologue"""
    title: str
    character_name: str
    text: str
    stage_directions: Optional[str] = None
    play_title: str
    author: str
    character_gender: Optional[str] = None
    character_age_range: Optional[str] = None
    notes: Optional[str] = None  # User's notes about the piece


@router.post("/upload", response_model=MonologueResponse)
async def upload_monologue(
    upload: MonologueUpload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Upload a custom monologue from user's own script.

    This allows users to upload their own scripts and use them with
    Scene Partner and other features.
    """
    import json

    from app.services.ai.content_analyzer import ContentAnalyzer

    try:
        # Check if play exists (user-uploaded custom play)
        play = db.query(Play).filter(
            Play.title == upload.play_title,
            Play.author == upload.author,
            Play.copyright_status == 'user_uploaded'
        ).first()

        if not play:
            # Create a custom play record for user uploads
            play = Play(
                title=upload.play_title,
                author=upload.author,
                year_written=None,
                genre='Custom',
                category='contemporary',
                copyright_status='user_uploaded',
                license_type='user_content',
                source_url=None,
                full_text=None,  # Don't store full text for user uploads
                text_format='plain'
            )
            db.add(play)
            db.commit()
            db.refresh(play)

        # Use AI to analyze the monologue
        analyzer = ContentAnalyzer()
        analysis = analyzer.analyze_monologue(
            text=upload.text,
            character=upload.character_name,
            play_title=upload.play_title,
            author=upload.author
        )

        # Generate embedding for search
        embedding = analyzer.generate_embedding(
            f"{upload.character_name} from {upload.play_title}: {upload.text[:500]}"
        )

        # Calculate word count and duration
        word_count = len(upload.text.split())
        duration_seconds = int((word_count / 150) * 60)

        # Use provided gender/age if available, otherwise use AI analysis
        character_gender = upload.character_gender or analysis.get('character_gender')
        character_age_range = upload.character_age_range or analysis.get('character_age_range')

        # Create monologue record
        monologue = Monologue(
            play_id=play.id,
            title=upload.title,
            character_name=upload.character_name,
            text=upload.text,
            stage_directions=upload.stage_directions,
            character_gender=character_gender,
            character_age_range=character_age_range,
            primary_emotion=analysis.get('primary_emotion'),
            emotion_scores=analysis.get('emotion_scores', {}),
            themes=analysis.get('themes', []),
            tone=analysis.get('tone'),
            difficulty_level=analysis.get('difficulty_level'),
            word_count=word_count,
            estimated_duration_seconds=duration_seconds,
            embedding=json.dumps(embedding) if embedding else None,
            overdone_score=0.0,  # User uploads start at 0
            is_verified=False  # Mark as user content
        )

        db.add(monologue)
        db.commit()
        db.refresh(monologue)

        # Automatically favorite the uploaded monologue for the user
        favorite = MonologueFavorite(
            user_id=current_user.id,
            monologue_id=monologue.id,
            notes=upload.notes
        )
        db.add(favorite)
        monologue.favorite_count = int(monologue.favorite_count) + 1  # type: ignore[assignment]
        db.commit()

        return _monologue_to_response(monologue, is_favorited=True)

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload monologue: {str(e)}"
        ) from e
