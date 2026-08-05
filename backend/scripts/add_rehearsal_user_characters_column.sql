-- Multi-role rehearsal: let an actor speak for more than one character.
--
-- The backend uses SQLAlchemy create_all (no Alembic), which only CREATES
-- missing tables — it does NOT add columns to an existing table. So on any
-- database that already has `rehearsal_sessions` (staging/prod), this column
-- must be added manually with the statement below.
--
-- ⚠️  RUN THIS BEFORE DEPLOYING THE BACKEND. Pushing to main auto-deploys Render,
--     and once the model declares the column, every SELECT against
--     rehearsal_sessions includes it — so an un-migrated database 500s on any
--     authed rehearsal request.
--
-- DO NOT run automatically. Canberk applies this deliberately at deploy time.
--
-- NULL means "single role" and falls back to the existing `user_character`
-- value, so sessions created before this column keep working untouched.

ALTER TABLE rehearsal_sessions
  ADD COLUMN IF NOT EXISTS user_characters TEXT[];


-- ---------------------------------------------------------------------------
-- Optional data repair — Ayush's "Champions for Change" upload (scenes 870/871)
-- ---------------------------------------------------------------------------
-- These are the two scenes behind the 2026-07-29 bug report. Not required by the
-- code changes; multi-role selection already lets an actor pick both halves of a
-- split character. Run only if you want the scenes themselves tidied.
--
-- Scene 870 "Gym Banter": the script cues one person as "Daniel" for the first
-- four lines and "Dan" for the remaining seventeen, which made "Daniel" look like
-- a 4-line part in a 43-line scene.
--
--   UPDATE scene_lines SET character_name = 'Dan'
--   WHERE scene_id = 870 AND character_name = 'Daniel';
--
--   UPDATE scenes SET character_2_name = 'Dan'
--   WHERE id = 870 AND character_2_name = 'Daniel';
--
-- Scene 871 "Words of Wisdom": the declared display name never matches a cue
-- ("Steve Komphela" vs "Steve"), which is what let session 320 start on a
-- character owning zero lines.
--
--   UPDATE scenes SET character_1_name = 'Steve'
--   WHERE id = 871 AND character_1_name = 'Steve Komphela';
