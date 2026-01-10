"""
Migration script to add user_script_id column to scenes table.

Run this script to add the missing user_script_id column to the scenes table.
This column links scenes to user-uploaded scripts.
"""

import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.database import engine
from sqlalchemy import text


def add_user_script_id_column():
    """Add user_script_id column to scenes table if it doesn't exist."""
    with engine.connect() as conn:
        # Check if column already exists
        check_query = text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'scenes' 
            AND column_name = 'user_script_id'
        """)
        
        result = conn.execute(check_query)
        if result.fetchone():
            print("✓ Column 'user_script_id' already exists in 'scenes' table")
            return
        
        # Check if user_scripts table exists
        check_table_query = text("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_name = 'user_scripts'
        """)
        
        table_result = conn.execute(check_table_query)
        if not table_result.fetchone():
            print("⚠ Warning: 'user_scripts' table does not exist. Creating it first...")
            # The table should be created by SQLAlchemy, but we'll handle it here if needed
            print("   Please ensure UserScript model is imported and tables are created.")
        
        # Add the column
        print("Adding 'user_script_id' column to 'scenes' table...")
        alter_query = text("""
            ALTER TABLE scenes 
            ADD COLUMN user_script_id INTEGER 
            REFERENCES user_scripts(id) 
            ON DELETE SET NULL
        """)
        
        try:
            conn.execute(alter_query)
            conn.commit()
            print("✓ Successfully added 'user_script_id' column to 'scenes' table")
            
            # Create index if it doesn't exist
            print("Creating index on 'user_script_id'...")
            index_query = text("""
                CREATE INDEX IF NOT EXISTS ix_scenes_user_script_id 
                ON scenes(user_script_id)
            """)
            conn.execute(index_query)
            conn.commit()
            print("✓ Successfully created index on 'user_script_id'")
            
        except Exception as e:
            conn.rollback()
            print(f"✗ Error adding column: {e}")
            raise


if __name__ == "__main__":
    print("Running migration: Add user_script_id to scenes table")
    print("=" * 60)
    add_user_script_id_column()
    print("=" * 60)
    print("Migration complete!")
