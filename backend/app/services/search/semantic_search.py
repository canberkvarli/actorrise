"""Semantic search for monologues using embeddings."""

import hashlib
import json
import re
from typing import Dict, List, Optional

import numpy as np
from app.models.actor import Monologue, Play
from app.services.ai.content_analyzer import ContentAnalyzer
from app.services.search.cache_manager import cache_manager
from app.services.search.query_optimizer import QueryOptimizer
from sqlalchemy import func, or_, text
from sqlalchemy.orm import Session


class SemanticSearch:
    """Semantic search using vector embeddings"""

    def __init__(self, db: Session):
        self.db = db
        self.analyzer = ContentAnalyzer()
        # Simple in-memory cache for embeddings (Level 0 hot cache).
        # For production-grade caching, we also use the global Redis-based cache_manager.
        self._embedding_cache = {}
        self._query_parse_cache = {}
        self.query_optimizer = QueryOptimizer()
        self.cache = cache_manager

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

        # Normalize explicit filters once
        explicit_filters = filters or {}

        # Tiered, cost-aware query optimization:
        # - Tier 1/2: keyword-only extraction (no AI parsing)
        # - Tier 3: allow AI parsing (with Redis + in-memory caching)
        tier, optimized_filters = self.query_optimizer.optimize(query, explicit_filters)
        print(f"Query tier: {tier}, optimized (keyword + explicit) filters: {optimized_filters}")

        extracted_filters: Dict = {}
        if explicit_filters:
            # If the user provided explicit filters, skip AI parsing entirely to save cost.
            print("Using explicit filters, skipping AI query parsing")
        else:
            if tier in (1, 2):
                # For simple/medium queries, rely on keyword extraction only (no AI).
                print("Tier 1/2 query with no explicit filters - skipping AI query parsing")
            else:
                # Tier 3: complex semantic query – use AI parsing with multi-level caching.
                query_hash = hashlib.md5(query.lower().encode()).hexdigest()

                # Level 0: in-memory cache
                if query_hash in self._query_parse_cache:
                    print(f"✅ Using in-memory cached query parse for: {query}")
                    extracted_filters = self._query_parse_cache[query_hash]
                else:
                    # Level 1: Redis cache via CacheManager
                    cached_filters = self.cache.get_parsed_filters(query)
                    if cached_filters:
                        print(f"✅ Using Redis cached query parse for: {query}")
                        extracted_filters = cached_filters
                        self._query_parse_cache[query_hash] = extracted_filters
                    else:
                        parse_start = time.time()
                        print(f"🤖 Parsing query for filters (AI): {query}")
                        extracted_filters = self.analyzer.parse_search_query(query)
                        parse_time = time.time() - parse_start
                        print(f"⏱️  Query parsing took {parse_time:.2f}s")
                        # Store in both in-memory and Redis caches
                        self._query_parse_cache[query_hash] = extracted_filters
                        self.cache.set_parsed_filters(query, extracted_filters)

                        # Limit in-memory cache size to prevent memory issues
                        if len(self._query_parse_cache) > 1000:
                            # Remove oldest entry (simple FIFO)
                            oldest_key = next(iter(self._query_parse_cache))
                            del self._query_parse_cache[oldest_key]

        print(f"Extracted filters (AI): {extracted_filters}")

        # Merge filters in precedence order:
        # AI-parsed < keyword-derived (optimized) < explicit filters
        merged_filters = {**(extracted_filters or {}), **(optimized_filters or {})}
        print(f"Merged filters (final): {merged_filters}")

        # Optional: check Redis cache for full search results for this (query, filters, user)
        cache_filters_for_results: Dict = dict(merged_filters)
        if user_id is not None:
            cache_filters_for_results["_user_id"] = user_id

        cached_result_ids = self.cache.get_search_results(query, cache_filters_for_results)
        if cached_result_ids:
            print(f"✅ Using cached search results for query='{query}' filters={cache_filters_for_results}")
            # Re-load monologues by ID to get current ORM instances, preserving order.
            mons = self.db.query(Monologue).join(Play).filter(Monologue.id.in_(cached_result_ids)).all()
            mon_by_id = {m.id: m for m in mons}
            ordered = [mon_by_id[mid] for mid in cached_result_ids if mid in mon_by_id]
            overall_time = time.time() - overall_start
            print(f"⏱️  Total search time (cache hit): {overall_time:.2f}s, results: {len(ordered)}")
            return ordered[:limit]

        # Generate embedding for query (with caching at multiple levels)
        query_hash = hashlib.md5(query.lower().encode()).hexdigest()
        if query_hash in self._embedding_cache:
            print(f"✅ Using cached embedding for: {query}")
            query_embedding = self._embedding_cache[query_hash]
        else:
            # Try Redis-backed embedding cache first
            cached_embedding = self.cache.get_embedding(query)
            if cached_embedding:
                print(f"✅ Using Redis cached embedding for: {query}")
                query_embedding = cached_embedding
                self._embedding_cache[query_hash] = query_embedding
            else:
                emb_start = time.time()
                print(f"🔢 Generating embedding for query (AI): {query}")
                query_embedding = self.analyzer.generate_embedding(query)
                emb_time = time.time() - emb_start
                print(f"⏱️  Embedding generation took {emb_time:.2f}s")
                if query_embedding:
                    # Store in in-memory and Redis caches
                    self._embedding_cache[query_hash] = query_embedding
                    self.cache.set_embedding(query, query_embedding)
                    # Limit in-memory cache size to prevent memory issues
                    if len(self._embedding_cache) > 1000:
                        # Remove oldest entry (simple FIFO)
                        oldest_key = next(iter(self._embedding_cache))
                        del self._embedding_cache[oldest_key]

        if not query_embedding:
            print("Failed to generate embedding, falling back to text search")
            return self._fallback_text_search(query, limit, merged_filters)

        # Hybrid search: run text search for direct play/character/title matches and merge on top.
        # Many monologues (e.g. from Gutenberg) have no embeddings, so "hamlet" would otherwise
        # return only semantic results from other plays and never show Hamlet.
        text_match_results = self._fallback_text_search(query, limit=limit, filters=merged_filters)

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
                category = merged_filters['category']
                # Handle both string and list formats
                if isinstance(category, list):
                    # If it's a list, use ILIKE with OR conditions
                    category_conditions = [
                        Play.category.ilike(f'%{cat}%') for cat in category
                    ]
                    base_query = base_query.filter(or_(*category_conditions))
                else:
                    # If it's a string, use exact match or ILIKE
                    base_query = base_query.filter(
                        Play.category.ilike(f'%{category}%')
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

        try:
            monologues_with_embeddings = base_query.filter(
                Monologue.embedding.isnot(None),
                Monologue.embedding != ''
            ).limit(MAX_CANDIDATES).all()
        except Exception as e:
            print(f"Error executing base query for semantic search: {e}")
            # Rollback and fall back to text search
            try:
                self.db.rollback()
            except Exception:
                pass
            return self._fallback_text_search(query, limit, merged_filters)

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
        top_semantic = [(mono, score) for mono, score in results_with_scores[:limit]]

        # Merge hybrid: text matches (play/character/title) first, then semantic results not already in text matches
        if text_match_results:
            existing_ids = {m.id for m in text_match_results}
            semantic_only = [(mono, score) for mono, score in top_semantic if mono.id not in existing_ids]
            # Fill up to limit: text matches first, then semantic
            combined = list(text_match_results)
            for mono, _ in semantic_only:
                if len(combined) >= limit:
                    break
                combined.append(mono)
            top_results = [(m, 0.0) for m in combined[:limit]]  # keep (mono, score) for fallback logic
            print(f"Hybrid: {len(text_match_results)} text matches + {min(len(semantic_only), limit - len(text_match_results))} semantic = {len(combined)} results")
        else:
            top_results = top_semantic

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

            # Cache final ordered results (per query + filters + user) in Redis.
            self.cache.set_search_results(
                query,
                cache_filters_for_results,
                [m.id for m in final_results],
            )

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

        final_semantic_results = [mono for mono, _ in top_results]

        # Cache final ordered results (per query + filters + user) in Redis.
        self.cache.set_search_results(
            query,
            cache_filters_for_results,
            [m.id for m in final_semantic_results],
        )

        return final_semantic_results

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
        """
        Fallback to simple text search if embedding fails.

        This is intentionally AI-free and keyword-friendly to keep costs low.
        For natural-language queries like "give me the hamlet monologue", we
        extract strong keyword tokens (e.g. "hamlet", "monologue") so that
        classical pieces like Hamlet still surface even when the exact phrase
        doesn't appear in the script.
        """

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
                category = filters['category']
                # Handle both string and list formats
                if isinstance(category, list):
                    # If it's a list, use ILIKE with OR conditions
                    category_conditions = [
                        Play.category.ilike(f'%{cat}%') for cat in category
                    ]
                    base_query = base_query.filter(or_(*category_conditions))
                else:
                    # If it's a string, use ILIKE for partial match
                    base_query = base_query.filter(
                        Play.category.ilike(f'%{category}%')
                    )

            if filters.get('author'):
                base_query = base_query.filter(
                    Play.author == filters['author']
                )

        # Simple keyword-friendly text search: play title, character, author, monologue title/text.
        # We search both the full query and important keywords so that
        # multi-word queries like "give me the hamlet monologue" still match "Hamlet".
        terms = [query]

        # Extract strong keyword tokens (lowercase, length > 3, not common stopwords).
        stopwords = {
            "the",
            "a",
            "an",
            "and",
            "or",
            "but",
            "for",
            "with",
            "of",
            "to",
            "me",
            "you",
            "give",
            "show",
            "find",
            "please",
        }
        tokens = {
            token
            for token in re.findall(r"\w+", query.lower())
            if token not in stopwords and len(token) > 3
        }
        terms.extend(tokens)

        ilike_clauses = []
        for term in terms:
            ilike_clauses.extend(
                [
                    Monologue.title.ilike(f"%{term}%"),
                    Monologue.text.ilike(f"%{term}%"),
                    Monologue.character_name.ilike(f"%{term}%"),
                    Play.title.ilike(f"%{term}%"),
                    Play.author.ilike(f"%{term}%"),
                ]
            )

        base_query = base_query.filter(or_(*ilike_clauses))

        # Prefer play title and character name matches (e.g. "Hamlet" → play Hamlet, character Hamlet first)
        base_query = base_query.order_by(
            Play.title.ilike(f'%{query}%').desc(),
            Monologue.character_name.ilike(f'%{query}%').desc(),
            Play.title,
            Monologue.character_name
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

        # Order by random and limit. SQLAlchemy's func.random() is callable at runtime,
        # but static analysis (pylint) may flag it as not-callable, so we disable that check here.
        return base_query.order_by(func.random()).limit(limit).all()  # pylint: disable=not-callable
