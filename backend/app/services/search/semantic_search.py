"""Semantic search for monologues using embeddings."""

import hashlib
import json
from typing import Dict, List, Optional

import numpy as np
from app.models.actor import Monologue, Play
from app.services.ai.content_analyzer import ContentAnalyzer
from sqlalchemy import func, or_, text
from sqlalchemy.orm import Session


class SemanticSearch:
    """Semantic search using vector embeddings"""

    def __init__(self, db: Session):
        self.db = db
        self.analyzer = ContentAnalyzer()
        # Simple in-memory cache for embeddings (consider Redis for production)
        self._embedding_cache = {}
        self._query_parse_cache = {}

    def search(
        self,
        query: str,
        limit: int = 20,
        filters: Optional[Dict] = None,
        user_id: Optional[int] = None
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
            user_id: Optional user ID to prioritize bookmarked monologues
        """

        import time
        overall_start = time.time()

        # Parse query to extract filters using AI (with caching)
        # Skip AI parsing if explicit filters are provided (optimization)
        if filters and len(filters) > 0:
            # If user provided explicit filters, skip AI parsing to save costs
            print("Using explicit filters, skipping AI query parsing")
            extracted_filters = {}
        else:
            # Cache query parsing results
            query_hash = hashlib.md5(query.lower().encode()).hexdigest()
            if query_hash in self._query_parse_cache:
                print(f"✅ Using cached query parse for: {query}")
                extracted_filters = self._query_parse_cache[query_hash]
            else:
                parse_start = time.time()
                print(f"🤖 Parsing query for filters: {query}")
                extracted_filters = self.analyzer.parse_search_query(query)
                parse_time = time.time() - parse_start
                print(f"⏱️  Query parsing took {parse_time:.2f}s")
                self._query_parse_cache[query_hash] = extracted_filters
                # Limit cache size to prevent memory issues
                if len(self._query_parse_cache) > 1000:
                    # Remove oldest entry (simple FIFO)
                    oldest_key = next(iter(self._query_parse_cache))
                    del self._query_parse_cache[oldest_key]

        print(f"Extracted filters: {extracted_filters}")

        # Merge extracted filters with explicit filters (explicit takes precedence)
        merged_filters = {**(extracted_filters or {}), **(filters or {})}
        print(f"Merged filters: {merged_filters}")

        # Generate embedding for query (with caching)
        query_hash = hashlib.md5(query.lower().encode()).hexdigest()
        if query_hash in self._embedding_cache:
            print(f"✅ Using cached embedding for: {query}")
            query_embedding = self._embedding_cache[query_hash]
        else:
            emb_start = time.time()
            print(f"🔢 Generating embedding for query: {query}")
            query_embedding = self.analyzer.generate_embedding(query)
            emb_time = time.time() - emb_start
            print(f"⏱️  Embedding generation took {emb_time:.2f}s")
            if query_embedding:
                self._embedding_cache[query_hash] = query_embedding
                # Limit cache size to prevent memory issues
                if len(self._embedding_cache) > 1000:
                    # Remove oldest entry (simple FIFO)
                    oldest_key = next(iter(self._embedding_cache))
                    del self._embedding_cache[oldest_key]

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
                # Check if theme is in the themes array using PostgreSQL array contains operator
                theme = merged_filters['theme']
                # Use PostgreSQL @> operator with proper type casting
                # Cast array to character varying[] to match column type
                base_query = base_query.filter(
                    text("monologues.themes @> ARRAY[:theme_val]::character varying[]").bindparams(theme_val=theme)
                )

            if merged_filters.get('themes'):
                # Handle multiple themes from query parser
                themes = merged_filters['themes']
                if isinstance(themes, list) and len(themes) > 0:
                    # Match if any of the requested themes are present
                    # Use OR condition to match any theme
                    # Use PostgreSQL @> operator with proper type casting
                    theme_conditions = [
                        text("monologues.themes @> ARRAY[:theme_val]::character varying[]").bindparams(theme_val=theme)
                        for theme in themes
                    ]
                    base_query = base_query.filter(or_(*theme_conditions))

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

        # Get user's bookmarked monologues if user_id provided
        bookmarked_ids = set()
        if user_id:
            from app.models.actor import MonologueFavorite
            favorites = self.db.query(MonologueFavorite.monologue_id).filter(
                MonologueFavorite.user_id == user_id
            ).all()
            bookmarked_ids = {f[0] for f in favorites}

        # OPTIMIZATION: Only fetch monologues WITH embeddings for semantic search
        # Limit to reasonable candidate pool size for performance (will expand with pgvector later)
        MAX_CANDIDATES = 500  # Limit how many embeddings we compare against for speed

        monologues_with_embeddings = base_query.filter(
            Monologue.embedding.isnot(None),
            Monologue.embedding != ''
        ).limit(MAX_CANDIDATES).all()

        print(f"Loaded {len(monologues_with_embeddings)} monologues with embeddings for semantic search (max: {MAX_CANDIDATES})")

        # Calculate cosine similarity for each monologue
        results_with_scores = []

        similarity_start = time.time()

        for mono in monologues_with_embeddings:
            embedding_value: Optional[str] = mono.embedding  # type: ignore[assignment]
            if embedding_value is not None and len(embedding_value) > 0:
                try:
                    # Parse embedding from JSON
                    mono_embedding = json.loads(embedding_value)

                    # Calculate cosine similarity
                    similarity = self._cosine_similarity(query_embedding, mono_embedding)

                    # Boost bookmarked monologues by adding 0.3 to similarity
                    if mono.id in bookmarked_ids:
                        similarity += 0.3
                        print(f"  ⭐ Boosting bookmarked: {mono.character_name} from {mono.play.title}")

                    results_with_scores.append((mono, similarity))

                except (json.JSONDecodeError, ValueError, TypeError) as e:
                    print(f"Error calculating similarity for monologue {mono.id}: {e}")
                    continue

        similarity_time = time.time() - similarity_start
        print(f"⏱️  Similarity calculation took {similarity_time:.2f}s for {len(monologues_with_embeddings)} candidates")

        # Sort by similarity (descending) and limit
        results_with_scores.sort(key=lambda x: x[1], reverse=True)
        top_results = results_with_scores[:limit]

        # FALLBACK: If we don't have enough semantic results, supplement with text search
        # This ensures users get results even when embeddings aren't available
        if len(top_results) < limit:
            needed = limit - len(top_results)
            print(f"Only {len(top_results)} semantic results, supplementing with {needed} text search results...")

            # Get IDs we already have to avoid duplicates
            existing_ids = {mono.id for mono, _ in top_results}

            # Fallback to text search
            fallback_start = time.time()
            fallback_results = self._fallback_text_search(query, needed * 2, merged_filters)  # Get extra for filtering
            fallback_time = time.time() - fallback_start
            print(f"⏱️  Fallback text search took {fallback_time:.2f}s")

            # Add fallback results that aren't already in semantic results
            fallback_unique = [m for m in fallback_results if m.id not in existing_ids][:needed]

            # Combine results: semantic results first, then fallback
            final_results = [mono for mono, _ in top_results] + fallback_unique
            overall_time = time.time() - overall_start
            print(f"⏱️  Total search time: {overall_time:.2f}s")
            print(f"Final results: {len([mono for mono, _ in top_results])} semantic + {len(fallback_unique)} text search = {len(final_results)} total")

            # Return combined results
            return final_results[:limit]

        overall_time = time.time() - overall_start

        # Debug logging to see what authors are being returned
        print("\n=== SEARCH RESULTS DEBUG ===")
        print(f"Query: {query}")
        print(f"⏱️  Total search time: {overall_time:.2f}s")
        print(f"Monologues with embeddings: {len(monologues_with_embeddings)}")
        print(f"Results with scores: {len(results_with_scores)}")
        print(f"\nTop {len(top_results)} semantic results:")
        for i, (mono, score) in enumerate(top_results[:5], 1):
            print(f"  {i}. {mono.character_name} from '{mono.play.title}' by {mono.play.author} (score: {score:.3f})")

        # Show author distribution in semantic results
        from collections import Counter
        author_dist = Counter(mono.play.author for mono, _ in results_with_scores)
        print(f"\nAuthor distribution in semantic results ({len(monologues_with_embeddings)} total):")
        for author, count in author_dist.most_common(10):
            print(f"  • {author}: {count}")
        print("=== END DEBUG ===\n")

        return [mono for mono, _ in top_results]

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
                # Check if theme is in the themes array using PostgreSQL array contains operator
                theme = filters['theme']
                # Use PostgreSQL @> operator with proper type casting
                # Cast array to character varying[] to match column type
                base_query = base_query.filter(
                    text("monologues.themes @> ARRAY[:theme_val]::character varying[]").bindparams(theme_val=theme)
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
