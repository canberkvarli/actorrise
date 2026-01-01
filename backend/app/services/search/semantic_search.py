"""Semantic search for monologues using embeddings."""

from sqlalchemy import func, select, and_, or_
from sqlalchemy.orm import Session
from app.models.actor import Monologue, Play
from app.services.ai.content_analyzer import ContentAnalyzer
from typing import List, Dict, Optional
import json
import numpy as np


class SemanticSearch:
    """Semantic search using vector embeddings"""

    def __init__(self, db: Session):
        self.db = db
        self.analyzer = ContentAnalyzer()

    def search(
        self,
        query: str,
        limit: int = 20,
        filters: Optional[Dict] = None
    ) -> List[Monologue]:
        """
        Semantic search for monologues.

        Args:
            query: Natural language search query
            limit: Number of results
            filters: {
                'gender': 'female',
                'age_range': '20s',
                'emotion': 'sad',
                'theme': 'love',
                'difficulty': 'intermediate',
                'category': 'classical',
                'author': 'William Shakespeare',
                'max_duration': 180  # seconds
            }
        """

        # Parse query to extract filters using AI
        print(f"Parsing query for filters: {query}")
        extracted_filters = self.analyzer.parse_search_query(query)
        print(f"Extracted filters: {extracted_filters}")

        # Merge extracted filters with explicit filters (explicit takes precedence)
        merged_filters = {**(extracted_filters or {}), **(filters or {})}
        print(f"Merged filters: {merged_filters}")

        # Generate embedding for query
        print(f"Generating embedding for query: {query}")
        query_embedding = self.analyzer.generate_embedding(query)

        if not query_embedding:
            print("Failed to generate embedding, falling back to text search")
            return self._fallback_text_search(query, limit, merged_filters)

        # Build base query
        base_query = self.db.query(Monologue).join(Play)

        # Apply merged filters
        if merged_filters:
            if merged_filters.get('gender'):
                base_query = base_query.filter(
                    or_(
                        Monologue.character_gender == merged_filters['gender'],
                        Monologue.character_gender == 'any'
                    )
                )

            if merged_filters.get('age_range'):
                base_query = base_query.filter(
                    Monologue.character_age_range == merged_filters['age_range']
                )

            if merged_filters.get('emotion'):
                base_query = base_query.filter(
                    Monologue.primary_emotion == merged_filters['emotion']
                )

            if merged_filters.get('theme'):
                # Check if theme is in the themes array
                base_query = base_query.filter(
                    Monologue.themes.contains([merged_filters['theme']])
                )

            if merged_filters.get('themes'):
                # Handle multiple themes from query parser
                themes = merged_filters['themes']
                if isinstance(themes, list) and len(themes) > 0:
                    # Match if any of the requested themes are present
                    base_query = base_query.filter(
                        Monologue.themes.overlap(themes)
                    )

            if merged_filters.get('tone'):
                # Filter by tone (e.g., 'comedic', 'dramatic')
                base_query = base_query.filter(
                    Monologue.tone == merged_filters['tone']
                )

            if merged_filters.get('difficulty'):
                base_query = base_query.filter(
                    Monologue.difficulty_level == merged_filters['difficulty']
                )

            if merged_filters.get('category'):
                base_query = base_query.filter(
                    Play.category == merged_filters['category']
                )

            if merged_filters.get('author'):
                base_query = base_query.filter(
                    Play.author == merged_filters['author']
                )

            if merged_filters.get('max_duration'):
                base_query = base_query.filter(
                    Monologue.estimated_duration_seconds <= merged_filters['max_duration']
                )

        # Get filtered monologues
        monologues = base_query.all()

        if not monologues:
            return []

        # Calculate cosine similarity for each monologue
        results_with_scores = []

        for mono in monologues:
            if mono.embedding:
                try:
                    # Parse embedding from JSON
                    mono_embedding = json.loads(mono.embedding)

                    # Calculate cosine similarity
                    similarity = self._cosine_similarity(query_embedding, mono_embedding)

                    results_with_scores.append((mono, similarity))

                except Exception as e:
                    print(f"Error calculating similarity for monologue {mono.id}: {e}")
                    continue

        # Sort by similarity (descending) and limit
        results_with_scores.sort(key=lambda x: x[1], reverse=True)
        top_results = results_with_scores[:limit]

        return [mono for mono, score in top_results]

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

    def _fallback_text_search(
        self,
        query: str,
        limit: int,
        filters: Optional[Dict]
    ) -> List[Monologue]:
        """Fallback to simple text search if embedding fails"""

        query_lower = query.lower()

        base_query = self.db.query(Monologue).join(Play)

        # Apply filters (same as semantic search)
        if filters:
            if filters.get('gender'):
                base_query = base_query.filter(
                    or_(
                        Monologue.character_gender == filters['gender'],
                        Monologue.character_gender == 'any'
                    )
                )

            if filters.get('age_range'):
                base_query = base_query.filter(
                    Monologue.character_age_range == filters['age_range']
                )

            if filters.get('emotion'):
                base_query = base_query.filter(
                    Monologue.primary_emotion == filters['emotion']
                )

            if filters.get('theme'):
                base_query = base_query.filter(
                    Monologue.themes.contains([filters['theme']])
                )

            if filters.get('difficulty'):
                base_query = base_query.filter(
                    Monologue.difficulty_level == filters['difficulty']
                )

            if filters.get('category'):
                base_query = base_query.filter(
                    Play.category == filters['category']
                )

            if filters.get('author'):
                base_query = base_query.filter(
                    Play.author == filters['author']
                )

        # Simple text search in title, text, and character name
        base_query = base_query.filter(
            or_(
                Monologue.title.ilike(f'%{query}%'),
                Monologue.text.ilike(f'%{query}%'),
                Monologue.character_name.ilike(f'%{query}%'),
                Play.title.ilike(f'%{query}%'),
                Play.author.ilike(f'%{query}%')
            )
        ).limit(limit)

        return base_query.all()

    def get_random_monologues(self, limit: int = 10, filters: Optional[Dict] = None) -> List[Monologue]:
        """Get random monologues (for "Discover" feature)"""

        base_query = self.db.query(Monologue).join(Play)

        # Apply filters
        if filters:
            if filters.get('category'):
                base_query = base_query.filter(Play.category == filters['category'])

            if filters.get('difficulty'):
                base_query = base_query.filter(Monologue.difficulty_level == filters['difficulty'])

        # Order by random and limit
        return base_query.order_by(func.random()).limit(limit).all()
