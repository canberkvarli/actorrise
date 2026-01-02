# Monologue Search Optimization Plan

## Current State Analysis

### Cost Breakdown (Per Search)

**Current Implementation:**
- Query parsing (GPT-4o-mini): ~$0.00015 per call
- Embedding generation (text-embedding-3-small, 1536 dims): ~$0.00001 per call
- **Total per search: ~$0.00016**
- **1000 searches/day: ~$160/day = $4,800/month**

### API Calls Per Search
1. `parse_search_query()` - Always executes, even for simple queries
2. `generate_embedding()` - Always executes, no caching

### Problems Identified
1. ❌ No caching at any level
2. ❌ AI parsing for simple queries ("sad", "funny", "male")
3. ❌ Duplicate embeddings for common queries
4. ❌ No query classification
5. ❌ No keyword matching fallback

---

## Optimization Strategy

### Goal: 80-90% Cost Reduction

**Target Costs:**
- Simple queries (70% of traffic): $0 (keyword matching)
- Medium queries (20% of traffic): ~$0.00001 (cached embeddings)
- Complex queries (10% of traffic): ~$0.00016 (full AI)
- **Average cost per search: ~$0.000026 (84% reduction)**
- **1000 searches/day: ~$26/day = $780/month**

---

## Implementation Plan

### 1. Query Classification System

Classify queries into 3 tiers:

**TIER 1: Simple Keyword Queries (70% of traffic)**
- Single emotion: "sad", "funny", "angry"
- Single demographic: "male", "female", "teen", "elderly"
- Single theme: "love", "death", "revenge"
- **Cost: $0** (no API calls)
- **Method: Keyword dictionary lookup**

**TIER 2: Medium Complexity (20% of traffic)**
- 2-3 filters: "sad woman", "funny young man", "angry shakespeare"
- Common combinations: Pre-computed embeddings
- **Cost: ~$0.00001** (embedding only, cached parsing)
- **Method: Keyword extraction + cached embedding**

**TIER 3: Complex Semantic (10% of traffic)**
- Natural language: "monologue about lost love and regret for middle aged woman"
- Metaphorical: "piece exploring the darkness within", "journey of self-discovery"
- **Cost: ~$0.00016** (full AI)
- **Method: AI parsing + AI embedding**

### 2. Keyword Dictionary

```python
KEYWORD_MAPPINGS = {
    # Emotions
    'emotions': {
        'sad': 'sadness', 'depressed': 'sadness', 'melancholy': 'melancholy',
        'happy': 'joy', 'funny': 'joy', 'comedic': 'joy', 'hilarious': 'joy',
        'angry': 'anger', 'furious': 'anger', 'rage': 'anger',
        'scared': 'fear', 'fearful': 'fear', 'anxious': 'fear',
        # ... ~50 emotion keywords
    },

    # Demographics
    'gender': {
        'male': 'male', 'man': 'male', 'boy': 'male', 'masculine': 'male',
        'female': 'female', 'woman': 'female', 'girl': 'female', 'feminine': 'female',
    },

    'age_range': {
        'teen': 'teens', 'teenager': 'teens', 'youth': 'teens', 'young': 'teens',
        '20s': '20s', 'twenties': '20s', 'young adult': '20s',
        '30s': '30s', 'thirties': '30s',
        '40s': '40s', 'forties': '40s', 'middle aged': '40s', 'middle-aged': '40s',
        '50s': '50s', 'fifties': '50s', 'older': '50s',
        'elderly': '60+', 'senior': '60+', 'old': '60+',
    },

    # Themes
    'themes': {
        'love': 'love', 'romance': 'love', 'romantic': 'love',
        'death': 'death', 'dying': 'death', 'mortality': 'death',
        'power': 'power', 'authority': 'power', 'control': 'power',
        'betrayal': 'betrayal', 'treachery': 'betrayal', 'backstab': 'betrayal',
        # ... ~100 theme keywords
    },

    # Category
    'category': {
        'shakespeare': 'classical', 'classical': 'classical', 'greek': 'classical',
        'chekhov': 'classical', 'ibsen': 'classical',
        'modern': 'contemporary', 'contemporary': 'contemporary', 'new': 'contemporary',
    },

    # Tone
    'tone': {
        'funny': 'comedic', 'comedic': 'comedic', 'humorous': 'comedic',
        'serious': 'dramatic', 'dramatic': 'dramatic', 'tragic': 'dramatic',
        'dark': 'dark', 'grim': 'dark',
        'romantic': 'romantic', 'loving': 'romantic',
    }
}
```

### 3. Multi-Level Caching Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Search Request                      │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│  Level 1: In-Memory LRU Cache (1000 queries)        │
│  - Stores: (query + filters) → results              │
│  - TTL: 1 hour                                       │
│  - Hit rate: ~40%                                    │
│  - Latency: <1ms                                     │
└─────────────────────┬───────────────────────────────┘
                      │ MISS
                      ▼
┌─────────────────────────────────────────────────────┐
│  Level 2: Redis Cache (10,000 queries)              │
│  - Stores: (query + filters) → results              │
│  - TTL: 24 hours                                     │
│  - Hit rate: ~30%                                    │
│  - Latency: ~5ms                                     │
└─────────────────────┬───────────────────────────────┘
                      │ MISS
                      ▼
┌─────────────────────────────────────────────────────┐
│  Level 3: Query Classification                      │
│  - Tier 1: Keyword match → Skip AI                  │
│  - Tier 2: Partial AI (embeddings only)             │
│  - Tier 3: Full AI (parsing + embeddings)           │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│  Level 4: Embedding Cache (PostgreSQL)              │
│  - Pre-computed embeddings for top 100 queries      │
│  - Common phrases: "sad monologue", "funny woman"   │
│  - Hit rate: ~20% (for Tier 2/3)                    │
└─────────────────────┬───────────────────────────────┘
                      │ MISS
                      ▼
┌─────────────────────────────────────────────────────┐
│  OpenAI API Calls (Only for complex queries)        │
└─────────────────────────────────────────────────────┘
```

### 4. Smart Fallback Chain

```python
def optimized_search(query, filters):
    # Step 1: Check memory cache
    if cached := memory_cache.get(cache_key):
        return cached

    # Step 2: Check Redis cache
    if cached := redis_cache.get(cache_key):
        memory_cache.set(cache_key, cached)
        return cached

    # Step 3: Classify query
    tier = classify_query(query)

    if tier == 1:  # Simple keyword
        filters = extract_keywords(query)
        results = database_search(filters)

    elif tier == 2:  # Medium complexity
        filters = extract_keywords(query)  # No AI
        embedding = get_cached_embedding(query) or generate_embedding(query)
        results = semantic_search(embedding, filters)

    elif tier == 3:  # Complex semantic
        filters = parse_query_with_ai(query)  # AI parsing
        embedding = generate_embedding(query)   # AI embedding
        results = semantic_search(embedding, filters)

    # Cache results
    redis_cache.set(cache_key, results, ttl=86400)
    memory_cache.set(cache_key, results, ttl=3600)

    return results
```

### 5. Pre-Computed Embeddings

Create database table for common query embeddings:

```sql
CREATE TABLE query_embeddings (
    id SERIAL PRIMARY KEY,
    query_text TEXT UNIQUE NOT NULL,
    embedding TEXT NOT NULL,  -- JSON array
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_query_text ON query_embeddings(query_text);
```

Pre-compute top 100 queries:
- "sad monologue"
- "funny piece"
- "angry man"
- "love monologue"
- "shakespeare tragedy"
- etc.

---

## Code Changes

### File 1: `backend/app/services/search/query_optimizer.py` (NEW)

```python
"""Query optimization and classification for monologue search."""

from typing import Dict, Tuple, Optional
from functools import lru_cache
import re

class QueryClassifier:
    """Classify search queries by complexity"""

    TIER_1_PATTERNS = [
        r'^(sad|happy|angry|funny|scared|joyful|melancholy)$',
        r'^(male|female|man|woman|boy|girl)$',
        r'^(teen|young|old|elderly)$',
        r'^(love|death|betrayal|power|revenge)$',
    ]

    TIER_2_PATTERNS = [
        r'^(sad|happy|angry) (male|female|man|woman)$',
        r'^(funny|dramatic) (piece|monologue) for (male|female|man|woman)$',
        r'^(young|old|middle.aged) (male|female|man|woman)$',
    ]

    @classmethod
    def classify(cls, query: str) -> int:
        """
        Classify query into tier.

        Returns:
            1: Simple keyword (no AI needed)
            2: Medium complexity (keywords + embedding)
            3: Complex semantic (full AI)
        """
        query_lower = query.lower().strip()

        # Tier 1: Single keyword
        for pattern in cls.TIER_1_PATTERNS:
            if re.match(pattern, query_lower):
                return 1

        # Tier 2: 2-3 keywords
        word_count = len(query_lower.split())
        if word_count <= 5:
            for pattern in cls.TIER_2_PATTERNS:
                if re.match(pattern, query_lower):
                    return 2

        # Tier 3: Complex
        return 3


class KeywordExtractor:
    """Extract filters from keywords without AI"""

    KEYWORD_MAPPINGS = {
        'emotions': {
            'sad': 'sadness', 'depressed': 'sadness', 'melancholy': 'melancholy',
            'blue': 'sadness', 'unhappy': 'sadness', 'tearful': 'sadness',
            'happy': 'joy', 'funny': 'joy', 'comedic': 'joy', 'hilarious': 'joy',
            'joyful': 'joy', 'cheerful': 'joy', 'humorous': 'joy', 'amusing': 'joy',
            'angry': 'anger', 'furious': 'anger', 'rage': 'anger', 'mad': 'anger',
            'enraged': 'anger', 'wrathful': 'anger',
            'scared': 'fear', 'fearful': 'fear', 'anxious': 'fear', 'afraid': 'fear',
            'terrified': 'fear', 'frightened': 'fear',
            'hopeful': 'hope', 'optimistic': 'hope', 'confident': 'hope',
            'desperate': 'despair', 'despairing': 'despair', 'hopeless': 'despair',
        },

        'gender': {
            'male': 'male', 'man': 'male', 'boy': 'male', 'masculine': 'male',
            'he': 'male', 'him': 'male', 'men': 'male',
            'female': 'female', 'woman': 'female', 'girl': 'female', 'feminine': 'female',
            'she': 'female', 'her': 'female', 'women': 'female',
        },

        'age_range': {
            'teen': 'teens', 'teenager': 'teens', 'youth': 'teens', 'young': 'teens',
            'adolescent': 'teens', 'teenage': 'teens',
            '20s': '20s', 'twenties': '20s', 'young adult': '20s',
            '30s': '30s', 'thirties': '30s',
            '40s': '40s', 'forties': '40s', 'middle aged': '40s', 'middle-aged': '40s',
            '50s': '50s', 'fifties': '50s', 'older': '50s',
            'elderly': '60+', 'senior': '60+', 'old': '60+', '60+': '60+',
        },

        'themes': {
            'love': 'love', 'romance': 'love', 'romantic': 'love', 'passion': 'love',
            'death': 'death', 'dying': 'death', 'mortality': 'death',
            'power': 'power', 'authority': 'power', 'control': 'power',
            'betrayal': 'betrayal', 'treachery': 'betrayal',
            'revenge': 'revenge', 'vengeance': 'revenge',
            'family': 'family', 'mother': 'family', 'father': 'family',
            'identity': 'identity', 'self': 'identity',
            'loss': 'loss', 'grief': 'loss', 'mourning': 'loss',
        },

        'category': {
            'shakespeare': 'classical', 'shakespearean': 'classical',
            'classical': 'classical', 'greek': 'classical', 'ancient': 'classical',
            'chekhov': 'classical', 'ibsen': 'classical',
            'modern': 'contemporary', 'contemporary': 'contemporary',
            'new': 'contemporary', 'recent': 'contemporary',
        },

        'tone': {
            'funny': 'comedic', 'comedic': 'comedic', 'humorous': 'comedic',
            'comic': 'comedic', 'lighthearted': 'comedic',
            'serious': 'dramatic', 'dramatic': 'dramatic', 'tragic': 'dramatic',
            'heavy': 'dramatic',
            'dark': 'dark', 'grim': 'dark', 'noir': 'dark',
            'romantic': 'romantic', 'loving': 'romantic',
        }
    }

    @classmethod
    @lru_cache(maxsize=1000)
    def extract(cls, query: str) -> Dict:
        """Extract filters from query using keyword matching"""
        query_lower = query.lower()
        words = re.findall(r'\b\w+\b', query_lower)

        filters = {}

        # Extract each filter type
        for word in words:
            # Check emotions
            if word in cls.KEYWORD_MAPPINGS['emotions']:
                filters['emotion'] = cls.KEYWORD_MAPPINGS['emotions'][word]

            # Check gender
            if word in cls.KEYWORD_MAPPINGS['gender']:
                filters['gender'] = cls.KEYWORD_MAPPINGS['gender'][word]

            # Check age_range
            if word in cls.KEYWORD_MAPPINGS['age_range']:
                filters['age_range'] = cls.KEYWORD_MAPPINGS['age_range'][word]

            # Check category
            if word in cls.KEYWORD_MAPPINGS['category']:
                filters['category'] = cls.KEYWORD_MAPPINGS['category'][word]

            # Check tone
            if word in cls.KEYWORD_MAPPINGS['tone']:
                filters['tone'] = cls.KEYWORD_MAPPINGS['tone'][word]

        # Extract themes (collect all)
        themes = []
        for word in words:
            if word in cls.KEYWORD_MAPPINGS['themes']:
                themes.append(cls.KEYWORD_MAPPINGS['themes'][word])

        if themes:
            filters['themes'] = themes

        return filters
```

### File 2: `backend/app/services/search/cache_manager.py` (NEW)

```python
"""Multi-level caching for search queries."""

from typing import Optional, List, Any
from functools import lru_cache
import hashlib
import json
import redis
from app.core.config import settings

class CacheManager:
    """Manage multi-level caching"""

    def __init__(self):
        # Level 1: In-memory LRU cache (handled by @lru_cache decorators)
        # Level 2: Redis cache
        try:
            self.redis_client = redis.Redis(
                host=settings.REDIS_HOST,
                port=settings.REDIS_PORT,
                db=0,
                decode_responses=False
            )
            self.redis_enabled = True
        except Exception as e:
            print(f"Redis not available: {e}")
            self.redis_enabled = False

    def _generate_cache_key(self, query: str, filters: dict) -> str:
        """Generate cache key from query and filters"""
        cache_data = {
            'query': query.lower().strip(),
            'filters': sorted(filters.items()) if filters else []
        }
        cache_str = json.dumps(cache_data, sort_keys=True)
        return f"search:{hashlib.md5(cache_str.encode()).hexdigest()}"

    def get_results(self, query: str, filters: dict) -> Optional[List]:
        """Get cached search results"""
        if not self.redis_enabled:
            return None

        cache_key = self._generate_cache_key(query, filters)

        try:
            cached = self.redis_client.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception as e:
            print(f"Cache get error: {e}")

        return None

    def set_results(self, query: str, filters: dict, results: List, ttl: int = 86400):
        """Cache search results"""
        if not self.redis_enabled:
            return

        cache_key = self._generate_cache_key(query, filters)

        try:
            # Serialize results (convert to dict if needed)
            serialized = json.dumps(results)
            self.redis_client.setex(cache_key, ttl, serialized)
        except Exception as e:
            print(f"Cache set error: {e}")

    def get_embedding(self, query: str) -> Optional[List[float]]:
        """Get cached embedding"""
        if not self.redis_enabled:
            return None

        cache_key = f"embedding:{hashlib.md5(query.lower().encode()).hexdigest()}"

        try:
            cached = self.redis_client.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception as e:
            print(f"Embedding cache get error: {e}")

        return None

    def set_embedding(self, query: str, embedding: List[float], ttl: int = 604800):
        """Cache embedding (7 day TTL)"""
        if not self.redis_enabled:
            return

        cache_key = f"embedding:{hashlib.md5(query.lower().encode()).hexdigest()}"

        try:
            self.redis_client.setex(cache_key, ttl, json.dumps(embedding))
        except Exception as e:
            print(f"Embedding cache set error: {e}")


# Global cache instance
cache_manager = CacheManager()
```

---

## Migration Strategy

### Phase 1: Add Caching (Week 1)
- ✅ Add Redis dependency
- ✅ Implement CacheManager
- ✅ Add caching to existing search flow
- ✅ Monitor cache hit rates
- **Expected savings: 30-40%**

### Phase 2: Add Query Classification (Week 2)
- ✅ Implement QueryClassifier
- ✅ Implement KeywordExtractor
- ✅ Add Tier 1 (keyword-only) path
- ✅ Add Tier 2 (keyword + embedding) path
- ✅ Keep Tier 3 (full AI) for complex queries
- **Expected savings: 60-70%**

### Phase 3: Pre-compute Embeddings (Week 3)
- ✅ Create query_embeddings table
- ✅ Analyze top 100 queries from logs
- ✅ Pre-compute and cache embeddings
- **Expected savings: 80-85%**

### Phase 4: Monitoring & Tuning (Week 4)
- ✅ Add performance metrics
- ✅ Track cost per query tier
- ✅ Optimize keyword dictionaries
- ✅ A/B test query classification thresholds
- **Target savings: 85-90%**

---

## Performance Metrics

Add monitoring for:

```python
@dataclass
class SearchMetrics:
    query: str
    tier: int  # 1, 2, or 3
    cache_hit: bool
    cache_level: str  # 'memory', 'redis', 'db', 'miss'
    api_calls: int  # 0, 1, or 2
    cost_usd: float
    latency_ms: float
    results_count: int
```

Track daily:
- Average cost per search
- Cache hit rate by level
- Query tier distribution
- API call count
- Total daily cost

---

## Cost Projections

### Before Optimization
- Simple query ("sad"): $0.00016
- Medium query ("sad woman"): $0.00016
- Complex query ("monologue about loss"): $0.00016
- **Average: $0.00016**

### After Optimization
- Simple query ("sad"): $0 (keyword match)
- Medium query ("sad woman"): $0.00001 (cached embedding)
- Complex query ("monologue about loss"): $0.00016 (full AI)
- With caching (40% hit rate): ~60% of queries = $0
- **Average: ~$0.000026 (84% reduction)**

### Monthly Savings
- Before: $4,800/month (1M searches)
- After: $780/month (1M searches)
- **Savings: $4,020/month**

---

## Backward Compatibility

All changes are backward compatible:

1. ✅ Existing API signatures unchanged
2. ✅ Redis optional (degrades gracefully)
3. ✅ Falls back to AI if keyword extraction fails
4. ✅ No database schema changes required (query_embeddings is optional)
5. ✅ Can deploy incrementally

---

## Testing Plan

1. **Unit Tests**
   - QueryClassifier.classify() with various queries
   - KeywordExtractor.extract() accuracy
   - CacheManager get/set operations

2. **Integration Tests**
   - End-to-end search with caching
   - Cache invalidation
   - Fallback behavior when Redis down

3. **Load Tests**
   - 1000 concurrent searches
   - Cache performance under load
   - Redis memory usage

4. **Cost Monitoring**
   - Track OpenAI API calls before/after
   - Measure actual cost reduction
   - Monitor query tier distribution

---

## Implementation Checklist

- [ ] Create `query_optimizer.py` with QueryClassifier and KeywordExtractor
- [ ] Create `cache_manager.py` with CacheManager
- [ ] Update `semantic_search.py` to use optimizer
- [ ] Update `content_analyzer.py` to use embedding cache
- [ ] Add Redis to requirements.txt
- [ ] Add Redis config to settings
- [ ] Add performance monitoring
- [ ] Write unit tests
- [ ] Write integration tests
- [ ] Deploy to staging
- [ ] Monitor for 48 hours
- [ ] Deploy to production
- [ ] Track cost savings

---

## Next Steps

1. Review and approve this plan
2. Set up Redis instance
3. Implement Phase 1 (caching)
4. Deploy and monitor
5. Proceed with Phases 2-4 based on results
