-- rehearsal_sessions.failure_reason: why an abandoned session did not finish,
-- as the client saw it (mic_denied, speech_unsupported, never_began, no_lines,
-- left_midway, ...). Vocabulary in app/services/rehearsal_failure.py.
--
-- create_all does not add columns to an existing table. Run by hand on
-- Supabase BEFORE the backend deploys: every rehearsal read selects this
-- column once the model declares it, so an un-migrated database 500s the
-- rehearse screen.
--
-- Additive, nullable, no backfill. NULL = completed, timed_out (the sweep
-- cannot know), or before the column.

ALTER TABLE rehearsal_sessions
  ADD COLUMN IF NOT EXISTS failure_reason VARCHAR(32);
