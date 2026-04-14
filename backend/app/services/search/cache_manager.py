"""Multi-level caching for search optimization."""

import hashlib
import json
import logging
import time
from datetime import datetime
from functools import lru_cache
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class CacheManager:
    """
    Multi-level caching for monologue search.

    Level 1: In-memory LRU cache (@lru_cache decorators)
    Level 2: Redis cache (if available)
    Level 3: Database cache (query_embeddings table)

    Cache Strategy:
    - Search results: 1 hour (frequent updates)
    - Embeddings: 7 days (stable)
    - Parsed filters: 24 hours (semi-stable)
    """

    def __init__(self):
        # Level 2: Redis cache (optional)
        # Supports both Upstash (REDIS_URL) and standard Redis (REDIS_HOST/PORT)
        self.redis_client = None
        self.redis_enabled = False

        try:
            import os
            import redis  # type: ignore[import-untyped]

            # Try Upstash Redis URL first (recommended for serverless)
            redis_url = os.getenv("REDIS_URL") or os.getenv("UPSTASH_REDIS_URL")

            if redis_url:
                # Upstash or any Redis URL (redis://... or rediss://...)
                # ssl_cert_reqs=None needed for macOS local dev (production has proper certs)
                self.redis_client = redis.Redis.from_url(
                    redis_url,
                    decode_responses=False,
                    socket_connect_timeout=2,
                    ssl_cert_reqs=None,
                )
            else:
                # Fallback to host/port config
                from app.core.config import settings
                self.redis_client = redis.Redis(
                    host=getattr(settings, "REDIS_HOST", "localhost"),
                    port=getattr(settings, "REDIS_PORT", 6379),
                    db=0,
                    decode_responses=False,
                    socket_connect_timeout=2,
                )

            # Test connection
            self.redis_client.ping()
            self.redis_enabled = True
            logger.info("Redis cache enabled for search")
        except Exception as e:
            logger.debug("Redis not available (using memory cache only): %s", e)
            self.redis_enabled = False

        # Metrics
        self.metrics = {
            "hits": {"memory": 0, "redis": 0, "db": 0},
            "misses": 0,
            "sets": 0,
        }

    def _generate_cache_key(
        self, prefix: str, query: str, filters: Optional[Dict] = None
    ) -> str:
        """
        Generate deterministic cache key.

        Args:
            prefix: Cache key prefix (e.g., 'search', 'embedding', 'filters')
            query: Search query
            filters: Additional filters

        Returns:
            Cache key string
        """
        cache_data = {
            "query": query.lower().strip(),
            "filters": sorted(filters.items()) if filters else [],
        }
        cache_str = json.dumps(cache_data, sort_keys=True)
        key_hash = hashlib.md5(cache_str.encode()).hexdigest()
        return f"{prefix}:{key_hash}"

    # ==================== Search Results Cache ====================

    def get_search_results(self, query: str, filters: Dict) -> Optional[List]:
        """
        Get cached search results.

        Returns:
            Cached results or None
        """
        if not self.redis_enabled:
            return None

        assert self.redis_client is not None
        cache_key = self._generate_cache_key("search", query, filters)

        try:
            cached = self.redis_client.get(cache_key)
            if cached:
                self.metrics["hits"]["redis"] += 1
                print(f"✓ Cache HIT (search): {query[:50]}")
                return json.loads(cached)

        except Exception as e:
            print(f"Cache get error: {e}")

        self.metrics["misses"] += 1
        return None

    def set_search_results(
        self,
        query: str,
        filters: Dict,
        results: List,
        ttl: int = 3600,  # 1 hour
    ):
        """
        Cache search results.

        Args:
            query: Search query
            filters: Search filters
            results: Search results (must be JSON serializable)
            ttl: Time to live in seconds (default: 1 hour)
        """
        if not self.redis_enabled:
            return

        assert self.redis_client is not None
        cache_key = self._generate_cache_key("search", query, filters)

        try:
            # Serialize results
            serialized = json.dumps(results)
            self.redis_client.setex(cache_key, ttl, serialized)
            self.metrics["sets"] += 1
            print(f"✓ Cache SET (search): {query[:50]}")

        except Exception as e:
            print(f"Cache set error: {e}")

    # ==================== Embedding Cache ====================

    def get_embedding(self, query: str) -> Optional[List[float]]:
        """
        Get cached embedding for query.

        Checks:
        1. Redis cache (fast)
        2. Database cache (slower but persistent)

        Returns:
            Embedding vector or None
        """
        cache_key = self._generate_cache_key("embedding", query)

        # Try Redis first
        if self.redis_enabled and self.redis_client is not None:
            try:
                cached = self.redis_client.get(cache_key)
                if cached:
                    self.metrics["hits"]["redis"] += 1
                    print(f"✓ Cache HIT (embedding): {query[:50]}")
                    return json.loads(cached)

            except Exception as e:
                print(f"Embedding cache get error: {e}")

        self.metrics["misses"] += 1
        return None

    def set_embedding(
        self,
        query: str,
        embedding: List[float],
        ttl: int = 604800,  # 7 days
    ):
        """
        Cache embedding with long TTL.

        Args:
            query: Search query
            embedding: Vector embedding
            ttl: Time to live (default: 7 days)
        """
        if not self.redis_enabled:
            return

        assert self.redis_client is not None
        cache_key = self._generate_cache_key("embedding", query)

        try:
            self.redis_client.setex(cache_key, ttl, json.dumps(embedding))
            self.metrics["sets"] += 1
            print(f"✓ Cache SET (embedding): {query[:50]}")

        except Exception as e:
            print(f"Embedding cache set error: {e}")

    # ==================== Parsed Filters Cache ====================

    def get_parsed_filters(self, query: str) -> Optional[Dict]:
        """
        Get cached AI-parsed filters.

        This saves expensive GPT-4o-mini calls for repeat queries.

        Returns:
            Parsed filters dict or None
        """
        if not self.redis_enabled:
            return None

        assert self.redis_client is not None
        cache_key = self._generate_cache_key("filters", query)

        try:
            cached = self.redis_client.get(cache_key)
            if cached:
                self.metrics["hits"]["redis"] += 1
                print(f"✓ Cache HIT (filters): {query[:50]}")
                return json.loads(cached)

        except Exception as e:
            print(f"Filters cache get error: {e}")

        self.metrics["misses"] += 1
        return None

    def set_parsed_filters(
        self,
        query: str,
        filters: Dict,
        ttl: int = 86400,  # 24 hours
    ):
        """
        Cache AI-parsed filters.

        Args:
            query: Search query
            filters: Parsed filters from AI
            ttl: Time to live (default: 24 hours)
        """
        if not self.redis_enabled:
            return

        assert self.redis_client is not None
        cache_key = self._generate_cache_key("filters", query)

        try:
            self.redis_client.setex(cache_key, ttl, json.dumps(filters))
            self.metrics["sets"] += 1
            print(f"✓ Cache SET (filters): {query[:50]}")

        except Exception as e:
            print(f"Filters cache set error: {e}")

    # ==================== Batch Operations ====================

    def get_batch(self, keys: List[str]) -> List[Optional[bytes]]:
        """
        Fetch multiple cache keys in a single Redis pipeline round-trip.

        Args:
            keys: List of raw Redis keys to fetch

        Returns:
            List of values (bytes or None) in the same order as keys
        """
        if not self.redis_enabled or not self.redis_client or not keys:
            return [None] * len(keys)

        try:
            pipe = self.redis_client.pipeline(transaction=False)
            for key in keys:
                pipe.get(key)
            return pipe.execute()
        except Exception as e:
            logger.debug("Redis pipeline get error: %s", e)
            return [None] * len(keys)

    # ==================== Cache Management ====================

    def clear_all(self):
        """Clear all caches (for testing/debugging)"""
        if self.redis_enabled and self.redis_client is not None:
            try:
                self.redis_client.flushdb()
                print("✓ All caches cleared")
            except Exception as e:
                print(f"Cache clear error: {e}")

    def clear_search_cache(self):
        """Clear only search result caches"""
        if self.redis_enabled and self.redis_client is not None:
            try:
                keys = self.redis_client.keys("search:*")
                if keys:
                    self.redis_client.delete(*keys)
                    print(f"✓ Cleared {len(keys)} search cache entries")
            except Exception as e:
                print(f"Cache clear error: {e}")

    def get_stats(self) -> Dict:
        """
        Get cache statistics.

        Returns:
            Dict with hit rates, sizes, etc.
        """
        total_requests = sum(self.metrics["hits"].values()) + self.metrics["misses"]
        hit_rate = (
            sum(self.metrics["hits"].values()) / total_requests
            if total_requests > 0
            else 0.0
        )

        stats = {
            "enabled": self.redis_enabled,
            "total_requests": total_requests,
            "hits": self.metrics["hits"],
            "misses": self.metrics["misses"],
            "sets": self.metrics["sets"],
            "hit_rate": round(hit_rate * 100, 2),
        }

        if self.redis_enabled and self.redis_client is not None:
            try:
                info = self.redis_client.info("memory")
                stats["redis_memory_mb"] = round(info["used_memory"] / 1024 / 1024, 2)
                stats["redis_keys"] = self.redis_client.dbsize()
            except Exception as e:
                print(f"Error getting Redis stats: {e}")

        return stats

    def warmup_common_queries(self, queries: List[str], embedding_generator):
        """
        Pre-warm cache with common queries.

        Args:
            queries: List of common search queries
            embedding_generator: Function that generates embeddings
        """
        if not self.redis_enabled:
            logger.debug("Redis not enabled, skipping warmup")
            return

        # Skip warmup if cache already has embeddings (fast check)
        try:
            existing_keys = self.redis_client.dbsize()
            if existing_keys >= len(queries):
                logger.info("Cache already warm (%d keys), skipping warmup", existing_keys)
                return
        except Exception:
            pass

        logger.info("Warming up cache with %d common queries...", len(queries))

        cached_count = 0
        generated_count = 0
        for query in queries:
            # Check if already cached (silent check)
            cache_key = self._generate_cache_key("embedding", query)
            try:
                if self.redis_client.exists(cache_key):
                    cached_count += 1
                    continue
            except Exception:
                pass

            # Generate and cache embedding
            try:
                embedding = embedding_generator(query)
                if embedding:
                    self.set_embedding(query, embedding, ttl=2592000)  # 30 days
                    generated_count += 1
                    time.sleep(0.1)  # Rate limit
            except Exception as e:
                logger.debug("Error caching %s: %s", query, e)

        logger.info("Cache warmup complete: %d cached, %d generated", cached_count, generated_count)


# Common queries to pre-warm (film/tv, emotions, demographics)
COMMON_WARMUP_QUERIES = [
    # ========== FILM/TV SEARCH QUERIES ==========
    # Basic source type
    "film monologue",
    "tv monologue",
    "movie monologue",
    "film monologues",
    "tv monologues",
    "movie monologues",
    "television monologue",
    "screenplay monologue",
    # Film/TV + emotion
    "sad film monologue",
    "sad movie monologue",
    "funny movie monologue",
    "funny film monologue",
    "dramatic tv monologue",
    "dramatic film monologue",
    "angry film monologue",
    "intense movie scene",
    "emotional film monologue",
    "powerful movie monologue",
    # Film/TV + gender
    "film monologue for woman",
    "film monologue for man",
    "tv monologue for woman",
    "tv monologue for man",
    "movie monologue female",
    "movie monologue male",
    "female film monologue",
    "male film monologue",
    "female movie scene",
    "male movie scene",
    # Film/TV + age
    "young woman film monologue",
    "young man movie monologue",
    "middle aged woman film",
    "middle aged man movie",
    # Film/TV specific titles (popular searches)
    "breaking bad monologue",
    "game of thrones monologue",
    "the office monologue",
    "godfather monologue",
    "pulp fiction monologue",
    "joker monologue",
    "taxi driver monologue",
    "network monologue",

    # ========== PLAYS SEARCH QUERIES ==========
    # Shakespeare (most common)
    "shakespeare monologue",
    "hamlet monologue",
    "macbeth monologue",
    "othello monologue",
    "romeo and juliet",
    "king lear monologue",
    "midsummer night dream",
    "twelfth night monologue",
    # Shakespeare + gender
    "shakespeare monologue female",
    "shakespeare monologue male",
    "shakespeare monologue woman",
    "shakespeare monologue man",
    # Other classical
    "chekhov monologue",
    "ibsen monologue",
    "greek tragedy monologue",
    "classical monologue",
    # Contemporary
    "contemporary monologue",
    "modern monologue",
    "contemporary play monologue",

    # ========== GENERAL MONOLOGUE QUERIES ==========
    # Common emotion queries
    "sad monologue",
    "funny monologue",
    "angry monologue",
    "dramatic monologue",
    "comedic monologue",
    "emotional monologue",
    "powerful monologue",
    "heartfelt monologue",
    # Common demographic queries
    "female monologue",
    "male monologue",
    "young woman monologue",
    "young man monologue",
    "teenage girl monologue",
    "teenage boy monologue",
    "middle aged woman monologue",
    "middle aged man monologue",
    # Theme queries
    "love monologue",
    "death monologue",
    "revenge monologue",
    "family monologue",
    "betrayal monologue",
    # Length queries
    "short monologue",
    "1 minute monologue",
    "2 minute monologue",
    # Audition specific
    "audition monologue",
    "audition piece",
    "dramatic audition piece",
    "comedic audition piece",
]


# Global cache instance
cache_manager = CacheManager()


# ==================== LRU Cache Decorators ====================


def lru_cached_search(maxsize=100):
    """
    Decorator for in-memory LRU cache of search results.

    This is Level 1 cache (fastest, but limited size).
    """

    def decorator(func):
        @lru_cache(maxsize=maxsize)
        def wrapper(query: str, filters_tuple):
            # Convert tuple back to dict
            filters = dict(filters_tuple) if filters_tuple else {}
            return func(query, filters)

        return wrapper

    return decorator


def cache_key_from_args(*args, **kwargs) -> str:
    """Generate cache key from function arguments"""
    cache_str = json.dumps(
        {"args": args, "kwargs": sorted(kwargs.items())}, sort_keys=True
    )
    return hashlib.md5(cache_str.encode()).hexdigest()
