-- user_scripts.class_share: a teacher's script handed to their own class
-- (app/services/class_shelf.py). NULL = not shared, 'live' = on the class
-- shelf, 'hidden' = taken down by a moderator. Additive, no backfill.
-- Run before the push that ships the class shelf (deploy ordering).

ALTER TABLE user_scripts ADD COLUMN IF NOT EXISTS class_share VARCHAR(16);
CREATE INDEX IF NOT EXISTS ix_user_scripts_class_share
    ON user_scripts (class_share) WHERE class_share IS NOT NULL;
