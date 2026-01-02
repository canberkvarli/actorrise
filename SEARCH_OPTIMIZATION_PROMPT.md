# Search Optimization Prompt for Cursor/Claude

## Context
I have a monologue search system that uses OpenAI API calls for every search query. Each search currently makes 2 API calls:
1. Query parsing (GPT-4o-mini) - extracts filters from natural language
2. Embedding generation (text-embedding-3-small) - for semantic search

**Current Issues:**
- Every search costs money (~$0.0001-0.0003 per search)
- No caching mechanism (repeated queries cost the same)
- AI parsing happens even when explicit filters are provided
- No fallback for simple keyword searches

## Optimization Goals

### 1. Cost Reduction (Priority: HIGH)
- Reduce API calls by 80-90% through smart caching
- Skip AI parsing when explicit filters are provided
- Use keyword matching for simple/common queries instead of AI
- Implement Redis or persistent caching for production

### 2. Smart Search Improvements (Priority: MEDIUM)
- Hybrid search: Use AI for complex queries, keyword matching for simple ones
- Pre-compute embeddings for common search terms (e.g., "sad", "funny", "dramatic")
- Implement query classification: detect if query is simple (use keyword search) vs complex (use AI)
- Add query expansion: map synonyms (e.g., "funny" → "comedic", "humorous")

### 3. Performance & User Experience (Priority: MEDIUM)
- Faster response times for cached queries
- Better fallback when API fails
- Support for typo tolerance in keyword searches
- Fuzzy matching for character names, play titles

## Technical Requirements

### Files to Optimize:
- `backend/app/services/search/semantic_search.py` - Main search logic
- `backend/app/services/ai/content_analyzer.py` - AI service (add caching layer)
- `backend/app/api/monologues.py` - API endpoint (add query preprocessing)

### Constraints:
- Must maintain backward compatibility with existing API
- Keep semantic search quality high
- Support both natural language and explicit filter queries
- Work with existing database schema (PostgreSQL with JSON embeddings)

### Implementation Suggestions:

1. **Query Classification System**
   - Simple queries (single word, common emotions): Use keyword search only
   - Complex queries (multi-word, nuanced): Use AI parsing + embedding
   - Examples:
     - "sad" → keyword search on `primary_emotion = 'sadness'`
     - "sad monologue about loss for young woman" → AI parsing + embedding

2. **Multi-Level Caching**
   - Level 1: In-memory cache (current requests)
   - Level 2: Redis cache (shared across instances)
   - Level 3: Database cache table (persistent across restarts)
   - Cache keys: query hash + filter hash

3. **Smart Query Parsing**
   - Keyword dictionary for common terms:
     - Emotions: "sad" → "sadness", "funny" → "joy", "angry" → "anger"
     - Demographics: "young woman" → gender="female", age_range="20s"
     - Difficulty: "easy" → "beginner", "hard" → "advanced"
   - Only use AI for queries that don't match keywords

4. **Embedding Optimization**
   - Pre-compute embeddings for top 100 common search terms
   - Store in database table `cached_embeddings`
   - Batch generate embeddings for similar queries

5. **Fallback Strategy**
   - If AI parsing fails → use keyword matching
   - If embedding fails → use text search with filters
   - If both fail → return filtered results by metadata only

## Expected Outcomes

### Cost Reduction:
- **Before**: ~$0.0002 per search
- **After**: ~$0.00002-0.00005 per search (90% reduction)
- **For 10,000 searches/month**: $2 → $0.20-0.50

### Performance:
- Cached queries: <50ms response time
- AI queries: <500ms response time
- Keyword queries: <100ms response time

### User Experience:
- Faster search results
- Better results for common queries
- More reliable (better fallbacks)

## Implementation Checklist

- [ ] Add query classification (simple vs complex)
- [ ] Implement multi-level caching (memory + Redis + DB)
- [ ] Create keyword dictionary for common terms
- [ ] Add pre-computed embeddings table
- [ ] Implement smart fallback chain
- [ ] Add query expansion/synonym mapping
- [ ] Add performance monitoring/logging
- [ ] Write tests for caching behavior
- [ ] Update API documentation

## Questions to Consider

1. Should we use a vector database (pgvector) instead of JSON embeddings for better performance?
2. Should we implement query result caching (cache full results, not just embeddings)?
3. Should we add rate limiting per user to prevent abuse?
4. Should we implement A/B testing to measure quality vs cost trade-offs?

---

**Please analyze the current implementation and provide:**
1. Detailed optimization plan with code changes
2. Cost analysis (before/after)
3. Performance benchmarks
4. Migration strategy (how to deploy without breaking existing functionality)
5. Monitoring/metrics to track improvements

