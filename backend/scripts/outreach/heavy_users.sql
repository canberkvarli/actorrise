-- The 30 free actors using ActorRise the most in the last 30 days.
-- For the founder email: "what would make you pay $12 for this?"
--
-- Score is saves + scene sessions + searches, all in the window. Free means no
-- active or trialing paid subscription. Staff, opted-out and do-not-contact
-- are dropped, and so is anyone a lifecycle email reached in the last 7 days:
-- a personal note the day after an automated one reads as a second automated one.
--
-- Read-only. Run through scripts/outreach/export.py, which writes the CSV.

with activity as (
  select
    u.id,
    (select count(*) from monologue_favorites f
      where f.user_id = u.id and f.removed_at is null
        and f.created_at > now() - interval '30 days')                       as saves,
    (select count(*) from rehearsal_sessions r
      where r.user_id = u.id and r.created_at > now() - interval '30 days')  as scenes,
    (select count(*) from rehearsal_sessions r
      where r.user_id = u.id and r.status = 'completed'
        and r.created_at > now() - interval '30 days')                       as scenes_finished,
    (select count(*) from search_logs s
      where s.user_id = u.id and s.source = 'search' and coalesce(s.page, 1) = 1
        and s.created_at > now() - interval '30 days')                       as searches,
    (select s.query from search_logs s
      where s.user_id = u.id and s.source = 'search'
      order by s.created_at desc limit 1)                                    as last_search
  from users u
  where coalesce(u.exclude_from_stats, false) = false
    and u.marketing_opt_in is true
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
)
select
  u.id                                  as user_id,
  u.email,
  coalesce(u.name, '')                  as name,
  u.created_at::date                    as signed_up,
  a.saves + a.scenes + a.searches       as score,
  concat_ws(', ',
    nullif(a.searches, 0) || ' searches',
    nullif(a.saves, 0) || ' saved',
    nullif(a.scenes, 0) || ' scenes (' || a.scenes_finished || ' finished)',
    'last searched "' || left(a.last_search, 60) || '"'
  )                                     as activity
from activity a
join users u on u.id = a.id
where a.saves + a.scenes + a.searches > 0
order by score desc, u.created_at desc
limit 30;
