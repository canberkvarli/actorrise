"""Add the ``plays.translator`` column in production (idempotent).

``create_all`` never adds columns to an existing table, so run this once after
deploying the model change:
    .venv/bin/python scripts/add_play_translator.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.database import SessionLocal
from sqlalchemy import text


def add_column():
    db = SessionLocal()
    try:
        db.execute(text("ALTER TABLE plays ADD COLUMN IF NOT EXISTS translator VARCHAR"))
        db.commit()
        print("OK: plays.translator is present.")
    finally:
        db.close()


if __name__ == "__main__":
    add_column()
