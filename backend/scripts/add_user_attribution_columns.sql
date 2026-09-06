-- Acquisition source on the users row: utm_source / utm_medium / utm_campaign
-- and the external referrer of the first page the browser loaded, captured by
-- lib/attribution.ts and written once by get_current_user when the row is
-- created.
--
-- The backend uses SQLAlchemy create_all (no Alembic), which only CREATES
-- missing tables; it does NOT add columns to an existing table. Run this
-- against Supabase by hand.
--
-- ⚠️  RUN THIS BEFORE DEPLOYING THE BACKEND. get_current_user loads User on
--     every authed request, so an un-migrated database 500s on everything the
--     moment the model declares these columns.
--
-- Additive only. No backfill: NULL means "arrived with none", which is the
-- honest answer for every account that predates the capture.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS utm_source   VARCHAR,
  ADD COLUMN IF NOT EXISTS utm_medium   VARCHAR,
  ADD COLUMN IF NOT EXISTS utm_campaign VARCHAR,
  ADD COLUMN IF NOT EXISTS referrer     VARCHAR;
