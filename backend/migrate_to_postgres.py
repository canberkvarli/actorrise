"""
Migration script to move from SQLite to PostgreSQL with pgvector.

This script:
1. Reads data from SQLite database
2. Converts JSON string embeddings to proper format
3. Writes to PostgreSQL database with pgvector support

Usage:
    python migrate_to_postgres.py

Make sure to set DATABASE_URL environment variable to your PostgreSQL connection string.
Example: postgresql://user:password@localhost:5432/actorrise
"""

import json
import os

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

load_dotenv()

# SQLite source
sqlite_url = "sqlite:///./database.db"
sqlite_engine = create_engine(sqlite_url, connect_args={"check_same_thread": False})
SqliteSession = sessionmaker(bind=sqlite_engine)

# PostgreSQL destination
postgres_url = os.getenv("DATABASE_URL")
if not postgres_url or not postgres_url.startswith("postgresql"):
    print("Error: DATABASE_URL must be set to a PostgreSQL connection string")
    print("Example: postgresql://user:password@localhost:5432/actorrise")
    exit(1)

postgres_engine = create_engine(postgres_url)
PostgresSession = sessionmaker(bind=postgres_engine)


def migrate_users():
    """Migrate users table."""
    print("Migrating users...")
    sqlite_db = SqliteSession()
    postgres_db = PostgresSession()
    
    try:
        # Use explicit column names to avoid order issues
        users = sqlite_db.execute(text("""
            SELECT id, email, hashed_password, created_at FROM users
        """)).fetchall()
        print(f"Found {len(users)} users")
        
        for user in users:
            postgres_db.execute(text("""
                INSERT INTO users (id, email, hashed_password, created_at)
                VALUES (:id, :email, :hashed_password, :created_at)
                ON CONFLICT (id) DO NOTHING
            """), {
                "id": user[0],
                "email": user[1],
                "hashed_password": user[2],
                "created_at": user[3]
            })
        
        postgres_db.commit()
        print(f"✓ Migrated {len(users)} users")
    except (ValueError, TypeError, KeyError) as e:
        postgres_db.rollback()
        print(f"Error migrating users: {e}")
        raise
    except Exception as e:
        postgres_db.rollback()
        print(f"Unexpected error migrating users: {e}")
        raise
    finally:
        sqlite_db.close()
        postgres_db.close()


def migrate_actor_profiles():
    """Migrate actor_profiles table."""
    print("Migrating actor profiles...")
    sqlite_db = SqliteSession()
    postgres_db = PostgresSession()
    
    try:
        # Use explicit column names to avoid order issues
        profiles = sqlite_db.execute(text("""
            SELECT id, user_id, name, age_range, gender, ethnicity, height, build,
                   location, experience_level, type, training_background, union_status,
                   preferred_genres, comfort_with_difficult_material, overdone_alert_sensitivity,
                   profile_bias_enabled, headshot_url, created_at, updated_at
            FROM actor_profiles
        """)).fetchall()
        print(f"Found {len(profiles)} actor profiles")
        
        for profile in profiles:
            # Handle JSON fields - preferred_genres is at index 13
            preferred_genres = profile[13] if len(profile) > 13 else None
            if isinstance(preferred_genres, str):
                try:
                    preferred_genres = json.loads(preferred_genres)
                except (json.JSONDecodeError, TypeError):
                    preferred_genres = []
            
            postgres_db.execute(text("""
                INSERT INTO actor_profiles (
                    id, user_id, name, age_range, gender, ethnicity, height, build,
                    location, experience_level, type, training_background, union_status,
                    preferred_genres, comfort_with_difficult_material, overdone_alert_sensitivity,
                    profile_bias_enabled, headshot_url, created_at, updated_at
                )
                VALUES (
                    :id, :user_id, :name, :age_range, :gender, :ethnicity, :height, :build,
                    :location, :experience_level, :type, :training_background, :union_status,
                    :preferred_genres, :comfort_with_difficult_material, :overdone_alert_sensitivity,
                    :profile_bias_enabled, :headshot_url, :created_at, :updated_at
                )
                ON CONFLICT (id) DO NOTHING
            """), {
                "id": profile[0],
                "user_id": profile[1],
                "name": profile[2],
                "age_range": profile[3],
                "gender": profile[4],
                "ethnicity": profile[5],
                "height": profile[6],
                "build": profile[7],
                "location": profile[8],
                "experience_level": profile[9],
                "type": profile[10],
                "training_background": profile[11],
                "union_status": profile[12] if len(profile) > 12 else None,
                "preferred_genres": json.dumps(preferred_genres) if preferred_genres else None,
                "comfort_with_difficult_material": profile[14] if len(profile) > 14 else "moderate",
                "overdone_alert_sensitivity": profile[15] if len(profile) > 15 else 0.5,
                "profile_bias_enabled": profile[16] if len(profile) > 16 else True,
                "headshot_url": profile[17] if len(profile) > 17 else None,
                "created_at": profile[18] if len(profile) > 18 else None,
                "updated_at": profile[19] if len(profile) > 19 else None,
            })
        
        postgres_db.commit()
        print(f"✓ Migrated {len(profiles)} actor profiles")
    except (ValueError, TypeError, KeyError) as e:
        postgres_db.rollback()
        print(f"Error migrating actor profiles: {e}")
        import traceback
        traceback.print_exc()
        raise
    except Exception as e:
        postgres_db.rollback()
        print(f"Unexpected error migrating actor profiles: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        sqlite_db.close()
        postgres_db.close()


def migrate_monologues():
    """Migrate monologues table, converting embeddings from JSON to vector format."""
    print("Migrating monologues...")
    sqlite_db = SqliteSession()
    postgres_db = PostgresSession()
    
    try:
        # Use explicit column names to avoid order issues
        monologues = sqlite_db.execute(text("""
            SELECT id, title, author, age_range, gender, genre, difficulty,
                   excerpt, full_text_url, source_url, embedding, created_at
            FROM monologues
        """)).fetchall()
        print(f"Found {len(monologues)} monologues")
        
        migrated = 0
        for monologue in monologues:
            # Parse embedding from JSON string - embedding is at index 10
            embedding_json = monologue[10] if len(monologue) > 10 else None
            embedding_vector = None
            
            if embedding_json:
                try:
                    embedding_list = json.loads(embedding_json)
                    if isinstance(embedding_list, list) and len(embedding_list) > 0:
                        # Convert to PostgreSQL array format for pgvector
                        embedding_vector = "[" + ",".join(str(x) for x in embedding_list) + "]"
                except (json.JSONDecodeError, TypeError) as e:
                    print(f"Warning: Could not parse embedding for monologue {monologue[0]}: {e}")
            
            # Use CAST to ensure proper vector type for pgvector
            if embedding_vector:
                postgres_db.execute(text("""
                    INSERT INTO monologues (
                        id, title, author, age_range, gender, genre, difficulty,
                        excerpt, full_text_url, source_url, embedding, created_at
                    )
                    VALUES (
                        :id, :title, :author, :age_range, :gender, :genre, :difficulty,
                        :excerpt, :full_text_url, :source_url, CAST(:embedding AS vector), :created_at
                    )
                    ON CONFLICT (id) DO NOTHING
                """), {
                    "id": monologue[0],
                    "title": monologue[1],
                    "author": monologue[2],
                    "age_range": monologue[3],
                    "gender": monologue[4],
                    "genre": monologue[5],
                    "difficulty": monologue[6],
                    "excerpt": monologue[7] if len(monologue) > 7 else None,
                    "full_text_url": monologue[8] if len(monologue) > 8 else None,
                    "source_url": monologue[9] if len(monologue) > 9 else None,
                    "embedding": embedding_vector,
                    "created_at": monologue[11] if len(monologue) > 11 else None,
                })
            else:
                # No embedding, insert without casting
                postgres_db.execute(text("""
                    INSERT INTO monologues (
                        id, title, author, age_range, gender, genre, difficulty,
                        excerpt, full_text_url, source_url, embedding, created_at
                    )
                    VALUES (
                        :id, :title, :author, :age_range, :gender, :genre, :difficulty,
                        :excerpt, :full_text_url, :source_url, :embedding, :created_at
                    )
                    ON CONFLICT (id) DO NOTHING
                """), {
                    "id": monologue[0],
                    "title": monologue[1],
                    "author": monologue[2],
                    "age_range": monologue[3],
                    "gender": monologue[4],
                    "genre": monologue[5],
                    "difficulty": monologue[6],
                    "excerpt": monologue[7] if len(monologue) > 7 else None,
                    "full_text_url": monologue[8] if len(monologue) > 8 else None,
                    "source_url": monologue[9] if len(monologue) > 9 else None,
                    "embedding": None,
                    "created_at": monologue[11] if len(monologue) > 11 else None,
                })
            migrated += 1
        
        postgres_db.commit()
        print(f"✓ Migrated {migrated} monologues")
    except (ValueError, TypeError, KeyError) as e:
        postgres_db.rollback()
        print(f"Error migrating monologues: {e}")
        import traceback
        traceback.print_exc()
        raise
    except Exception as e:
        postgres_db.rollback()
        print(f"Unexpected error migrating monologues: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        sqlite_db.close()
        postgres_db.close()


def setup_postgres():
    """Set up PostgreSQL database with pgvector extension."""
    print("Setting up PostgreSQL database...")
    postgres_db = PostgresSession()
    
    try:
        # Enable pgvector extension
        postgres_db.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        postgres_db.commit()
        print("✓ Enabled pgvector extension")
        
        # Create tables (using SQLAlchemy models)
        from app.core.database import Base
        Base.metadata.create_all(bind=postgres_engine)
        print("✓ Created tables")
    except Exception as e:
        print(f"Error setting up PostgreSQL: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        postgres_db.close()


def main():
    """Run the migration."""
    print("=" * 60)
    print("SQLite to PostgreSQL Migration")
    print("=" * 60)
    print()
    
    # Check if SQLite database exists
    if not os.path.exists("database.db"):
        print("Error: database.db not found")
        return
    
    # Setup PostgreSQL
    setup_postgres()
    print()
    
    # Migrate data
    migrate_users()
    migrate_actor_profiles()
    migrate_monologues()
    
    print()
    print("=" * 60)
    print("Migration complete!")
    print("=" * 60)
    print()
    print("Next steps:")
    print("1. Update your .env file with the PostgreSQL DATABASE_URL")
    print("2. Test your application")
    print("3. Keep database.db as backup until you verify everything works")


if __name__ == "__main__":
    main()



