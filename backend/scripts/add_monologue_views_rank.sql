-- Click-through rank on monologue_views. The client already sends ?slid= (the
-- search_logs id) when a result is opened; it now sends ?rank= too, the
-- 1-based position of the clicked result. Joined to search_logs.best_cosine
-- this answers "did a strong-cosine search still fail the user".
--
-- create_all does not add columns to an existing table. Run by hand on
-- Supabase BEFORE the backend deploys: the detail-open insert is wrapped in a
-- try/rollback so it would not 500, but every open until then would be lost.
--
-- Additive, nullable, no backfill: NULL is "not from a result list" or
-- "before the column".

ALTER TABLE monologue_views
  ADD COLUMN IF NOT EXISTS rank INTEGER;

-- The relevance query is "opens per search, by rank", so:
--
--   SELECT s.id, s.best_cosine, s.weak_match, min(v.rank) AS first_open_rank,
--          count(v.id) AS opens
--   FROM search_logs s
--   LEFT JOIN monologue_views v ON v.search_log_id = s.id
--   WHERE s.created_at > now() - interval '30 days' AND s.page = 1
--   GROUP BY s.id;
