#!/usr/bin/env python
"""Migration: partner_audio.chars, the line length the monthly Gemini cap sums.

Additive and idempotent. Run it BEFORE the backend that reads the column is
deployed: the model selects every mapped column, so until this has run every
partner_audio query would fail (see the deploy-ordering note in the memory).

Usage:
    cd backend && uv run python scripts/add_partner_audio_chars.py
"""
from __future__ import annotations

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import text

from app.core.database import engine

STATEMENTS = [
    text("ALTER TABLE partner_audio ADD COLUMN IF NOT EXISTS chars INTEGER"),
    # The cap query: this month's ready rows of one vendor.
    text("CREATE INDEX IF NOT EXISTS ix_partner_audio_vendor_created ON partner_audio (vendor, created_at)"),
]

if __name__ == "__main__":
    with engine.begin() as conn:
        for stmt in STATEMENTS:
            conn.execute(stmt)
    print("ok: partner_audio.chars")
