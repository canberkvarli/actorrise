"""The daily read on the money path, as markdown.

  cd backend
  uv run python scripts/conversion_brief.py                 # to stdout
  uv run python scripts/conversion_brief.py --save          # to <repo>/outputs/conversion/YYYY-MM-DD.md

The sections, in the order they are acted on (9 is what free people use, 30 days):

  1. The funnel, this week against last
  2. Who was stopped by a wall in the last two days and did not start a checkout
     (the server emails these a day later; listed so Canberk can see them)
  3. Who is inside a Stripe trial, and whether they are using it
  4. What the emails did
  5. Five people worth writing to by hand

Reads only: every query runs in a read-only transaction, and the script checks that
it is before it asks for anything. The output carries names and
email addresses, which is why outputs/conversion/ is in .gitignore. Nothing
here sends anything. It is the input to /checkup, which drafts.
"""

import argparse
import os
import re
import sys
from datetime import date, timedelta
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
# A save the actor chose. The onboarding payoff saves its whole shelf in one
# burst right after signup (ProfileOnboardingFlow: api.post favorite per pick),
# so every day-one account showed "6 saved" and the note nearly said "you
# saved six pieces" to someone who tapped one button (2026-10-03). Fifteen
# minutes after signup is past the wizard for everyone; the first search
# comes after it anyway.
CHOSEN_SAVE = """f.user_id = u.id and f.removed_at is null
            and f.created_at > u.created_at + interval '15 minutes'"""
# A v2 run that is FINISHED: reached the end and spoken, the rule in
# app/services/rehearsal/spoken.py (at least half the actor's lines heard: not
# skipped, not deaf, score above 0). In SQL here because ACTIVITY is per row of
# a bigger query; the guided section below goes through the service itself.
SPOKEN_RUN = """exists (select 1 from rehearsal_events c where c.run_id = rr.id and c.type = 'completed')
  and 2 * (select count(distinct a.line_index) from rehearsal_events a
           where a.run_id = rr.id and a.type = 'actor_line_read'
             and coalesce(a.payload->>'ended_by', '') <> 'skipped'
             and coalesce(a.payload->>'deaf', '') <> 'true'
             and case when a.payload->>'score' ~ '^[0-9]*[.]?[0-9]+([eE][-+]?[0-9]+)?$'
                      then (a.payload->>'score')::float else 0 end > 0)
      >= (select count(*) from scene_lines sl where sl.scene_id = rr.scene_id
          and lower(trim(sl.character_name)) = lower(trim(rr.character)))
  and exists (select 1 from scene_lines sl where sl.scene_id = rr.scene_id
              and lower(trim(sl.character_name)) = lower(trim(rr.character)))"""

ACTIVITY = f"""concat_ws(', ',
    nullif((select count(*) from monologue_favorites f
            where {CHOSEN_SAVE}), 0) || ' saved',
    nullif((select count(distinct v.monologue_id) from monologue_views v
            where v.user_id = u.id and v.created_at > now() - interval '30 days'), 0) || ' read this month',
    nullif((select count(*) from rehearsal_sessions r
            where r.user_id = u.id and r.status = 'completed')
         + (select count(*) from rehearsal_runs rr where rr.user_id = u.id and {SPOKEN_RUN}), 0) || ' scenes finished',
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
  -- paid is invoice.paid (trial_converted). trial_ended/converted is only
  -- trusted before 2026-09-27, when trial_converted did not exist yet: after
  -- that it was written on `active`, before the card was tried, and on
  -- 2026-09-30 it counted a declined card as money.
  count(distinct e.user_id) filter (
    where e.event_name = 'trial_converted'
       or (e.event_name = 'trial_ended' and e.properties->>'outcome' = 'converted'
           and e.created_at < '2026-09-27'))
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
order by (select count(*) from monologue_favorites f where {CHOSEN_SAVE})
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
       (select count(*) from monologue_favorites f where {CHOSEN_SAVE}
          and f.created_at > now() - interval '7 days')
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
  -- Hand-written notes go out through Gmail, which the database never sees.
  -- outputs/conversion/written.txt is the loop's own record of who it drafted
  -- to; without it the same three names came back the day after they were sent.
  and lower(u.email) not in :written
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


# The Ghost Light iOS app, which bills through Apple and never touches Stripe.
# Three sources: app_store_daily (App Store Connect: who saw the listing and
# installed, synced daily at 16:00 UTC, about a day behind), monologue_views
# with client = 'ghostlight' (what people actually read in the app; the only
# in-app action the server records by client), and RevenueCat (who pays, via
# the webhook, recorded from 2026-10-06). Anonymous app users carry an
# anon+...@anon.actorrise.com address and can never be emailed.
APP_STORE_DAYS = """
select day, impressions, page_views, downloads, redownloads, iap_units, proceeds_usd
from app_store_daily where day >= current_date - 14 order by day
"""

ASC_LAST_SYNC = "select value from app_settings where key = 'asc_last_sync'"

APP_READS = """
select count(*) filter (where created_at > now() - interval '7 days'),
       count(distinct user_id) filter (where created_at > now() - interval '7 days'),
       count(*) filter (where created_at <= now() - interval '7 days'),
       count(distinct user_id) filter (where created_at <= now() - interval '7 days')
from monologue_views where client = 'ghostlight' and created_at > now() - interval '14 days'
"""

APP_READERS = f"""
select case when u.email like 'anon+%' then '(anonymous)' else coalesce(nullif(u.name, ''), '') end,
       case when u.email like 'anon+%' then '' else u.email end,
       u.created_at::date,
       count(*) reads, count(distinct mv.monologue_id) pieces, max(mv.created_at)::date,
       (select count(*) from monologue_views w where w.user_id = u.id and w.client = 'web'
          and w.created_at > now() - interval '7 days'),
       coalesce((select t.name from user_subscriptions s join pricing_tiers t on t.id = s.tier_id
                 where s.user_id = u.id and s.status in ('active', 'trialing')
                 order by s.updated_at desc limit 1), 'free'),
       (select string_agg(distinct coalesce(p.title, m.title), ', ')
          from monologue_views w join monologues m on m.id = w.monologue_id
          left join plays p on p.id = m.play_id
          where w.user_id = u.id and w.client = 'ghostlight' and w.created_at > now() - interval '7 days')
from monologue_views mv join users u on u.id = mv.user_id
where mv.client = 'ghostlight' and mv.created_at > now() - interval '7 days' and {REAL}
group by u.id order by reads desc limit 10
"""

APP_SUBS = """
select s.status, coalesce(s.billing_period, ''), count(*)
from user_subscriptions s where s.source = 'revenuecat' group by 1, 2 order by 1, 2
"""

APP_EVENTS = """
select e.created_at::date, e.properties->>'type', e.properties->>'product_id', e.properties->>'period_type',
       case when u.email like 'anon+%' then '(anonymous)' else coalesce(nullif(u.name, ''), u.email) end
from user_events e join users u on u.id = e.user_id
where e.event_name = 'app_subscription_event'
  and coalesce(e.properties->>'environment', '') <> 'SANDBOX'
  and e.created_at > now() - interval '7 days'
order by e.created_at desc
"""


# Turkish actors (Canberk, 2026-11-25: "add turkish users to the conversion, i
# wanna see it in my daily log"). Two signals: an event sent from the Turkish UI
# (record_user_event writes ui_language "tr", from 2026-11-25 on), or a script
# they uploaded in Turkish (the Play hook marks it). Last 7 days, real users.
TURKISH_PEOPLE = f"""
with tr as (
  select e.user_id from user_events e
  where e.properties->>'ui_language' = 'tr' and e.created_at > now() - interval '7 days'
  union
  select us.user_id from user_scripts us
  join scenes sc on sc.user_script_id = us.id join plays p on p.id = sc.play_id
  where p.language = 'tr' and us.user_id is not null
    and us.created_at > now() - interval '7 days')
select coalesce(u.name, ''), u.email, u.created_at::date,
       (select count(*) from user_events e where e.user_id = u.id
          and e.created_at > now() - interval '7 days') events_7d,
       (select count(distinct us.id) from user_scripts us
          join scenes sc on sc.user_script_id = us.id join plays p on p.id = sc.play_id
          where us.user_id = u.id and p.language = 'tr') turkish_uploads,
       exists (select 1 from user_events e where e.user_id = u.id
          and e.event_name in ('paywall_hit', 'upgrade_modal_viewed', 'trial_offer_shown')
          and e.created_at > now() - interval '7 days') saw_price,
       exists (select 1 from user_events e where e.user_id = u.id
          and e.event_name = 'checkout_started'
          and e.created_at > now() - interval '7 days') checkout,
       {PAID} paying
from (select distinct user_id from tr) t join users u on u.id = t.user_id
where {REAL}
order by events_7d desc
"""

# The audition tracker (services/auditions), moderators only while Canberk
# tries it (2026-10-08), so for now these rows are his own. Staff is counted
# separately rather than hidden, so the section is not blank until launch.
AUDITIONS = """
select coalesce(u.exclude_from_stats, false) staff,
       count(*) filter (where a.created_at > now() - interval '7 days'),
       count(*) filter (where a.created_at <= now() - interval '7 days' and a.created_at > now() - interval '14 days'),
       count(*) filter (where a.status = 'scheduled'),
       count(distinct a.user_id)
from auditions a join users u on u.id = a.user_id
where a.deleted_at is null group by 1 order by 1
"""

AUDITIONS_UPCOMING = """
select coalesce(nullif(u.name, ''), u.email), a.project, coalesce(a.role, ''), a.kind,
       coalesce(a.starts_at, a.due_at)::date, a.source,
       exists (select 1 from audition_pieces x where x.audition_id = a.id) has_piece
from auditions a join users u on u.id = a.user_id
where a.deleted_at is null and coalesce(a.starts_at, a.due_at) between now() and now() + interval '7 days'
order by 5 limit 10
"""

AUDITION_EVENTS = """
select e.event_name, count(*), count(distinct e.user_id)
from user_events e where e.event_name like 'audition_%' and e.created_at > now() - interval '7 days'
group by 1 order by 2 desc
"""


# What people told the site, the same rows the admin feedback inbox, requests
# queue and search log show (Canberk, 2026-10-22: "put in daily, we gotta tend
# to the app and improve in any way we can"). Two days so a missed run still
# overlaps. Staff are left out; an anonymous row is a reader with no account.
FEEDBACK = """
select f.created_at::date, f.context, f.rating, coalesce(f.comment, ''),
       coalesce(u.email, '(no account)')
from result_feedback f left join users u on u.id = f.user_id
where f.created_at > now() - interval '2 days'
  and not coalesce(u.exclude_from_stats, false)
order by f.created_at
"""

CONTENT_REQUESTS = """
select last_requested_at::date, play_title, coalesce(author, ''), coalesce(character_name, ''),
       request_count, status
from content_requests where last_requested_at > now() - interval '2 days'
order by last_requested_at
"""

# Weak includes searches that recovered through available_in, so a row here is
# "worth a look", never "not in the library": that claim needs the three-place
# check (plays.title, monologues.title, character_name).
FAILED_SEARCHES = """
select left(lower(s.query), 90), count(*), count(distinct s.user_id), min(s.results_count)
from search_logs s left join users u on u.id = s.user_id
where s.created_at > now() - interval '2 days'
  and (s.weak_match or s.results_count = 0)
  and not coalesce(u.exclude_from_stats, false)
group by 1 order by 2 desc, 3 desc limit 15
"""

SEARCH_TOTALS = """
select count(*), count(*) filter (where s.weak_match or s.results_count = 0)
from search_logs s left join users u on u.id = s.user_id
where s.created_at > now() - interval '2 days'
  and not coalesce(u.exclude_from_stats, false)
"""


# Where the library is thin, 30 days (Canberk, 2026-10-22: "keep track of where
# we lack in sources, is it teens? contemporary? so we can focus on scraping
# those"). A kind of piece is a keyword match on the query, or the filter that
# says the same thing; a search can be several kinds. The weak rate against the
# overall rate is the signal: a kind well above it is where to add pieces.
# Titles searched that are in no tab at all come from content_gap (a jsonb
# 'null' there is not SQL NULL, hence the ->> test).
GAP_SEARCHES = """
select lower(s.query), s.filters_used, (s.weak_match or s.results_count = 0), s.user_id
from search_logs s left join users u on u.id = s.user_id
where s.created_at > now() - interval '30 days' and not coalesce(u.exclude_from_stats, false)
  and coalesce(s.page, 1) = 1 and s.source = 'search'
"""

ABSENT_TITLES = """
select min(s.content_gap->>'play'), count(*), count(distinct s.user_id), max(s.created_at)::date,
       bool_or(coalesce((s.content_gap->>'carried_but_empty')::boolean, false))
from search_logs s left join users u on u.id = s.user_id
where s.created_at > now() - interval '30 days' and not coalesce(u.exclude_from_stats, false)
  and (s.weak_match or s.results_count = 0)
  and s.content_gap->>'play' is not null
  and jsonb_array_length(coalesce(s.content_gap->'available_in', '[]'::jsonb)) = 0
group by lower(s.content_gap->>'play') order by 3 desc, 2 desc limit 20
"""


def recheck_absent(rows: list[tuple], carried_now) -> tuple[list[tuple], list[str]]:
    """Split the logged gaps into still absent and carried today.

    content_gap is what the search said at the time, kept for 30 days, so a
    title the search has since learned to find stays on the list for a month:
    "harry potter" was logged as a gap on Oct 5 and Oct 27, the prefix match
    that finds its eight film pieces shipped Oct 30, and the brief still said
    it was in no tab on Nov 3. carried_now(title) is today's answer, the
    source_types the title is carried under (empty when it is not).
    """
    absent, found = [], []
    for title, searches, people, last, empty_shell in rows:
        tabs = carried_now(title)
        if tabs:
            found.append(f"{title} ({', '.join(tabs)})")
        else:
            absent.append((title, searches, people, last, "listed, no pieces" if empty_shell else ""))
    return absent[:12], found


def recheck_weak(rows: list[tuple], finds_now) -> list[tuple]:
    """Add what today's search makes of each weak query: the show or character it
    now routes to, or blank. "shiv roy" was weak on Nov 1 and routes to Shiv's
    Succession pieces since Nov 2; without this the brief reads as a gap."""
    return [tuple(r) + (finds_now(r[0]) or "",) for r in rows]


def _carried_now(conn):
    from app.services.search.title_lookup import find_catalogue_source_types

    def check(title: str) -> list[str]:
        try:
            return find_catalogue_source_types(conn, title)
        except Exception:  # noqa: BLE001 - the brief must still print
            return []
    return check


def _finds_now(conn):
    from app.services.search.title_lookup import (detect_catalogue_character,
                                                  detect_catalogue_title)

    def check(query: str) -> str:
        try:
            hit = detect_catalogue_title(conn, query)
            if hit:
                return hit["title"]
            ch = detect_catalogue_character(conn, query)
            if ch:
                return f"character {ch['character']}"
        except Exception:  # noqa: BLE001
            pass
        return ""
    return check


GAP_KINDS = {
    "teens / high school": (r"\bteen|high ?school|highschool|\b1[2-8]\b|young|\bkids?\b|child|middle school|tween",
                            lambda f: f.get("age_range") == "teens"),
    "contemporary / modern": (r"contemporary|modern|recent|\bnew\b|current|today",
                              lambda f: f.get("category") == "contemporary"),
    "comedy": (r"comed|funny|humou?r|comic|witty|sarcas", lambda f: f.get("tone") == "comedic"),
    "musical theatre": (r"musical|muscial|broadway|\bsong", None),
    "villain": (r"villa?i|evil|antagonist|menac|psycho", None),
    "grief / loss": (r"grie|\bloss\b|death|dying|cancer|mourn", None),
    "angry / intense": (r"ang(ry|er)|rage|intense|furious", None),
    "romance": (r"roman|\blove\b|crush|heartbreak", None),
    "audition brief (school, 1 min)": (r"\b1 ?min|one minute|tisch|college|bfa|conservator|juilliard", None),
    "classical / Shakespeare": (r"shakespear|greek|classical|restoration|chekhov|ibsen", None),
}


def gap_rows(searches: list[tuple]) -> tuple[str, list[tuple]]:
    """Each kind of piece: weak searches, all searches, weak rate, people who
    got a weak one. Plus two pairs that came up together (contemporary comedy,
    contemporary teens), since that is how actors actually ask."""
    from collections import defaultdict

    tot, weak, ppl = defaultdict(int), defaultdict(int), defaultdict(set)
    for q, f, w, uid in searches:
        f = f if isinstance(f, dict) else {}
        hit = {name for name, (rx, ft) in GAP_KINDS.items() if re.search(rx, q) or (ft and ft(f))}
        if {"contemporary / modern", "comedy"} <= hit:
            hit.add("contemporary + comedy")
        if {"contemporary / modern", "teens / high school"} <= hit:
            hit.add("contemporary + teens")
        for name in hit:
            tot[name] += 1
            if w:
                weak[name] += 1
                ppl[name].add(uid)
    all_weak = sum(1 for r in searches if r[2])
    overall = f"{all_weak} of {len(searches)} searches were weak or empty ({all_weak / max(1, len(searches)):.0%})."
    rows = [(n, weak[n], tot[n], f"{weak[n] / tot[n]:.0%}", len(ppl[n]))
            for n in sorted(tot, key=lambda n: (-len(ppl[n]), -weak[n]))]
    return overall, rows


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


WRITTEN = backend_dir.parent / "outputs" / "conversion" / "written.txt"


def written_to(conn=None) -> list[str]:
    """Addresses already written to: written.txt when this machine has it (one per
    line, anything after a # is a comment), plus every address in the
    contact_log table, which is the record a cloud session can see too. The
    brief leaves them out of section 5. Returns a placeholder when there are
    none, since `not in ()` is not SQL."""
    addrs = set()
    if WRITTEN.exists():
        for line in WRITTEN.read_text().splitlines():
            addr = line.split("#", 1)[0].strip().lower()
            if "@" in addr:
                addrs.add(addr)
    if conn is not None:
        from sqlalchemy import text
        try:
            addrs |= {r[0] for r in conn.execute(text(
                "SELECT DISTINCT lower(address) FROM contact_log WHERE address LIKE '%@%'"))}
        except Exception:  # noqa: BLE001 — table not created yet
            conn.rollback()
    return sorted(addrs) or ["nobody@nowhere"]


def guided_section(conn) -> str:
    """By scene and part, counting people (app/services/rehearsal/guided_report)."""
    from datetime import datetime, timezone

    from sqlalchemy.orm import Session

    from app.services.rehearsal.guided_report import as_table, breakdown

    since = datetime.now(timezone.utc) - timedelta(days=14)
    return as_table(breakdown(Session(bind=conn), since))


# What free people use, 30 days (Canberk, 2026-11-28: "make sure we are taking that
# into account, that's the most important thing"). The admin pages (searches,
# sessions, auditions, Cue) one row per feature: how many free people used it,
# how much, and whether a wall ever met them. A feature used a lot by people no
# wall reaches is free value standing between them and paying; a wall that meets
# many and turns none is in the wrong place. "Free" is who has no Plus today
# (a comp, a taste or a trial counts as Plus). A web open is a monologue_views
# row: the detail page opened, which the read wall may then cover. The app's own
# walls go to PostHog, not here: scripts/posthog_report.py.
USAGE_DAYS = 30
USAGE_FEATURES = (
    ("search", "select user_id u, created_at t from search_logs where user_id is not null"),
    ("monologue opened, web", "select user_id u, created_at t from monologue_views where user_id is not null and client = 'web'"),
    ("monologue opened, app", "select user_id u, created_at t from monologue_views where user_id is not null and client = 'ghostlight'"),
    ("monologue rehearsal", "select user_id u, created_at t from user_events where event_name = 'monologue_work_started'"),
    ("guided first scene", "select user_id u, started_at t from rehearsal_runs where is_guided"),
    ("scene, own script", "select user_id u, started_at t from rehearsal_runs where not is_guided"),
    ("save", "select user_id u, created_at t from monologue_favorites"),
    ("script upload", "select user_id u, created_at t from user_scripts where not coalesce(is_sample, false)"),
    ("audition added", "select user_id u, created_at t from auditions"),
    ("Cue conversation", "select user_id u, started_at t from cue_conversations"),
    ("self-tape", "select user_id u, created_at t from user_tapes"),
)
HAS_PLUS = """select s.user_id from user_subscriptions s join pricing_tiers t on t.id = s.tier_id
  where s.status in ('active', 'trialing') and t.name <> 'free'
    and (s.trial_end is null or s.trial_end > now())
    and (s.current_period_end is null or s.current_period_end > now())"""
PAYING = """select user_id from user_subscriptions
  where (stripe_subscription_id is not null and status in ('active', 'past_due'))
     or (source = 'revenuecat' and status = 'active')"""


def _pct(sorted_vals: list[int], p: float) -> int:
    return sorted_vals[min(len(sorted_vals) - 1, int(len(sorted_vals) * p))] if sorted_vals else 0


def usage_rows(per: dict, free: set, walled: set, asked: set, paying: set) -> list[tuple]:
    """One row per feature: (feature, free people, median uses, top tenth uses,
    free people a wall met, of those who tapped a price, paying people using it).
    `per` is {feature: {user_id: uses}} over real people only."""
    rows = []
    for name, users in per.items():
        vals = sorted(n for u, n in users.items() if u in free)
        met = [u for u in users if u in free and u in walled]
        rows.append((
            name, len(vals), _pct(vals, 0.5), _pct(vals, 0.9), len(met),
            sum(1 for u in met if u in asked), sum(1 for u in users if u in paying),
        ))
    return rows


def return_days(days: dict, free: set) -> str:
    """'came back' line: free people by how many different days they did anything."""
    one = sum(1 for u in free if days.get(u) == 1)
    two = sum(1 for u in free if days.get(u) == 2)
    more = sum(1 for u in free if days.get(u, 0) >= 3)
    return f"{one} on 1 day only, {two} on 2 days, {more} on 3 or more"


def usage_section(conn) -> str:
    from sqlalchemy import text

    def ids(sql):
        return {r[0] for r in conn.execute(text(sql))}

    since = f"now() - interval '{USAGE_DAYS} days'"
    real = ids(f"select u.id from users u where {REAL} and u.email not like '%@actorrise.com' and u.email not like 'test%'")
    plus, paying = ids(HAS_PLUS), ids(PAYING)
    per, days = {}, {}
    for name, sql in USAGE_FEATURES:
        rows = conn.execute(text(f"select u, count(*) from ({sql}) x where t > {since} group by u")).fetchall()
        per[name] = {u: n for u, n in rows if u in real}
    every = " union all ".join(f"select u, t from ({sql}) x{i}" for i, (_, sql) in enumerate(USAGE_FEATURES))
    for u, n in conn.execute(text(f"select u, count(distinct t::date) from ({every}) z where t > {since} group by u")):
        if u in real:
            days[u] = n
    active = set(days)
    free = active - plus
    walls = {}
    for u, gate in conn.execute(text(
            f"select user_id, coalesce(properties->>'gate', properties->>'feature') from user_events "
            f"where event_name in ('paywall_hit', 'upgrade_modal_viewed') and created_at > {since}")):
        if u in free:
            walls.setdefault(u, set()).add(gate)
    asked = ids(f"select distinct user_id from user_events where event_name in "
                f"('paywall_cta_clicked', 'checkout_started') and created_at > {since}")
    gates = {}
    for gs in walls.values():
        for g in gs:
            gates[g] = gates.get(g, 0) + 1
    regulars = sorted((u for u in free if days[u] >= 3), key=lambda u: -days[u])
    reg_rows = [(u, days[u], "yes" if u in walls else "no",
                 ", ".join(f"{k} {per[k][u]}" for k in per if u in per[k])) for u in regulars[:15]]
    return "\n".join([
        f"## 9. What free people use, last {USAGE_DAYS} days\n",
        f"{len(active)} real people did something: {len(free)} free today, {len(active & plus)} on Plus "
        f"(comp, taste or trial included), {len(active & paying)} paying.",
        f"Free people by the days they came: {return_days(days, free)}.\n",
        table(("feature", "free people", "median uses", "top tenth uses", "a wall met them",
               "of those, tapped a price", "payers using it"),
              usage_rows(per, free, set(walls), asked, paying)),
        "### Which walls met free people (people)\n",
        table(("gate", "people"), sorted(gates.items(), key=lambda x: -x[1])),
        "### Free regulars: 3 or more days, and whether a wall ever met them\n",
        table(("user id", "days", "walled", "what they used"), reg_rows),
        "The app's own price screens are in PostHog: `scripts/posthog_report.py --days 30`.",
    ])


def build(conn) -> str:
    from sqlalchemy import bindparam, text

    def q(sql, **params):
        stmt = text(sql)
        if "written" in params:
            stmt = stmt.bindparams(bindparam("written", expanding=True))
        return [tuple(r) for r in conn.execute(stmt, params).fetchall()]

    this_week = q(FUNNEL, older=7, newer=0)[0]
    last_week = q(FUNNEL, older=14, newer=7)[0]
    funnel = [
        (name, now, before, change(now, before))
        for name, now, before in zip(FUNNEL_ROWS, this_week, last_week)
    ]

    walked = q(WALKED_AWAY, days=2, limit=25)
    absent, found_since = recheck_absent(q(ABSENT_TITLES), _carried_now(conn))
    worth = [r for r in q(WORTH, written=written_to(conn)) if r[4] > 0]

    # Ghost Light. Apple's analytics columns are NULL until the first instance
    # lands (about a day after the report request), and a NULL is "not from
    # Apple yet", never a zero.
    store_days = q(APP_STORE_DAYS)
    cutoff = date.today() - timedelta(days=7)

    def store_sum(col: int, recent: bool) -> int | float | None:
        vals = [r[col] for r in store_days if (r[0] >= cutoff) == recent and r[col] is not None]
        if not vals:
            return None
        s = sum(vals)
        return round(s, 2) if isinstance(s, float) else s

    store_rows = []
    for i, name in ((1, "impressions"), (2, "page views"), (3, "first downloads"), (4, "redownloads"), (5, "in-app purchases"), (6, "proceeds, USD")):
        now_v, before_v = store_sum(i, True), store_sum(i, False)
        if now_v is None and before_v is None:
            store_rows.append((name, "not from Apple yet", "", ""))
        else:
            store_rows.append((name, now_v if now_v is not None else "", before_v if before_v is not None else "",
                               change(int(now_v or 0), int(before_v or 0)) if isinstance(now_v, int) or now_v is None else ""))
    # What Apple said on the last sync, so a blank row says why it is blank.
    store_note = ""
    if any(r[1] == "not from Apple yet" for r in store_rows):
        last = q(ASC_LAST_SYNC)
        if last and last[0][0]:
            import json

            try:
                kept = json.loads(last[0][0])
                notes = "; ".join(kept.get("notes") or []) or "no notes"
                store_note = (f"Last sync {str(kept.get('synced_at', ''))[:16]}: analytics days {kept.get('engagement_days', '?')}, "
                              f"download days {kept.get('download_days', '?')}. Apple said: {notes}\n")
            except ValueError:
                store_note = ""
        else:
            store_note = "No sync result kept yet (asc_last_sync is written from 2026-11-17).\n"
    reads7, readers7, reads14, readers14 = q(APP_READS)[0]
    guided = guided_section(conn)
    turkish = q(TURKISH_PEOPLE)
    gap_overall, gap_kinds = gap_rows(q(GAP_SEARCHES))

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
        "## 5b. The guided first scene, last 14 days, people\n",
        "Finished means spoken: reached the end with at least half the actor's lines heard.",
        "Reached the end counts runs skipped through on a dead mic too. Staff left out.\n",
        guided,
        "## 6. Ghost Light, the iOS app\n",
        "### The store, last 7 days against the 7 before\n",
        "App Store Connect, synced at 16:00 UTC and about a day behind. Downloads are",
        "first-time installs.\n",
        table(("", "last 7 days", "7 before", "change"), store_rows),
        store_note,
        "### In the app\n",
        f"{readers7} people read {reads7} pieces in the app this week, against {readers14} people and {reads14} the week before.",
        "Anonymous means they never signed in: the app lets you read without an account, and those people cannot be emailed.\n",
        table(
            ("name", "email", "signed up", "reads", "pieces", "last read", "web reads too", "tier", "what they read"),
            q(APP_READERS),
        ),
        "### Money, via RevenueCat\n",
        table(("status", "plan", "people"), q(APP_SUBS)),
        "Events this week (purchases, renewals, trials, expirations), as Apple reported them:\n",
        table(("day", "type", "product", "period", "who"), q(APP_EVENTS)),
        "## 6b. Turkish actors, last 7 days\n",
        "Anyone who used the Turkish UI (counted from 2026-11-25) or uploaded a script in",
        "Turkish. Real users only.\n",
        table(("name", "email", "signed up", "events", "Turkish uploads", "saw a price", "checkout", "paying"),
              [r[:5] + tuple("yes" if v else "no" for v in r[5:]) for r in turkish]),
        "## 7. Auditions, the tracker\n",
        "Moderators only until Canberk opens it up, so `staff = true` is him trying it.",
        "Created this week against last, how many are still scheduled, by how many people.\n",
        table(("staff", "created, 7 days", "7 before", "scheduled now", "people"),
              [("yes" if r[0] else "no",) + tuple(r[1:]) for r in q(AUDITIONS)]),
        "### Coming up in the next 7 days\n",
        table(("who", "project", "role", "kind", "when", "source", "piece attached"),
              [r[:6] + ("yes" if r[6] else "no",) for r in q(AUDITIONS_UPCOMING)]),
        "### What the tracker recorded this week\n",
        table(("event", "times", "people"), q(AUDITION_EVENTS)),
        "## 8. What people told the site, last 2 days\n",
        "The admin feedback inbox, the requests queue and the search log. Staff left out.\n",
        "### Feedback\n",
        table(("day", "where", "rating", "comment", "who"), q(FEEDBACK)),
        "### Content requests\n",
        table(("last asked", "title", "author", "character", "times", "status"), q(CONTENT_REQUESTS)),
        "### Weak or empty searches\n",
        "{1} of {0} searches came back weak or empty. Weak counts recoveries too, so check a".format(*q(SEARCH_TOTALS)[0]),
        "title in plays.title, monologues.title and character_name before calling it missing.\n",
        table(("query", "times", "people", "fewest results", "finds today"),
              recheck_weak(q(FAILED_SEARCHES), _finds_now(conn))),
        "### Where the library is thin, 30 days\n",
        gap_overall + " A kind well above that rate is where to add pieces.\n",
        table(("kind of piece", "weak", "searches", "weak rate", "people"), gap_kinds),
        "Titles searched that are in no tab, checked against the library today (screen titles come in like the rest of the TV and film corpus):\n",
        table(("title", "searches", "people", "last", "note"), absent),
        ("Logged as missing but carried today (the search learned them since, or a tab hid them): "
         + "; ".join(found_since) + ".") if found_since else "",
        usage_section(conn),
    ]
    return "\n".join(parts)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--save", action="store_true", help="write to outputs/conversion/ instead of stdout")
    ap.add_argument("--store", action="store_true",
                    help="keep it in loop_snapshots for tomorrow's run (--save does too); still prints")
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

    if args.save or args.store:
        # Its own write connection, after the read-only one has closed. A cloud
        # session has no outputs/ from yesterday; tomorrow's run reads this.
        from loop_snapshot import store

        try:
            store("brief", brief)
        except Exception as e:  # noqa: BLE001
            print(f"not stored for tomorrow: {e}", file=sys.stderr)

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
