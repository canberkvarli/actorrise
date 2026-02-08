"""Semantic search for monologues using embeddings."""

import hashlib
import json
import logging
import re
from typing import Any, Dict, List, Optional

import numpy as np

logger = logging.getLogger(__name__)
from app.models.actor import Monologue, Play
from app.services.ai.content_analyzer import ContentAnalyzer
from app.services.search.cache_manager import cache_manager
from app.services.search.query_optimizer import QueryOptimizer
from sqlalchemy import func, or_, text
from sqlalchemy.orm import Session

# Module-level in-memory caches (Level 0 hot cache shared across SemanticSearch instances).
# These are always available, even when Redis is not installed, and keep repeat
# queries cheap within a single process. Keys use a *canonical* form of the query
# so trivial variants like "Hamlet", "hamlet ", or "HAMLET!!!" all share entries.
EMBEDDING_CACHE: Dict[str, List[float]] = {}
QUERY_PARSE_CACHE: Dict[str, Dict] = {}
SEARCH_RESULTS_CACHE: Dict[str, List[Any]] = {}


def _canonicalize_query_for_cache(raw_query: str) -> str:
    """
    Canonicalize queries for caching so trivial variants map to the same key.

    This is intentionally conservative to avoid UX regressions:
    - Lowercase
    - Strip leading/trailing whitespace
    - Collapse internal whitespace
    - Strip common trailing punctuation like "!!!" or "??"

    We DO NOT remove content words (like "hamlet", "monologue") here, so
    different natural-language queries still get their own embeddings/results
    (e.g., "hamlet" vs "give me the hamlet monologue").
    """
    q = raw_query.lower().strip()
    # Strip trailing punctuation
    q = re.sub(r"[!?.,;:]+$", "", q)
    # Collapse multiple spaces/tabs into a single space
    q = re.sub(r"\s+", " ", q)
    return q


class SemanticSearch:
    """Semantic search using vector embeddings"""

    def __init__(self, db: Session):
        self.db = db
        self.analyzer = ContentAnalyzer()
        self.query_optimizer = QueryOptimizer()
        # Global cache manager: Level 1 Redis if available, otherwise memory-only.
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

        # Normalize query for caching (conservative canonicalization)
        canonical_query = _canonicalize_query_for_cache(query)

        # Normalize explicit filters once
        explicit_filters = filters or {}

        # Tiered, cost-aware query optimization:
        # - Tier 1/2: keyword-only extraction (no AI parsing)
        # - Tier 3: allow AI parsing (with Redis + in-memory caching)
        tier, optimized_filters = self.query_optimizer.optimize(query, explicit_filters)
        logger.debug("Query tier: %s, optimized filters: %s", tier, optimized_filters)

        extracted_filters: Dict = {}
        if explicit_filters:
            # If the user provided explicit filters, skip AI parsing entirely to save cost.
            logger.debug("Using explicit filters, skipping AI query parsing")
        else:
            if tier in (1, 2):
                # For simple/medium queries, rely on keyword extraction only (no AI).
                logger.debug("Tier 1/2 query with no explicit filters - skipping AI query parsing")
            else:
                # Tier 3: complex semantic query – use AI parsing with multi-level caching.
                query_hash = hashlib.md5(canonical_query.encode()).hexdigest()

                # Level 0: in-memory cache (shared across all SemanticSearch instances)
                if query_hash in QUERY_PARSE_CACHE:
                    logger.debug("Using in-memory cached query parse for: %s", query)
                    extracted_filters = QUERY_PARSE_CACHE[query_hash]
                else:
                    # Level 1: Redis cache via CacheManager
                    cached_filters = self.cache.get_parsed_filters(canonical_query)
                    if cached_filters:
                        logger.debug("Using Redis cached query parse for: %s", query)
                        extracted_filters = cached_filters
                        QUERY_PARSE_CACHE[query_hash] = extracted_filters
                    else:
                        parse_start = time.time()
                        logger.debug("Parsing query for filters (AI): %s", query)
                        extracted_filters = self.analyzer.parse_search_query(query)
                        parse_time = time.time() - parse_start
                        logger.debug("Query parsing took %.2fs", parse_time)
                        # Store in both in-memory and Redis caches
                        QUERY_PARSE_CACHE[query_hash] = extracted_filters
                        self.cache.set_parsed_filters(canonical_query, extracted_filters)

                        # Limit in-memory cache size to prevent memory issues
                        if len(QUERY_PARSE_CACHE) > 1000:
                            # Remove oldest entry (simple FIFO)
                            oldest_key = next(iter(QUERY_PARSE_CACHE))
                            del QUERY_PARSE_CACHE[oldest_key]

        logger.debug("Extracted filters (AI): %s", extracted_filters)

        # Merge filters in precedence order:
        # AI-parsed < keyword-derived (optimized) < explicit filters
        merged_filters = {**(extracted_filters or {}), **(optimized_filters or {})}
        logger.debug("Merged filters (final): %s", merged_filters)

        # Optional: check cache for full search results for this (query, filters, user)
        cache_filters_for_results: Dict = dict(merged_filters)
        if user_id is not None:
            cache_filters_for_results["_user_id"] = user_id

        # Build a deterministic cache key for the in-memory result cache
        results_cache_key = json.dumps(
            {"query": canonical_query, "filters": cache_filters_for_results},
            sort_keys=True,
        )

        cached_result_ids: Optional[List[int]] = None

        # Level 1: Redis cache for full search results (if enabled)
        if self.cache.redis_enabled:
            cached_result_ids = self.cache.get_search_results(canonical_query, cache_filters_for_results)
        else:
            # Level 0: in-memory result cache shared within this process
            cached_result_ids = SEARCH_RESULTS_CACHE.get(results_cache_key)

        if cached_result_ids:
            logger.debug("Using cached search results for query=%r filters=%s", query, cache_filters_for_results)
            # Re-load monologues by ID to get current ORM instances, preserving order.
            mons = self.db.query(Monologue).join(Play).filter(Monologue.id.in_(cached_result_ids)).all()
            mon_by_id: Dict[Any, Monologue] = {m.id: m for m in mons}
            ordered = [mon_by_id[mid] for mid in cached_result_ids if mid in mon_by_id]  # type: ignore[index]
            overall_time = time.time() - overall_start
            logger.debug("Total search time (cache hit): %.2fs, results: %s", overall_time, len(ordered))
            return ordered[:limit]

        # Generate embedding for query (with caching at multiple levels)
        query_hash = hashlib.md5(canonical_query.encode()).hexdigest()
        if query_hash in EMBEDDING_CACHE:
            logger.debug("Using cached embedding for: %s", query)
            query_embedding = EMBEDDING_CACHE[query_hash]
        else:
            # Try Redis-backed embedding cache first
            cached_embedding = self.cache.get_embedding(canonical_query)
            if cached_embedding:
                logger.debug("Using Redis cached embedding for: %s", query)
                query_embedding = cached_embedding
                EMBEDDING_CACHE[query_hash] = query_embedding
            else:
                emb_start = time.time()
                logger.debug("Generating embedding for query (AI): %s", query)
                query_embedding = self.analyzer.generate_embedding(query)
                emb_time = time.time() - emb_start
                logger.debug("Embedding generation took %.2fs", emb_time)
                if query_embedding:
                    # Store in in-memory and Redis caches
                    EMBEDDING_CACHE[query_hash] = query_embedding
                    self.cache.set_embedding(canonical_query, query_embedding)
                    # Limit in-memory cache size to prevent memory issues
                    if len(EMBEDDING_CACHE) > 1000:
                        # Remove oldest entry (simple FIFO)
                        oldest_key = next(iter(EMBEDDING_CACHE))
                        del EMBEDDING_CACHE[oldest_key]

        if not query_embedding:
            logger.info("Failed to generate embedding, falling back to text search")
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

        # OPTIMIZATION: Prefer DB-side vector search via pgvector when available.
        # We first try to use the `embedding_vector` pgvector column, and only
        # fall back to legacy JSON embeddings + Python cosine similarity when
        # pgvector is not available or no vectors exist yet.
        MAX_CANDIDATES = 500  # Upper bound for candidate pool size

        results_with_scores: List[tuple[Monologue, float]] = []

        try:
            # Primary path: pgvector-based similarity search in the database.
            # Order by cosine distance and take a modest multiple of `limit`
            # so we can still apply bookmark boosts and hybrid merging.
            VECTOR_CANDIDATES = min(MAX_CANDIDATES, max(limit * 3, limit))
            semantic_candidates = (
                base_query.filter(Monologue.embedding_vector.isnot(None))
                .order_by(Monologue.embedding_vector.cosine_distance(query_embedding))
                .limit(VECTOR_CANDIDATES)
                .all()
            )

            logger.debug(
                "Loaded %s monologues with pgvector embeddings (max: %s)",
                len(semantic_candidates), VECTOR_CANDIDATES
            )

            similarity_start = time.time()
            for mono in semantic_candidates:
                # The pgvector column is exposed as a Python sequence of floats.
                mono_embedding_vec: Optional[List[float]] = getattr(mono, "embedding_vector", None)  # type: ignore[assignment]
                if mono_embedding_vec:
                    similarity = self._cosine_similarity(query_embedding, mono_embedding_vec)

                    # Boost bookmarked monologues by adding 0.3 to similarity
                    if mono.id in bookmarked_ids:
                        similarity += 0.3
                        logger.debug("Boosting bookmarked (pgvector): %s from %s", mono.character_name, mono.play.title)

                    results_with_scores.append((mono, similarity))

            similarity_time = time.time() - similarity_start
            logger.debug(
                "Similarity (pgvector) took %.2fs for %s candidates",
                similarity_time, len(semantic_candidates)
            )

        except Exception as e:
            # If pgvector is unavailable or misconfigured, fall back to legacy
            # JSON-based embeddings to keep search functional.
            logger.debug("pgvector search failed, using legacy embeddings: %s", e)
            try:
                self.db.rollback()
            except Exception:
                pass

            try:
                monologues_with_embeddings = (
                    base_query.filter(
                        Monologue.embedding.isnot(None),
                        Monologue.embedding != "",
                    )
                    .order_by(Monologue.id)  # deterministic ordering for candidate pool
                    .limit(MAX_CANDIDATES)
                    .all()
                )
            except Exception as inner_e:
                logger.debug("Legacy semantic search base query failed: %s", inner_e)
                # Rollback and fall back to pure text search
                try:
                    self.db.rollback()
                except Exception:
                    pass
                return self._fallback_text_search(query, limit, merged_filters)

            logger.debug(
                "Loaded %s monologues with legacy JSON embeddings (max: %s)",
                len(monologues_with_embeddings), MAX_CANDIDATES
            )

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
                            logger.debug("Boosting bookmarked: %s from %s", mono.character_name, mono.play.title)

                        results_with_scores.append((mono, similarity))

                    except (json.JSONDecodeError, ValueError, TypeError) as parse_e:
                        logger.debug("Error calculating similarity for monologue %s: %s", mono.id, parse_e)
                        continue

            similarity_time = time.time() - similarity_start
            logger.debug(
                "Similarity (legacy JSON) took %.2fs for %s candidates",
                similarity_time, len(results_with_scores)
            )

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
            logger.debug(
                "Hybrid: %s text + %s semantic = %s results",
                len(text_match_results), min(len(semantic_only), limit - len(text_match_results)), len(combined)
            )
        else:
            top_results = top_semantic

        # Famous-line boost: if the query looks like a quote (multi-word), put monologues whose
        # text contains the query at the very top so "to be or not to be" returns Hamlet first
        query_lower = query.strip().lower()
        if len(query_lower.split()) >= 2:
            monologues_with_scores = list(top_results)
            text_contains = [(m, s) for m, s in monologues_with_scores if m.text and query_lower in m.text.lower()]
            text_does_not = [(m, s) for m, s in monologues_with_scores if not m.text or query_lower not in m.text.lower()]
            if text_contains:
                top_results = text_contains + text_does_not
                logger.debug("Famous-line boost: %s monologue(s) with query in text moved first", len(text_contains))

        # FALLBACK: If we don't have enough semantic results, supplement with text search
        # This ensures users get results even when embeddings aren't available
        if len(top_results) < limit:
            needed = limit - len(top_results)
            logger.debug("Only %s semantic results, supplementing with %s text search", len(top_results), needed)

            # Get IDs we already have to avoid duplicates
            existing_ids = {mono.id for mono, _ in top_results}

            # Fallback to text search
            fallback_start = time.time()
            fallback_results = self._fallback_text_search(query, needed * 2, merged_filters)  # Get extra for filtering
            fallback_time = time.time() - fallback_start
            logger.debug("Fallback text search took %.2fs", fallback_time)

            # Add fallback results that aren't already in semantic results
            fallback_unique = [m for m in fallback_results if m.id not in existing_ids][:needed]

            # Combine results: semantic results first, then fallback
            final_results = [mono for mono, _ in top_results] + fallback_unique

            # Cache final ordered results (per query + filters + user).
            if self.cache.redis_enabled:
                self.cache.set_search_results(
                    canonical_query,
                    cache_filters_for_results,
                    [m.id for m in final_results],
                )
            else:
                SEARCH_RESULTS_CACHE[results_cache_key] = [m.id for m in final_results]

            overall_time = time.time() - overall_start
            logger.debug("Total search time: %.2fs, final results: %s", overall_time, len(final_results))

            # Return combined results
            return final_results[:limit]

        overall_time = time.time() - overall_start

        if logger.isEnabledFor(logging.DEBUG):
            from collections import Counter
            author_dist = Counter(mono.play.author for mono, _ in results_with_scores)
            logger.debug(
                "Search complete: query=%r, time=%.2fs, candidates=%s, top=%s; author dist: %s",
                query, overall_time, len(results_with_scores), len(top_results),
                dict(author_dist.most_common(5)),
            )

        final_semantic_results = [mono for mono, _ in top_results]

        # Cache final ordered results (per query + filters + user).
        if self.cache.redis_enabled:
            self.cache.set_search_results(
                canonical_query,
                cache_filters_for_results,
                [m.id for m in final_semantic_results],
            )
        else:
            SEARCH_RESULTS_CACHE[results_cache_key] = [m.id for m in final_semantic_results]

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

        # When user types a famous line (e.g. "to be or not to be"), put monologues that
        # contain that exact phrase in the text first. Then play/character matches.
        normalized_query = query.strip()
        base_query = base_query.order_by(
            Monologue.text.ilike(f"%{normalized_query}%").desc(),
            Play.title.ilike(f'%{normalized_query}%').desc(),
            Monologue.character_name.ilike(f'%{normalized_query}%').desc(),
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
