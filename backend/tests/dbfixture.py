"""A real database for tests, on SQLite, with foreign keys enforced.

The model tree cannot be created wholesale against SQLite — pgvector columns
elsewhere stop it — so tests name the tables they need and get those. Two things
are Postgres-only and stand down for the duration: server_default=now(), which
SQLite refuses as DDL, and ARRAY columns, which it has no type for. Both live on
the column objects, which are module-level shared state, so restore() puts them
back.

Foreign keys are switched on deliberately. SQLite ignores them by default, and
the bug this was first written for was a delete in the wrong order: without the
pragma it would have passed here and still 500'd in production.
"""

from sqlalchemy import JSON, create_engine, event
from sqlalchemy.orm import sessionmaker


def memory_db(models):
    """Create `models`' tables in a fresh in-memory database.

    Returns (session, saved) — pass `saved` to restore() when the test is done.
    """
    saved = []
    for model in models:
        for col in model.__table__.c:
            # Only now() has to go. Stripping every server_default turns plain
            # NOT NULL columns like plays.source_type into landmines SQLite can
            # no longer fill in for itself.
            #
            # str() straight off the clause: `x or ""` asks a SQLAlchemy clause
            # for its truth value, which it refuses to answer.
            default_sql = str(getattr(col.server_default, "arg", "")).lower()
            if col.server_default is not None and "now(" in default_sql:
                saved.append((col, "server_default", col.server_default))
                col.server_default = None
            if type(col.type).__name__ == "ARRAY":
                saved.append((col, "type", col.type))
                col.type = JSON()

    engine = create_engine("sqlite://")

    @event.listens_for(engine, "connect")
    def _fk_on(conn, _record):
        conn.execute("PRAGMA foreign_keys=ON")

    for model in models:
        model.__table__.create(engine)
    return sessionmaker(bind=engine)(), saved


def restore(saved):
    for col, attr, value in saved:
        setattr(col, attr, value)
