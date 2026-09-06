-- Product events table: the funnel between "users row created" and the first
-- search_logs row (and, from later commits, result clicks, trial outcomes and
-- collection-feature discovery).
--
-- create_all WILL create this table on the next backend boot because it is a
-- new table, not a new column. The statements are here so it can be created
-- ahead of the deploy, and so the schema is on record next to the others.
-- Idempotent either way.

CREATE TABLE IF NOT EXISTS user_events (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    event_name  VARCHAR(48) NOT NULL,
    properties  JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_user_events_user_id      ON user_events (user_id);
CREATE INDEX IF NOT EXISTS ix_user_events_name_created ON user_events (event_name, created_at);

-- Every other table got RLS in the 2026-08-23 lockdown; the API talks to
-- Postgres as the owner role, which bypasses RLS, so enabling it costs nothing
-- and keeps the anon key out.
ALTER TABLE user_events ENABLE ROW LEVEL SECURITY;
