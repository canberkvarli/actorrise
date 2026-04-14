#!/usr/bin/env python3
"""
One-time script to add all existing paid subscribers to the do-not-contact list.

Run from backend directory:
    DATABASE_URL='...' .venv/bin/python scripts/add_paid_users_to_dnc.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import joinedload

from app.core.database import SessionLocal
from app.models.billing import UserSubscription
from app.models.email_do_not_contact import EmailDoNotContact
from app.models.user import User


def main():
    db = SessionLocal()
    try:
        # Get all users with their subscriptions
        users = (
            db.query(User)
            .options(joinedload(User.subscription).joinedload(UserSubscription.tier))
            .all()
        )

        # Get existing DNC emails
        existing_dnc = {
            row[0].strip().lower()
            for row in db.query(EmailDoNotContact.email).all()
            if row[0]
        }

        added = 0
        skipped = 0

        for u in users:
            sub = u.subscription
            if not sub or sub.status not in ("active", "trialing"):
                continue
            tier = sub.tier
            if not tier or tier.name == "free":
                continue

            email_addr = (u.email or "").strip().lower()
            if not email_addr:
                continue

            if email_addr in existing_dnc:
                skipped += 1
                continue

            db.add(EmailDoNotContact(
                email=email_addr,
                name=u.name,
                reason="paid_subscriber",
            ))
            existing_dnc.add(email_addr)
            added += 1
            print(f"  + {email_addr} ({u.name or 'no name'})")

        db.commit()
        print(f"\nDone! Added {added} paid users to DNC, skipped {skipped} already on list.")

    finally:
        db.close()


if __name__ == "__main__":
    main()
