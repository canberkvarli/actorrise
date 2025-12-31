"""Search API endpoints for monologue discovery and recommendations."""
from typing import List, Optional

from app.api.auth import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.models.actor import ActorProfile, Monologue
from app.models.user import User
from app.services.ai import (get_embedding, recommend_monologues,
                             vector_search_monologues)
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/search", tags=["search"])


class SearchRequest(BaseModel):
    """Pydantic model for search request parameters."""

    query: Optional[str] = None
    profile_bias: bool = True
    filters: Optional[dict] = None


class MonologueResponse(BaseModel):
    """Pydantic model for monologue response data."""

    id: int
    title: str
    author: str
    age_range: str
    gender: str
    genre: str
    theme: Optional[str] = None
    category: Optional[str] = None
    excerpt: str
    full_text_url: Optional[str] = None
    source_url: Optional[str] = None
    relevance_score: Optional[float] = None

    class Config:
        """Pydantic configuration."""

        from_attributes = True


class SearchResponse(BaseModel):
    """Pydantic model for search response containing results and total count."""

    results: List[MonologueResponse]
    total: int


@router.post("", response_model=SearchResponse)
def search_monologues(
    search_request: SearchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Search for monologues with optional profile bias and filters.

    Supports multiple search modes:
    - Profile-based recommendations (when profile_bias=True)
    - Semantic/vector search (when query provided and embeddings available)
    - Keyword search (fallback when embeddings unavailable)
    - Filtered search (by age_range, gender, genre, theme, category)

    Args:
        search_request: Search parameters including query, filters, and bias options
        current_user: The authenticated user (from dependency)
        db: Database session

    Returns:
        SearchResponse: List of matching monologues with relevance scores
    """
    try:
        # Get user's profile if profile_bias is enabled
        profile = None
        if search_request.profile_bias:
            profile = (
                db.query(ActorProfile)
                .filter(ActorProfile.user_id == current_user.id)
                .first()
            )
            if not profile:
                # If profile doesn't exist, fall back to regular search
                search_request.profile_bias = False

        # Get monologues with filters applied at database level (more efficient)
        query = db.query(Monologue)
    except OperationalError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable. Please try again later.",
        ) from e

    if search_request.filters:
        if search_request.filters.get("age_range"):
            query = query.filter(
                Monologue.age_range == search_request.filters["age_range"]
            )
        if search_request.filters.get("gender"):
            query = query.filter(
                Monologue.gender == search_request.filters["gender"]
            )
        if search_request.filters.get("genre"):
            query = query.filter(
                Monologue.genre == search_request.filters["genre"]
            )
        if search_request.filters.get("theme"):
            query = query.filter(
                Monologue.theme == search_request.filters["theme"]
            )
        if search_request.filters.get("category"):
            query = query.filter(
                Monologue.category == search_request.filters["category"]
            )

    # Only fetch all monologues if we need them for Python-based search
    # Vector search will handle filtering in SQL
    try:
        needs_monologues = not (
            search_request.profile_bias and profile and search_request.query
        )
        monologues = query.all() if needs_monologues else []
    except OperationalError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable. Please try again later.",
        ) from e

    # Apply AI recommendations if profile_bias is enabled
    if search_request.profile_bias and profile:
        # Use semantic search with embeddings if available
        use_semantic = bool(search_request.query)
        scored_results = recommend_monologues(
            monologues,
            profile,
            search_request.query or "",
            use_semantic_search=use_semantic,
            db=db,
            filters=search_request.filters,
        )
        results = [
            MonologueResponse(
                **scored["monologue"].__dict__,
                relevance_score=scored["relevance_score"],
            )
            for scored in scored_results
        ]
    else:
        # Simple keyword search or hybrid search if query provided
        if search_request.query:
            # Try semantic search even without profile bias if embeddings available
            query_embedding = None
            if settings.openai_api_key:
                query_embedding = get_embedding(search_request.query)

            if query_embedding:
                # Use native PostgreSQL vector search
                try:
                    vector_results = vector_search_monologues(
                        db,
                        query_embedding,
                        limit=50,
                        filters=search_request.filters,
                    )
                    results = [
                        MonologueResponse(
                            **monologue.__dict__,
                            relevance_score=score,
                        )
                        for monologue, score in vector_results
                    ]
                except OperationalError as e:
                    raise HTTPException(
                        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                        detail="Database connection unavailable. Please try again later.",
                    ) from e
            else:
                # Fallback to keyword search when embeddings unavailable
                if not monologues:
                    try:
                        monologues = query.all()
                    except OperationalError as e:
                        raise HTTPException(
                            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail="Database connection unavailable. Please try again later.",
                        ) from e

                query_lower = search_request.query.lower()
                monologues = [
                    m
                    for m in monologues
                    if query_lower in (m.title or "").lower()
                    or query_lower in (m.author or "").lower()
                    or query_lower in (m.excerpt or "").lower()
                ]
                results = [
                    MonologueResponse(**monologue.__dict__)
                    for monologue in monologues
                ]
        else:
            # No query, return all filtered monologues
            if not monologues:
                try:
                    monologues = query.all()
                except OperationalError as e:
                    raise HTTPException(
                        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                        detail="Database connection unavailable. Please try again later.",
                    ) from e

            results = [
                MonologueResponse(**monologue.__dict__)
                for monologue in monologues
            ]

    return SearchResponse(results=results, total=len(results))


@router.get("/recommended", response_model=SearchResponse)
def get_recommended_monologues(
    limit: int = 5,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get recommended monologues based on user's profile."""
    try:
        profile = (
            db.query(ActorProfile)
            .filter(ActorProfile.user_id == current_user.id)
            .first()
        )

        if not profile:
            # Return empty results if no profile
            return SearchResponse(results=[], total=0)

        # Get all monologues
        monologues = db.query(Monologue).all()
    except OperationalError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable. Please try again later.",
        ) from e

    # Get recommendations
    scored_results = recommend_monologues(
        monologues,
        profile,
        query="",
        limit=limit,
        use_semantic_search=False,  # Use profile-based matching
        db=db,
    )

    results = [
        MonologueResponse(
            **scored["monologue"].__dict__,
            relevance_score=scored["relevance_score"],
        )
        for scored in scored_results
    ]

    return SearchResponse(results=results, total=len(results))
