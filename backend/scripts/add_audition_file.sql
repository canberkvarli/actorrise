-- The audition file (bring checklist, who put you up, notes after the room,
-- saved AI help) and where the actor leaves from. Additive.
-- Apply on Supabase BEFORE the backend deploy that uses it.

ALTER TABLE auditions ADD COLUMN IF NOT EXISTS bring_list   JSONB;
ALTER TABLE auditions ADD COLUMN IF NOT EXISTS through      VARCHAR(200);
ALTER TABLE auditions ADD COLUMN IF NOT EXISTS through_kind VARCHAR(8);
ALTER TABLE auditions ADD COLUMN IF NOT EXISTS shoots       VARCHAR(300);
ALTER TABLE auditions ADD COLUMN IF NOT EXISTS after_notes  JSONB;
ALTER TABLE auditions ADD COLUMN IF NOT EXISTS assist       JSONB;

-- Applied 2026-10-08 with two users columns for a "getting there" trip planner
-- that was cut the same day. Nothing reads them; drop when convenient:
--   ALTER TABLE users DROP COLUMN IF EXISTS leaving_from, DROP COLUMN IF EXISTS travel_mode;

-- Reading it back:
--   select count(*) filter (where assist is not null), count(*) filter (where after_notes is not null) from auditions;
