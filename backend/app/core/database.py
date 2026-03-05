from app.core.config import settings
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

# NullPool: required when using Supabase's connection pooler (PgBouncer in session mode).
# SQLAlchemy must NOT maintain its own pool — each request opens/closes a connection via the pooler.
# Holding persistent connections against a session-mode pooler exhausts its client limit.
engine = create_engine(
    settings.database_url,
    poolclass=NullPool,
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()


def get_db():
    """Dependency to get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
