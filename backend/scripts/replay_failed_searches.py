"""Replay the searches that failed, against the corpus we now have.

The whole point of doubling the play corpus was to answer queries the logs show
people actually typing and not getting anything for. That is an assumption until
the queries are run again, and a bigger library that fails the same searches is
worth nothing.

So this takes the real failures out of `search_logs` -- zero results, or flagged
as a content gap -- and puts them back through the same path the endpoint uses,
via run_golden_search._observe_full, which mirrors the title pre-pass and the
weak-match logic rather than calling the vector search alone.

Reports per query: how many results now, whether it is still weak, and whether
it still reads as a content gap.

    python -m scripts.replay_failed_searches
    python -m scripts.replay_failed_searches --days 180 --limit 40
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import create_engine, text  # noqa: E402

from app.core.config import settings  # noqa: E402

# content_gap is JSONB, so a plain `IS TRUE` raises: it holds a JSON value, and
# a JSON null is not SQL NULL.
GAP = ("(content_gap IS NOT NULL AND content_gap::text <> 'null' "
       "AND content_gap::text <> 'false')")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=120)
    ap.add_argument("--limit", type=int, default=40)
    args = ap.parse_args()

    engine = create_engine(settings.database_url, pool_pre_ping=True)
    with engine.connect() as c:
        rows = c.execute(text(f"""
            SELECT lower(trim(query)) q, count(*) n
            FROM search_logs
            WHERE created_at > now() - make_interval(days => :d)
              AND (results_count = 0 OR {GAP} OR weak_match IS TRUE)
              AND length(trim(query)) > 2
            GROUP BY 1 ORDER BY n DESC, q LIMIT :lim
        """), {"d": args.days, "lim": args.limit}).fetchall()

    print(f"replaying {len(rows)} previously-failing queries "
          f"from the last {args.days} days\n")

    from scripts.run_golden_search import _observe_full

    verdicts = Counter()
    still_bad = []
    for q, times in rows:
        try:
            obs = _observe_full(q, None)
        except Exception as exc:                      # noqa: BLE001
            print(f"   ERROR  {q[:44]:<44} {str(exc)[:40]}")
            verdicts["error"] += 1
            continue
        n = len(obs.get("results") or [])
        weak = bool(obs.get("weak"))
        gap = bool(obs.get("content_gap"))
        if n == 0:
            mark, key = "STILL EMPTY", "empty"
        elif gap:
            mark, key = "content gap", "gap"
        elif weak:
            mark, key = "weak", "weak"
        else:
            mark, key = "ok", "ok"
        verdicts[key] += 1
        if key != "ok":
            still_bad.append((q, times, n, mark))
        print(f"   {mark:<12} n={n:<3} x{times:<3} {q[:52]}")

    print("\n" + "  ".join(f"{k}={v}" for k, v in verdicts.most_common()))
    if still_bad:
        print("\nstill not answered:")
        for q, times, n, mark in still_bad:
            print(f"   [{mark}] x{times}  n={n}  {q[:56]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
