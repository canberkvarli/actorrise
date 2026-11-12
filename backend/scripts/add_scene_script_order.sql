-- 2026-11-12. Additive and nullable: safe to run before or after the deploy.
--
-- script_order: where a scene of an actor's own script sits, as the actor put
-- it (the app's "edit the map": drag a scene, move it under another act or
-- episode). NULL until the actor first arranges the script; until then
-- scenes come in the order they were built, as they always have. Library
-- scenes never use it. `scenes` already has RLS on.
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS script_order INTEGER;
