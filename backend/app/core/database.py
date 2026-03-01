from app.core.config import settings
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Create PostgreSQL engine.
# pool_pre_ping: verify connections are alive before use (avoids "server closed the connection" after idle/timeout).
# pool_recycle: recycle connections before server idle timeout (e.g. Supabase pooler ~10 min).
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_recycle=300,  # 5 minutes
    pool_size=3,       # keep only 3 persistent connections
    max_overflow=5,    # allow up to 8 total (3+5) under burst
    pool_timeout=10,   # fail fast if no connection available in 10s
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
