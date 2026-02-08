# Monologue search (pgvector and indexes)

## Famous-line search ("to be or not to be", etc.)

Search is tuned so that when you type a famous line (e.g. "to be or not to be"), the monologue that **contains that text** is ranked first. This uses:

- **Text search**: monologues whose `text` contains the query are ordered first in fallback/keyword search.
- **Famous-line boost**: in hybrid results, any monologue whose text contains the multi-word query is moved to the top.

If you don’t see the Hamlet "To be or not to be" monologue at all, the play may have been ingested with only `full_text` and no extracted monologues. Ensure the DB has the `embedding_vector` column (see below), then backfill and re-embed:

```bash
cd backend
uv run python scripts/add_embedding_vector_column.py   # if you get "embedding_vector does not exist"
uv run python scripts/backfill_play_monologues.py --play "Hamlet"
uv run python scripts/backfill_monologue_vectors.py
```

Then search again for "to be or not to be"; it should appear first.

## pgvector setup

If you see **`column monologues.embedding_vector does not exist`**, run the one-time migration first:

```bash
cd backend && uv run python scripts/add_embedding_vector_column.py
```

That script enables the `vector` extension and adds `monologues.embedding_vector` if missing. Then run the backfill scripts.

Manual alternative:

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
