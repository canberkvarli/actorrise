#!/usr/bin/env python
"""
Migration: add admin user management tables.

Adds:
1) user_benefit_overrides
2) admin_audit_logs

Usage:
    uv run python scripts/add_admin_user_management_tables.py
"""

from __future__ import annotations

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import text

from app.core.database import engine


STATEMENTS = [
    text(
        """
        CREATE TABLE IF NOT EXISTS user_benefit_overrides (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            feature_key VARCHAR NOT NULL,
            override_type VARCHAR NOT NULL,
            value JSONB,
            expires_at TIMESTAMP WITH TIME ZONE,
            note TEXT,
            created_by_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE
        )
        """
    ),
    text(
        """
        CREATE TABLE IF NOT EXISTS admin_audit_logs (
            id SERIAL PRIMARY KEY,
            actor_admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            target_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            action_type VARCHAR NOT NULL,
            before_json JSONB,
            after_json JSONB,
            note TEXT,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        )
        """
    ),
    text(
        "CREATE INDEX IF NOT EXISTS ix_user_benefit_override_lookup "
        "ON user_benefit_overrides(user_id, feature_key)"
    ),
    text(
        "CREATE INDEX IF NOT EXISTS ix_user_benefit_overrides_expires_at "
        "ON user_benefit_overrides(expires_at)"
    ),
    text(
        "CREATE INDEX IF NOT EXISTS ix_admin_audit_logs_actor_admin_id "
        "ON admin_audit_logs(actor_admin_id)"
    ),
    text(
        "CREATE INDEX IF NOT EXISTS ix_admin_audit_logs_target_user_id "
        "ON admin_audit_logs(target_user_id)"
    ),
    text(
        "CREATE INDEX IF NOT EXISTS ix_admin_audit_logs_action_type "
        "ON admin_audit_logs(action_type)"
    ),
    text(
        "CREATE INDEX IF NOT EXISTS ix_admin_audit_logs_created_at "
        "ON admin_audit_logs(created_at)"
    ),
]


def main() -> None:
    with engine.begin() as conn:
        for stmt in STATEMENTS:
            conn.execute(stmt)
    print("✓ admin user management tables ensured.")


if __name__ == "__main__":
    main()
