#!/usr/bin/env python
"""
Make a user a moderator with approval permissions.

Usage:
    uv run python scripts/make_moderator.py canberkvarli@gmail.com
"""

from __future__ import annotations

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.database import SessionLocal
from app.models.user import User


def main():
    email = sys.argv[1] if len(sys.argv) > 1 else "canberkvarli@gmail.com"

    db = SessionLocal()

    try:
        # Find user by email
        user = db.query(User).filter(User.email == email).first()

        if user:
            # Grant moderator permissions
            user.is_moderator = True
            user.can_approve_submissions = True
            user.email_verified = True
            db.commit()

            print("=" * 60)
            print("✅ MODERATOR PERMISSIONS GRANTED")
            print("=" * 60)
            print(f"Email: {user.email}")
            print(f"User ID: {user.id}")
            print(f"Name: {user.name or '(not set)'}")
            print()
            print("Permissions:")
            print(f"  ✓ is_moderator: {user.is_moderator}")
            print(f"  ✓ can_approve_submissions: {user.can_approve_submissions}")
            print(f"  ✓ email_verified: {user.email_verified}")
            print()
            print("Next steps:")
            print("  1. Test moderation queue: GET /api/admin/moderation/queue")
            print("  2. Test approval: POST /api/admin/moderation/{id}/approve")
        else:
            print("❌ User not found with email:", email)
            print()
            print("Available users:")
            users = db.query(User).all()
            for u in users:
                print(f"  - {u.email} (ID: {u.id})")

    finally:
        db.close()


if __name__ == "__main__":
    main()
