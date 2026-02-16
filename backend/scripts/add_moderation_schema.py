#!/usr/bin/env python
"""
Migration: Add moderation system for user submissions.

Adds:
1. monologue_submissions table - Track user-submitted content
2. moderation_logs table - Audit trail of moderation decisions
3. User moderation fields - is_moderator, can_approve_submissions, email_verified

This enables:
- User submission workflow with AI pre-screening
- Manual moderation queue
- Email notification tracking
- Full audit trail

Usage:
    uv run python scripts/add_moderation_schema.py

Safe to run multiple times (uses IF NOT EXISTS).
"""

from __future__ import annotations

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import text

from app.core.database import engine


STATEMENTS = [
    # 1. Add moderation fields to users table
    text(
        "ALTER TABLE users "
        "ADD COLUMN IF NOT EXISTS is_moderator BOOLEAN DEFAULT FALSE NOT NULL, "
        "ADD COLUMN IF NOT EXISTS can_approve_submissions BOOLEAN DEFAULT FALSE NOT NULL, "
        "ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE NOT NULL"
    ),

    # 2. Create monologue_submissions table
    text("""
        CREATE TABLE IF NOT EXISTS monologue_submissions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            monologue_id INTEGER REFERENCES monologues(id) ON DELETE SET NULL,

            -- Submission data
            submitted_title VARCHAR NOT NULL,
            submitted_text TEXT NOT NULL,
            submitted_character VARCHAR NOT NULL,
            submitted_play_title VARCHAR NOT NULL,
            submitted_author VARCHAR NOT NULL,
            user_notes TEXT,

            -- Moderation workflow
            status VARCHAR NOT NULL DEFAULT 'pending',

            -- AI moderation
            ai_quality_score FLOAT,
            ai_copyright_risk VARCHAR,
            ai_flags JSONB,
            ai_moderation_notes TEXT,

            -- Manual review
            reviewer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            reviewer_notes TEXT,
            reviewed_at TIMESTAMP WITH TIME ZONE,

            -- Rejection
            rejection_reason VARCHAR,
            rejection_details TEXT,

            -- Timestamps
            submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            processed_at TIMESTAMP WITH TIME ZONE,

            -- Email tracking
            email_sent BOOLEAN NOT NULL DEFAULT FALSE,
            email_sent_at TIMESTAMP WITH TIME ZONE
        )
    """),

    # 3. Create moderation_logs table
    text("""
        CREATE TABLE IF NOT EXISTS moderation_logs (
            id SERIAL PRIMARY KEY,
            submission_id INTEGER NOT NULL REFERENCES monologue_submissions(id) ON DELETE CASCADE,
            action VARCHAR NOT NULL,
            actor_type VARCHAR NOT NULL,
            actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,

            -- Action details
            previous_status VARCHAR,
            new_status VARCHAR NOT NULL,
            reason TEXT,
            metadata JSONB,

            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        )
    """),

    # 4. Create indexes for performance
    text("CREATE INDEX IF NOT EXISTS idx_submissions_user_id ON monologue_submissions(user_id)"),
    text("CREATE INDEX IF NOT EXISTS idx_submissions_monologue_id ON monologue_submissions(monologue_id)"),
    text("CREATE INDEX IF NOT EXISTS idx_submissions_status ON monologue_submissions(status)"),
    text("CREATE INDEX IF NOT EXISTS idx_submissions_submitted_at ON monologue_submissions(submitted_at)"),
    text("CREATE INDEX IF NOT EXISTS idx_submissions_reviewer_id ON monologue_submissions(reviewer_id)"),

    text("CREATE INDEX IF NOT EXISTS idx_moderation_logs_submission_id ON moderation_logs(submission_id)"),
    text("CREATE INDEX IF NOT EXISTS idx_moderation_logs_created_at ON moderation_logs(created_at)"),
]


def main() -> None:
    print("=" * 60)
    print("🛡️  MODERATION SCHEMA MIGRATION")
    print("=" * 60)
    print()
    print("Adding:")
    print("  - User moderation permissions (is_moderator, can_approve_submissions)")
    print("  - monologue_submissions table")
    print("  - moderation_logs table (audit trail)")
    print("  - Performance indexes")
    print()

    with engine.begin() as conn:
        for i, stmt in enumerate(STATEMENTS, 1):
            # Show first 80 chars of statement
            stmt_preview = stmt.text.replace('\n', ' ').strip()[:80]
            print(f"[{i}/{len(STATEMENTS)}] {stmt_preview}...")

            try:
                conn.execute(stmt)
                print("  ✓ Success")
            except Exception as e:
                error_msg = str(e).lower()
                if "already exists" in error_msg or "duplicate" in error_msg:
                    print("  → Already exists (skipping)")
                else:
                    print(f"  ✗ Error: {e}")
                    raise
            print()

    print("=" * 60)
    print("✅ MODERATION SCHEMA MIGRATION COMPLETE")
    print("=" * 60)
    print()
    print("Next steps:")
    print("  1. Create AI moderation service (content_moderation.py)")
    print("  2. Add submission API endpoints")
    print("  3. Set up Resend email notifications")
    print("  4. Create admin moderation dashboard")
    print()
    print("To make a user a moderator:")
    print("  UPDATE users SET is_moderator = TRUE, can_approve_submissions = TRUE WHERE email = 'admin@example.com';")


if __name__ == "__main__":
    main()
