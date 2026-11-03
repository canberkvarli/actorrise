"""What the daily loop saw, kept a day so tomorrow's run can compare.

  uv run python scripts/loop_snapshot.py take     # today's money, app subscriptions, class links
  uv run python scripts/loop_snapshot.py show     # the newest day before today, every kind
  uv run python scripts/loop_snapshot.py show --ago 7
  uv run python scripts/loop_snapshot.py keep best_move "<the summary's Best move line>"

The brief itself is stored by `conversion_brief.py --save` (or `--store` over the
bridge). "What moved" is today against `show`: a trial that went paid or lapsed, a
renewal turned off, a class link that gained joins, the money line. A cloud session
has no files from yesterday, which is why this is a table (loop_snapshots) and not
outputs/conversion/. Rows older than 30 days are dropped on every take.

Kinds: brief, money, revenuecat, class_links, and best_move (the run's own last line,
kept with `keep`, so tomorrow can say whether it happened). A source that fails is stored as
"unavailable: <why>", so a failure is never read tomorrow as a zero.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import date, timedelta
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

KEEP_DAYS = 30
KINDS = ("best_move", "brief", "money", "revenuecat", "class_links")
KEPT_BY_HAND = ("best_move",)


def store(kind: str, body: str, day: date | None = None) -> None:
    from sqlalchemy import text

    from app.core.database import engine

    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO loop_snapshots (day, kind, body) VALUES (:d, :k, :b) "
                "ON CONFLICT (day, kind) DO UPDATE SET body = EXCLUDED.body, created_at = NOW()"
            ),
            {"d": day or date.today(), "k": kind, "b": body},
        )
        conn.execute(text("DELETE FROM loop_snapshots WHERE day < :cut"),
                     {"cut": date.today() - timedelta(days=KEEP_DAYS)})


def read(ago: int | None = None) -> tuple[date | None, dict[str, str]]:
    """The rows for one day: `ago` days back, or the newest day before today."""
    from sqlalchemy import text

    from app.core.database import engine

    with engine.connect().execution_options(postgresql_readonly=True) as conn:
        if ago is None:
            day = conn.execute(text("SELECT max(day) FROM loop_snapshots WHERE day < :t"),
                               {"t": date.today()}).scalar()
        else:
            day = date.today() - timedelta(days=ago)
        if day is None:
            return None, {}
        rows = conn.execute(text("SELECT kind, body FROM loop_snapshots WHERE day = :d"), {"d": day})
        return day, {k: b for k, b in rows}


def _script(*argv: str) -> str:
    """Another loop script's output, run as its own process the way the loop runs it."""
    p = subprocess.run([sys.executable, str(backend_dir / "scripts" / argv[0]), *argv[1:]],
                       cwd=backend_dir, capture_output=True, text=True, timeout=120)
    if p.returncode != 0:
        raise RuntimeError((p.stderr or p.stdout).strip()[-300:] or f"exit {p.returncode}")
    return p.stdout


def _money() -> str:
    from app.api.admin.stripe_revenue import _compute

    data = _compute()
    if not data.get("available"):
        raise RuntimeError(data.get("reason", "Stripe unavailable"))
    return json.dumps(data, indent=1, sort_keys=True)


def take() -> dict[str, str]:
    sources = {
        "money": _money,
        "revenuecat": lambda: _script("revenuecat_report.py"),
        "class_links": lambda: _script("class_link.py", "list"),
    }
    taken = {}
    for kind, fn in sources.items():
        try:
            taken[kind] = fn()
        except Exception as e:  # noqa: BLE001
            taken[kind] = f"unavailable: {e}"
        store(kind, taken[kind])
    return taken


def main() -> None:
    from dotenv import load_dotenv

    load_dotenv(backend_dir / ".env")
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("take")
    k = sub.add_parser("keep")
    k.add_argument("kind", choices=KEPT_BY_HAND)
    k.add_argument("body")
    s = sub.add_parser("show")
    s.add_argument("--ago", type=int, help="exactly this many days back (default: the newest before today)")
    args = ap.parse_args()

    if args.cmd == "take":
        for kind, body in take().items():
            state = body[:80] if body.startswith("unavailable") else f"{len(body.splitlines())} lines"
            print(f"{kind}: {state}")
        return

    if args.cmd == "keep":
        store(args.kind, args.body)
        print(f"kept {args.kind} for {date.today()}")
        return

    day, rows = read(args.ago)
    if not rows:
        print("no snapshot yet" if day is None else f"nothing stored for {day}")
        return
    print(f"# Snapshot of {day}\n")
    for kind in KINDS:
        if kind in rows:
            print(f"===== {kind} =====\n\n{rows[kind].rstrip()}\n")


if __name__ == "__main__":
    main()
