# Embedding Upgrade Summary

## ✅ Completed

### 1. **Upgraded to text-embedding-3-large (3072 dims)**
- All 8,630 monologues re-embedded with enriched metadata
- All 14,256 film/TV references re-embedded
- Enriched format includes: character, emotion, tone, gender, age, themes, difficulty

### 2. **Fixed Search Issues**
- ✅ **Duration filter** - Now works correctly in both semantic and text search
- ✅ **Query parsing** - Now extracts duration from natural language (e.g., "2 minute monologue" → 120 seconds)
- ✅ **Hybrid merge** - Fixed to sort by score, preventing low-quality text matches from blocking semantic results
- ✅ **Gender parsing** - "women" and "female" both correctly map to female filter

### 3. **Column Swap Status**
- ✅ Columns renamed: `embedding_vector_v2` → `embedding_vector`
- ⚠️ HNSW index skipped (3072 dims exceeds 2000 dim limit)
- ✅ Search still works (uses sequential scan or can use IVFFlat index)

## 📊 Confidence Scores

Confidence scores ARE being returned in search results (0.0-1.0). Check your frontend to ensure it's displaying the `score` field from search results.

Example response:
```json
{
  "results": [
    {
      "monologue": {...},
      "score": 0.92,  // <-- This is the confidence score
      "match_type": "exact_quote"  // or "title_match", "character_match", etc.
    }
  ]
}
```

## 🎬 Film/TV Search Quality

Film/TV references use plot summaries and actor lists for embeddings. For better "villain" searches, the enriched embeddings help, but:

- "villain" in Kung Fu Panda's plot → matches
- Consider adding character-level metadata to film/TV (villain/hero role) if available

## 🔧 Optional: Add IVFFlat Index

Since HNSW doesn't support 3072 dims, you can add an IVFFlat index for better performance:

```sql
CREATE INDEX monologues_embedding_ivfflat_idx
ON monologues
USING ivfflat (embedding_vector vector_cosine_ops)
WITH (lists = 100);

CREATE INDEX film_tv_references_embedding_ivfflat_idx
ON film_tv_references
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

## 📝 Next Steps

1. Test search quality thoroughly
2. Monitor search performance (may be slower without index)
3. Add IVFFlat indexes if needed
4. Clean up deprecated columns when ready:
   ```sql
   ALTER TABLE monologues DROP COLUMN embedding_vector_deprecated;
   ALTER TABLE film_tv_references DROP COLUMN embedding_deprecated;
   ```

## 🚀 GitHub Workflow

No changes needed to GitHub workflows. The embedding upgrade is transparent to CI/CD:
- Models already had the columns (added in migration)
- Search automatically detects and uses v2 embeddings
- Tests should pass without modification

If you have embedding generation in workflows, ensure they use:
- Model: `text-embedding-3-large`
- Dimensions: `3072`
- Enriched text format (from `embedding_text_builder.py`)
