-- 2026-10-22. Additive and nullable: safe to run before or after the deploy.
--
-- source_text: the whole script as read at upload. raw_text holds only what was
-- built (a picked upload keeps the picked part), so without this a script that
-- built one scene could never offer the rest. Deferred in the model: list
-- queries must not carry it (plays.full_text on joins was the egress bill).
--
-- genres: up to three. genre stays as the first of them, for the colours and
-- emblems that key off one value.
ALTER TABLE user_scripts ADD COLUMN IF NOT EXISTS source_text TEXT;
ALTER TABLE user_scripts ADD COLUMN IF NOT EXISTS genres JSONB;
