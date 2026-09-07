"""Preview or send the day-3 / day-10 return emails by hand.

The hourly scheduler in app/main.py does this automatically once the admin
toggle is on. This is for looking before switching it on, and for sending a
test to yourself.

  cd backend
  uv run python scripts/lifecycle_emails.py day3               # who would get it now, and which anchor
  uv run python scripts/lifecycle_emails.py day10 --send --limit 5
  uv run python scripts/lifecycle_emails.py day3 --test you@example.com   # render for a fake person and send
"""

import argparse
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

try:
    from dotenv import load_dotenv

    load_dotenv(backend_dir / ".env")
    load_dotenv()
except ImportError:
    pass


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("touch", choices=["day3", "day10"])
    ap.add_argument("--send", action="store_true", help="actually send (default: preview)")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--hour", type=int, default=None, help="only people who signed up in this UTC hour")
    ap.add_argument("--test", metavar="EMAIL", help="send all three anchor variants to this address")
    args = ap.parse_args()

    from app.services.email import lifecycle

    if args.test:
        from app.services.email.resend_client import ResendEmailClient
        from app.services.email.templates import EmailTemplates

        tpl, client = EmailTemplates(), ResendEmailClient()
        fakes = [
            {"anchor": "favorite", "character": "Viola", "play": "Twelfth Night", "link": f"{lifecycle.SITE_URL}/monologue/1"},
            {"anchor": "search", "query": "funny monologue for a woman in her 20s", "link": f"{lifecycle.SITE_URL}/monologues?q=funny"},
            {"anchor": "none", "link": f"{lifecycle.SITE_URL}/monologues"},
        ]
        for f in fakes:
            person = {"touch": args.touch, "user_name": "Test Actor", **f}
            subject, html, plain = lifecycle.render(tpl, person, None)
            client.send_email(to=args.test, subject=f"[{f['anchor']}] {subject}", html=html, plain_text=plain)
            print(f"sent {args.touch}/{f['anchor']} to {args.test}")
        return

    stats = lifecycle.run_touch(args.touch, send=args.send, active_hour=args.hour, limit=args.limit)
    for p in stats["previews"]:
        what = p.get("character") or p.get("query") or "(no anchor)"
        print(f"{p['email']:40s} {p['anchor']:8s} {what}")
    print(f"\n{args.touch}: eligible {stats['eligible']} sent {stats['sent']} failed {stats['failed']}")
    if not args.send:
        print("preview only; pass --send to send")


if __name__ == "__main__":
    main()
