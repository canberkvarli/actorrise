"""
Migration script to add embedding column to monologues table.
Run this once to update your existing database.
"""
import sqlite3
import os
from app.core.config import settings

def migrate_database():
    # Get database path
    db_path = settings.database_url.replace("sqlite:///", "")
    
    if not os.path.exists(db_path):
        print(f"Database file not found at {db_path}. It will be created on first run.")
        return
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if column already exists
        cursor.execute("PRAGMA table_info(monologues)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if "embedding" in columns:
            print("Embedding column already exists. Migration not needed.")
            return
        
        # Add the embedding column
        print("Adding embedding column to monologues table...")
        cursor.execute("ALTER TABLE monologues ADD COLUMN embedding TEXT")
        conn.commit()
        print("Migration completed successfully!")
        
    except sqlite3.Error as e:
        print(f"Error during migration: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate_database()


