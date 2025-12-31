"""
Migration script to update monologue columns.
Removes difficulty column and adds theme and category columns.
"""
import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

# Get database URL
database_url = os.getenv("DATABASE_URL", "sqlite:///./database.db")
is_postgres = database_url.startswith("postgresql://") or database_url.startswith("postgresql+psycopg2://")

engine = create_engine(database_url, connect_args={"check_same_thread": False} if not is_postgres else {})
Session = sessionmaker(bind=engine)


def migrate_database():
    """Update monologue columns: remove difficulty, add theme and category."""
    db = Session()

    try:
        if is_postgres:
            # PostgreSQL migration
            print("Migrating PostgreSQL database...")

            # Check if difficulty column exists and remove it
            result = db.execute(text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name='monologues' AND column_name='difficulty'
            """))

            if result.fetchone() is not None:
                print("Removing difficulty column...")
                db.execute(text("ALTER TABLE monologues DROP COLUMN difficulty"))
                db.commit()
                print("✓ Removed difficulty column")
            else:
                print("✓ difficulty column already removed")

            # Check if theme column exists
            result = db.execute(text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name='monologues' AND column_name='theme'
            """))

            if result.fetchone() is None:
                print("Adding theme column...")
                db.execute(text("ALTER TABLE monologues ADD COLUMN theme VARCHAR"))
                db.commit()
                print("✓ Added theme column")
            else:
                print("✓ theme column already exists")

            # Check if category column exists
            result = db.execute(text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name='monologues' AND column_name='category'
            """))

            if result.fetchone() is None:
                print("Adding category column...")
                db.execute(text("ALTER TABLE monologues ADD COLUMN category VARCHAR"))
                db.commit()
                print("✓ Added category column")
            else:
                print("✓ category column already exists")

        else:
            # SQLite migration
            print("Migrating SQLite database...")

            # Check if columns exist
            result = db.execute(text("PRAGMA table_info(monologues)"))
            columns = {row[1]: row for row in result.fetchall()}

            # SQLite doesn't support DROP COLUMN easily, so we check if it exists
            if 'difficulty' in columns:
                print("⚠ Warning: SQLite doesn't support DROP COLUMN easily.")
                print("  The 'difficulty' column still exists but is no longer used.")
                print("  Consider recreating the table if needed.")

            if 'theme' not in columns:
                print("Adding theme column...")
                db.execute(text("ALTER TABLE monologues ADD COLUMN theme TEXT"))
                db.commit()
                print("✓ Added theme column")
            else:
                print("✓ theme column already exists")

            if 'category' not in columns:
                print("Adding category column...")
                db.execute(text("ALTER TABLE monologues ADD COLUMN category TEXT"))
                db.commit()
                print("✓ Added category column")
            else:
                print("✓ category column already exists")

        print("\nMigration completed successfully!")

    except Exception as e:
        print(f"Error during migration: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    migrate_database()
