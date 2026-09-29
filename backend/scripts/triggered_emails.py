"""Preview or send the triggered emails by hand.

The hourly scheduler in app/main.py does this automatically once the
"Triggered emails" switch in /admin/emails is on. This is for looking before
switching it on, and for sending a test to yourself.

  cd backend
  uv run python scripts/triggered_emails.py                      # everyone owed anything, by touch
  uv run python scripts/triggered_emails.py checkout_abandoned   # one touch
  uv run python scripts/triggered_emails.py --test you@example.com   # both, to you
  uv run python scripts/triggered_emails.py checkout_abandoned --send

The words are in backend/emails/lifecycle/<touch>.txt.
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
    from app.services.email import triggered

    ap = argparse.ArgumentParser()
    ap.add_argument("touch", nargs="?", choices=list(triggered.TRIGGERS))
    ap.add_argument("--send", action="store_true", help="actually send (default: preview)")
    ap.add_argument("--test", metavar="EMAIL", help="render for a made-up person and send to this address")
    args = ap.parse_args()

    touches = [args.touch] if args.touch else list(triggered.PRIORITY)

    if args.test:
        from app.services.email.resend_client import ResendEmailClient

        client = ResendEmailClient()
        for touch in touches:
            person = {
                "touch": touch,
                "user_name": "Test Actor",
                "link": triggered._link(touch),
                "span": "a week",
            }
            subject, html, plain = triggered.render(person, None)
            client.send_email(to=args.test, subject=f"[{touch}] {subject}", html=html, plain_text=plain)
            print(f"sent {touch} to {args.test}")
        return

    taken: set[int] = set()
    for touch in touches:
        stats = triggered.run_touch(touch, send=args.send, skip=taken)
        for p in stats["previews"]:
            print(f"{p['email']:40s} {touch:22s} {p['anchored_at']:%Y-%m-%d %H:%M}  {p['span']}")
        print(f"{touch}: eligible {stats['eligible']} sent {stats['sent']} failed {stats['failed']}\n")
    if not args.send:
        print("preview only; pass --send to send")


if __name__ == "__main__":
    main()
