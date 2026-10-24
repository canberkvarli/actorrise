-- 2026-10-24. Additive and nullable: safe to run before or after the deploy.
--
-- scene_map: the scene map read from source_text, with the key it was read
-- under. Opening a script read the whole text again every time, and sent an
-- under-split one to the model each time. Deferred in the model like
-- source_text, so list queries never carry it.
ALTER TABLE user_scripts ADD COLUMN IF NOT EXISTS scene_map JSONB;
