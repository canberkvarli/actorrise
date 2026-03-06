#!/usr/bin/env python
"""
Migration: Set marketing_opt_in=True for all existing users.

Since we removed the opt-in checkbox from signup and all new users
default to True, this brings existing users in line. Users who
unsubscribe via email links will be set back to False.

Usage:
    uv run python scripts/set_all_marketing_opt_in.py
"""

from __future__ import annotations

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import text

from app.core.database import engine


def main() -> None:
    with engine.connect() as conn:
        result = conn.execute(
            text("UPDATE users SET marketing_opt_in = TRUE WHERE marketing_opt_in = FALSE")
        )
        conn.commit()
        print(f"Updated {result.rowcount} users to marketing_opt_in=True.")


if __name__ == "__main__":
    main()
