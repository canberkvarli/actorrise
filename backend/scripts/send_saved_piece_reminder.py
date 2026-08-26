"""Day-1 "you saved a piece" re-engagement — manual CLI over the shared service.

The live path is the hourly in-process scheduler (see app/main.py lifespan and
app/services/email/saved_piece_reminder.py). This CLI is for previews and one-off
manual sends; both share the same selection + atomic-claim send logic, so a manual
run can never double-send against the scheduler (dedup is DB-backed).

  uv run python scripts/send_saved_piece_reminder.py                 # DRY RUN preview
  uv run python scripts/send_saved_piece_reminder.py --active-hour-only
  uv run python scripts/send_saved_piece_reminder.py --send          # send now via Resend
"""

import argparse
from datetime import datetime, timezone
from pathlib import Path

from app.core.database import SessionLocal
from app.services.email.saved_piece_reminder import (SUBJECT, run_reminders,
                                                     select_candidates)
from app.services.email.templates import EmailTemplates


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--send", action="store_true", help="actually send via Resend (default: dry run)")
    ap.add_argument("--active-hour-only", action="store_true", help="only saves in the current UTC hour")
    ap.add_argument("--hours-min", type=int, default=24)
    ap.add_argument("--hours-max", type=int, default=72)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "backups" / "saved_piece_reminder_preview.txt"))
    args = ap.parse_args()

    active_hour = datetime.now(timezone.utc).hour if args.active_hour_only else None

    if not args.send:
        db = SessionLocal()
        try:
            people = select_candidates(db, args.hours_min, args.hours_max, active_hour)
        finally:
            db.close()
        if args.limit:
            people = people[: args.limit]
        tpl = EmailTemplates()
        preview = []
        for p in people[:10]:
            plain = tpl.render_saved_piece_reminder_plain(p["character"], p["play"], p["link"], p["user_name"])
            preview.append(
                f"TO: {p['email']}   (saved {p['saved_at']})\n"
                f"SUBJECT: {SUBJECT.format(character=p['character'], play=p['play'])}\n\n{plain}\n" + "=" * 70
            )
        Path(args.out).write_text("\n".join(preview), encoding="utf-8")
        print(f"eligible: {len(people)}  — DRY RUN, nothing sent. {min(len(people),10)} previews -> {args.out}")
        for p in people[:12]:
            print(f"  - {p['email']:32} {p['character']} / {p['play']}")
        print("\nTo send for real: add --send")
        return

    stats = run_reminders(
        send=True,
        active_hour=active_hour,
        hours_min=args.hours_min,
        hours_max=args.hours_max,
        limit=args.limit,
    )
    print(f"eligible {stats['eligible']}, sent {stats['sent']}, failed {stats['failed']}")


if __name__ == "__main__":
    main()
