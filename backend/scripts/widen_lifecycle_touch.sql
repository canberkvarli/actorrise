-- lifecycle_email_sends.touch: varchar(16) -> varchar(32).
--
-- The triggered touches (backend/app/services/email/triggered.py) do not fit:
--   checkout_abandoned      18
--   trial_ended_no_pay      18
--   paywall_seen_no_trial   21
--
-- Widening a varchar is a catalog change in Postgres: no table rewrite, no
-- lock worth the name on a table of ~700 rows. Existing rows are untouched.
--
-- APPLY BEFORE the code that sends them deploys. Until it is applied a claim
-- for one of these touches fails on insert, the send is skipped, and nothing
-- goes out. That is the safe direction, but it is silent.

alter table public.lifecycle_email_sends alter column touch type varchar(32);

-- Reading it back:
--   select character_maximum_length from information_schema.columns
--   where table_name = 'lifecycle_email_sends' and column_name = 'touch';   -- 32
