# Monologue search (pgvector and indexes)

## pgvector setup

1. **Enable the extension** (PostgreSQL):

   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

2. **Add the vector column** to `monologues` (if not already present):

   ```sql
   ALTER TABLE monologues ADD COLUMN IF NOT EXISTS embedding_vector vector(1536);
   ```

   Use the dimension that matches your embedding model (e.g. 1536 for OpenAI `text-embedding-3-small`).

3. **Backfill** existing JSON embeddings into `embedding_vector`:

   From project root:

   ```bash
   python backend/scripts/backfill_monologue_vectors.py
   ```

   Or from `backend`:

   ```bash
   uv run python scripts/backfill_monologue_vectors.py
   ```

4. **Verify stability** (optional):

   ```bash
   python backend/scripts/verify_search_stability.py
   ```

## Text search indexes (PostgreSQL)

To speed up keyword/fallback search, create trigram indexes:

```bash
python backend/scripts/create_search_indexes.py
```

Requires the `pg_trgm` extension (the script creates it if allowed).
