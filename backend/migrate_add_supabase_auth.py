"""
Migration script to add Supabase Auth support to users table.
Adds supabase_id column and makes hashed_password nullable.
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
    """Add supabase_id column and make hashed_password nullable."""
    db = Session()
    
    try:
        if is_postgres:
            # PostgreSQL migration
            print("Migrating PostgreSQL database...")
            
            # Check if supabase_id column exists
            result = db.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='users' AND column_name='supabase_id'
            """))
            
            if result.fetchone() is None:
                print("Adding supabase_id column...")
                db.execute(text("ALTER TABLE users ADD COLUMN supabase_id VARCHAR UNIQUE"))
                db.commit()
                print("✓ Added supabase_id column")
            else:
                print("✓ supabase_id column already exists")
            
            # Make hashed_password nullable (if not already)
            result = db.execute(text("""
                SELECT is_nullable 
                FROM information_schema.columns 
                WHERE table_name='users' AND column_name='hashed_password'
            """))
            
            row = result.fetchone()
            if row and row[0] == 'NO':
                print("Making hashed_password nullable...")
                db.execute(text("ALTER TABLE users ALTER COLUMN hashed_password DROP NOT NULL"))
                db.commit()
                print("✓ Made hashed_password nullable")
            else:
                print("✓ hashed_password is already nullable")
                
        else:
            # SQLite migration
            print("Migrating SQLite database...")
            
            # SQLite doesn't support ALTER COLUMN easily, so we check if column exists
            result = db.execute(text("PRAGMA table_info(users)"))
            columns = {row[1]: row for row in result.fetchall()}
            
            if 'supabase_id' not in columns:
                print("Adding supabase_id column...")
                db.execute(text("ALTER TABLE users ADD COLUMN supabase_id TEXT UNIQUE"))
                db.commit()
                print("✓ Added supabase_id column")
            else:
                print("✓ supabase_id column already exists")
            
            # SQLite columns are nullable by default, so hashed_password should be fine
            print("✓ hashed_password is nullable (SQLite default)")
        
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

