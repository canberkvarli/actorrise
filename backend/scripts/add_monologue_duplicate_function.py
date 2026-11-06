#!/usr/bin/env python
"""
Migration: monologue_duplicate_of(), the corpus-wide duplicate check as SQL.

A cloud session reaches Supabase over HTTPS only (the sandbox proxies HTTP and
nothing else, so the Postgres wire protocol on 5432/6543 never gets out). The
REST writer (`data_ingestion/rest_writer.py`) could therefore only compare a new
piece with plays of the same title. This puts the check in the database, where
PostgREST can call it as `POST /rest/v1/rpc/monologue_duplicate_of` with the
service key the session already holds. Same rules as `find_duplicate`, plus one:

* identical_text   md5 of the text with case, punctuation and spaces removed
* near_identical   nearest neighbour on the HNSW index within `max_distance`
* overlapping_cut  the same speech cut differently: an 80-character slice from
                   the middle of the shorter text appears inside the longer one.
                   Daily Actor filed This Is Our Youth's Jessica twice, 338 and
                   253 words, at a vector distance of 0.041 (the 0.02 threshold
                   is right for "identical", wrong for "another cut of it").

Plus the expression index the fingerprint needs: without it the exact-text
check is a 3.3 s scan of every monologue, with it 0.4 s. About 1.5 MB.
No table change. service_role may execute it; anon and
authenticated may not. Safe to run before or after the deploy, and again.

Usage:
    uv run python scripts/add_monologue_duplicate_function.py
"""

from __future__ import annotations

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

FUNCTION_SQL = """
CREATE OR REPLACE FUNCTION public.monologue_duplicate_of(
    p_text text,
    p_embedding halfvec(1536) DEFAULT NULL,
    p_max_distance double precision DEFAULT 0.02
) RETURNS TABLE (id integer, reason text)
LANGUAGE plpgsql STABLE
SET search_path = public, extensions
AS $$
DECLARE
    v_norm text := regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]', '', 'g');
    v_fp text := md5(v_norm);
BEGIN
    IF v_norm = '' THEN
        RETURN;
    END IF;

    RETURN QUERY
        SELECT m.id, 'identical_text'::text FROM monologues m
        WHERE md5(regexp_replace(lower(m.text), '[^a-z0-9]', '', 'g')) = v_fp
        LIMIT 1;
    IF FOUND OR p_embedding IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
        WITH nn AS (
            SELECT m.id, m.text, (m.embedding_vector <=> p_embedding) AS dist
            FROM monologues m
            WHERE m.embedding_vector IS NOT NULL
            ORDER BY m.embedding_vector <=> p_embedding
            LIMIT 5
        ), cmp AS (
            SELECT nn.id, nn.dist,
                   regexp_replace(lower(nn.text), '[^a-z0-9]', '', 'g') AS other
            FROM nn
        )
        SELECT c.id,
               CASE WHEN c.dist <= p_max_distance
                    THEN 'near_identical:' || round(c.dist::numeric, 4)
                    ELSE 'overlapping_cut:' || round(c.dist::numeric, 4) END
        FROM cmp c
        WHERE c.dist <= p_max_distance
           OR (length(v_norm) > 200 AND length(c.other) > 200 AND (
                  (length(v_norm) <= length(c.other)
                   AND position(substr(v_norm, length(v_norm) / 2 - 40, 80) IN c.other) > 0)
               OR (length(c.other) < length(v_norm)
                   AND position(substr(c.other, length(c.other) / 2 - 40, 80) IN v_norm) > 0)))
        ORDER BY c.dist
        LIMIT 1;
END;
$$;
"""

INDEX_SQL = """
CREATE INDEX IF NOT EXISTS ix_monologues_fingerprint
    ON public.monologues (md5(regexp_replace(lower(text), '[^a-z0-9]', '', 'g')));
"""

GRANTS_SQL = """
REVOKE ALL ON FUNCTION public.monologue_duplicate_of(text, halfvec, double precision) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.monologue_duplicate_of(text, halfvec, double precision) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.monologue_duplicate_of(text, halfvec, double precision) TO service_role;
"""


def main() -> None:
    from sqlalchemy import text

    from app.core.database import engine

    with engine.begin() as conn:
        conn.execute(text(INDEX_SQL))
        conn.execute(text(FUNCTION_SQL))
        conn.execute(text(GRANTS_SQL))
    print("monologue_duplicate_of() created")


if __name__ == "__main__":
    main()
