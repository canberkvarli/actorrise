"""Fingerprints of candidates we have already looked at and turned down.

Extraction is not deterministic across runs of the SAME source: a scraper
re-reads a Gutenberg file, the parser produces the same 40-word fragment, the
75-word floor rejects it, and we have paid for the parse, the language check and
sometimes an LLM call to learn what we already knew. Worse, a short piece that
was DELETED to reclaim space looks brand new on the next pass, so it comes back,
gets rejected again, and the cycle repeats every time the source is revisited.

This table is the memory between runs. It holds the fingerprint and the reason,
never the text — storing the text is the thing we were trying to stop doing,
both for space (6,176 short rows were 45 MB) and because a candidate we refused
on rights grounds is precisely the one we must not keep a copy of.

The fingerprint is `cross_source_dedupe.text_fingerprint`, the same md5 of
lowercased alphanumerics the duplicate check uses, so a re-typeset version of
the same speech still matches.
"""

from sqlalchemy import Column, DateTime, Integer, String, Text
from sqlalchemy import text as sql_text

from app.core.database import Base


class RejectedExtraction(Base):
    """One candidate we declined, remembered so we can decline it for free."""

    __tablename__ = "rejected_extractions"

    #: md5 of the normalised text — 32 hex chars. The primary key, because the
    #: fingerprint IS the identity of the thing we are refusing.
    fingerprint = Column(String(32), primary_key=True)

    #: Why. A `QualityResult.reasons` entry ("too_short", "direction_heavy",
    #: "interleaved_dialogue") or a rights refusal ("no_license_basis").
    reason = Column(Text, nullable=False, index=True)

    word_count = Column(Integer, nullable=True)

    #: Enough to recognise it in a report without keeping the speech itself.
    character_name = Column(String, nullable=True)
    play_title = Column(String, nullable=True)
    source_url = Column(String, nullable=True)

    first_seen_at = Column(DateTime(timezone=True), server_default=sql_text("now()"))
    last_seen_at = Column(DateTime(timezone=True), server_default=sql_text("now()"))

    #: How many times a source has offered us this same rejected candidate.
    #: A high count means a scraper is re-reading something it should skip.
    times_seen = Column(Integer, nullable=False, server_default=sql_text("1"))
