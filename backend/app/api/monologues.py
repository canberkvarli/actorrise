"""API endpoints for monologue search and discovery."""

from typing import List, Optional

from app.api.auth import get_current_user
from app.core.database import get_db
from app.models.actor import ActorProfile, Monologue, MonologueFavorite, Play
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

    class Config:
        from_attributes = True


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


@router.get("/search", response_model=List[MonologueResponse])
async def search_monologues(
    q: str = Query(..., min_length=1, description="Search query"),
    gender: Optional[str] = None,
    age_range: Optional[str] = None,
    emotion: Optional[str] = None,
    theme: Optional[str] = None,
    difficulty: Optional[str] = None,
    category: Optional[str] = None,
    author: Optional[str] = None,
    max_duration: Optional[int] = None,
    limit: int = Query(20, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Semantic search for monologues.

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
    if max_duration:
        filters['max_duration'] = max_duration

    # Search
    search_service = SemanticSearch(db)
    results = search_service.search(q, limit=limit, filters=filters)

    # Get user's favorites
    favorites = db.query(MonologueFavorite.monologue_id).filter(
        MonologueFavorite.user_id == current_user.id
    ).all()
    favorite_ids = {f[0] for f in favorites}

    # Format response
    return [
        MonologueResponse(
            id=m.id,
            title=m.title,
            character_name=m.character_name,
            text=m.text,
            stage_directions=m.stage_directions,
            play_title=m.play.title,
            play_id=m.play.id,
            author=m.play.author,
            category=m.play.category,
            character_gender=m.character_gender,
            character_age_range=m.character_age_range,
            primary_emotion=m.primary_emotion,
            emotion_scores=m.emotion_scores,
            themes=m.themes or [],
            tone=m.tone,
            difficulty_level=m.difficulty_level,
            word_count=m.word_count,
            estimated_duration_seconds=m.estimated_duration_seconds,
            view_count=m.view_count,
            favorite_count=m.favorite_count,
            is_favorited=m.id in favorite_ids,
            overdone_score=m.overdone_score,
            scene_description=m.scene_description
        )
        for m in results
    ]


@router.get("/recommendations", response_model=List[MonologueResponse])
async def get_recommendations(
    limit: int = Query(20, le=100),
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

    # Get recommendations
    recommender = Recommender(db)
    results = recommender.recommend_for_actor(actor_profile, limit=limit)

    # Get favorites
    favorites = db.query(MonologueFavorite.monologue_id).filter(
        MonologueFavorite.user_id == current_user.id
    ).all()
    favorite_ids = {f[0] for f in favorites}

    # Format response
    return [
        MonologueResponse(
            id=m.id,
            title=m.title,
            character_name=m.character_name,
            text=m.text,
            stage_directions=m.stage_directions,
            play_title=m.play.title,
            play_id=m.play.id,
            author=m.play.author,
            category=m.play.category,
            character_gender=m.character_gender,
            character_age_range=m.character_age_range,
            primary_emotion=m.primary_emotion,
            emotion_scores=m.emotion_scores,
            themes=m.themes or [],
            tone=m.tone,
            difficulty_level=m.difficulty_level,
            word_count=m.word_count,
            estimated_duration_seconds=m.estimated_duration_seconds,
            view_count=m.view_count,
            favorite_count=m.favorite_count,
            is_favorited=m.id in favorite_ids,
            overdone_score=m.overdone_score,
            scene_description=m.scene_description
        )
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

    # Get favorites
    favorites = db.query(MonologueFavorite.monologue_id).filter(
        MonologueFavorite.user_id == current_user.id
    ).all()
    favorite_ids = {f[0] for f in favorites}

    return [
        MonologueResponse(
            id=m.id,
            title=m.title,
            character_name=m.character_name,
            text=m.text,
            stage_directions=m.stage_directions,
            play_title=m.play.title,
            play_id=m.play.id,
            author=m.play.author,
            category=m.play.category,
            character_gender=m.character_gender,
            character_age_range=m.character_age_range,
            primary_emotion=m.primary_emotion,
            emotion_scores=m.emotion_scores,
            themes=m.themes or [],
            tone=m.tone,
            difficulty_level=m.difficulty_level,
            word_count=m.word_count,
            estimated_duration_seconds=m.estimated_duration_seconds,
            view_count=m.view_count,
            favorite_count=m.favorite_count,
            is_favorited=m.id in favorite_ids,
            overdone_score=m.overdone_score,
            scene_description=m.scene_description
        )
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

    # Get favorites
    favorites = db.query(MonologueFavorite.monologue_id).filter(
        MonologueFavorite.user_id == current_user.id
    ).all()
    favorite_ids = {f[0] for f in favorites}

    return [
        MonologueResponse(
            id=m.id,
            title=m.title,
            character_name=m.character_name,
            text=m.text,
            stage_directions=m.stage_directions,
            play_title=m.play.title,
            play_id=m.play.id,
            author=m.play.author,
            category=m.play.category,
            character_gender=m.character_gender,
            character_age_range=m.character_age_range,
            primary_emotion=m.primary_emotion,
            emotion_scores=m.emotion_scores,
            themes=m.themes or [],
            tone=m.tone,
            difficulty_level=m.difficulty_level,
            word_count=m.word_count,
            estimated_duration_seconds=m.estimated_duration_seconds,
            view_count=m.view_count,
            favorite_count=m.favorite_count,
            is_favorited=m.id in favorite_ids,
            overdone_score=m.overdone_score,
            scene_description=m.scene_description
        )
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
    monologue.view_count += 1
    db.commit()

    # Check if favorited
    is_favorited = db.query(MonologueFavorite).filter(
        MonologueFavorite.user_id == current_user.id,
        MonologueFavorite.monologue_id == monologue_id
    ).first() is not None

    return MonologueResponse(
        id=monologue.id,
        title=monologue.title,
        character_name=monologue.character_name,
        text=monologue.text,
        stage_directions=monologue.stage_directions,
        play_title=monologue.play.title,
        play_id=monologue.play.id,
        author=monologue.play.author,
        category=monologue.play.category,
        character_gender=monologue.character_gender,
        character_age_range=monologue.character_age_range,
        primary_emotion=monologue.primary_emotion,
        emotion_scores=monologue.emotion_scores,
        themes=monologue.themes or [],
        tone=monologue.tone,
        difficulty_level=monologue.difficulty_level,
        word_count=monologue.word_count,
        estimated_duration_seconds=monologue.estimated_duration_seconds,
        view_count=monologue.view_count,
        favorite_count=monologue.favorite_count,
        is_favorited=is_favorited,
        overdone_score=monologue.overdone_score,
        scene_description=monologue.scene_description
    )


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
    monologue.favorite_count += 1

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
    if monologue and monologue.favorite_count > 0:
        monologue.favorite_count -= 1

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

    favorite.notes = data.notes
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

    # Get favorites
    favorites = db.query(MonologueFavorite.monologue_id).filter(
        MonologueFavorite.user_id == current_user.id
    ).all()
    favorite_ids = {f[0] for f in favorites}

    return [
        MonologueResponse(
            id=m.id,
            title=m.title,
            character_name=m.character_name,
            text=m.text,
            stage_directions=m.stage_directions,
            play_title=m.play.title,
            play_id=m.play.id,
            author=m.play.author,
            category=m.play.category,
            character_gender=m.character_gender,
            character_age_range=m.character_age_range,
            primary_emotion=m.primary_emotion,
            emotion_scores=m.emotion_scores,
            themes=m.themes or [],
            tone=m.tone,
            difficulty_level=m.difficulty_level,
            word_count=m.word_count,
            estimated_duration_seconds=m.estimated_duration_seconds,
            view_count=m.view_count,
            favorite_count=m.favorite_count,
            is_favorited=m.id in favorite_ids,
            overdone_score=m.overdone_score,
            scene_description=m.scene_description
        )
        for m in results
    ]


@router.get("/favorites/my", response_model=List[MonologueResponse])
async def get_my_favorites(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get user's favorited monologues"""

    favorites = db.query(MonologueFavorite).filter(
        MonologueFavorite.user_id == current_user.id
    ).all()

    monologue_ids = [f.monologue_id for f in favorites]

    if not monologue_ids:
        return []

    monologues = db.query(Monologue).filter(Monologue.id.in_(monologue_ids)).all()

    return [
        MonologueResponse(
            id=m.id,
            title=m.title,
            character_name=m.character_name,
            text=m.text,
            stage_directions=m.stage_directions,
            play_title=m.play.title,
            play_id=m.play.id,
            author=m.play.author,
            category=m.play.category,
            character_gender=m.character_gender,
            character_age_range=m.character_age_range,
            primary_emotion=m.primary_emotion,
            emotion_scores=m.emotion_scores,
            themes=m.themes or [],
            tone=m.tone,
            difficulty_level=m.difficulty_level,
            word_count=m.word_count,
            estimated_duration_seconds=m.estimated_duration_seconds,
            view_count=m.view_count,
            favorite_count=m.favorite_count,
            is_favorited=True,
            overdone_score=m.overdone_score,
            scene_description=m.scene_description
        )
        for m in monologues
    ]


@router.get("/plays/all", response_model=List[PlayResponse])
async def get_all_plays(
    category: Optional[str] = None,
    author: Optional[str] = None,
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all plays in the database"""

    query = db.query(Play)

    if category:
        query = query.filter(Play.category == category)

    if author:
        query = query.filter(Play.author.ilike(f'%{author}%'))

    plays = query.order_by(Play.author, Play.title).limit(limit).all()

    return [
        PlayResponse(
            id=p.id,
            title=p.title,
            author=p.author,
            year_written=p.year_written,
            genre=p.genre,
            category=p.category,
            source_url=p.source_url
        )
        for p in plays
    ]


@router.get("/stats/database", )
async def get_database_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
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
