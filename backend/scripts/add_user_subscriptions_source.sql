-- user_subscriptions.source: stripe | manual | revenuecat (app/models/billing.py).
-- Applied to prod 2026-09-08. Additive, plus the one backfill that was asked
-- for: the 13 comp grants made by hand on 2026-09-04 between 19:23 and 19:40
-- UTC (ids 41-53), so snapshot queries can exclude them from subs_active.
-- Older comps keep NULL; stripe_subscription_id IS NULL still identifies them.

ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS source VARCHAR(16);

UPDATE user_subscriptions
   SET source = 'manual'
 WHERE source IS NULL
   AND stripe_subscription_id IS NULL
   AND status = 'trialing'
   AND created_at >= '2026-09-04 19:23:00+00'
   AND created_at <  '2026-09-04 19:41:00+00';

-- Snapshot line, subs_active:
--   select count(*) from user_subscriptions
--    where status in ('active','trialing')
--      and (source is null or source <> 'manual')
--      and (trial_end is null or trial_end > now());
