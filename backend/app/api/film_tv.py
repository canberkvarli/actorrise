"""Film & TV search — semantic + structured search over IMDb/OMDb-seeded film_tv_references."""

import math
from typing import List, Optional, cast

from app.api.auth import get_current_user
from app.core.database import get_db
from app.middleware.rate_limiting import record_total_search
from app.models.actor import FilmTvFavorite, FilmTvReference
from app.models.user import User
from app.services.ai.content_analyzer import ContentAnalyzer
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/film-tv", tags=["film-tv"])

BEST_MATCH_THRESHOLD = 0.90

# Module-level singleton — avoids re-initialising LangChain on every request
_analyzer: "ContentAnalyzer | None" = None


def _get_analyzer() -> "ContentAnalyzer":
    global _analyzer
    if _analyzer is None:
        _analyzer = ContentAnalyzer()
    return _analyzer


# ── Response schema ────────────────────────────────────────────────────────────

class FilmTvReferenceResult(BaseModel):
    id: int
    title: str
    year: Optional[int] = None
    type: Optional[str] = None          # "movie" | "tvSeries"
    genre: Optional[List[str]] = None
    plot_snippet: Optional[str] = None  # ≤300 chars for card
    plot: Optional[str] = None          # full plot for detail panel
    director: Optional[str] = None
    actors: Optional[List[str]] = None
    imdb_rating: Optional[float] = None
    poster_url: Optional[str] = None
    imdb_id: str
    imsdb_url: Optional[str] = None
    confidence_score: Optional[float] = None
    is_best_match: bool = False

    class Config:
        from_attributes = True


class FilmTvSearchResponse(BaseModel):
    results: List[FilmTvReferenceResult]
    total: int
    page: int
    page_size: int


# ── Helpers ────────────────────────────────────────────────────────────────────

def _cosine_sim(a: list, b: list) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    if na * nb <= 0:
        return 0.0
    return max(0.0, min(1.0, dot / (na * nb)))


def _plot_snippet(plot: Optional[str], max_len: int = 300) -> Optional[str]:
    if not plot:
        return None
    return plot if len(plot) <= max_len else plot[:max_len].rsplit(" ", 1)[0] + " …"


def _text_match_score(ref: FilmTvReference, query: str) -> Optional[float]:
    """
    Boost score when the query matches title, director, actors, or plot keywords.

    Mirrors the title_match / play_match logic in monologue semantic search.
    Scores (highest wins):
      title exact             → 0.98
      title contains          → 0.95
      director contains       → 0.87
      actor word match (≥4ch) → 0.85
      plot keyword match      → 0.80
    Returns None when no match found.
    """
    q = query.strip().lower()
    if not q:
        return None

    title_lower = (ref.title or "").lower()
    director_lower = (ref.director or "").lower()
    actors_lower = [a.lower() for a in (ref.actors or [])]
    plot_lower = (ref.plot or "").lower()

    if q == title_lower:
        return 0.98
    if q in title_lower or title_lower in q:
        return 0.95
    if director_lower and (q in director_lower or director_lower in q):
        return 0.87

    query_words = [w for w in q.split() if len(w) >= 4]
    if query_words:
        if any(any(w in a for w in query_words) for a in actors_lower):
            return 0.85
        if any(w in plot_lower for w in query_words):
            return 0.80
    return None


def _to_result(
    ref: FilmTvReference,
    score: Optional[float] = None,
    is_best_match: bool = False,
) -> FilmTvReferenceResult:
    return FilmTvReferenceResult(
        id=cast(int, ref.id),
        title=cast(str, ref.title),
        year=ref.year,
        type=ref.type,
        genre=list(ref.genre) if ref.genre else None,
        plot_snippet=_plot_snippet(ref.plot),
        plot=ref.plot,
        director=ref.director,
        actors=list(ref.actors) if ref.actors else None,
        imdb_rating=ref.imdb_rating,
        poster_url=ref.poster_url,
        imdb_id=cast(str, ref.imdb_id),
        imsdb_url=ref.imsdb_url,
        confidence_score=round(score, 4) if score is not None else None,
        is_best_match=is_best_match,
    )


# ── Endpoint ───────────────────────────────────────────────────────────────────

@router.get("/search", response_model=FilmTvSearchResponse)
async def search_film_tv_references(
    q: Optional[str] = Query(None, max_length=500, description="Natural language query"),
    type: Optional[str] = Query(None, description="'movie' or 'tvSeries'"),
    genre: Optional[str] = Query(None, description="Genre (e.g. 'drama')"),
    year_min: Optional[int] = Query(None),
    year_max: Optional[int] = Query(None),
    director: Optional[str] = Query(None),
    title: Optional[str] = Query(None, description="Title fuzzy match"),
    imdb_rating_min: Optional[float] = Query(None),
    limit: int = Query(20, le=100),
    page: int = Query(1, ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Semantic + structured search over film/TV references.

    Two parallel paths are merged by imdb_id (highest score wins):
    - Semantic: pgvector cosine similarity on query embedding
    - Text: ILIKE across title / director / plot, word match on actors[]

    First result with confidence ≥ 0.90 is tagged is_best_match=True.
    """
    base = db.query(FilmTvReference)

    # Structured filters
    if type:
        base = base.filter(FilmTvReference.type == type)
    if year_min is not None:
        base = base.filter(FilmTvReference.year >= year_min)
    if year_max is not None:
        base = base.filter(FilmTvReference.year <= year_max)
    if imdb_rating_min is not None:
        base = base.filter(FilmTvReference.imdb_rating >= imdb_rating_min)
    if genre:
        base = base.filter(FilmTvReference.genre.any(genre.lower()))
    if director:
        base = base.filter(FilmTvReference.director.ilike(f"%{director}%"))
    if title:
        base = base.filter(FilmTvReference.title.ilike(f"%{title}%"))

    if q and q.strip():
        q_clean = q.strip()
        query_embedding = _get_analyzer().generate_embedding(q_clean)

        # scores_by_id: imdb_id → (score, ref)
        scores_by_id: dict[str, tuple[float, FilmTvReference]] = {}

        # Path A — semantic (pgvector)
        if query_embedding:
            sem_rows = (
                base.filter(FilmTvReference.embedding.isnot(None))
                .order_by(FilmTvReference.embedding.cosine_distance(query_embedding))
                .limit(limit * 3)
                .all()
            )
            for ref in sem_rows:
                iid = cast(str, ref.imdb_id)
                try:
                    vec = getattr(ref, "embedding", None)
                    vec_list = list(vec) if (vec is not None and hasattr(vec, "__iter__")) else []
                    sem_score = _cosine_sim(vec_list, query_embedding) if vec_list else 0.0
                except Exception:
                    sem_score = 0.0
                prev = scores_by_id.get(iid)
                if prev is None or sem_score > prev[0]:
                    scores_by_id[iid] = (sem_score, ref)

        # Path B — text (title / director / plot ILIKE, actors word match)
        text_rows = (
            base.filter(
                or_(
                    FilmTvReference.title.ilike(f"%{q_clean}%"),
                    FilmTvReference.director.ilike(f"%{q_clean}%"),
                    FilmTvReference.plot.ilike(f"%{q_clean}%"),
                )
            )
            .order_by(FilmTvReference.imdb_rating.desc().nullslast())
            .limit(limit * 2)
            .all()
        )
        for ref in text_rows:
            iid = cast(str, ref.imdb_id)
            text_score = _text_match_score(ref, q_clean) or 0.80
            prev = scores_by_id.get(iid)
            if prev is None or text_score > prev[0]:
                scores_by_id[iid] = (text_score, ref)

        # Merge, sort, paginate
        total = len(scores_by_id)
        ranked = sorted(scores_by_id.values(), key=lambda x: x[0], reverse=True)
        offset = (page - 1) * limit
        page_items = ranked[offset: offset + limit]

        results: List[FilmTvReferenceResult] = []
        best_assigned = False
        for score, ref in page_items:
            is_best = not best_assigned and score >= BEST_MATCH_THRESHOLD
            if is_best:
                best_assigned = True
            results.append(_to_result(ref, score=score, is_best_match=is_best))

        if results:
            record_total_search(current_user.id, db)
        return FilmTvSearchResponse(results=results, total=total, page=page, page_size=limit)

    # No query — filter-only, ordered by IMDb rating
    total = base.count()
    offset = (page - 1) * limit
    rows = base.order_by(FilmTvReference.imdb_rating.desc().nullslast()).offset(offset).limit(limit).all()
    if rows:
        record_total_search(current_user.id, db)
    return FilmTvSearchResponse(
        results=[_to_result(r) for r in rows],
        total=total,
        page=page,
        page_size=limit,
    )


# ── Favorites ───────────────────────────────────────────────────────────────────

@router.post("/references/{reference_id:int}/favorite")
async def favorite_film_tv_reference(
    reference_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add film/TV reference to user's saved list."""
    ref = db.query(FilmTvReference).filter(FilmTvReference.id == reference_id).first()
    if not ref:
        raise HTTPException(status_code=404, detail="Film/TV reference not found")
    existing = db.query(FilmTvFavorite).filter(
        FilmTvFavorite.user_id == current_user.id,
        FilmTvFavorite.film_tv_reference_id == reference_id,
    ).first()
    if existing:
        return {"message": "Already favorited", "id": existing.id}
    favorite = FilmTvFavorite(
        user_id=current_user.id,
        film_tv_reference_id=reference_id,
    )
    db.add(favorite)
    db.commit()
    return {"message": "Favorited successfully", "id": favorite.id}


@router.delete("/references/{reference_id:int}/favorite")
async def unfavorite_film_tv_reference(
    reference_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove film/TV reference from user's saved list."""
    favorite = db.query(FilmTvFavorite).filter(
        FilmTvFavorite.user_id == current_user.id,
        FilmTvFavorite.film_tv_reference_id == reference_id,
    ).first()
    if not favorite:
        raise HTTPException(status_code=404, detail="Favorite not found")
    db.delete(favorite)
    db.commit()
    return {"message": "Unfavorited successfully"}


@router.get("/favorites/my", response_model=List[FilmTvReferenceResult])
async def get_my_film_tv_favorites(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get user's saved film/TV references, ordered by last added first."""
    favorites = (
        db.query(FilmTvFavorite)
        .filter(FilmTvFavorite.user_id == current_user.id)
        .order_by(FilmTvFavorite.created_at.desc())
        .all()
    )
    if not favorites:
        return []
    ref_ids = [f.film_tv_reference_id for f in favorites]
    refs = db.query(FilmTvReference).filter(FilmTvReference.id.in_(ref_ids)).all()
    ref_by_id = {r.id: r for r in refs}
    return [
        _to_result(ref_by_id[fid])
        for fid in ref_ids
        if fid in ref_by_id
    ]
