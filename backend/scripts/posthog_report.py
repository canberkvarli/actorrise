"""Read only: the Ghost Light app's money path, from PostHog.

The app sends its paywall and purchase events to PostHog only (apps/mobile/src/lib/analytics.ts),
never to user_events, so this is the one place to see who met a price in the app and who tapped buy.

    cd backend && uv run python scripts/posthog_report.py [--days 28]

Needs POSTHOG_PERSONAL_API_KEY (read scopes) and POSTHOG_PROJECT_ID in backend/.env.
POSTHOG_API_HOST defaults to https://us.posthog.com (the API host, not the us.i ingestion host).
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

STEPS = ("demo_shown", "demo_curtain", "paywall_shown", "purchase_started", "purchase_completed")


def hogql(query: str) -> list[list]:
    key = os.getenv("POSTHOG_PERSONAL_API_KEY")
    project = os.getenv("POSTHOG_PROJECT_ID")
    if not key or not project:
        sys.exit("POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID must be set in backend/.env")
    host = os.getenv("POSTHOG_API_HOST", "https://us.posthog.com").rstrip("/")
    r = httpx.post(
        f"{host}/api/projects/{project}/query/",
        headers={"Authorization": f"Bearer {key}"},
        json={"query": {"kind": "HogQLQuery", "query": query}},
        timeout=60,
    )
    if r.status_code != 200:
        sys.exit(f"PostHog answered {r.status_code}: {r.text[:300]}")
    return r.json().get("results") or []


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=28)
    days = ap.parse_args().days
    since = f"timestamp > now() - interval {days} day"

    total = hogql(f"select count(distinct person_id) from events where {since}")[0][0]
    print(f"Ghost Light app, last {days} days (PostHog, people)\n")
    print(f"  anyone in the app       {total}")
    names = ", ".join(f"'{s}'" for s in STEPS)
    by_step = dict(hogql(f"select event, count(distinct person_id) from events where {since} and event in ({names}) group by event"))
    for s in STEPS:
        print(f"  {s:<23} {by_step.get(s, 0)}")

    print("\nPaywall shown, by what brought it up (people, times)")
    for trig, people, times in hogql(
        f"select properties.trigger, count(distinct person_id), count() from events "
        f"where {since} and event = 'paywall_shown' group by 1 order by 2 desc limit 20"
    ):
        print(f"  {str(trig):<16} {people:>4} {times:>5}")

    print("\nBy week (people): anyone, curtain, paywall, buy tapped, bought")
    for row in hogql(
        f"select toStartOfWeek(timestamp, 1) as wk, count(distinct person_id), "
        f"count(distinct if(event = 'demo_curtain', person_id, null)), "
        f"count(distinct if(event = 'paywall_shown', person_id, null)), "
        f"count(distinct if(event = 'purchase_started', person_id, null)), "
        f"count(distinct if(event = 'purchase_completed', person_id, null)) "
        f"from events where {since} group by wk order by wk"
    ):
        print("  " + str(row[0])[:10] + "  " + "  ".join(f"{v:>5}" for v in row[1:]))

    # Whether the Apple sheet offered the free trial. It comes from the store
    # product's introductory offer; from 2026-10-28 every tap said no trial.
    print("\nBuy taps by whether a free trial was on offer (people, taps, bought)")
    for trial, people, taps, bought in hogql(
        f"select properties.trial, count(distinct person_id), countIf(event = 'purchase_started'), "
        f"countIf(event = 'purchase_completed') from events "
        f"where {since} and event in ('purchase_started', 'purchase_completed') group by 1"
    ):
        print(f"  {'trial' if trial else 'no trial':<9} {people:>4} {taps:>5} {bought:>5}")

    print("\nOther purchase events (name, times)")
    for name, times in hogql(
        f"select event, count() from events where {since} and event like 'purchase%' "
        f"and event not in ('purchase_started', 'purchase_completed') group by event order by 2 desc"
    ):
        print(f"  {name:<28} {times}")


if __name__ == "__main__":
    main()
