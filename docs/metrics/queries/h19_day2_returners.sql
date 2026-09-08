-- H-19: day-2 returners vs non-returners, fave/rehearse split. Run against prod.
with cohort as (
  select u.id, u.created_at
  from users u
  where u.created_at >= now() - interval '37 days' and u.created_at < now() - interval '7 days'
    and u.email not like '%@anon.actorrise.com' and u.email not like '%@actorrise.com'
    and coalesce(u.exclude_from_stats,false) = false
),
act as (
  select user_id, created_at from search_logs
  union all select user_id, created_at from monologue_views
  union all select user_id, started_at from rehearsal_sessions
),
flags as (
  select c.id,
    exists (select 1 from act a where a.user_id = c.id
              and a.created_at >= c.created_at + interval '24 hours'
              and a.created_at <  c.created_at + interval '30 days') as returned,
    exists (select 1 from monologue_favorites f where f.user_id = c.id and f.created_at < c.created_at + interval '24 hours') as fav_d1,
    exists (select 1 from rehearsal_sessions r where r.user_id = c.id and r.started_at < c.created_at + interval '24 hours') as reh_d1,
    exists (select 1 from search_logs s where s.user_id = c.id and s.created_at < c.created_at + interval '24 hours') as search_d1
  from cohort c
)
select returned, count(*) n,
  count(*) filter (where fav_d1) fav_d1,
  count(*) filter (where reh_d1) reh_d1,
  count(*) filter (where search_d1) search_d1,
  count(*) filter (where not fav_d1 and not reh_d1) neither_d1
from flags group by 1 order by 1;
