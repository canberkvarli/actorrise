-- The audition file (bring checklist, who put you up, notes after the room,
-- saved AI help) and where the actor leaves from. Additive.
-- Apply on Supabase BEFORE the backend deploy that uses it.

ALTER TABLE auditions ADD COLUMN IF NOT EXISTS bring_list   JSONB;
ALTER TABLE auditions ADD COLUMN IF NOT EXISTS through      VARCHAR(200);
ALTER TABLE auditions ADD COLUMN IF NOT EXISTS through_kind VARCHAR(8);
ALTER TABLE auditions ADD COLUMN IF NOT EXISTS shoots       VARCHAR(300);
ALTER TABLE auditions ADD COLUMN IF NOT EXISTS after_notes  JSONB;
ALTER TABLE auditions ADD COLUMN IF NOT EXISTS assist       JSONB;

ALTER TABLE users ADD COLUMN IF NOT EXISTS leaving_from VARCHAR(300);
ALTER TABLE users ADD COLUMN IF NOT EXISTS travel_mode  VARCHAR(8);

-- Reading it back:
--   select count(*) filter (where assist is not null), count(*) filter (where after_notes is not null) from auditions;
