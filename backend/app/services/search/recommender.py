"""Recommend monologues based on actor profile and preferences."""

from typing import Any, List, Optional

from app.models.actor import ActorProfile, Monologue, Play
from sqlalchemy import or_
from sqlalchemy import text as sql_text
from sqlalchemy.orm import Session

from .semantic_search import SemanticSearch


def _attr_bool(obj: Any, name: str, default: bool = False) -> bool:
    """Read ORM attribute as bool for type-safe conditionals."""
    val = getattr(obj, name, default)
    return bool(val) if val is not None else default


def _attr_str(obj: Any, name: str) -> Optional[str]:
    """Read ORM attribute as str | None."""
    val = getattr(obj, name, None)
    return str(val) if val is not None and val != "" else None


def _attr_float(obj: Any, name: str, default: float = 0.0) -> float:
    """Read ORM attribute as float."""
    val = getattr(obj, name, default)
    if val is None:
        return default
    try:
        return float(val)
    except (TypeError, ValueError):
        return default


def _preferred_genres_list(actor_profile: ActorProfile) -> List[str]:
    """Get preferred genres as a list of strings."""
    raw = getattr(actor_profile, "preferred_genres", None)
    if not raw or not isinstance(raw, list):
        return []
    return [str(g) for g in raw[:10] if g]


class Recommender:
    """Recommend monologues based on actor profile"""

    def __init__(self, db: Session):
        self.db = db
        self.semantic_search = SemanticSearch(db)

    def recommend_for_actor(
        self,
        actor_profile: ActorProfile,
        limit: int = 20,
        fast: bool = False
    ) -> List[Monologue]:
        """
        Recommend monologues based on actor profile.

        Considers:
        - Profile bias (age, gender, experience)
        - Preferred genres
        - Overdone alert sensitivity
        - Previously favorited pieces (collaborative filtering)
        - Falls back to SQL-based recommendations if semantic search fails

        When fast=True, uses only SQL-based recommendations (no semantic search)
        for quicker response e.g. dashboard widgets.
        """
        # Build filters from profile (use helpers for type-safe ORM attribute access)
        filters: dict = {}
        if _attr_bool(actor_profile, "profile_bias_enabled"):
            gender = _attr_str(actor_profile, "gender")
            if gender and gender != "prefer not to say":
                filters["gender"] = gender.lower()
            age_range = _attr_str(actor_profile, "age_range")
            if age_range:
                filters["age_range"] = age_range
            exp_level = _attr_str(actor_profile, "experience_level")
            if exp_level:
                difficulty_map = {
                    "beginner": "beginner",
                    "intermediate": "intermediate",
                    "advanced": "advanced",
                    "professional": "advanced",
                }
                filters["difficulty"] = difficulty_map.get(
                    exp_level.lower(), "intermediate"
                )

        preferred_genres = _preferred_genres_list(actor_profile)
        overdone_sensitivity = _attr_float(actor_profile, "overdone_alert_sensitivity", 0.0)

        # Fast path: SQL-only for dashboard/small requests (no embedding call)
        if fast:
            try:
                results = self._get_sql_based_recommendations(
                    actor_profile, limit=limit * 2, filters=filters
                )
                if overdone_sensitivity > 0:
                    threshold = 1.0 - overdone_sensitivity
                    results = [
                        m for m in results
                        if (getattr(m, "overdone_score", None) or 0) <= threshold
                    ]
                return results[:limit]
            except Exception as e:
                print(f"Fast recommendations failed: {e}")
                try:
                    self.db.rollback()
                except Exception:
                    pass
                return []

        # Try semantic search first
        results: List[Monologue] = []
        if preferred_genres:
            # Create a query from preferred genres
            query = f"monologue about {' and '.join(preferred_genres[:3])}"
            try:
                results = self.semantic_search.search(query, limit=limit * 2, filters=filters)
            except Exception as e:
                print(f"Semantic search failed: {e}")
                # Rollback any failed transaction to allow fallback to work
                try:
                    self.db.rollback()
                except Exception:
                    pass  # Ignore rollback errors
                results = []

        # Fallback to SQL-based recommendations if semantic search returns nothing
        if len(results) < limit:
            print(f"Only {len(results)} semantic results, using SQL fallback")
            sql_results = []
            try:
                sql_results = self._get_sql_based_recommendations(actor_profile, limit * 2, filters)
            except Exception as e:
                print(f"SQL fallback failed: {e}")
                # Rollback any failed transaction
                try:
                    self.db.rollback()
                except Exception:
                    pass
                sql_results = []

            # Combine results, avoiding duplicates
            existing_ids = {m.id for m in results}
            for m in sql_results:
                if m.id not in existing_ids:
                    results.append(m)
                    existing_ids.add(m.id)
                    if len(results) >= limit * 2:
                        break

        # Apply overdone filtering
        if overdone_sensitivity > 0:
            threshold = 1.0 - overdone_sensitivity
            results = [
                m for m in results
                if (getattr(m, "overdone_score", None) or 0) <= threshold
            ]

        # Limit results
        return results[:limit]

    def _get_sql_based_recommendations(
        self,
        actor_profile: ActorProfile,
        limit: int = 20,
        filters: Optional[dict] = None
    ) -> List[Monologue]:
        """
        Get recommendations using SQL queries instead of semantic search.
        Used as fallback when embeddings aren't available.
        """
        filters = filters or {}
        preferred_genres = _preferred_genres_list(actor_profile)

        # Build base query
        query = self.db.query(Monologue).join(Play)

        # Apply filters
        if filters.get('gender'):
            query = query.filter(
                or_(
                    Monologue.character_gender.ilike(f"%{filters['gender']}%"),
                    Monologue.character_gender.is_(None)  # Include gender-neutral
                )
            )

        if filters.get('age_range'):
            # Map profile age ranges to database age ranges
            # Profile uses: "18-25", "25-35", "35-45", "45-55", "55+"
            # Database uses: "teens", "20-30", "30-40", "20s", "30s", "40s", "50s", "60+", "any"
            age_mapping = {
                '18-25': ['teens', '20-30', '20s', 'any'],
                '25-35': ['20-30', '30-40', '20s', '30s', 'any'],
                '35-45': ['30-40', '40s', 'any'],
                '45-55': ['40s', '50s', 'any'],
                '55+': ['50s', '60+', 'any']
            }

            db_age_ranges = age_mapping.get(filters['age_range'], ['any'])
            query = query.filter(
                or_(
                    Monologue.character_age_range.in_(db_age_ranges),
                    Monologue.character_age_range.is_(None)  # Include unspecified age
                )
            )

        if filters.get('difficulty'):
            query = query.filter(
                or_(
                    Monologue.difficulty_level == filters['difficulty'],
                    Monologue.difficulty_level.is_(None)  # Include unspecified difficulty
                )
            )

        # Filter by preferred genres if available
        if preferred_genres:
            genre_conditions = [
                Play.category.ilike(f"%{genre}%") for genre in preferred_genres
            ]
            query = query.filter(or_(*genre_conditions))

        # Order by quality indicators (favor popular but not overdone); random() for tie-break
        query = query.order_by(
            (Monologue.favorite_count * (1.0 - Monologue.overdone_score)).desc(),
            sql_text("random()"),
        )

        return query.limit(limit).all()

    def get_similar_monologues(
        self,
        monologue_id: int,
        limit: int = 10
    ) -> List[Monologue]:
        """Find similar monologues using pgvector cosine distance (fast, DB-side)."""

        monologue = self.db.query(Monologue).filter(Monologue.id == monologue_id).first()

        if not monologue or monologue.embedding_vector is None:
            return []

        try:
            return (
                self.db.query(Monologue)
                .join(Play)
                .filter(
                    Monologue.id != monologue_id,
                    Monologue.embedding_vector.isnot(None),
                )
                .order_by(Monologue.embedding_vector.cosine_distance(monologue.embedding_vector))
                .limit(limit)
                .all()
            )
        except Exception as e:
            print(f"Error finding similar monologues: {e}")
            # Fallback: same author or same primary emotion
            return self.db.query(Monologue).join(Play).filter(
                Monologue.id != monologue_id,
                or_(
                    Play.author == monologue.play.author,
                    Monologue.primary_emotion == monologue.primary_emotion
                )
            ).limit(limit).all()

    def get_trending_monologues(self, limit: int = 20) -> List[Monologue]:
        """Get trending monologues based on recent views and favorites"""

        # Simple trending algorithm: sort by favorite_count + view_count/10
        # This gives more weight to favorites than views
        return self.db.query(Monologue).order_by(
            (Monologue.favorite_count + Monologue.view_count / 10).desc()
        ).limit(limit).all()

    def get_fresh_picks(self, limit: int = 20) -> List[Monologue]:
        """Get fresh, under-performed monologues (opposite of trending)"""

        return self.db.query(Monologue).filter(
            Monologue.overdone_score < 0.3,
            Monologue.favorite_count < 10
        ).order_by(sql_text("random()")).limit(limit).all()
