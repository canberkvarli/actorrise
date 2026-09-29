"""The daily read on the money path, as markdown.

  cd backend
  uv run python scripts/conversion_brief.py                 # to stdout
  uv run python scripts/conversion_brief.py --save          # to <repo>/outputs/conversion/YYYY-MM-DD.md

Five things, in the order they are acted on:

  1. The funnel, this week against last
  2. Who was stopped by a wall in the last two days and did not start a checkout
     (the server emails these a day later; listed so Canberk can see them)
  3. Who is inside a Stripe trial, and whether they are using it
  4. What the emails did
  5. Five people worth writing to by hand

Reads only: every query runs in a read-only transaction, and the script checks that
it is before it asks for anything. The output carries names and
email addresses, which is why outputs/conversion/ is in .gitignore. Nothing
here sends anything. It is the input to /conversion-loop, which drafts.
"""

import argparse
import os
import re
import sys
from datetime import date
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

try:
    from dotenv import load_dotenv

    load_dotenv(backend_dir / ".env")
    load_dotenv()
except ImportError:
    pass

REAL = "coalesce(u.exclude_from_stats, false) = false"
PAID = """exists (select 1 from user_subscriptions s join pricing_tiers t on t.id = s.tier_id
          where s.user_id = u.id and s.status in ('active', 'trialing') and t.name <> 'free')"""
REACHABLE = f"""{REAL} and u.marketing_opt_in is true and u.email is not null
  and u.email not like '%@anon.actorrise.com' and u.email not like '%@actorrise.com'
  and u.email not like '%@privaterelay.appleid.com'
  and not exists (select 1 from email_do_not_contact d where lower(d.email) = lower(u.email))"""
# A wall, under either name. upgrade_modal_viewed was only ever sent by walls.
WALL = """(e.event_name = 'upgrade_modal_viewed'
           or (e.event_name = 'paywall_hit' and e.properties->>'kind' = 'wall'))"""
ACTIVITY = """concat_ws(', ',
    nullif((select count(*) from monologue_favorites f
            where f.user_id = u.id and f.removed_at is null), 0) || ' saved',
    nullif((select count(distinct v.monologue_id) from monologue_views v
            where v.user_id = u.id and v.created_at > now() - interval '30 days'), 0) || ' read this month',
    nullif((select count(*) from rehearsal_sessions r
            where r.user_id = u.id and r.status = 'completed'), 0) || ' scenes finished',
    'last searched "' || left((select s.query from search_logs s
            where s.user_id = u.id and s.source = 'search'
            order by s.created_at desc limit 1), 50) || '"')"""

FUNNEL = f"""
select
  count(distinct e.user_id) filter (where e.event_name = 'signup_completed'),
  count(distinct e.user_id) filter (where e.event_name = 'onboarding_completed'),
  count(distinct e.user_id) filter (where e.event_name = 'first_search_submitted'),
  count(distinct e.user_id) filter (where e.event_name = 'monologue_work_started'),
  count(distinct e.user_id) filter (
    where e.event_name in ('paywall_hit', 'upgrade_modal_viewed', 'trial_offer_shown')),
  count(distinct e.user_id) filter (where e.event_name = 'paywall_cta_clicked'),
  count(distinct e.user_id) filter (where e.event_name = 'checkout_started'),
  count(distinct e.user_id) filter (where e.event_name = 'trial_started'),
  count(distinct e.user_id) filter (
    where e.event_name = 'trial_converted'
       or (e.event_name = 'trial_ended' and e.properties->>'outcome' = 'converted'))
from user_events e join users u on u.id = e.user_id
where {REAL} and e.created_at > now() - make_interval(days => :older)
  and e.created_at <= now() - make_interval(days => :newer)
"""
FUNNEL_ROWS = (
    "signed up", "onboarded", "searched", "worked a monologue", "saw a price",
    "clicked a price", "started checkout", "started a trial", "paid",
)

GATES = f"""
select coalesce(e.properties->>'gate', e.properties->>'feature', e.properties->>'trigger') gate,
       case when {WALL} then 'wall' else 'ask' end kind,
       count(distinct e.user_id) users, count(*) shows
from user_events e join users u on u.id = e.user_id
where {REAL} and e.created_at > now() - interval '7 days'
  and e.event_name in ('paywall_hit', 'upgrade_modal_viewed', 'trial_offer_shown')
  -- paywall_hit rides alongside the two older names from 2026-09-29 on; count
  -- each show once by preferring it wherever it exists.
  and (e.event_name = 'paywall_hit' or not exists (
        select 1 from user_events p where p.user_id = e.user_id and p.event_name = 'paywall_hit'
          and p.created_at between e.created_at - interval '5 seconds'
                               and e.created_at + interval '5 seconds'))
group by 1, 2 order by 3 desc, 4 desc
"""

WALKED_AWAY = f"""
with hit as (
  select e.user_id, min(e.created_at) at,
         (array_agg(coalesce(e.properties->>'gate', e.properties->>'feature')
                    order by e.created_at))[1] gate
  from user_events e
  where {WALL} and e.created_at > now() - make_interval(days => :days)
  group by 1)
select coalesce(u.name, ''), u.email, u.created_at::date, h.gate, h.at::date, {ACTIVITY},
       exists (select 1 from lifecycle_email_sends l
               where l.user_id = u.id and l.sent_at > now() - interval '7 days') emailed
from hit h join users u on u.id = h.user_id
where {REACHABLE} and not {PAID}
  and not exists (select 1 from user_events c where c.user_id = u.id
                  and c.event_name = 'checkout_started' and c.created_at >= h.at)
order by (select count(*) from monologue_favorites f where f.user_id = u.id and f.removed_at is null)
       + (select count(*) from search_logs s where s.user_id = u.id
          and s.created_at > now() - interval '30 days') desc
limit :limit
"""

# Who to write to by hand. NOT the people a wall stopped: those belong to the
# automated email (paywall_seen_no_trial, a day after the wall), and on the
# first real run every one of the five drawn from that pool was already owed
# it. A note from the founder an hour before an automated one from "the
# founder" is the same person writing twice. These are the most active free
# actors that nothing automated is about to reach.
WORTH = f"""
select coalesce(u.name, ''), u.email, u.created_at::date, {ACTIVITY},
       (select count(*) from monologue_favorites f where f.user_id = u.id
          and f.removed_at is null and f.created_at > now() - interval '7 days')
     + (select count(*) from search_logs s where s.user_id = u.id and s.source = 'search'
          and coalesce(s.page, 1) = 1 and s.created_at > now() - interval '7 days')
     + (select count(*) from rehearsal_sessions r where r.user_id = u.id
          and r.created_at > now() - interval '7 days') as week
from users u
where {REACHABLE} and not {PAID}
  -- Students come through their teacher (CLAUDE.md). On the first run one of
  -- the five was a student looking for pieces for a thirteen year old.
  and coalesce(u.account_type, '') <> 'student'
  and not exists (select 1 from lifecycle_email_sends l
                  where l.user_id = u.id and l.sent_at > now() - interval '7 days')
  and not exists (select 1 from user_events e where e.user_id = u.id and {WALL}
                  and e.created_at > now() - interval '5 days')
order by week desc, u.created_at desc
limit 5
"""

TRIALS = f"""
select coalesce(u.name, ''), u.email, s.trial_end::date,
       greatest(0, ceil(extract(epoch from (s.trial_end - now())) / 86400))::int days_left,
       (select count(*) from rehearsal_sessions r where r.user_id = u.id
          and r.created_at > coalesce(s.created_at, now() - interval '30 days')) scenes_since,
       (select count(*) from user_events w where w.user_id = u.id
          and w.event_name = 'monologue_work_started'
          and w.created_at > coalesce(s.created_at, now() - interval '30 days')) runs_since
from user_subscriptions s join users u on u.id = s.user_id
where {REAL} and s.status = 'trialing' and s.stripe_subscription_id is not null
order by s.trial_end
"""

EMAILS = """
select l.touch, count(*) sent,
       (select count(distinct c.user_id) from user_events c
        where c.event_name = 'email_clicked' and c.properties->>'touch' = l.touch
          and c.created_at > now() - interval '7 days') clicked
from lifecycle_email_sends l
where l.sent_at > now() - interval '7 days'
group by 1 order by 2 desc
"""


def table(head: tuple[str, ...], rows: list[tuple]) -> str:
    if not rows:
        return "_nobody_\n"
    out = ["| " + " | ".join(head) + " |", "|" + "---|" * len(head)]
    out += ["| " + " | ".join("" if c is None else str(c) for c in r) + " |" for r in rows]
    return "\n".join(out) + "\n"


def change(now: int, before: int) -> str:
    if before == 0:
        return "new" if now else ""
    return f"{(now - before) / before:+.0%}"


def build(conn) -> str:
    from sqlalchemy import text

    def q(sql, **params):
        return [tuple(r) for r in conn.execute(text(sql), params).fetchall()]

    this_week = q(FUNNEL, older=7, newer=0)[0]
    last_week = q(FUNNEL, older=14, newer=7)[0]
    funnel = [
        (name, now, before, change(now, before))
        for name, now, before in zip(FUNNEL_ROWS, this_week, last_week)
    ]

    walked = q(WALKED_AWAY, days=2, limit=25)
    worth = [r for r in q(WORTH) if r[4] > 0]

    parts = [
        f"# Conversion brief, {date.today():%Y-%m-%d}\n",
        "## 1. The funnel: last 7 days against the 7 before\n",
        "Distinct real users. The money events only exist from 2026-09-27, so a",
        "`before` of 0 on those rows up to 2026-10-11 means nothing was counting.\n",
        table(("step", "last 7 days", "7 before", "change"), funnel),
        "### Which gates showed a price\n",
        table(("gate", "kind", "users", "shows"), q(GATES)),
        "## 2. Stopped by a wall in the last 2 days, no checkout since\n",
        table(
            ("name", "email", "signed up", "gate", "when", "what they've done"),
            [r[:6] for r in walked],
        ),
        "## 3. Inside a Stripe trial\n",
        table(
            ("name", "email", "trial ends", "days left", "scenes since", "monologue runs since"),
            q(TRIALS),
        ),
        "## 4. Emails, last 7 days\n",
        table(("touch", "sent", "clicked"), q(EMAILS)),
        "## 5. Write to these five\n",
        "The most active free actors this week that nothing automated is about to",
        "reach: no wall in the last 5 days (that email is the server's), no email",
        "from either lifecycle job in 7.\n",
        table(
            ("name", "email", "signed up", "what they've done", "actions this week"),
            worth,
        ),
    ]
    return "\n".join(parts)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--save", action="store_true", help="write to outputs/conversion/ instead of stdout")
    args = ap.parse_args()

    from sqlalchemy import create_engine

    # Read-only, and actually so. The database is reached through Supabase's
    # pooler (port 6543), which throws away startup options: passing
    # "-c default_transaction_read_only=on" connects without complaint and
    # leaves the session writable. Found 2026-09-29 by asking the server
    # (`show transaction_read_only` said off). postgresql_readonly is set on the
    # transaction itself, and a write is refused.
    engine = create_engine(os.environ["DATABASE_URL"])
    with engine.connect().execution_options(postgresql_readonly=True) as conn:
        from sqlalchemy import text

        if conn.execute(text("show transaction_read_only")).scalar() != "on":
            raise SystemExit("refusing to run: the connection is not read-only")
        brief = build(conn)

    if not args.save:
        print(brief)
        return
    out_dir = backend_dir.parent / "outputs" / "conversion"
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{date.today():%Y-%m-%d}.md"
    path.write_text(brief, encoding="utf-8")
    # Counts only on the terminal; the people are in the file.
    print(f"saved {path}")
    for line in re.findall(r"^\| (?:saw a price|started checkout|started a trial|paid) \|.*$", brief, re.M):
        print(line)


if __name__ == "__main__":
    main()
