"""
Add ``users.ui_language``: the language the actor's UI is in, "en" or "tr".

Turkish came back to the web on 2026-11-25. The emails an actor gets on a
schedule (return emails, price-look emails, audition reminders, the saved-piece
reminder) are written with no request around them, so the server can't tell
from a header who reads Turkish. GET /api/auth/me records it from the
X-ActorRise-Locale header (web and iOS send "tr" from the Turkish UI only), and
the senders read it back (services/ui_language.email_language).

Idempotent (``IF NOT EXISTS``), safe to run repeatedly. Defaults 'en', which
is what every account was before.

    python backend/scripts/add_ui_language.py
"""

import sys
from pathlib import Path

backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.database import SessionLocal
from sqlalchemy import text


def main():
    db = SessionLocal()
    try:
        db.execute(text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS ui_language VARCHAR(8) NOT NULL DEFAULT 'en'"
        ))
        db.commit()
        n = db.execute(text("SELECT count(*) FROM users WHERE ui_language = 'tr'")).scalar()
        print(f"users.ui_language ready ({n} Turkish)")
    finally:
        db.close()


if __name__ == "__main__":
    main()
