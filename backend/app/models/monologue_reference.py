"""Monologues we know exist and can point at, but do not hold (CAN-24).

Contemporary plays are where the library is thinnest (a third of contemporary
searches come back weak, more for teens), and almost all of them are in
copyright. A reference row is the fair way to answer anyway: who speaks it, in
which play, who wrote it, who licenses it, and where to get the script.

There is deliberately no column for the speech. Facts about a work are not the
work; the words are, and they are never read, stored or served here. When a
playwright says yes, the piece goes in through the normal ingest as `licensed`
and the reference can go.
"""

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, text
from sqlalchemy.sql import func

from app.core.database import Base


class MonologueReference(Base):
    __tablename__ = "monologue_references"

    id = Column(Integer, primary_key=True)
    play_title = Column(String(300), nullable=False)
    character_name = Column(String(200), nullable=False)
    author = Column(String(200), nullable=False)
    publisher = Column(String(200), nullable=True)
    character_gender = Column(String(20), nullable=True)  # female / male / any
    character_age = Column(String(40), nullable=True)  # as the source states it, e.g. "16"
    is_teen = Column(Boolean, nullable=False, default=False)
    genre = Column(String(40), nullable=True)  # comedy / drama / dramedy / seriocomic
    year = Column(Integer, nullable=True)  # premiere or publication
    act = Column(String(20), nullable=True)
    scene = Column(String(20), nullable=True)
    get_script_url = Column(Text, nullable=True)  # where an actor buys or reads the play
    source_url = Column(Text, nullable=True)  # where we verified the facts
    language = Column(String(8), nullable=False, default="en")
    active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


#: Table + RLS in one go, at API startup before create_all (so the table never
#: exists without RLS) and by scripts/add_monologue_references_table.py. RLS on,
#: no policies: read only by the API over the service connection.
DDL = [
    text(
        """
        CREATE TABLE IF NOT EXISTS monologue_references (
            id SERIAL PRIMARY KEY,
            play_title VARCHAR(300) NOT NULL,
            character_name VARCHAR(200) NOT NULL,
            author VARCHAR(200) NOT NULL,
            publisher VARCHAR(200),
            character_gender VARCHAR(20),
            character_age VARCHAR(40),
            is_teen BOOLEAN NOT NULL DEFAULT FALSE,
            genre VARCHAR(40),
            year INTEGER,
            act VARCHAR(20),
            scene VARCHAR(20),
            get_script_url TEXT,
            source_url TEXT,
            language VARCHAR(8) NOT NULL DEFAULT 'en',
            active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
        """
    ),
    text("ALTER TABLE monologue_references ENABLE ROW LEVEL SECURITY"),
    text(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_monologue_references_piece "
        "ON monologue_references (lower(play_title), lower(character_name), lower(author))"
    ),
]
