-- Ghost Light iOS (spec §4 #2): the free-read counter, server-side.
--
-- The backend uses SQLAlchemy create_all (no Alembic), which only CREATES
-- missing tables — it does NOT add columns to an existing table. So on any
-- database that already has `usage_metrics` (staging/prod), this column must be
-- added manually with the statement below.
--
-- DO NOT run automatically. Canberk applies this deliberately at deploy time.
--
-- The free tier gets 3 full monologue reads for their LIFETIME. That total is
-- SUM(monologue_reads) across all of a user's daily rows, incremented by
-- POST /api/monologues/{id}/read. It must survive a reinstall, which is exactly
-- why it lives here and not on the device.
--
-- After running it, also add the new "monologues" pricing tier by re-running
-- the canonical seeder (it upserts, so existing tiers are untouched):
--     python backend/scripts/seed_pricing_tiers.py

ALTER TABLE usage_metrics
  ADD COLUMN IF NOT EXISTS monologue_reads INTEGER NOT NULL DEFAULT 0;
