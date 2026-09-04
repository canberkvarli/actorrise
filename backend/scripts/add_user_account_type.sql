-- Account type: tell actors, educators and students apart.
--
-- The backend uses SQLAlchemy create_all (no Alembic), which only CREATES
-- missing tables — it does NOT add columns to an existing table. So on any
-- database that already has `users` (i.e. staging/prod), these columns must be
-- added manually with the statements below.
--
-- DO NOT run automatically. Canberk applies this deliberately at deploy time,
-- and BEFORE pushing the matching backend code — a main push auto-deploys
-- Render, and the model would then select a column the database doesn't have,
-- 500-ing every authenticated request.
--
-- Both columns are nullable ON PURPOSE and there is NO backfill. NULL means
-- "unknown / legacy", which is what every existing account is. Do not add a
-- DEFAULT and do not make these NOT NULL: guessing "actor" for the whole
-- back catalogue would turn the educator count into noise.
--
-- account_type is one of 'actor' | 'educator' | 'student'. The allowed set is
-- enforced in the application (app/core/account_types.py) rather than by a CHECK
-- constraint, so adding a fourth kind later is a code change, not a migration.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS account_type VARCHAR;

-- School, studio or company name. Free text, capped at 280 chars in the API.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS organization VARCHAR;

-- Partial index: the only queries that matter are "show me the educators" and
-- "how many students came from this school", which never look at the NULL bulk.
-- Indexing only the answered rows keeps this tiny (a few hundred rows, not tens
-- of thousands).
CREATE INDEX IF NOT EXISTS ix_users_account_type
  ON users (account_type)
  WHERE account_type IS NOT NULL;
