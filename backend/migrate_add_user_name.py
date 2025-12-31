"""
Migration script to add name column to users table.
Adds name VARCHAR/TEXT column to store user display names.
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
    """Add name column to users table."""
    db = Session()

    try:
        if is_postgres:
            # PostgreSQL migration
            print("Migrating PostgreSQL database...")

            # Check if name column exists
            result = db.execute(text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name='users' AND column_name='name'
            """))

            if result.fetchone() is None:
                print("Adding name column...")
                db.execute(text("ALTER TABLE users ADD COLUMN name VARCHAR"))
                db.commit()
                print("✓ Added name column")
            else:
                print("✓ name column already exists")

        else:
            # SQLite migration
            print("Migrating SQLite database...")

            # Check if column exists
            result = db.execute(text("PRAGMA table_info(users)"))
            columns = {row[1]: row for row in result.fetchall()}

            if 'name' not in columns:
                print("Adding name column...")
                db.execute(text("ALTER TABLE users ADD COLUMN name TEXT"))
                db.commit()
                print("✓ Added name column")
            else:
                print("✓ name column already exists")

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
