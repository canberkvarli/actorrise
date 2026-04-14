"""Semantic search for monologues using embeddings."""

import concurrent.futures
import hashlib
import json
import logging
import random as _random
import re
from collections import OrderedDict
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)
from sqlalchemy import func, or_, text
from sqlalchemy.orm import Session, joinedload

from app.models.actor import Monologue, Play
from app.services.ai.content_analyzer import ContentAnalyzer
from app.services.search.cache_manager import cache_manager
from app.services.search.query_optimizer import QueryOptimizer

# Module-level in-memory caches (Level 0 hot cache shared across SemanticSearch instances).
# Uses OrderedDict for LRU eviction - popular queries stay cached longer.
# These are always available, even when Redis is not installed, and keep repeat
# queries cheap within a single process. Keys use a *canonical* form of the query
# so trivial variants like "Hamlet", "hamlet ", or "HAMLET!!!" all share entries.
#
# Max sizes are tuned for a 512 MB instance (~200 MB baseline from imports):
#   - Embeddings: 500 × ~6 KB ≈ 3 MB
#   - Query parse: 1000 × ~5 KB ≈ 5 MB
#   - Search results: 300 × ~20 KB ≈ 6 MB
_MAX_EMBEDDING_CACHE = 500
_MAX_QUERY_PARSE_CACHE = 1000
_MAX_SEARCH_RESULTS_CACHE = 300

EMBEDDING_CACHE: OrderedDict[str, List[float]] = OrderedDict()
QUERY_PARSE_CACHE: OrderedDict[str, Dict] = OrderedDict()
SEARCH_RESULTS_CACHE: OrderedDict[str, List[Any]] = OrderedDict()


_AGE_RANGE_ORDER = ["teens", "20s", "30s", "40s", "50s", "60s", "70s"]


def _expand_age_range(age_range: str) -> List[str]:
    """Expand an age range to include adjacent ranges + 'any'.
    e.g. '30s' → ['20s', '30s', '40s', 'any']
    """
    age_lower = age_range.lower().strip()
    try:
        idx = _AGE_RANGE_ORDER.index(age_lower)
    except ValueError:
        return [age_range, "any"]
    adjacent = {_AGE_RANGE_ORDER[idx]}
    if idx > 0:
        adjacent.add(_AGE_RANGE_ORDER[idx - 1])
    if idx < len(_AGE_RANGE_ORDER) - 1:
        adjacent.add(_AGE_RANGE_ORDER[idx + 1])
    adjacent.add("any")
    return list(adjacent)


def _evict_if_needed(cache: OrderedDict, max_size: int) -> None:
    """Remove oldest entries until cache is within max_size."""
    while len(cache) > max_size:
        cache.popitem(last=False)


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
    if (
        q in play_title_lower
        or play_title_lower in q
        or q in play_author_lower
        or play_author_lower in q
    ):
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
    if merged_filters.get("min_duration"):
        try:
            min_sec = int(merged_filters["min_duration"])
            if mono.estimated_duration_seconds >= min_sec:
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
    is_bookmarked: bool,
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
        "filter_gender": 0.25,
        "filter_emotion": 0.15,
        "filter_tone": 0.12,
        "filter_age_range": 0.20,
        "filter_duration": 0.12,
        "filter_theme": 0.08,
        "profile_gender": 0.10,
        "profile_age": 0.05,
        "bookmark": 0.20,  # Reduced from +0.3 additive
    }

    # 1. Filter matches
    if merged_filters.get("gender"):
        g = (mono.character_gender or "").lower()
        want = (merged_filters["gender"] or "").lower()
        if g == want or g == "any" or want == "any":
            score *= 1 + WEIGHTS["filter_gender"]

    if merged_filters.get("emotion"):
        e = (mono.primary_emotion or "").lower()
        if e == (merged_filters["emotion"] or "").lower():
            score *= 1 + WEIGHTS["filter_emotion"]

    if merged_filters.get("tone"):
        t = (mono.tone or "").lower()
        if t == (merged_filters["tone"] or "").lower():
            score *= 1 + WEIGHTS["filter_tone"]

    if merged_filters.get("age_range"):
        ca = (mono.character_age_range or "").lower()
        want_age = (merged_filters["age_range"] or "").lower()
        if ca == want_age:
            score *= 1 + WEIGHTS["filter_age_range"]  # Full boost for exact match
        elif ca == "any" or ca in [
            a for a in _expand_age_range(want_age) if a != want_age and a != "any"
        ]:
            score *= (
                1 + WEIGHTS["filter_age_range"] * 0.5
            )  # Half boost for adjacent/any

    if merged_filters.get("max_duration") and mono.estimated_duration_seconds:
        try:
            max_sec = int(merged_filters["max_duration"])
            if mono.estimated_duration_seconds <= max_sec:
                score *= 1 + WEIGHTS["filter_duration"]
        except (TypeError, ValueError):
            pass

    if merged_filters.get("min_duration") and mono.estimated_duration_seconds:
        try:
            min_sec = int(merged_filters["min_duration"])
            if mono.estimated_duration_seconds >= min_sec:
                score *= 1 + WEIGHTS["filter_duration"]
        except (TypeError, ValueError):
            pass

    want_themes = merged_filters.get("themes") or (
        [merged_filters["theme"]] if merged_filters.get("theme") else None
    )
    if want_themes and mono.themes:
        mono_themes_lower = [str(t).lower() for t in (mono.themes or []) if t]
        for wt in want_themes if isinstance(want_themes, list) else [want_themes]:
            if wt and str(wt).lower() in mono_themes_lower:
                score *= 1 + WEIGHTS["filter_theme"]
                break

    # 2. Profile matches
    if actor_profile and actor_profile.get("profile_bias_enabled", True):
        ap_gender = (actor_profile.get("gender") or "").strip().lower()
        if ap_gender:
            cg = (mono.character_gender or "").lower()
            if cg == ap_gender or cg == "any":
                score *= 1 + WEIGHTS["profile_gender"]

        ap_age = (actor_profile.get("age_range") or "").strip().lower()
        if ap_age:
            ca = (mono.character_age_range or "").lower()
            if ca == ap_age or ca == "any":
                score *= 1 + WEIGHTS["profile_age"]

    # 3. Bookmark boost
    if is_bookmarked:
        score *= 1 + WEIGHTS["bookmark"]

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
    pattern = r"\b" + re.escape(query).replace(r"\ ", r"\s+") + r"\b"
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
        self.last_content_gap: Optional[Dict] = None
        self._ai_is_valid_search: Optional[bool] = None
        self._ai_corrected_query: Optional[str] = None

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
        self._debug_timing: Dict[str, Any] = {"start": overall_start}

        # Normalize query for caching (conservative canonicalization)
        canonical_query = _canonicalize_query_for_cache(query)

        # Normalize explicit filters once
        explicit_filters = filters or {}

        # Tiered, cost-aware query optimization:
        # - Tier 1/2: keyword-only extraction (no AI parsing)
        # - Tier 3: allow AI parsing (with Redis + in-memory caching)
        tier, optimized_filters = self.query_optimizer.optimize(query, explicit_filters)
        logger.debug("Query tier: %s, optimized filters: %s", tier, optimized_filters)
        self._debug_timing["tier"] = tier
        self._debug_timing["optimize_ms"] = round((time.time() - overall_start) * 1000)

        extracted_filters: Dict = {}

        # --- Start embedding generation early (parallel with AI parsing) ---
        # For cold-cache Tier 3 queries, this saves ~1-2s by running the
        # embedding API call concurrently with the AI query parsing call.
        embedding_model = "text-embedding-3-large"
        embedding_dims = 1536  # Max 2000 for pgvector HNSW indexing
        _emb_cache_suffix = f"_{embedding_model}_{embedding_dims}"
        _emb_hash = hashlib.md5(
            (canonical_query + _emb_cache_suffix).encode()
        ).hexdigest()
        _precomputed_embedding: Optional[List[float]] = None
        _embedding_future: Optional[concurrent.futures.Future] = None
        _emb_start: Optional[float] = None

        if _emb_hash in EMBEDDING_CACHE:
            _precomputed_embedding = EMBEDDING_CACHE[_emb_hash]
            EMBEDDING_CACHE.move_to_end(_emb_hash)
            logger.debug("Embedding pre-check: in-memory cache hit for: %s", query)
            self._debug_timing["embedding_source"] = "memory_cache"
        else:
            _emb_cache_query = canonical_query + _emb_cache_suffix
            _cached_emb = self.cache.get_embedding(_emb_cache_query)
            if _cached_emb:
                _precomputed_embedding = _cached_emb
                EMBEDDING_CACHE[_emb_hash] = _precomputed_embedding
                EMBEDDING_CACHE.move_to_end(_emb_hash)
                _evict_if_needed(EMBEDDING_CACHE, _MAX_EMBEDDING_CACHE)
                logger.debug("Embedding pre-check: Redis cache hit for: %s", query)
                self._debug_timing["embedding_source"] = "redis_cache"
            else:
                # No cache hit — start embedding generation in background thread
                # so it runs in parallel with AI query parsing (Tier 3) or
                # filter merging + result cache check (Tier 1/2).
                from app.services.ai.langchain.embeddings import (
                    generate_embedding as _gen_emb,
                )

                logger.debug(
                    "Embedding pre-check: cache miss, starting background generation"
                )
                self._debug_timing["embedding_source"] = "generated"
                _emb_start = time.time()
                # Use 2 workers to allow parallel embedding + AI parsing
                _emb_executor = concurrent.futures.ThreadPoolExecutor(max_workers=2)
                _embedding_future = _emb_executor.submit(
                    _gen_emb,
                    text=query,
                    model=embedding_model,
                    dimensions=embedding_dims,
                    api_key=self.analyzer.api_key,
                )

        if explicit_filters:
            # If the user provided explicit filters, skip AI parsing entirely to save cost.
            logger.debug("Using explicit filters, skipping AI query parsing")
        else:
            if tier in (1, 2):
                # For simple/medium queries, rely on keyword extraction only (no AI).
                logger.debug(
                    "Tier 1/2 query with no explicit filters - skipping AI query parsing"
                )
            else:
                # Tier 3: complex semantic query – use AI parsing with multi-level caching.
                query_hash = hashlib.md5(canonical_query.encode()).hexdigest()

                # Level 0: in-memory cache (shared across all SemanticSearch instances)
                if query_hash in QUERY_PARSE_CACHE:
                    logger.debug("Using in-memory cached query parse for: %s", query)
                    extracted_filters = QUERY_PARSE_CACHE[query_hash]
                    self._debug_timing["ai_parse_source"] = "memory_cache"
                    self._debug_timing["ai_parse_ms"] = 0
                    QUERY_PARSE_CACHE.move_to_end(
                        query_hash
                    )  # Mark as recently used (LRU)
                else:
                    # Level 1: Redis cache via CacheManager
                    cached_filters = self.cache.get_parsed_filters(canonical_query)
                    if cached_filters:
                        logger.debug("Using Redis cached query parse for: %s", query)
                        extracted_filters = cached_filters
                        self._debug_timing["ai_parse_source"] = "redis_cache"
                        self._debug_timing["ai_parse_ms"] = 0
                        QUERY_PARSE_CACHE[query_hash] = extracted_filters
                    else:
                        parse_start = time.time()
                        logger.debug("Parsing query for filters (AI): %s", query)
                        extracted_filters = self.analyzer.parse_search_query(query)
                        parse_time = time.time() - parse_start
                        logger.debug("Query parsing took %.2fs", parse_time)
                        self._debug_timing["ai_parse_ms"] = round(parse_time * 1000)
                        self._debug_timing["ai_parse_source"] = "api"
                        # Store in both in-memory and Redis caches
                        QUERY_PARSE_CACHE[query_hash] = extracted_filters
                        QUERY_PARSE_CACHE.move_to_end(
                            query_hash
                        )  # Mark as recently used
                        self.cache.set_parsed_filters(
                            canonical_query, extracted_filters
                        )

                        _evict_if_needed(QUERY_PARSE_CACHE, _MAX_QUERY_PARSE_CACHE)

        # Extract AI validation fields before merging
        if extracted_filters:
            ai_valid = extracted_filters.pop("is_valid_search", None)
            ai_corrected = extracted_filters.pop("corrected_query", None)
            if ai_valid is not None:
                self._ai_is_valid_search = ai_valid
            if ai_corrected:
                self._ai_corrected_query = ai_corrected

        logger.debug("Extracted filters (AI): %s", extracted_filters)

        # Normalize gender values from AI (it may return "woman"/"man" instead of "female"/"male")
        _GENDER_NORMALIZE = {
            "woman": "female",
            "women": "female",
            "girl": "female",
            "lady": "female",
            "feminine": "female",
            "she": "female",
            "her": "female",
            "man": "male",
            "men": "male",
            "boy": "male",
            "gentleman": "male",
            "masculine": "male",
            "he": "male",
            "him": "male",
        }
        for filters_dict in [extracted_filters, optimized_filters, explicit_filters]:
            if filters_dict and filters_dict.get("gender"):
                g = filters_dict["gender"].lower().strip()
                filters_dict["gender"] = _GENDER_NORMALIZE.get(g, g)

        # Safety net: regex-based gender detection from query text (in case AI missed it)
        _query_lower = query.lower()
        _has_gender_in_any = any(
            d and d.get("gender")
            for d in [extracted_filters, optimized_filters, explicit_filters]
        )
        if not _has_gender_in_any:
            import re as _re

            if _re.search(
                r"\b(female|woman|women|girl|lady|for her|for a woman)\b", _query_lower
            ):
                if extracted_filters is None:
                    extracted_filters = {}
                extracted_filters["gender"] = "female"
                logger.debug("Safety net: detected gender=female from query text")
            elif _re.search(
                r"\b(male|man|men|boy|for him|for a man|gentleman)\b", _query_lower
            ):
                if extracted_filters is None:
                    extracted_filters = {}
                extracted_filters["gender"] = "male"
                logger.debug("Safety net: detected gender=male from query text")

        # Merge filters in precedence order:
        # AI-parsed < keyword-derived (optimized) < explicit filters
        merged_filters = {
            **(extracted_filters or {}),
            **(optimized_filters or {}),
            **(explicit_filters or {}),
        }
        logger.debug("Merged filters (final): %s", merged_filters)
        self._debug_timing["filters_merged"] = dict(merged_filters)
        self._debug_timing["filters_ms"] = round((time.time() - overall_start) * 1000)

        # IMPORTANT: Separate hard SQL filters from boost-only filters.
        # Filters derived from natural language (keyword extraction / AI parsing) for
        # subjective attributes like tone, age_range, theme should only BOOST
        # results, not eliminate them via SQL WHERE clauses. Only explicit UI-selected
        # filters should be hard constraints for these attributes.
        # Exceptions: emotion and gender are ALWAYS hard filters —
        # "funny monologue" must return joy, "for a woman" must return female/any.
        # These are unambiguous user intent. Age, tone, themes stay as boosts
        # since they're fuzzier (embedding handles the nuance).
        BOOST_ONLY_KEYS = {
            "tone",
            "age_range",
            "theme",
            "themes",
            "intended_play",
            "intended_author",
        }
        hard_filters = {}
        for k, v in merged_filters.items():
            if k in BOOST_ONLY_KEYS:
                # Only use as hard SQL filter if it came from explicit UI filters
                if k in (explicit_filters or {}):
                    hard_filters[k] = v
            else:
                hard_filters[k] = v
        logger.debug("Hard filters (SQL WHERE): %s", hard_filters)
        logger.debug(
            "Boost-only filters (scoring): %s",
            {k: v for k, v in merged_filters.items() if k not in hard_filters},
        )

        # Store intended play/author for content gap detection by the caller
        self._intended_play = merged_filters.get("intended_play")
        self._intended_author = merged_filters.get("intended_author")

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
            cached = self.cache.get_search_results(
                canonical_query, cache_filters_for_results
            )
        else:
            # Level 0: in-memory result cache shared within this process
            cached = SEARCH_RESULTS_CACHE.get(results_cache_key)

        if cached:
            logger.debug(
                "Using cached search results for query=%r filters=%s",
                query,
                cache_filters_for_results,
            )
            # Cache format: list of [id, score] so we preserve confidence scores for UI
            if cached and isinstance(cached[0], (list, tuple)):
                cached_ids = [item[0] for item in cached]
                cached_scores = {item[0]: float(item[1]) for item in cached}
            else:
                # Legacy: list of ids only
                cached_ids = list(cached)
                cached_scores = {}
            mons = (
                self.db.query(Monologue)
                .join(Play)
                .filter(Monologue.id.in_(cached_ids))
                .all()
            )
            mon_by_id: Dict[Any, Monologue] = {m.id: m for m in mons}
            ordered_with_scores: List[tuple[Monologue, float]] = [
                (mon_by_id[mid], cached_scores.get(mid, 0.0))
                for mid in cached_ids
                if mid in mon_by_id
            ]
            overall_time = time.time() - overall_start
            logger.debug(
                "Total search time (cache hit): %.2fs, results: %s",
                overall_time,
                len(ordered_with_scores),
            )
            self._debug_timing["total_ms"] = round(overall_time * 1000)
            self._debug_timing["result_count"] = len(ordered_with_scores)
            self._debug_timing["results_source"] = "cache"
            # Restore quote_match_type from cache if stored (payload item length >= 3)
            quote_types: Dict[int, str] = {}
            if cached and isinstance(cached[0], (list, tuple)) and len(cached[0]) >= 3:
                quote_types = {
                    item[0]: item[2] for item in cached if len(item) >= 3 and item[2]
                }
            return (ordered_with_scores[:limit], quote_types)

        # Retrieve embedding from early parallel fetch or cache (started before AI parsing)
        query_embedding: Optional[List[float]] = None
        if _precomputed_embedding is not None:
            query_embedding = _precomputed_embedding
            logger.debug("Using pre-checked cached embedding for: %s", query)
        elif _embedding_future is not None:
            # Wait for the background embedding generation to complete
            try:
                query_embedding = _embedding_future.result()
            except Exception as e:
                logger.warning("Background embedding generation failed: %s", e)
                query_embedding = None
            if _emb_start is not None:
                _emb_elapsed = time.time() - _emb_start
                logger.debug("Embedding generation (parallel) took %.2fs", _emb_elapsed)
                self._debug_timing["embedding_ms"] = round(_emb_elapsed * 1000)
            if query_embedding:
                # Store in in-memory and Redis caches
                _emb_cache_query_store = canonical_query + _emb_cache_suffix
                EMBEDDING_CACHE[_emb_hash] = query_embedding
                EMBEDDING_CACHE.move_to_end(_emb_hash)
                self.cache.set_embedding(_emb_cache_query_store, query_embedding)
                _evict_if_needed(EMBEDDING_CACHE, _MAX_EMBEDDING_CACHE)
        else:
            # Fallback: generate embedding synchronously (shouldn't normally reach here)
            logger.debug("Generating embedding synchronously (fallback): %s", query)
            from app.services.ai.langchain.embeddings import generate_embedding

            _emb_start_sync = time.time()
            query_embedding = generate_embedding(
                text=query,
                model=embedding_model,
                dimensions=embedding_dims,
                api_key=self.analyzer.api_key,
            )
            logger.debug(
                "Embedding generation (sync fallback) took %.2fs",
                time.time() - _emb_start_sync,
            )
            if query_embedding:
                _emb_cache_query_store = canonical_query + _emb_cache_suffix
                EMBEDDING_CACHE[_emb_hash] = query_embedding
                EMBEDDING_CACHE.move_to_end(_emb_hash)
                self.cache.set_embedding(_emb_cache_query_store, query_embedding)
                _evict_if_needed(EMBEDDING_CACHE, _MAX_EMBEDDING_CACHE)

        if not query_embedding:
            logger.info("Failed to generate embedding, falling back to text search")
            fallback = self._fallback_text_search(
                query, limit, hard_filters, explicit_filters
            )
            return ([(m, 0.0) for m in fallback], {})

        # Hybrid search: run text search for direct play/character/title matches and merge on top.
        # Many monologues (e.g. from Gutenberg) have no embeddings, so "hamlet" would otherwise
        # return only semantic results from other plays and never show Hamlet.
        text_match_results = self._fallback_text_search(
            query, limit=limit, filters=hard_filters, explicit_filters=explicit_filters
        )

        # Build base query (eager-load Play to avoid N+1 during scoring/response)
        base_query = (
            self.db.query(Monologue).join(Play).options(joinedload(Monologue.play))
        )

        # Apply ONLY hard filters as SQL WHERE clauses.
        # Soft filters (emotion, tone, age_range, theme from NL query) are applied
        # as score boosts in _calculate_relevance_score_multiplicative instead.
        if hard_filters:
            if hard_filters.get("gender"):
                base_query = base_query.filter(
                    Monologue.character_gender == hard_filters["gender"]
                )

            if hard_filters.get("age_range"):
                expanded_ages = _expand_age_range(hard_filters["age_range"])
                base_query = base_query.filter(
                    Monologue.character_age_range.in_(expanded_ages)
                )

            if hard_filters.get("emotion"):
                base_query = base_query.filter(
                    Monologue.primary_emotion == hard_filters["emotion"]
                )

            if hard_filters.get("theme"):
                theme = hard_filters["theme"]
                base_query = base_query.filter(
                    text(
                        "monologues.themes @> ARRAY[:theme_val]::character varying[]"
                    ).bindparams(theme_val=theme)
                )

            if hard_filters.get("themes"):
                themes = hard_filters["themes"]
                if isinstance(themes, list) and len(themes) > 0:
                    theme_conditions = [
                        text(
                            "monologues.themes @> ARRAY[:theme_val]::character varying[]"
                        ).bindparams(theme_val=theme)
                        for theme in themes
                    ]
                    base_query = base_query.filter(or_(*theme_conditions))

            if hard_filters.get("tone"):
                base_query = base_query.filter(Monologue.tone == hard_filters["tone"])

            if hard_filters.get("difficulty"):
                base_query = base_query.filter(
                    Monologue.difficulty_level == hard_filters["difficulty"]
                )

            if hard_filters.get("category"):
                category = hard_filters["category"]
                if isinstance(category, list):
                    category_conditions = [
                        Play.category.ilike(f"%{cat}%") for cat in category
                    ]
                    base_query = base_query.filter(or_(*category_conditions))
                else:
                    base_query = base_query.filter(Play.category.ilike(f"%{category}%"))

            if hard_filters.get("author"):
                base_query = base_query.filter(
                    Play.author.ilike(f"%{hard_filters['author']}%")
                )

            if hard_filters.get("exclude_author"):
                base_query = base_query.filter(
                    ~Play.author.ilike(f"%{hard_filters['exclude_author']}%")
                )

            if hard_filters.get("character_name"):
                base_query = base_query.filter(
                    Monologue.character_name.ilike(
                        f"%{hard_filters['character_name']}%"
                    )
                )

            if hard_filters.get("max_duration"):
                base_query = base_query.filter(
                    Monologue.estimated_duration_seconds <= hard_filters["max_duration"]
                )

            if hard_filters.get("min_duration"):
                base_query = base_query.filter(
                    Monologue.estimated_duration_seconds >= hard_filters["min_duration"]
                )

            if hard_filters.get("act"):
                base_query = base_query.filter(Monologue.act == hard_filters["act"])

            if hard_filters.get("scene"):
                base_query = base_query.filter(Monologue.scene == hard_filters["scene"])

            if hard_filters.get("max_overdone_score") is not None:
                threshold = float(hard_filters["max_overdone_score"])
                base_query = base_query.filter(
                    or_(
                        Monologue.overdone_score.is_(None),
                        Monologue.overdone_score <= threshold,
                    )
                )

            if hard_filters.get("source_type"):
                st = hard_filters["source_type"]
                if isinstance(st, list):
                    base_query = base_query.filter(Play.source_type.in_(st))
                else:
                    base_query = base_query.filter(Play.source_type == st)

        # Get user's bookmarked monologues if user_id provided
        # NOTE: Fetches all bookmarks because boost is applied during scoring
        # Capped at 1000 most recent to avoid pathological cases
        bookmarked_ids = set()
        if user_id:
            from app.models.actor import MonologueFavorite

            favorites = (
                self.db.query(MonologueFavorite.monologue_id)
                .filter(MonologueFavorite.user_id == user_id)
                .order_by(MonologueFavorite.created_at.desc())
                .limit(1000)
                .all()
            )
            bookmarked_ids = {f[0] for f in favorites}

        # OPTIMIZATION: Prefer DB-side vector search via pgvector when available.
        # We first try to use the `embedding_vector` pgvector column, and only
        # fall back to legacy JSON embeddings + Python cosine similarity when
        # pgvector is not available or no vectors exist yet.
        MAX_CANDIDATES = 75  # Upper bound for candidate pool size

        results_with_scores: List[tuple[Monologue, float]] = []

        try:
            # Primary path: pgvector-based similarity search in the database.
            # Order by cosine distance and take a modest multiple of `limit`
            # so we can still apply bookmark boosts and hybrid merging.
            # OPTIMIZED: Reduced from 3x to 1.5x since HNSW indexes are now in place
            VECTOR_CANDIDATES = min(MAX_CANDIDATES, max(int(limit * 1.5), limit))

            # OPTIMIZATION: Set ef_search for faster HNSW queries (default is 40).
            # Lower = faster but less accurate, higher = slower but more accurate.
            # 40 is a good balance for our corpus size (~7.5k monologues).
            try:
                self.db.execute(text("SET hnsw.ef_search = 40"))
            except Exception:
                pass  # Non-fatal if this fails (e.g., old pgvector version)

            semantic_candidates = (
                base_query.filter(Monologue.embedding_vector.isnot(None))
                .order_by(Monologue.embedding_vector.cosine_distance(query_embedding))
                .limit(VECTOR_CANDIDATES)
                .all()
            )

            logger.debug(
                "Loaded %s monologues with pgvector embeddings (max: %s)",
                len(semantic_candidates),
                VECTOR_CANDIDATES,
            )

            # pgvector already returned candidates sorted best-first by cosine distance.
            # Recomputing cosine similarity in Python is redundant; derive a score
            # from rank position instead (rank 0 = best match → 1.0, decreasing).
            total = len(semantic_candidates)
            for rank, mono in enumerate(semantic_candidates):
                similarity = max(0.0, 1.0 - (rank / max(total, 1)) * 0.4)
                results_with_scores.append((mono, similarity))

            logger.debug("pgvector returned %s candidates (rank-based scoring)", total)

        except Exception as e:
            # If pgvector is unavailable or misconfigured, fall back to legacy
            # JSON-based embeddings to keep search functional.
            logger.warning("pgvector search failed, falling back to text search: %s", e)
            try:
                self.db.rollback()
            except Exception:
                pass
            fallback_monologues = self._fallback_text_search(
                query, limit, hard_filters, explicit_filters
            )
            return ([(m, 0.0) for m in fallback_monologues], {})

        # IMPROVED: Apply all boosts using multiplicative scoring (prevents saturation)
        results_with_scores = [
            (
                mono,
                _calculate_relevance_score_multiplicative(
                    score,
                    mono,
                    merged_filters,
                    actor_profile,
                    mono.id in bookmarked_ids,
                ),
            )
            for mono, score in results_with_scores
        ]

        # Sort by similarity (descending) and limit
        results_with_scores.sort(key=lambda x: x[1], reverse=True)
        top_semantic = [(mono, score) for mono, score in results_with_scores[:limit]]

        # Match types for frontend badges (exact quote, title match, character match, play match)
        query_lower = query.strip().lower()
        query_stripped = _strip_punctuation(query)
        quote_match_type_by_id: Dict[int, str] = {}

        # Merge hybrid: combine text and semantic matches, sort by best score
        if text_match_results:
            existing_ids = {m.id for m in text_match_results}
            semantic_only = [
                (mono, score)
                for mono, score in top_semantic
                if mono.id not in existing_ids
            ]
            semantic_scores_by_id = {mono.id: score for mono, score in top_semantic}
            combined_with_scores: list[tuple[Monologue, float]] = []

            # Score text matches (use max of semantic and keyword scores)
            for m in text_match_results:
                kw_score, kw_type = _keyword_match_score_and_type(m, query)
                # Use best of semantic score or keyword score so title/character/play matches rank at top
                score = max(
                    semantic_scores_by_id.get(m.id, 0.0),
                    kw_score if kw_score > 0 else 0.0,
                )
                if kw_type:
                    quote_match_type_by_id[m.id] = kw_type
                combined_with_scores.append((m, score))

            # Add semantic-only matches
            combined_with_scores.extend(semantic_only)

            # Sort by score descending and take top limit
            combined_with_scores.sort(key=lambda x: x[1], reverse=True)
            top_results = combined_with_scores[:limit]

            logger.debug(
                "Hybrid: %s text + %s semantic = %s combined, top %s after sorting",
                len(text_match_results),
                len(semantic_only),
                len(combined_with_scores),
                len(top_results),
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
                    len(exact_matches),
                    EXACT_QUOTE_MATCH_SCORE,
                    len(fuzzy_matches),
                    FUZZY_QUOTE_MATCH_SCORE,
                )

        # Tag ALL results with keyword match type (title/character/play) if applicable.
        # The initial merge only tags text_match_results; semantic-only results from the
        # same play/character miss the badge. This ensures e.g. ALL Hamlet monologues get
        # "play_match" type and a score boost, not just the ones from keyword search.
        boosted_results: list[tuple[Monologue, float]] = []
        for m, s in top_results:
            if m.id not in quote_match_type_by_id:
                kw_score, kw_type = _keyword_match_score_and_type(m, query)
                if kw_type:
                    quote_match_type_by_id[m.id] = kw_type
                    s = max(s, kw_score)
            boosted_results.append((m, s))
        top_results = boosted_results

        # No real match: if best score is below threshold (e.g. unrelated language / gibberish), return empty
        no_semantic_match = False
        if top_results:
            best_score = max(s for _, s in top_results)
            if best_score < MIN_RELEVANCE_TO_SHOW:
                logger.debug(
                    "Best relevance %.3f below threshold %.2f; returning no results",
                    best_score,
                    MIN_RELEVANCE_TO_SHOW,
                )
                return ([], {})
            top_results = [(m, s) for m, s in top_results if s >= MIN_RELEVANCE_TO_SHOW]
        else:
            no_semantic_match = True

        # FALLBACK: Only supplement with text search if semantic returned zero results.
        # The hybrid merge at line 766 already handles title/author/character matches.
        # Running a second ILIKE scan for partial results just adds latency for score=0.0 filler.
        if len(top_results) == 0 and not no_semantic_match:
            needed = limit - len(top_results)
            logger.debug(
                "Only %s semantic results, supplementing with %s text search",
                len(top_results),
                needed,
            )

            # Get IDs we already have to avoid duplicates
            existing_ids = {mono.id for mono, _ in top_results}

            # Fallback to text search
            fallback_start = time.time()
            fallback_results = self._fallback_text_search(
                query, needed * 2, hard_filters, explicit_filters
            )  # Get extra for filtering
            fallback_time = time.time() - fallback_start
            logger.debug("Fallback text search took %.2fs", fallback_time)

            # Add fallback results that aren't already in semantic results
            fallback_unique = [m for m in fallback_results if m.id not in existing_ids][
                :needed
            ]

            # Combine results: semantic results first (with scores), then fallback (with 0.0 score)
            final_results_with_scores = list(top_results) + [
                (m, 0.0) for m in fallback_unique
            ]
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
                _evict_if_needed(SEARCH_RESULTS_CACHE, _MAX_SEARCH_RESULTS_CACHE)

            overall_time = time.time() - overall_start
            logger.debug(
                "Total search time: %.2fs, final results: %s",
                overall_time,
                len(final_results),
            )
            self._debug_timing["total_ms"] = round(overall_time * 1000)
            self._debug_timing["result_count"] = len(final_results)
            self._debug_timing["results_source"] = "text_fallback"

            return (final_results_with_scores[:limit], quote_match_type_by_id)

        overall_time = time.time() - overall_start
        self._debug_timing["total_ms"] = round(overall_time * 1000)
        self._debug_timing["result_count"] = len(top_results)
        self._debug_timing["candidates"] = len(results_with_scores)
        self._debug_timing["results_source"] = "semantic"

        if logger.isEnabledFor(logging.DEBUG):
            from collections import Counter

            author_dist = Counter(mono.play.author for mono, _ in results_with_scores)
            logger.debug(
                "Search complete: query=%r, time=%.2fs, candidates=%s, top=%s; author dist: %s",
                query,
                overall_time,
                len(results_with_scores),
                len(top_results),
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
            _evict_if_needed(SEARCH_RESULTS_CACHE, _MAX_SEARCH_RESULTS_CACHE)

        return (list(top_results), quote_match_type_by_id)

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
        # Gender is always a hard filter — "for women" is unambiguous intent
        apply_gender_filter = filters and filters.get("gender")

        base_query = self.db.query(Monologue).join(Play)

        # Apply filters (same as semantic search)
        if filters:
            if apply_gender_filter:
                base_query = base_query.filter(
                    Monologue.character_gender == filters["gender"]
                )

            if filters.get("tone"):
                base_query = base_query.filter(Monologue.tone == filters["tone"])

            if filters.get("age_ranges"):
                base_query = base_query.filter(
                    Monologue.character_age_range.in_(filters["age_ranges"])
                )
            elif filters.get("age_range"):
                expanded_ages = _expand_age_range(filters["age_range"])
                base_query = base_query.filter(
                    Monologue.character_age_range.in_(expanded_ages)
                )

            if filters.get("emotion"):
                base_query = base_query.filter(
                    Monologue.primary_emotion == filters["emotion"]
                )

            if filters.get("theme"):
                # Check if theme is in the themes array using PostgreSQL array contains operator
                theme = filters["theme"]
                # Use PostgreSQL @> operator with proper type casting
                # Cast array to character varying[] to match column type
                base_query = base_query.filter(
                    text(
                        "monologues.themes @> ARRAY[:theme_val]::character varying[]"
                    ).bindparams(theme_val=theme)
                )

            if filters.get("difficulty"):
                base_query = base_query.filter(
                    Monologue.difficulty_level == filters["difficulty"]
                )

            if filters.get("category"):
                category = filters["category"]
                # Handle both string and list formats
                if isinstance(category, list):
                    # If it's a list, use ILIKE with OR conditions
                    category_conditions = [
                        Play.category.ilike(f"%{cat}%") for cat in category
                    ]
                    base_query = base_query.filter(or_(*category_conditions))
                else:
                    # If it's a string, use ILIKE for partial match
                    base_query = base_query.filter(Play.category.ilike(f"%{category}%"))

            if filters.get("author"):
                base_query = base_query.filter(
                    Play.author.ilike(f"%{filters['author']}%")
                )

            # Exclude author filter (e.g., "not Shakespeare")
            if filters.get("exclude_author"):
                base_query = base_query.filter(
                    ~Play.author.ilike(f"%{filters['exclude_author']}%")
                )

            # Duration filter
            if filters.get("max_duration"):
                base_query = base_query.filter(
                    Monologue.estimated_duration_seconds <= filters["max_duration"]
                )

            if filters.get("min_duration"):
                base_query = base_query.filter(
                    Monologue.estimated_duration_seconds >= filters["min_duration"]
                )

            # Act/scene filters for classical plays
            if filters.get("act"):
                base_query = base_query.filter(Monologue.act == filters["act"])

            if filters.get("scene"):
                base_query = base_query.filter(Monologue.scene == filters["scene"])

            if filters.get("max_overdone_score") is not None:
                threshold = float(filters["max_overdone_score"])
                base_query = base_query.filter(
                    or_(
                        Monologue.overdone_score.is_(None),
                        Monologue.overdone_score <= threshold,
                    )
                )

            if filters.get("source_type"):
                st = filters["source_type"]
                if isinstance(st, list):
                    base_query = base_query.filter(Play.source_type.in_(st))
                else:
                    base_query = base_query.filter(Play.source_type == st)

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
                token
                for token in query_words
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

        # Priority 2: Title match: when user searches by monologue title (e.g. "sadf"), put exact/contains match first
        ordering_clauses.append(Monologue.title.ilike(f"%{normalized_query}%").desc())

        # Priority 3: Opening line matches query pattern
        # Check if the normalized start of text contains most words from query
        # Uses word boundaries to avoid matching common word fragments
        query_words_for_match = [
            w for w in re.findall(r"\w+", normalized_for_punctuation.lower())
        ]
        if len(query_words_for_match) >= 3:
            # Check if words appear as whole words in first 50 chars using regex word boundaries
            # More words matched = higher priority
            word_boundary_clauses = " + ".join(
                [
                    f"CASE WHEN regexp_replace(lower(substring(monologues.text, 1, 50)), '[^a-z ]', '', 'g') ~ '\\y{word}\\y' THEN 1 ELSE 0 END"
                    for word in query_words_for_match
                ]
            )
            ordering_clauses.append(text(f"({word_boundary_clauses}) DESC"))

        # Priority 4: Exact match with punctuation (text, play title, character)
        ordering_clauses.extend(
            [
                Monologue.text.ilike(f"%{normalized_query}%").desc(),
                Play.title.ilike(f"%{normalized_query}%").desc(),
                Monologue.character_name.ilike(f"%{normalized_query}%").desc(),
            ]
        )

        # Final: alphabetical
        ordering_clauses.extend([Play.title, Monologue.character_name])

        base_query = base_query.order_by(*ordering_clauses).limit(limit)

        return base_query.all()

    def get_random_monologues(
        self, limit: int = 10, filters: Optional[Dict] = None
    ) -> List[Monologue]:
        """Get random monologues (for "Discover" feature).

        Uses ORDER BY RANDOM() LIMIT directly in the DB — single query, no
        Python-side ID fetch. For ~10k rows this is significantly faster than
        fetching all IDs to Python and doing a second IN query.
        """

        query = self.db.query(Monologue).join(Play)

        # Apply filters — same set as semantic search so UI toggles work in browse mode
        if filters:
            if filters.get("gender"):
                query = query.filter(Monologue.character_gender == filters["gender"])

            if filters.get("age_range"):
                expanded_ages = _expand_age_range(filters["age_range"])
                query = query.filter(Monologue.character_age_range.in_(expanded_ages))

            if filters.get("emotion"):
                query = query.filter(Monologue.primary_emotion == filters["emotion"])

            if filters.get("theme"):
                theme = filters["theme"]
                query = query.filter(
                    text(
                        "monologues.themes @> ARRAY[:theme_val]::character varying[]"
                    ).bindparams(theme_val=theme)
                )

            if filters.get("category"):
                category = filters["category"]
                if isinstance(category, list):
                    category_conditions = [
                        Play.category.ilike(f"%{cat}%") for cat in category
                    ]
                    query = query.filter(or_(*category_conditions))
                else:
                    query = query.filter(Play.category.ilike(f"%{category}%"))

            if filters.get("difficulty"):
                query = query.filter(
                    Monologue.difficulty_level == filters["difficulty"]
                )

            if filters.get("author"):
                query = query.filter(Play.author.ilike(f"%{filters['author']}%"))

            if filters.get("tone"):
                query = query.filter(Monologue.tone == filters["tone"])

            if filters.get("max_duration"):
                query = query.filter(
                    Monologue.estimated_duration_seconds <= filters["max_duration"]
                )

            if filters.get("min_duration"):
                query = query.filter(
                    Monologue.estimated_duration_seconds >= filters["min_duration"]
                )

            if filters.get("act"):
                query = query.filter(Monologue.act == filters["act"])

            if filters.get("scene"):
                query = query.filter(Monologue.scene == filters["scene"])

            if filters.get("max_overdone_score") is not None:
                threshold = float(filters["max_overdone_score"])
                query = query.filter(
                    or_(
                        Monologue.overdone_score.is_(None),
                        Monologue.overdone_score <= threshold,
                    )
                )

            if filters.get("source_type"):
                st = filters["source_type"]
                if isinstance(st, list):
                    query = query.filter(Play.source_type.in_(st))
                else:
                    query = query.filter(Play.source_type == st)

        return query.order_by(func.random()).limit(limit).all()
