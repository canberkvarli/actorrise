-- The conversion funnel, one row per UTC day (docs/plans/conversion-phase1.md).
-- Additive: creates a view, alters no table.
--
-- security_invoker: a view in public is served by the Supabase API and by
-- default runs with its owner's rights, which would step around the RLS
-- lockdown of 2026-08-23. With it, anon and authenticated hit user_events'
-- own RLS and read nothing. The backend connects as the owner.
--
-- Distinct users throughout, staff dropped. price_seen folds in the two older
-- names so days before paywall_hit existed are not read as zero. paid folds in
-- trial_ended/converted before 2026-09-27 because user 2127 (2026-09-15) has
-- that row and no trial_converted; after that date only invoice.paid counts.
--
-- The money events start 2026-09-27 (31bfe793). A day before that shows
-- price_seen = 0 because nothing was counting, not because nobody saw a price.

create or replace view public.funnel_daily
with (security_invoker = true) as
select
  (e.created_at at time zone 'utc')::date as d,
  count(distinct e.user_id) filter (where e.event_name = 'signup_completed')       as signups,
  count(distinct e.user_id) filter (where e.event_name = 'onboarding_completed')   as onboarded,
  count(distinct e.user_id) filter (where e.event_name = 'first_search_submitted') as searched,
  count(distinct e.user_id) filter (where e.event_name = 'monologue_work_started') as working,
  count(distinct e.user_id) filter (
    where e.event_name in ('paywall_hit', 'upgrade_modal_viewed', 'trial_offer_shown')
  ) as price_seen,
  count(*) filter (where e.event_name = 'paywall_hit')                             as paywall_hits,
  count(distinct e.user_id) filter (where e.event_name = 'paywall_cta_clicked')    as cta_clicked,
  count(distinct e.user_id) filter (where e.event_name = 'checkout_started')       as checkouts,
  count(distinct e.user_id) filter (where e.event_name = 'checkout_completed')     as checkouts_done,
  count(distinct e.user_id) filter (where e.event_name = 'trial_started')          as trials,
  -- paid is invoice.paid (trial_converted). trial_ended/converted is trusted
  -- only before 2026-09-27, when trial_converted did not exist: after that it
  -- was written on `active`, before the card was tried, and on 2026-09-30 it
  -- counted a declined card as money.
  count(distinct e.user_id) filter (
    where e.event_name = 'trial_converted'
       or (e.event_name = 'trial_ended' and e.properties->>'outcome' = 'converted'
           and e.created_at < '2026-09-27')
  ) as paid
from public.user_events e
join public.users u on u.id = e.user_id
where coalesce(u.exclude_from_stats, false) = false
group by 1;

revoke all on public.funnel_daily from anon, authenticated;

-- Reading it back:
--   select * from funnel_daily order by d desc limit 7;
--
-- Which gates are doing the work:
--   select properties->>'gate' gate, properties->>'kind' kind,
--          count(*) hits, count(distinct user_id) users
--   from user_events
--   where event_name = 'paywall_hit' and created_at > now() - interval '7 days'
--   group by 1, 2 order by 3 desc;
