"""
Script to seed the database with monologues.
This file is intentionally empty - monologues should be imported from real sources.
"""
from app.core.database import SessionLocal
from app.models.actor import Monologue

# No sample monologues - use real data sources instead
sample_monologues = []


def seed_monologues():
    db = SessionLocal()
    try:
        # Check if monologues already exist
        existing_count = db.query(Monologue).count()
        if existing_count > 0:
            print(f"Database already has {existing_count} monologues. Skipping seed.")
            return

        print("No sample monologues configured. Please import monologues from real sources.")
        print("Consider using Backstage.com API or other monologue databases.")
    except Exception as e:
        db.rollback()
        print(f"Error checking monologues: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()


if __name__ == "__main__":
    seed_monologues()
