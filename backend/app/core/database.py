from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

# Determine if we're using PostgreSQL
is_postgres = settings.database_url.startswith("postgresql://") or settings.database_url.startswith("postgresql+psycopg2://")

# Export for use in models
__all__ = ["Base", "get_db", "init_db", "engine", "SessionLocal", "is_postgres"]

# Configure engine with appropriate connection args
connect_args = {}
if not is_postgres:
    # SQLite-specific connection args
    connect_args = {"check_same_thread": False}

engine = create_engine(
    settings.database_url,
    connect_args=connect_args,
    pool_pre_ping=True,  # Verify connections before using
    echo=False  # Set to True for SQL query debugging
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initialize database and enable pgvector extension if using PostgreSQL."""
    Base.metadata.create_all(bind=engine)
    
    # Enable pgvector extension for PostgreSQL
    if is_postgres:
        try:
            with engine.connect() as conn:
                conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
                conn.commit()
        except Exception as e:
            # Extension might already exist or user might not have permission
            print(f"Note: Could not enable pgvector extension: {e}")
            print("If using PostgreSQL, ensure pgvector is installed: https://github.com/pgvector/pgvector")

