#!/usr/bin/env python3
"""Fix category casing from 'Contemporary' to 'contemporary'."""

from app.core.database import SessionLocal
from app.models.actor import Play

def main():
    db = SessionLocal()

    try:
        # Find all plays with capitalized 'Contemporary'
        plays_to_fix = db.query(Play).filter(Play.category == 'Contemporary').all()

        print(f"Found {len(plays_to_fix)} plays with capitalized 'Contemporary' category")

        if plays_to_fix:
            print("\nFixing categories...")
            for play in plays_to_fix:
                print(f"  - {play.title} by {play.author}")
                play.category = 'contemporary'

            db.commit()
            print(f"\n✅ Fixed {len(plays_to_fix)} plays!")
        else:
            print("\n✅ No plays need fixing.")

        # Also check for 'Classical' and fix to 'classical'
        classical_to_fix = db.query(Play).filter(Play.category == 'Classical').all()

        if classical_to_fix:
            print(f"\nFound {len(classical_to_fix)} plays with capitalized 'Classical' category")
            print("Fixing categories...")
            for play in classical_to_fix:
                print(f"  - {play.title} by {play.author}")
                play.category = 'classical'

            db.commit()
            print(f"\n✅ Fixed {len(classical_to_fix)} classical plays!")

        # Show final category distribution
        from sqlalchemy import func
        categories = db.query(Play.category, func.count(Play.id)).group_by(Play.category).all()

        print("\n" + "="*70)
        print("FINAL CATEGORY DISTRIBUTION")
        print("="*70)
        for cat, count in categories:
            print(f"  {cat}: {count}")
        print("="*70)

    except Exception as e:
        print(f"❌ Error: {e}")
        db.rollback()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    main()
