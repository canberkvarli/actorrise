#!/usr/bin/env python
"""
Backfill community_events from existing activity so the Green Room feed launches
alive instead of empty.

The feed shows a 48h window and the counter widens to 7 days, so we only backfill
the last N days (default 7). Events are inserted with their SOURCE row's real
created_at (not now()), so they sort correctly in the window.

Privacy: search events reuse SearchLog.filters_used (already parsed filters) via
build_search_payload — raw query text is never copied. Users who have opted out
(share_activity = false) are filtered at READ time, so no need to exclude here.

Usage:
    uv run python scripts/backfill_community_events.py            # dry run, prints counts
    uv run python scripts/backfill_community_events.py --apply    # write events
    uv run python scripts/backfill_community_events.py --apply --days 14
    uv run python scripts/backfill_community_events.py --apply --force   # even if table non-empty
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.database import SessionLocal
from app.models.actor import (Monologue, MonologueFavorite, RehearsalSession,
                              Scene)
from app.models.community import CommunityEvent
from app.models.search_log import SearchLog
from app.models.user import User
from app.services.community import build_search_payload


def _add(events, user_id, event_type, created_at, **payload):
    events.append(
        CommunityEvent(
            user_id=user_id,
            event_type=event_type,
            payload={k: v for k, v in payload.items() if v is not None},
            created_at=created_at,
        )
    )


def build_events(db, cutoff):
    events = []

    # joined
    for u in db.query(User).filter(User.created_at >= cutoff).all():
        _add(events, u.id, "joined", u.created_at)

    # searched — new searches only, intent-bearing only
    q = db.query(SearchLog).filter(SearchLog.created_at >= cutoff)
    for row in q.all():
        if row.page and row.page > 1:
            continue
        payload = build_search_payload(row.filters_used)
        if payload and row.user_id:
            _add(events, row.user_id, "searched", row.created_at, **payload)

    # bookmarked — active favorites, with monologue title
    fav_q = (
        db.query(MonologueFavorite, Monologue)
        .join(Monologue, MonologueFavorite.monologue_id == Monologue.id)
        .filter(MonologueFavorite.created_at >= cutoff)
        .filter(MonologueFavorite.removed_at.is_(None))
    )
    for fav, mono in fav_q.all():
        _add(events, fav.user_id, "bookmarked", fav.created_at,
             title=mono.title, monologue_id=mono.id)

    # rehearsed — completed scene rehearsals, with line count
    reh_q = (
        db.query(RehearsalSession, Scene)
        .join(Scene, RehearsalSession.scene_id == Scene.id)
        .filter(RehearsalSession.status == "completed")
        .filter(RehearsalSession.created_at >= cutoff)
    )
    for sess, scene in reh_q.all():
        _add(events, sess.user_id, "rehearsed",
             sess.completed_at or sess.created_at, line_count=scene.line_count)

    return events


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write events (default: dry run)")
    ap.add_argument("--days", type=int, default=7, help="lookback window in days")
    ap.add_argument("--force", action="store_true", help="backfill even if table non-empty")
    args = ap.parse_args()

    cutoff = datetime.now(timezone.utc) - timedelta(days=args.days)
    db = SessionLocal()
    try:
        existing = db.query(CommunityEvent).count()
        if existing and not args.force:
            print(f"community_events already has {existing} rows — pass --force to backfill anyway. Aborting.")
            return

        events = build_events(db, cutoff)
        by_type = {}
        for e in events:
            by_type[e.event_type] = by_type.get(e.event_type, 0) + 1
        print(f"Built {len(events)} events over last {args.days} days: {by_type}")

        if not args.apply:
            print("Dry run — pass --apply to write.")
            return

        db.add_all(events)
        db.commit()
        print(f"Done — inserted {len(events)} community_events.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
