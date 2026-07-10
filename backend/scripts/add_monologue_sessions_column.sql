-- Increment 4 (Monologue Work / X): add the per-session usage counter.
--
-- The backend uses SQLAlchemy create_all (no Alembic), which only CREATES
-- missing tables — it does NOT add columns to an existing table. So on any
-- database that already has `usage_metrics` (i.e. staging/prod), this column
-- must be added manually with the statement below.
--
-- DO NOT run automatically. Canberk applies this deliberately at deploy time.
--
-- After running it, also re-seed / update the pricing tiers so each tier's
-- `features` JSON includes `monologue_sessions` (see backend/app/core/seed.py),
-- otherwise `features.get("monologue_sessions", 0)` defaults to 0 and the
-- feature reads as "not available" for existing users.

ALTER TABLE usage_metrics
  ADD COLUMN IF NOT EXISTS monologue_sessions INTEGER NOT NULL DEFAULT 0;
