"""Recommend monologues based on actor profile and preferences."""

from collections import Counter
from typing import Any, List, Optional, Set

from app.models.actor import ActorProfile, Monologue, MonologueFavorite, Play
from sqlalchemy import or_
from sqlalchemy import text as sql_text
from sqlalchemy.orm import Session

from .semantic_search import SemanticSearch

# Profile age → DB age range mapping
AGE_MAPPING = {
    "18-25": ["teens", "20-30", "20s", "any"],
    "25-35": ["20-30", "30-40", "20s", "30s", "any"],
    "35-45": ["30-40", "40s", "any"],
    "45-55": ["40s", "50s", "any"],
    "55+": ["50s", "60+", "any"],
}


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

    def _build_profile_filters(self, actor_profile: ActorProfile) -> dict:
        """Extract profile filters dict from actor profile."""
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
        return filters

    def _apply_overdone_filter(
        self, results: List[Monologue], sensitivity: float
    ) -> List[Monologue]:
        if sensitivity <= 0:
            return results
        threshold = 1.0 - sensitivity
        return [
            m for m in results
            if (getattr(m, "overdone_score", None) or 0) <= threshold
        ]

    def _blend_pools(
        self,
        comfort: List[Monologue],
        stretch: List[Monologue],
        limit: int,
    ) -> List[Monologue]:
        """Interleave: every 2 comfort items, insert 1 stretch item."""
        blended: List[Monologue] = []
        seen: Set[int] = set()
        s_idx = 0
        for i, m in enumerate(comfort):
            if m.id in seen:
                continue
            blended.append(m)
            seen.add(m.id)
            if (i + 1) % 2 == 0 and s_idx < len(stretch):
                sm = stretch[s_idx]
                s_idx += 1
                if sm.id not in seen:
                    blended.append(sm)
                    seen.add(sm.id)
        while s_idx < len(stretch):
            sm = stretch[s_idx]
            s_idx += 1
            if sm.id not in seen:
                blended.append(sm)
                seen.add(sm.id)
        return blended[:limit]

    def recommend_for_actor(
        self,
        actor_profile: ActorProfile,
        limit: int = 20,
        fast: bool = False,
        user_id: Optional[int] = None,
    ) -> List[Monologue]:
        """
        Recommend monologues based on actor profile.

        Blends three pools:
        - Comfort: SQL/semantic matches based on profile + preferred genres
        - Favorites-based: similar to what the user has bookmarked
        - Stretch (~30%): pieces outside the user's comfort zone to expand range

        When fast=True, uses SQL-only for quicker response (dashboard).
        When user_id is None, falls back to the basic comfort-only approach.
        """
        filters = self._build_profile_filters(actor_profile)
        preferred_genres = _preferred_genres_list(actor_profile)
        overdone_sensitivity = _attr_float(actor_profile, "overdone_alert_sensitivity", 0.0)

        comfort_limit = max(1, int(limit * 0.7)) if user_id else limit
        stretch_limit = limit - comfort_limit

        # ── Fast path (dashboard) ──────────────────────────────────────────
        if fast:
            try:
                # Comfort pool: SQL-based
                sql_results = self._get_sql_based_recommendations(
                    actor_profile, limit=comfort_limit * 2, filters=filters
                )
                sql_results = self._apply_overdone_filter(sql_results, overdone_sensitivity)

                comfort_results: List[Monologue] = []
                comfort_ids: Set[int] = set()
                for m in sql_results:
                    if len(comfort_results) >= comfort_limit:
                        break
                    comfort_results.append(m)
                    comfort_ids.add(m.id)

                # Mix in favorites-based results if user has bookmarks
                if user_id and len(comfort_results) < comfort_limit:
                    try:
                        fav_results = self._get_favorites_based_recommendations(
                            user_id,
                            limit=comfort_limit - len(comfort_results),
                            exclude_ids=comfort_ids,
                            filters=filters,
                        )
                        fav_results = self._apply_overdone_filter(fav_results, overdone_sensitivity)
                        for m in fav_results:
                            if m.id not in comfort_ids:
                                comfort_results.append(m)
                                comfort_ids.add(m.id)
                    except Exception as e:
                        print(f"Favorites-based recommendations failed: {e}")
                        try:
                            self.db.rollback()
                        except Exception:
                            pass

                # Stretch pool
                stretch_results: List[Monologue] = []
                if user_id and stretch_limit > 0:
                    try:
                        stretch_results = self._get_stretch_recommendations(
                            actor_profile, user_id,
                            limit=stretch_limit,
                            exclude_ids=comfort_ids,
                        )
                        stretch_results = self._apply_overdone_filter(stretch_results, overdone_sensitivity)
                    except Exception as e:
                        print(f"Stretch recommendations failed: {e}")
                        try:
                            self.db.rollback()
                        except Exception:
                            pass

                return self._blend_pools(comfort_results, stretch_results, limit)
            except Exception as e:
                print(f"Fast recommendations failed: {e}")
                try:
                    self.db.rollback()
                except Exception:
                    pass
                return []

        # ── Full path (semantic search) ────────────────────────────────────
        comfort_results: List[Monologue] = []
        if preferred_genres:
            query = f"monologue about {' and '.join(preferred_genres[:3])}"
            try:
                comfort_results = self.semantic_search.search(
                    query, limit=comfort_limit * 2, filters=filters
                )
            except Exception as e:
                print(f"Semantic search failed: {e}")
                try:
                    self.db.rollback()
                except Exception:
                    pass

        # SQL fallback if semantic returned too few
        if len(comfort_results) < comfort_limit:
            try:
                sql_results = self._get_sql_based_recommendations(
                    actor_profile, comfort_limit * 2, filters
                )
                existing_ids = {m.id for m in comfort_results}
                for m in sql_results:
                    if m.id not in existing_ids:
                        comfort_results.append(m)
                        existing_ids.add(m.id)
                    if len(comfort_results) >= comfort_limit * 2:
                        break
            except Exception as e:
                print(f"SQL fallback failed: {e}")
                try:
                    self.db.rollback()
                except Exception:
                    pass

        comfort_results = self._apply_overdone_filter(comfort_results, overdone_sensitivity)
        comfort_results = comfort_results[:comfort_limit]
        comfort_ids = {m.id for m in comfort_results}

        # Mix in favorites-based
        if user_id and len(comfort_results) < comfort_limit:
            try:
                fav_results = self._get_favorites_based_recommendations(
                    user_id,
                    limit=comfort_limit - len(comfort_results),
                    exclude_ids=comfort_ids,
                    filters=filters,
                )
                fav_results = self._apply_overdone_filter(fav_results, overdone_sensitivity)
                for m in fav_results:
                    if m.id not in comfort_ids:
                        comfort_results.append(m)
                        comfort_ids.add(m.id)
            except Exception as e:
                print(f"Favorites-based recommendations failed: {e}")
                try:
                    self.db.rollback()
                except Exception:
                    pass

        # Stretch pool
        stretch_results: List[Monologue] = []
        if user_id and stretch_limit > 0:
            try:
                stretch_results = self._get_stretch_recommendations(
                    actor_profile, user_id,
                    limit=stretch_limit,
                    exclude_ids=comfort_ids,
                )
                stretch_results = self._apply_overdone_filter(stretch_results, overdone_sensitivity)
            except Exception as e:
                print(f"Stretch recommendations failed: {e}")
                try:
                    self.db.rollback()
                except Exception:
                    pass

        return self._blend_pools(comfort_results, stretch_results, limit)

    # ── Shared filter helpers ─────────────────────────────────────────────────

    def _apply_casting_filters(self, query, filters: dict):
        """Apply gender, age_range, and difficulty filters to a Monologue query."""
        if filters.get("gender"):
            query = query.filter(
                or_(
                    Monologue.character_gender.ilike(f"%{filters['gender']}%"),
                    Monologue.character_gender.is_(None),
                )
            )
        if filters.get("age_range"):
            db_age_ranges = AGE_MAPPING.get(filters["age_range"], ["any"])
            query = query.filter(
                or_(
                    Monologue.character_age_range.in_(db_age_ranges),
                    Monologue.character_age_range.is_(None),
                )
            )
        if filters.get("difficulty"):
            query = query.filter(
                or_(
                    Monologue.difficulty_level == filters["difficulty"],
                    Monologue.difficulty_level.is_(None),
                )
            )
        return query

    # ── SQL-based recommendations ──────────────────────────────────────────

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

        query = self.db.query(Monologue).join(Play)
        query = self._apply_casting_filters(query, filters)

        if preferred_genres:
            genre_conditions = [
                Play.category.ilike(f"%{genre}%") for genre in preferred_genres
            ]
            query = query.filter(or_(*genre_conditions))

        query = query.order_by(
            (Monologue.favorite_count * (1.0 - Monologue.overdone_score)).desc(),
            sql_text("random()"),
        )

        return query.limit(limit).all()

    # ── Favorites-based recommendations ────────────────────────────────────

    def _get_user_favorite_centroid(
        self, user_id: int, max_favorites: int = 10
    ) -> Optional[list]:
        """
        Compute the average embedding of the user's most recent favorites.
        Returns None if no favorites have embeddings.
        """
        fav_subq = (
            self.db.query(MonologueFavorite.monologue_id)
            .join(Monologue, Monologue.id == MonologueFavorite.monologue_id)
            .filter(
                MonologueFavorite.user_id == user_id,
                Monologue.embedding_vector.isnot(None),
            )
            .order_by(MonologueFavorite.created_at.desc())
            .limit(max_favorites)
            .subquery()
        )

        rows = (
            self.db.query(Monologue.embedding_vector)
            .filter(Monologue.id.in_(fav_subq))
            .all()
        )

        if not rows:
            return None

        vectors = [list(r[0]) for r in rows if r[0] is not None]
        if not vectors:
            return None

        dim = len(vectors[0])
        n = len(vectors)
        return [sum(v[i] for v in vectors) / n for i in range(dim)]

    def _get_favorites_based_recommendations(
        self,
        user_id: int,
        limit: int = 20,
        exclude_ids: Optional[Set[int]] = None,
        filters: Optional[dict] = None,
    ) -> List[Monologue]:
        """
        Find monologues similar to what the user has bookmarked,
        using the centroid of their favorite embeddings.
        """
        centroid = self._get_user_favorite_centroid(user_id)
        if centroid is None:
            return []

        filters = filters or {}
        exclude_ids = exclude_ids or set()

        # Exclude already-favorited monologues
        fav_ids = {
            r[0]
            for r in self.db.query(MonologueFavorite.monologue_id)
            .filter(MonologueFavorite.user_id == user_id)
            .all()
        }
        all_exclude = exclude_ids | fav_ids

        query = (
            self.db.query(Monologue)
            .join(Play)
            .filter(Monologue.embedding_vector.isnot(None))
        )

        if all_exclude:
            query = query.filter(Monologue.id.notin_(all_exclude))

        # Apply gender/age but NOT difficulty (style similarity transcends difficulty)
        casting_filters = {k: v for k, v in filters.items() if k != "difficulty"}
        query = self._apply_casting_filters(query, casting_filters)

        query = query.order_by(
            Monologue.embedding_vector.cosine_distance(centroid)
        )

        return query.limit(limit).all()

    # ── Stretch / "push your limits" recommendations ───────────────────────

    def _get_stretch_recommendations(
        self,
        actor_profile: ActorProfile,
        user_id: int,
        limit: int = 10,
        exclude_ids: Optional[Set[int]] = None,
    ) -> List[Monologue]:
        """
        Get recommendations OUTSIDE the user's comfort zone.
        Inverts genre, difficulty, and emotion preferences while still
        respecting physical casting filters (gender, age).
        """
        exclude_ids = exclude_ids or set()
        preferred_genres = _preferred_genres_list(actor_profile)
        exp_level = _attr_str(actor_profile, "experience_level")

        # Find user's top 2 comfort-zone emotions from favorites
        fav_emotions = (
            self.db.query(Monologue.primary_emotion)
            .join(MonologueFavorite, MonologueFavorite.monologue_id == Monologue.id)
            .filter(
                MonologueFavorite.user_id == user_id,
                Monologue.primary_emotion.isnot(None),
            )
            .all()
        )
        comfort_emotions: Set[str] = set()
        if fav_emotions:
            emotion_counts = Counter(r[0] for r in fav_emotions if r[0])
            comfort_emotions = {e for e, _ in emotion_counts.most_common(2)}

        query = self.db.query(Monologue).join(Play)

        if exclude_ids:
            query = query.filter(Monologue.id.notin_(exclude_ids))

        # Respect physical casting filters (gender, age) — not preferences
        casting_filters: dict = {}
        if _attr_bool(actor_profile, "profile_bias_enabled"):
            gender = _attr_str(actor_profile, "gender")
            if gender and gender != "prefer not to say":
                casting_filters["gender"] = gender.lower()
            age_range = _attr_str(actor_profile, "age_range")
            if age_range:
                casting_filters["age_range"] = age_range
        query = self._apply_casting_filters(query, casting_filters)

        # INVERT genre: prefer genres the user hasn't selected
        if preferred_genres:
            genre_conditions = [
                ~Play.category.ilike(f"%{genre}%") for genre in preferred_genres
            ]
            query = query.filter(or_(*genre_conditions))

        # INVERT difficulty: push one level
        if exp_level:
            stretch_map = {
                "beginner": "intermediate",
                "intermediate": "advanced",
                "advanced": "beginner",
                "professional": "intermediate",
            }
            stretch_diff = stretch_map.get(exp_level.lower())
            if stretch_diff:
                query = query.filter(
                    or_(
                        Monologue.difficulty_level == stretch_diff,
                        Monologue.difficulty_level.is_(None),
                    )
                )

        # INVERT emotion: exclude the user's top comfort-zone emotions
        if comfort_emotions:
            query = query.filter(
                or_(
                    Monologue.primary_emotion.notin_(comfort_emotions),
                    Monologue.primary_emotion.is_(None),
                )
            )

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
