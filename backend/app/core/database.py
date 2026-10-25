from app.core.config import settings
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# QueuePool with conservative limits for Supabase's transaction-mode pooler (port 6543).
# Reuses connections instead of opening a new TCP+TLS handshake per request (~1.5s saved each).
# pool_size=5: baseline connections kept open (idle connections cost nothing on Supabase)
# max_overflow=10: burst capacity for concurrent requests (15 total max)
# pool_pre_ping=True: test connection before use so stale connections auto-reconnect
#
# pool_recycle=1800 (was 300). Every recycle is a fresh client connection, and
# pgbouncer answers each one with `SELECT * FROM pgbouncer.get_auth($1)` --
# 1.47 million of those had accumulated, the single largest line in
# pg_stat_statements by call count, and Supabase bills the bytes. Recycling 15
# connections every 5 minutes manufactures that churn for no benefit:
# pool_pre_ping already catches a connection the pooler dropped, on the
# checkout that would have used it. Five minutes was defensive against an idle
# timeout that pre_ping was always going to handle anyway.
#
# max_overflow=20 (was 10). A class of 26 signing up in one period on
# 2026-10-22 ran the 15 out twice ("QueuePool limit of size 5 overflow 10
# reached", 21:23:55 and 21:27:18 UTC): students saw a black screen and
# monologues that took a minute or two. The pooler takes 200 clients.
engine = create_engine(
    settings.database_url,
    pool_size=5,
    max_overflow=20,
    pool_pre_ping=True,
    pool_recycle=1800,
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# A pool of its own for the fire-and-forget writes made from inside a request
# (services/events.record_user_event, services/community.record_event). They
# open a second session while the request still holds its first, so on the
# shared pool a burst of requests each held one connection and waited on
# another, nobody could finish, and everyone sat out the 30 s timeout. Here
# they wait on each other only, briefly, and a write that cannot get a
# connection in 5 s is dropped the way any failed event write is.
side_engine = create_engine(
    settings.database_url,
    pool_size=2,
    max_overflow=3,
    pool_timeout=5,
    pool_pre_ping=True,
    pool_recycle=1800,
)
SideSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=side_engine)

# Base class for models
Base = declarative_base()


def get_db():
    """Dependency to get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
