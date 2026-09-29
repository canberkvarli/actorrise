-- 30 actors who finished onboarding, looked around, and never came back.
-- For the founder email: "what were you looking for that you didn't find?"
--
-- Signed up 7 to 30 days ago, completed onboarding, and nothing after their
-- first day: no search, no piece opened, no scene.
--
-- day10 already asks this population nearly the same question, and on
-- 2026-09-29 it had reached 183 of the 202 people this query finds. So the
-- list leads with those day10 has NOT reached, and `had_day10` is a column.
-- Writing by hand to someone day10 already asked is asking twice.
--
-- Within each group the order is by what they did on day one. The actor who
-- ran four searches and left was looking for something in particular.
--
-- Read-only. Run through scripts/outreach/export.py, which writes the CSV.

with day_one as (
  select
    u.id,
    (select count(*) from search_logs s
      where s.user_id = u.id and s.source = 'search' and coalesce(s.page, 1) = 1
        and s.created_at <= u.created_at + interval '1 day')  as searches,
    (select count(distinct v.monologue_id) from monologue_views v
      where v.user_id = u.id
        and v.created_at <= u.created_at + interval '1 day')  as opened,
    (select count(*) from monologue_favorites f
      where f.user_id = u.id and f.removed_at is null)        as saved,
    (select s.query from search_logs s
      where s.user_id = u.id and s.source = 'search'
      order by s.created_at desc limit 1)                     as last_search,
    exists (select 1 from lifecycle_email_sends l
      where l.user_id = u.id and l.touch = 'day10')           as had_day10
  from users u
  where coalesce(u.exclude_from_stats, false) = false
    and u.marketing_opt_in is true
    and u.has_completed_profile_onboarding is true
    and u.created_at between now() - interval '30 days' and now() - interval '7 days'
    and u.email is not null
    and u.email not like '%@anon.actorrise.com'
    and u.email not like '%@actorrise.com'
    and u.email not like '%@privaterelay.appleid.com'
    and not exists (
      select 1 from email_do_not_contact d where lower(d.email) = lower(u.email))
    and not exists (
      select 1 from user_subscriptions s
      join pricing_tiers t on t.id = s.tier_id
      where s.user_id = u.id and s.status in ('active', 'trialing') and t.name <> 'free')
    and not exists (
      select 1 from lifecycle_email_sends l
      where l.user_id = u.id and l.sent_at > now() - interval '7 days')
    and not exists (
      select 1 from search_logs s
      where s.user_id = u.id and s.created_at > u.created_at + interval '1 day')
    and not exists (
      select 1 from monologue_views v
      where v.user_id = u.id and v.created_at > u.created_at + interval '1 day')
    and not exists (
      select 1 from rehearsal_sessions r
      where r.user_id = u.id and r.created_at > u.created_at + interval '1 day')
)
select
  u.id                     as user_id,
  u.email,
  coalesce(u.name, '')     as name,
  u.created_at::date       as signed_up,
  d.had_day10,
  concat_ws(', ',
    nullif(d.searches, 0) || ' searches on day one',
    nullif(d.opened, 0) || ' opened',
    nullif(d.saved, 0) || ' saved',
    'last searched "' || left(d.last_search, 60) || '"'
  )                        as activity
from day_one d
join users u on u.id = d.id
order by d.had_day10 asc, d.searches + d.opened desc, u.created_at desc
limit 30;
