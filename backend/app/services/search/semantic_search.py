"""Semantic search for monologues using embeddings."""

import hashlib
import json
import logging
import re
from collections import OrderedDict
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)
from app.models.actor import Monologue, Play
from app.services.ai.content_analyzer import ContentAnalyzer
from app.services.search.cache_manager import cache_manager
from app.services.search.query_optimizer import QueryOptimizer
from sqlalchemy import func, or_, text
from sqlalchemy.orm import Session

# Module-level in-memory caches (Level 0 hot cache shared across SemanticSearch instances).
# Uses OrderedDict for LRU eviction - popular queries stay cached longer.
# These are always available, even when Redis is not installed, and keep repeat
# queries cheap within a single process. Keys use a *canonical* form of the query
# so trivial variants like "Hamlet", "hamlet ", or "HAMLET!!!" all share entries.
EMBEDDING_CACHE: OrderedDict[str, List[float]] = OrderedDict()
QUERY_PARSE_CACHE: OrderedDict[str, Dict] = OrderedDict()
SEARCH_RESULTS_CACHE: OrderedDict[str, List[Any]] = OrderedDict()

# Minimum relevance (0–1) to show any results. Below this, the query is treated as no match
# (e.g. unrelated language, gibberish) and we return empty instead of weak semantic hits.
# Tuned so queries like "at hirsizi" (unrelated to corpus) return no results.
MIN_RELEVANCE_TO_SHOW = 0.48


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


def _strip_punctuation(text: str) -> str:
    """
    Strip punctuation from text for fuzzy famous-line matching.
    E.g., "To be, or not to be" -> "to be or not to be"
    """
    # Remove all punctuation except apostrophes (for contractions like "don't")
    text = re.sub(r"[^\w\s']", "", text.lower())
    # Collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _keyword_match_score_and_type(mono: Monologue, query: str) -> Tuple[float, str]:
    """
    When a monologue was found via text search (title/character/play), return a high
    score and match_type so it ranks at the top and shows an "Exact match" / "Title match"
    style badge. Prefer title > character > play.
    """
    q = query.strip().lower()
    if not q:
        return (0.0, "")
    title_lower = (mono.title or "").lower()
    char_lower = (mono.character_name or "").lower()
    play_title_lower = (mono.play.title or "").lower() if mono.play else ""
    play_author_lower = (mono.play.author or "").lower() if mono.play else ""
    if q in title_lower or title_lower in q:
        return (0.95, "title_match")
    if q in char_lower or char_lower in q:
        return (0.90, "character_match")
    if q in play_title_lower or play_title_lower in q or q in play_author_lower or play_author_lower in q:
        return (0.85, "play_match")
    return (0.0, "")


def _profile_match_boost(mono: Monologue, actor_profile: Optional[Dict]) -> float:
    """
    Return a small score boost when the monologue matches the actor's profile
    (e.g. character gender/age fits the actor). Only applies when profile_bias_enabled.
    """
    if not actor_profile or not actor_profile.get("profile_bias_enabled", True):
        return 0.0
    boost = 0.0
    ap_gender = (actor_profile.get("gender") or "").strip().lower()
    if ap_gender:
        cg = (mono.character_gender or "").lower()
        if cg == ap_gender or cg == "any":
            boost += 0.08
    ap_age = (actor_profile.get("age_range") or "").strip().lower()
    if ap_age:
        ca = (mono.character_age_range or "").lower()
        if ca == ap_age or ca == "any":
            boost += 0.07
    return min(0.12, boost)


def _filter_match_boost(mono: Monologue, merged_filters: Dict) -> float:
    """
    Return a score boost (0.0 to 0.35) when the monologue matches parsed query filters.
    So "funny piece for a woman 2min" results that match female + joy + duration get
    a higher displayed confidence (e.g. 37% -> 65%) and feel more encouraging.
    """
    if not merged_filters:
        return 0.0
    boost = 0.0
    if merged_filters.get("gender"):
        g = (mono.character_gender or "").lower()
        want = (merged_filters["gender"] or "").lower()
        if g == want or g == "any" or want == "any":
            boost += 0.12
    if merged_filters.get("emotion"):
        e = (mono.primary_emotion or "").lower()
        if e == (merged_filters["emotion"] or "").lower():
            boost += 0.12
    if merged_filters.get("max_duration"):
        try:
            max_sec = int(merged_filters["max_duration"])
            if mono.estimated_duration_seconds <= max_sec:
                boost += 0.11
        except (TypeError, ValueError):
            pass
    want_themes = merged_filters.get("themes")
    if not want_themes and merged_filters.get("theme"):
        want_themes = [merged_filters["theme"]]
    if want_themes and mono.themes:
        mono_themes_lower = [str(t).lower() for t in (mono.themes or []) if t]
        for wt in want_themes if isinstance(want_themes, list) else [want_themes]:
            if wt and str(wt).lower() in mono_themes_lower:
                boost += 0.05
                break
    return min(0.35, boost)


def _calculate_relevance_score_multiplicative(
    base_similarity: float,
    mono: Monologue,
    merged_filters: Dict,
    actor_profile: Optional[Dict],
    is_bookmarked: bool
) -> float:
    """
    IMPROVED: Multiplicative scoring to prevent saturation and preserve ranking.

    Formula: score = base * (1 + w1*match1) * (1 + w2*match2) * ...
    This allows stacking bonuses while preserving relative ranking granularity.

    Args:
        base_similarity: Cosine similarity (0.0-1.0)
        mono: Monologue object
        merged_filters: Parsed query filters
        actor_profile: User's actor profile
        is_bookmarked: Whether user has bookmarked this monologue

    Returns:
        Final relevance score
    """
    score = base_similarity

    # Weight constants (tuned for good results)
    WEIGHTS = {
        'filter_gender': 0.15,
        'filter_emotion': 0.15,
        'filter_tone': 0.12,
        'filter_duration': 0.12,
        'filter_theme': 0.08,
        'profile_gender': 0.10,
        'profile_age': 0.05,
        'bookmark': 0.20,  # Reduced from +0.3 additive
    }

    # 1. Filter matches
    if merged_filters.get("gender"):
        g = (mono.character_gender or "").lower()
        want = (merged_filters["gender"] or "").lower()
        if g == want or g == "any" or want == "any":
            score *= (1 + WEIGHTS['filter_gender'])

    if merged_filters.get("emotion"):
        e = (mono.primary_emotion or "").lower()
        if e == (merged_filters["emotion"] or "").lower():
            score *= (1 + WEIGHTS['filter_emotion'])

    if merged_filters.get("tone"):
        t = (mono.tone or "").lower()
        if t == (merged_filters["tone"] or "").lower():
            score *= (1 + WEIGHTS['filter_tone'])

    if merged_filters.get("max_duration") and mono.estimated_duration_seconds:
        try:
            max_sec = int(merged_filters["max_duration"])
            if mono.estimated_duration_seconds <= max_sec:
                score *= (1 + WEIGHTS['filter_duration'])
        except (TypeError, ValueError):
            pass

    want_themes = merged_filters.get("themes") or ([merged_filters["theme"]] if merged_filters.get("theme") else None)
    if want_themes and mono.themes:
        mono_themes_lower = [str(t).lower() for t in (mono.themes or []) if t]
        for wt in want_themes if isinstance(want_themes, list) else [want_themes]:
            if wt and str(wt).lower() in mono_themes_lower:
                score *= (1 + WEIGHTS['filter_theme'])
                break

    # 2. Profile matches
    if actor_profile and actor_profile.get("profile_bias_enabled", True):
        ap_gender = (actor_profile.get("gender") or "").strip().lower()
        if ap_gender:
            cg = (mono.character_gender or "").lower()
            if cg == ap_gender or cg == "any":
                score *= (1 + WEIGHTS['profile_gender'])

        ap_age = (actor_profile.get("age_range") or "").strip().lower()
        if ap_age:
            ca = (mono.character_age_range or "").lower()
            if ca == ap_age or ca == "any":
                score *= (1 + WEIGHTS['profile_age'])

    # 3. Bookmark boost
    if is_bookmarked:
        score *= (1 + WEIGHTS['bookmark'])

    # Soft cap at 1.0, but allow exceptional matches to go slightly higher
    return min(1.0, score)


def _exact_quote_match_with_boundaries(query: str, text: str) -> bool:
    """
    Check if query is an exact quote with word boundaries.
    Prevents false positives like "be" matching "because".

    Args:
        query: Search query (already stripped of punctuation)
        text: Monologue text (already stripped of punctuation)

    Returns:
        True if exact match with word boundaries
    """
    if len(query) < 3:  # Too short to be meaningful
        return False

    # Use regex with word boundaries
    pattern = r'\b' + re.escape(query).replace(r'\ ', r'\s+') + r'\b'
    return re.search(pattern, text, re.IGNORECASE) is not None


def _fuzzy_quote_match(
    query: str, text: str, min_word_ratio: float = 0.80, max_span_words: int = 16
) -> bool:
    """
    Check if query is a fuzzy match for a famous line in text.
    Handles minor typos like "to be or not be" matching "to be or not to be".
    IMPROVED: Uses word boundaries to avoid false matches.

    Returns True only if:
    - At least min_word_ratio of query words appear in order in text, AND
    - Those matches fall within a span of at most max_span_words (so we match
      a real phrase like "to be or not to be", not scattered "to"/"be"/"or"/"not"
      across a long essay).
    """
    query_words = query.split()
    text_words = text.split()

    if len(query_words) < 3:  # Require at least 3 words for fuzzy matching
        return False

    # Find query words in order and record their indices in text
    text_idx = 0
    matched_indices: List[int] = []
    for qword in query_words:
        while text_idx < len(text_words):
            if text_words[text_idx] == qword:
                matched_indices.append(text_idx)
                text_idx += 1
                break
            text_idx += 1

    # Increased threshold to 80% for better precision
    if len(matched_indices) < len(query_words) * min_word_ratio:
        return False

    # Require matches to be within a short span (actual phrase, not scattered)
    span = matched_indices[-1] - matched_indices[0] + 1
    return span <= max_span_words


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
        user_id: Optional[int] = None,
        actor_profile: Optional[Dict] = None,
    ) -> Tuple[List[tuple[Monologue, float]], Dict[int, str]]:
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
            actor_profile: Optional dict with gender, age_range, profile_bias_enabled to boost results that fit the actor

        Returns:
            List of (Monologue, relevance_score) tuples, sorted by relevance.
            Scores are 0.0-1.0 for semantic matches, higher is more relevant.
            Text-only matches return score of 0.0.
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
                    QUERY_PARSE_CACHE.move_to_end(query_hash)  # Mark as recently used (LRU)
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
                        QUERY_PARSE_CACHE.move_to_end(query_hash)  # Mark as recently used
                        self.cache.set_parsed_filters(canonical_query, extracted_filters)

                        # Limit in-memory cache size to prevent memory issues
                        # LRU eviction: remove least recently used item
                        if len(QUERY_PARSE_CACHE) > 1000:
                            QUERY_PARSE_CACHE.popitem(last=False)  # Remove LRU item

        logger.debug("Extracted filters (AI): %s", extracted_filters)

        # Merge filters in precedence order:
        # AI-parsed < keyword-derived (optimized) < explicit filters
        merged_filters = {**(extracted_filters or {}), **(optimized_filters or {}), **(explicit_filters or {})}
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
            cached = self.cache.get_search_results(canonical_query, cache_filters_for_results)
        else:
            # Level 0: in-memory result cache shared within this process
            cached = SEARCH_RESULTS_CACHE.get(results_cache_key)

        if cached:
            logger.debug("Using cached search results for query=%r filters=%s", query, cache_filters_for_results)
            # Cache format: list of [id, score] so we preserve confidence scores for UI
            if cached and isinstance(cached[0], (list, tuple)):
                cached_ids = [item[0] for item in cached]
                cached_scores = {item[0]: float(item[1]) for item in cached}
            else:
                # Legacy: list of ids only
                cached_ids = list(cached)
                cached_scores = {}
            mons = self.db.query(Monologue).join(Play).filter(Monologue.id.in_(cached_ids)).all()
            mon_by_id: Dict[Any, Monologue] = {m.id: m for m in mons}
            ordered_with_scores: List[tuple[Monologue, float]] = [
                (mon_by_id[mid], cached_scores.get(mid, 0.0))
                for mid in cached_ids
                if mid in mon_by_id
            ]
            overall_time = time.time() - overall_start
            logger.debug("Total search time (cache hit): %.2fs, results: %s", overall_time, len(ordered_with_scores))
            # Restore quote_match_type from cache if stored (payload item length >= 3)
            quote_types: Dict[int, str] = {}
            if cached and isinstance(cached[0], (list, tuple)) and len(cached[0]) >= 3:
                quote_types = {item[0]: item[2] for item in cached if len(item) >= 3 and item[2]}
            return (ordered_with_scores[:limit], quote_types)

        # Generate embedding for query (with caching at multiple levels)
        query_hash = hashlib.md5(canonical_query.encode()).hexdigest()
        if query_hash in EMBEDDING_CACHE:
            logger.debug("Using cached embedding for: %s", query)
            query_embedding = EMBEDDING_CACHE[query_hash]
            EMBEDDING_CACHE.move_to_end(query_hash)  # Mark as recently used (LRU)
        else:
            # Try Redis-backed embedding cache first
            cached_embedding = self.cache.get_embedding(canonical_query)
            if cached_embedding:
                logger.debug("Using Redis cached embedding for: %s", query)
                query_embedding = cached_embedding
                EMBEDDING_CACHE[query_hash] = query_embedding
                EMBEDDING_CACHE.move_to_end(query_hash)  # Mark as recently used
            else:
                emb_start = time.time()
                logger.debug("Generating embedding for query (AI): %s", query)
                query_embedding = self.analyzer.generate_embedding(query)
                emb_time = time.time() - emb_start
                logger.debug("Embedding generation took %.2fs", emb_time)
                if query_embedding:
                    # Store in in-memory and Redis caches
                    EMBEDDING_CACHE[query_hash] = query_embedding
                    EMBEDDING_CACHE.move_to_end(query_hash)  # Mark as recently used
                    self.cache.set_embedding(canonical_query, query_embedding)
                    # Limit in-memory cache size to prevent memory issues
                    # LRU eviction: remove least recently used item
                    if len(EMBEDDING_CACHE) > 1000:
                        EMBEDDING_CACHE.popitem(last=False)  # Remove LRU item

        if not query_embedding:
            logger.info("Failed to generate embedding, falling back to text search")
            fallback = self._fallback_text_search(query, limit, merged_filters, explicit_filters)
            return ([(m, 0.0) for m in fallback], {})

        # Hybrid search: run text search for direct play/character/title matches and merge on top.
        # Many monologues (e.g. from Gutenberg) have no embeddings, so "hamlet" would otherwise
        # return only semantic results from other plays and never show Hamlet.
        text_match_results = self._fallback_text_search(query, limit=limit, filters=merged_filters, explicit_filters=explicit_filters)

        # Build base query
        base_query = self.db.query(Monologue).join(Play)

        # Apply merged filters (gender only as hard filter when set via UI, else boost-only)
        if merged_filters:
            if merged_filters.get('gender') and explicit_filters.get('gender'):
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

            # Act/scene filters for classical plays
            if merged_filters.get('act'):
                base_query = base_query.filter(
                    Monologue.act == merged_filters['act']
                )

            if merged_filters.get('scene'):
                base_query = base_query.filter(
                    Monologue.scene == merged_filters['scene']
                )

            if merged_filters.get('max_overdone_score') is not None:
                threshold = float(merged_filters['max_overdone_score'])
                base_query = base_query.filter(
                    or_(
                        Monologue.overdone_score.is_(None),
                        Monologue.overdone_score <= threshold,
                    )
                )

        # Get user's bookmarked monologues if user_id provided
        # NOTE: Fetches all bookmarks because boost is applied during scoring
        # Capped at 1000 most recent to avoid pathological cases
        bookmarked_ids = set()
        if user_id:
            from app.models.actor import MonologueFavorite
            favorites = self.db.query(MonologueFavorite.monologue_id).filter(
                MonologueFavorite.user_id == user_id
            ).order_by(MonologueFavorite.created_at.desc()).limit(1000).all()
            bookmarked_ids = {f[0] for f in favorites}

        # OPTIMIZATION: Prefer DB-side vector search via pgvector when available.
        # We first try to use the `embedding_vector` pgvector column, and only
        # fall back to legacy JSON embeddings + Python cosine similarity when
        # pgvector is not available or no vectors exist yet.
        MAX_CANDIDATES = 150  # Upper bound for candidate pool size

        results_with_scores: List[tuple[Monologue, float]] = []

        try:
            # Primary path: pgvector-based similarity search in the database.
            # Order by cosine distance and take a modest multiple of `limit`
            # so we can still apply bookmark boosts and hybrid merging.
            # OPTIMIZED: Reduced from 3x to 1.5x since HNSW indexes are now in place
            VECTOR_CANDIDATES = min(MAX_CANDIDATES, max(int(limit * 1.5), limit))
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

            # pgvector already returned candidates sorted best-first by cosine distance.
            # Recomputing cosine similarity in Python is redundant — derive a score
            # from rank position instead (rank 0 = best match → 1.0, decreasing).
            total = len(semantic_candidates)
            for rank, mono in enumerate(semantic_candidates):
                similarity = max(0.0, 1.0 - (rank / max(total, 1)) * 0.4)
                results_with_scores.append((mono, similarity))

            logger.debug("pgvector returned %s candidates (rank-based scoring)", total)

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
                fallback_monologues = self._fallback_text_search(query, limit, merged_filters, explicit_filters)
                return ([(m, 0.0) for m in fallback_monologues], {})

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
                        # Note: Bookmark boost will be applied later in multiplicative scoring
                        results_with_scores.append((mono, similarity))

                    except (json.JSONDecodeError, ValueError, TypeError) as parse_e:
                        logger.debug("Error calculating similarity for monologue %s: %s", mono.id, parse_e)
                        continue

            similarity_time = time.time() - similarity_start
            logger.debug(
                "Similarity (legacy JSON) took %.2fs for %s candidates",
                similarity_time, len(results_with_scores)
            )

        # IMPROVED: Apply all boosts using multiplicative scoring (prevents saturation)
        results_with_scores = [
            (mono, _calculate_relevance_score_multiplicative(
                score, mono, merged_filters, actor_profile, mono.id in bookmarked_ids
            ))
            for mono, score in results_with_scores
        ]

        # Sort by similarity (descending) and limit
        results_with_scores.sort(key=lambda x: x[1], reverse=True)
        top_semantic = [(mono, score) for mono, score in results_with_scores[:limit]]

        # Match types for frontend badges (exact quote, title match, character match, play match)
        query_lower = query.strip().lower()
        query_stripped = _strip_punctuation(query)
        quote_match_type_by_id: Dict[int, str] = {}

        # Merge hybrid: text matches (play/character/title) first, then semantic results not already in text matches
        if text_match_results:
            existing_ids = {m.id for m in text_match_results}
            semantic_only = [(mono, score) for mono, score in top_semantic if mono.id not in existing_ids]
            semantic_scores_by_id = {mono.id: score for mono, score in top_semantic}
            combined_with_scores: list[tuple[Monologue, float]] = []
            for m in text_match_results:
                kw_score, kw_type = _keyword_match_score_and_type(m, query)
                # Use best of semantic score or keyword score so title/character/play matches rank at top
                score = max(semantic_scores_by_id.get(m.id, 0.0), kw_score if kw_score > 0 else 0.0)
                if kw_type:
                    quote_match_type_by_id[m.id] = kw_type
                combined_with_scores.append((m, score))
            for mono, score in semantic_only:
                if len(combined_with_scores) >= limit:
                    break
                combined_with_scores.append((mono, score))
            top_results = combined_with_scores[:limit]
            logger.debug(
                "Hybrid: %s text + %s semantic = %s results",
                len(text_match_results), min(len(semantic_only), limit - len(text_match_results)), len(combined_with_scores)
            )
        else:
            top_results = top_semantic

        # Famous-line boost: if the query looks like a quote (multi-word), put monologues whose
        # text contains the query at the very top AND boost their score. Track match_type so the
        # frontend can show "Exact quote" / "This is the one" only for the actual quote monologue(s).
        EXACT_QUOTE_MATCH_SCORE = 0.98  # Very high score for exact text matches
        FUZZY_QUOTE_MATCH_SCORE = 0.90  # High score for fuzzy matches (handles typos)
        if len(query_lower.split()) >= 2:
            monologues_with_scores = list(top_results)
            exact_matches: list[tuple[Monologue, float]] = []
            fuzzy_matches: list[tuple[Monologue, float]] = []
            other_results: list[tuple[Monologue, float]] = []

            for m, s in monologues_with_scores:
                if not m.text:
                    other_results.append((m, s))
                    continue
                text_stripped = _strip_punctuation(m.text)
                # IMPROVED: Exact match with word boundaries (prevents "be" matching "because")
                if _exact_quote_match_with_boundaries(query_stripped, text_stripped):
                    exact_matches.append((m, max(s, EXACT_QUOTE_MATCH_SCORE)))
                    quote_match_type_by_id[m.id] = "exact_quote"
                # Fuzzy match (handles minor typos like "to be or not be" → "to be or not to be")
                elif _fuzzy_quote_match(query_stripped, text_stripped):
                    fuzzy_matches.append((m, max(s, FUZZY_QUOTE_MATCH_SCORE)))
                    quote_match_type_by_id[m.id] = "fuzzy_quote"
                else:
                    other_results.append((m, s))

            if exact_matches or fuzzy_matches:
                top_results = exact_matches + fuzzy_matches + other_results
                logger.debug(
                    "Famous-line boost: %s exact (%.2f), %s fuzzy (%.2f)",
                    len(exact_matches), EXACT_QUOTE_MATCH_SCORE,
                    len(fuzzy_matches), FUZZY_QUOTE_MATCH_SCORE
                )

        # No real match: if best score is below threshold (e.g. unrelated language / gibberish), return empty
        if top_results:
            best_score = max(s for _, s in top_results)
            if best_score < MIN_RELEVANCE_TO_SHOW:
                logger.debug("Best relevance %.3f below threshold %.2f; returning no results", best_score, MIN_RELEVANCE_TO_SHOW)
                return ([], {})
            top_results = [(m, s) for m, s in top_results if s >= MIN_RELEVANCE_TO_SHOW]

        # FALLBACK: If we don't have enough semantic results, supplement with text search
        # This ensures users get results even when embeddings aren't available
        if len(top_results) < limit:
            needed = limit - len(top_results)
            logger.debug("Only %s semantic results, supplementing with %s text search", len(top_results), needed)

            # Get IDs we already have to avoid duplicates
            existing_ids = {mono.id for mono, _ in top_results}

            # Fallback to text search
            fallback_start = time.time()
            fallback_results = self._fallback_text_search(query, needed * 2, merged_filters, explicit_filters)  # Get extra for filtering
            fallback_time = time.time() - fallback_start
            logger.debug("Fallback text search took %.2fs", fallback_time)

            # Add fallback results that aren't already in semantic results
            fallback_unique = [m for m in fallback_results if m.id not in existing_ids][:needed]

            # Combine results: semantic results first (with scores), then fallback (with 0.0 score)
            final_results_with_scores = list(top_results) + [(m, 0.0) for m in fallback_unique]
            final_results = [mono for mono, _ in final_results_with_scores]

            # Cache final ordered results with scores and quote match types
            cache_payload = [
                [m.id, round(s, 4), quote_match_type_by_id.get(m.id, "")]
                for m, s in final_results_with_scores
            ]
            if self.cache.redis_enabled:
                self.cache.set_search_results(
                    canonical_query,
                    cache_filters_for_results,
                    cache_payload,
                )
            else:
                SEARCH_RESULTS_CACHE[results_cache_key] = cache_payload

            overall_time = time.time() - overall_start
            logger.debug("Total search time: %.2fs, final results: %s", overall_time, len(final_results))

            return (final_results_with_scores[:limit], quote_match_type_by_id)

        overall_time = time.time() - overall_start

        if logger.isEnabledFor(logging.DEBUG):
            from collections import Counter
            author_dist = Counter(mono.play.author for mono, _ in results_with_scores)
            logger.debug(
                "Search complete: query=%r, time=%.2fs, candidates=%s, top=%s; author dist: %s",
                query, overall_time, len(results_with_scores), len(top_results),
                dict(author_dist.most_common(5)),
            )

        # Cache final ordered results with scores and quote match types
        cache_payload = [
            [m.id, round(s, 4), quote_match_type_by_id.get(m.id, "")]
            for m, s in top_results
        ]
        if self.cache.redis_enabled:
            self.cache.set_search_results(
                canonical_query,
                cache_filters_for_results,
                cache_payload,
            )
        else:
            SEARCH_RESULTS_CACHE[results_cache_key] = cache_payload

        return (list(top_results), quote_match_type_by_id)

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
        filters: Optional[Dict],
        explicit_filters: Optional[Dict] = None,
    ) -> List[Monologue]:
        """
        Fallback to simple text search if embedding fails.

        This is intentionally AI-free and keyword-friendly to keep costs low.
        For natural-language queries like "give me the hamlet monologue", we
        extract strong keyword tokens (e.g. "hamlet", "monologue") so that
        classical pieces like Hamlet still surface even when the exact phrase
        doesn't appear in the script.
        """
        # Gender: only hard-filter when set via UI (explicit), not when from query text
        apply_gender_filter = filters and filters.get('gender') and (
            explicit_filters is None or explicit_filters.get('gender')
        )

        base_query = self.db.query(Monologue).join(Play)

        # Apply filters (same as semantic search)
        if filters:
            if apply_gender_filter:
                base_query = base_query.filter(
                    or_(
                        Monologue.character_gender == filters['gender'],
                        Monologue.character_gender == 'any'
                    )
                )

            if filters.get('tone'):
                base_query = base_query.filter(
                    Monologue.tone == filters['tone']
                )

            if filters.get('age_ranges'):
                base_query = base_query.filter(
                    Monologue.character_age_range.in_(filters['age_ranges'])
                )
            elif filters.get('age_range'):
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

            # Act/scene filters for classical plays
            if filters.get('act'):
                base_query = base_query.filter(
                    Monologue.act == filters['act']
                )

            if filters.get('scene'):
                base_query = base_query.filter(
                    Monologue.scene == filters['scene']
                )

            if filters.get('max_overdone_score') is not None:
                threshold = float(filters['max_overdone_score'])
                base_query = base_query.filter(
                    or_(
                        Monologue.overdone_score.is_(None),
                        Monologue.overdone_score <= threshold,
                    )
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

        # If no strong tokens found but query has multiple words (potential famous line),
        # include shorter significant words like "be", "not", "what", etc.
        query_words = re.findall(r"\w+", query.lower())
        if not tokens and len(query_words) >= 3:
            # Include short non-stopwords for famous line detection
            short_tokens = {
                token for token in query_words
                if token not in stopwords and len(token) >= 2
            }
            tokens.update(short_tokens)

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

        # For famous line matching: also search with punctuation stripped
        # This allows "to be or not to be" to match "To be, or not to be"
        normalized_for_punctuation = _strip_punctuation(query)
        if len(normalized_for_punctuation) > 5:
            # Use PostgreSQL regexp_replace to strip punctuation from text before comparing
            # Pattern: remove all non-word chars except spaces and apostrophes
            ilike_clauses.append(
                text(
                    "regexp_replace(lower(monologues.text), '[^\\w\\s'']', '', 'g') ILIKE :pattern"
                ).bindparams(pattern=f"%{normalized_for_punctuation}%")
            )

        base_query = base_query.filter(or_(*ilike_clauses))

        # When user types a famous line (e.g. "to be or not to be"), put monologues that
        # contain that exact phrase in the text first. Then play/character matches.
        # Use punctuation-stripped comparison to boost famous lines correctly.
        normalized_query = query.strip()

        # Build ordering priorities for famous line detection
        ordering_clauses = []

        # Priority 1: Exact famous line match (punctuation-stripped)
        ordering_clauses.append(
            text(
                "CASE WHEN regexp_replace(lower(monologues.text), '[^\\w\\s'']', '', 'g') "
                "ILIKE :pattern THEN 100 ELSE 0 END DESC"
            ).bindparams(pattern=f"%{normalized_for_punctuation}%")
        )

        # Priority 2: Title match — when user searches by monologue title (e.g. "sadf"), put exact/contains match first
        ordering_clauses.append(Monologue.title.ilike(f"%{normalized_query}%").desc())

        # Priority 3: Opening line matches query pattern
        # Check if the normalized start of text contains most words from query
        # Uses word boundaries to avoid matching common word fragments
        query_words_for_match = [w for w in re.findall(r"\w+", normalized_for_punctuation.lower())]
        if len(query_words_for_match) >= 3:
            # Check if words appear as whole words in first 50 chars using regex word boundaries
            # More words matched = higher priority
            word_boundary_clauses = " + ".join([
                f"CASE WHEN regexp_replace(lower(substring(monologues.text, 1, 50)), '[^a-z ]', '', 'g') ~ '\\y{word}\\y' THEN 1 ELSE 0 END"
                for word in query_words_for_match
            ])
            ordering_clauses.append(text(f"({word_boundary_clauses}) DESC"))

        # Priority 4: Exact match with punctuation (text, play title, character)
        ordering_clauses.extend([
            Monologue.text.ilike(f"%{normalized_query}%").desc(),
            Play.title.ilike(f'%{normalized_query}%').desc(),
            Monologue.character_name.ilike(f'%{normalized_query}%').desc(),
        ])

        # Final: alphabetical
        ordering_clauses.extend([Play.title, Monologue.character_name])

        base_query = base_query.order_by(*ordering_clauses).limit(limit)

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

            if filters.get('max_overdone_score') is not None:
                threshold = float(filters['max_overdone_score'])
                base_query = base_query.filter(
                    or_(
                        Monologue.overdone_score.is_(None),
                        Monologue.overdone_score <= threshold,
                    )
                )

        # Order by random and limit. SQLAlchemy's func.random() is callable at runtime,
        # but static analysis (pylint) may flag it as not-callable, so we disable that check here.
        return base_query.order_by(func.random()).limit(limit).all()  # pylint: disable=not-callable
