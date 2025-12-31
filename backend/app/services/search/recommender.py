"""Recommend monologues based on actor profile and preferences."""

from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from app.models.actor import ActorProfile, Monologue, MonologueFavorite, Play
from .semantic_search import SemanticSearch
from typing import List, Optional
import json
import numpy as np


class Recommender:
    """Recommend monologues based on actor profile"""

    def __init__(self, db: Session):
        self.db = db
        self.semantic_search = SemanticSearch(db)

    def recommend_for_actor(
        self,
        actor_profile: ActorProfile,
        limit: int = 20
    ) -> List[Monologue]:
        """
        Recommend monologues based on actor profile.

        Considers:
        - Profile bias (age, gender, experience)
        - Preferred genres
        - Overdone alert sensitivity
        - Previously favorited pieces (collaborative filtering)
        """

        # Build filters from profile
        filters = {}

        if actor_profile.profile_bias_enabled:
            if actor_profile.gender and actor_profile.gender != 'prefer not to say':
                filters['gender'] = actor_profile.gender.lower()

            if actor_profile.age_range:
                filters['age_range'] = actor_profile.age_range

            if actor_profile.experience_level:
                difficulty_map = {
                    'beginner': 'beginner',
                    'intermediate': 'intermediate',
                    'advanced': 'advanced',
                    'professional': 'advanced'
                }
                filters['difficulty'] = difficulty_map.get(
                    actor_profile.experience_level.lower(),
                    'intermediate'
                )

        # Generate query from preferences
        preferred_genres = actor_profile.preferred_genres or []

        if preferred_genres:
            # Create a query from preferred genres
            query = f"monologue about {' and '.join(preferred_genres[:3])}"
        else:
            query = "dramatic monologue for actor"

        # Search with filters
        results = self.semantic_search.search(query, limit=limit * 2, filters=filters)

        # Apply overdone filtering
        if actor_profile.overdone_alert_sensitivity > 0:
            threshold = 1.0 - actor_profile.overdone_alert_sensitivity
            results = [m for m in results if m.overdone_score <= threshold]

        # Limit results
        return results[:limit]

    def get_similar_monologues(
        self,
        monologue_id: int,
        limit: int = 10
    ) -> List[Monologue]:
        """Find similar monologues based on embedding similarity"""

        monologue = self.db.query(Monologue).filter(Monologue.id == monologue_id).first()

        if not monologue or not monologue.embedding:
            return []

        try:
            # Parse the target embedding
            target_embedding = json.loads(monologue.embedding)

            # Get all monologues with embeddings (excluding the current one)
            all_monologues = self.db.query(Monologue).filter(
                Monologue.id != monologue_id,
                Monologue.embedding.isnot(None)
            ).all()

            # Calculate similarities
            similarities = []
            for mono in all_monologues:
                try:
                    mono_embedding = json.loads(mono.embedding)
                    similarity = self._cosine_similarity(target_embedding, mono_embedding)
                    similarities.append((mono, similarity))
                except:
                    continue

            # Sort by similarity (descending)
            similarities.sort(key=lambda x: x[1], reverse=True)

            # Return top N
            return [mono for mono, score in similarities[:limit]]

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

    def _cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """Calculate cosine similarity between two vectors"""
        vec1_np = np.array(vec1)
        vec2_np = np.array(vec2)

        dot_product = np.dot(vec1_np, vec2_np)
        norm1 = np.linalg.norm(vec1_np)
        norm2 = np.linalg.norm(vec2_np)

        if norm1 == 0 or norm2 == 0:
            return 0.0

        return float(dot_product / (norm1 * norm2))

    def get_trending_monologues(self, limit: int = 20) -> List[Monologue]:
        """Get trending monologues based on recent views and favorites"""

        # Simple trending algorithm: sort by favorite_count + view_count/10
        # This gives more weight to favorites than views
        return self.db.query(Monologue).order_by(
            (Monologue.favorite_count + Monologue.view_count / 10).desc()
        ).limit(limit).all()

    def get_fresh_picks(self, limit: int = 20) -> List[Monologue]:
        """Get fresh, under-performed monologues (opposite of trending)"""

        # Get monologues with low overdone scores and few favorites
        return self.db.query(Monologue).filter(
            Monologue.overdone_score < 0.3,
            Monologue.favorite_count < 10
        ).order_by(
            func.random()
        ).limit(limit).all()
