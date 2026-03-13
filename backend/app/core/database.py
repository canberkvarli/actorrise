from app.core.config import settings
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# QueuePool with conservative limits for Supabase's transaction-mode pooler (port 6543).
# Reuses connections instead of opening a new TCP+TLS handshake per request (~1.5s saved each).
# pool_size=5: baseline connections kept open (idle connections cost nothing on Supabase)
# max_overflow=10: burst capacity for concurrent requests (15 total max)
# pool_pre_ping=True: test connection before use so stale connections auto-reconnect
# pool_recycle=300: refresh connections every 5 min to avoid pgbouncer idle timeouts
engine = create_engine(
    settings.database_url,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
    pool_recycle=300,
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
