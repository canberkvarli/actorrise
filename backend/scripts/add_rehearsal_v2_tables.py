#!/usr/bin/env python
"""Migration: ScenePartner v2 tables (partner_audio, rehearsal_runs, rehearsal_events).

Usage:
    cd backend && uv run python scripts/add_rehearsal_v2_tables.py
"""
from __future__ import annotations

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import text

from app.core.database import engine

STATEMENTS = [
    text("""
        CREATE TABLE IF NOT EXISTS partner_audio (
            key VARCHAR(64) PRIMARY KEY,
            vendor VARCHAR(16) NOT NULL,
            voice VARCHAR(64) NOT NULL,
            storage_path VARCHAR(128),
            status VARCHAR(8) NOT NULL DEFAULT 'pending',
            error TEXT,
            claimed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """),
    text("""
        CREATE TABLE IF NOT EXISTS rehearsal_runs (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            scene_id INTEGER NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
            character VARCHAR NOT NULL,
            voices JSONB NOT NULL DEFAULT '{}'::jsonb,
            is_guided BOOLEAN NOT NULL DEFAULT FALSE,
            started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """),
    text("CREATE INDEX IF NOT EXISTS ix_rehearsal_runs_user_scene ON rehearsal_runs (user_id, scene_id, started_at DESC)"),
    text("""
        CREATE TABLE IF NOT EXISTS rehearsal_events (
            id SERIAL PRIMARY KEY,
            run_id INTEGER NOT NULL REFERENCES rehearsal_runs(id) ON DELETE CASCADE,
            seq INTEGER NOT NULL,
            type VARCHAR(24) NOT NULL,
            line_index INTEGER,
            at_ms INTEGER NOT NULL,
            payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_rehearsal_event_seq UNIQUE (run_id, seq)
        )
    """),
    text("CREATE INDEX IF NOT EXISTS ix_rehearsal_events_run ON rehearsal_events (run_id)"),
    # Enable RLS like every other table (see docs: RLS lockdown 2026-08-23). The
    # backend connects with the service role, which bypasses it.
    text("ALTER TABLE partner_audio ENABLE ROW LEVEL SECURITY"),
    text("ALTER TABLE rehearsal_runs ENABLE ROW LEVEL SECURITY"),
    text("ALTER TABLE rehearsal_events ENABLE ROW LEVEL SECURITY"),
]

if __name__ == "__main__":
    with engine.begin() as conn:
        for stmt in STATEMENTS:
            conn.execute(stmt)
    print("ok: partner_audio, rehearsal_runs, rehearsal_events")
