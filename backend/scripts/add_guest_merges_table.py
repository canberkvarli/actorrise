"""
Create ``guest_merges``: an anonymous app user and the account it became.

See app/services/guest_purchase.py. Without it a purchase made before signing
in with Apple stayed on the anonymous user and the account hit the paywall
(2026-11-17). Idempotent (``IF NOT EXISTS``), RLS on with no policies: only the
backend's own connection reads it.

Run before pushing the code that names it:
    python backend/scripts/add_guest_merges_table.py
"""

import sys
from pathlib import Path

backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.database import SessionLocal
from sqlalchemy import text

STATEMENTS = (
    text(
        "CREATE TABLE IF NOT EXISTS guest_merges ("
        " guest_user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,"
        " owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,"
        " created_at TIMESTAMPTZ DEFAULT now())"
    ),
    text("CREATE INDEX IF NOT EXISTS ix_guest_merges_owner_user_id ON guest_merges (owner_user_id)"),
    text("ALTER TABLE guest_merges ENABLE ROW LEVEL SECURITY"),
)


def main():
    db = SessionLocal()
    try:
        db.execute(text("SET lock_timeout = '10s'"))
        for stmt in STATEMENTS:
            db.execute(stmt)
        db.commit()
        print("OK: guest_merges is present, RLS on.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
