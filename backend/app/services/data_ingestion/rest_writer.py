"""`ingest_monologue` for a machine that cannot open a Postgres connection.

A cloud session reaches Supabase over HTTPS only: the pooler (6543) and the
direct host (IPv6) are both out of reach. The Turkish import already writes
through PostgREST for that reason. This does the same for a single excerpt, and
keeps every guarantee `pipeline.ingest_monologue` gives, in the same order:

    rights -> English -> character -> category -> word ceiling -> rejection
    memory -> quality gate -> play get-or-create -> duplicate -> analyse ->
    embed -> insert

The duplicate check is the database function `monologue_duplicate_of`
(scripts/add_monologue_duplicate_function.py), called over PostgREST as an RPC.
It is corpus-wide like `find_duplicate` (fingerprint, then nearest neighbour on
the HNSW index) and adds one rule `find_duplicate` lacks: the same speech in a
different cut. The fingerprint half runs before the analyser, so a re-run
spends nothing on a piece already stored.

Pure HTTP plus the analyser and the embedder. Importing this opens no database.
"""

from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request
from typing import Any, Callable, Optional

from app.services.data_ingestion.cross_source_dedupe import (
    DUPLICATE_DISTANCE,
    text_fingerprint,
)
from app.services.data_ingestion.pipeline import GROUP_CUES, IngestReport
from app.services.extraction.monologue_quality import (
    DEFAULT_MIN_WORDS,
    assess_monologue_quality,
    looks_non_english,
    strip_artifacts,
    to_display_text,
)
from app.services.extraction.source_adapter import resolve_metadata
from app.services.licensing import max_words_for, may_store_text
from app.utils.duration import estimate_duration_seconds


class Rest:
    """The few PostgREST calls an ingest needs. Service role, so RLS is bypassed."""

    def __init__(self, base: Optional[str] = None, key: Optional[str] = None):
        self.base = (base or os.environ["SUPABASE_URL"]).rstrip("/") + "/rest/v1/"
        self.key = key or os.environ["SUPABASE_SERVICE_ROLE_KEY"]

    def _call(self, method: str, path: str, body: Any = None) -> Any:
        req = urllib.request.Request(
            self.base + path,
            data=None if body is None else json.dumps(body, ensure_ascii=False).encode(),
            method=method,
            headers={
                "apikey": self.key,
                "Authorization": f"Bearer {self.key}",
                "Content-Type": "application/json",
                "Prefer": "return=representation",
            },
        )
        with urllib.request.urlopen(req, timeout=120) as r:
            raw = r.read()
        return json.loads(raw) if raw else None

    def get(self, table: str, **params: str) -> list[dict]:
        return self._call("GET", f"{table}?{urllib.parse.urlencode(params)}") or []

    def post(self, table: str, body: Any) -> list[dict]:
        return self._call("POST", table, body) or []

    def patch(self, table: str, body: dict, **params: str) -> list[dict]:
        return self._call("PATCH", f"{table}?{urllib.parse.urlencode(params)}", body) or []

    def duplicate_of(self, text: str, vector: Optional[list[float]] = None) -> Optional[tuple[int, str]]:
        """`monologue_duplicate_of` in the database: ``(id, reason)`` or None."""
        body: dict[str, Any] = {"p_text": text, "p_max_distance": DUPLICATE_DISTANCE}
        if vector is not None:
            body["p_embedding"] = _vector_literal(vector)
        rows = self._call("POST", "rpc/monologue_duplicate_of", body) or []
        return (rows[0]["id"], rows[0]["reason"]) if rows else None


def _vector_literal(vector: list[float]) -> str:
    return "[" + ",".join(f"{x:.6f}" for x in vector) + "]"


def rejected_fingerprints(rest: Rest, texts: list[str]) -> set[str]:
    """Which of these candidates were turned down before (`was_rejected`, batched)."""
    fps = sorted({text_fingerprint(t) for t in texts})
    seen: set[str] = set()
    for i in range(0, len(fps), 40):
        chunk = fps[i:i + 40]
        rows = rest.get(
            "rejected_extractions", select="fingerprint",
            fingerprint=f"in.({','.join(chunk)})",
        )
        seen.update(r["fingerprint"] for r in rows)
    return seen


def ingest_monologue_rest(
    rest: Rest,
    *,
    play_title: str,
    author: str,
    character: str,
    text: str,
    copyright_status: str,
    license_type: Optional[str],
    source_url: Optional[str] = None,
    year_written: Optional[int] = None,
    category: Optional[str] = None,
    genre: str = "drama",
    source_type: str = "play",
    language: str = "en",
    min_words: int = DEFAULT_MIN_WORDS,
    max_words: Optional[int] = None,
    analyzer: Any,
    embed: Callable,
    rejected: Optional[set[str]] = None,
    provided: Optional[dict] = None,
) -> IngestReport:
    """Store ONE already-extracted speech through PostgREST. Always writes.

    ``rejected`` is the output of :func:`rejected_fingerprints` for the whole
    batch, so the rejection memory costs one request per 40 candidates rather
    than one per candidate.
    """
    report = IngestReport()

    if not may_store_text(copyright_status, license_type):
        report.refused = (
            f"no basis to store text: copyright_status={copyright_status!r} "
            f"license_type={license_type!r}"
        )
        return report

    display = (text or "").strip()
    if not display:
        report.refused = "no text"
        return report
    if looks_non_english(display):
        report.refused = "source is not English"
        return report

    character = (character or "").strip()
    if not character:
        report.refused = "no character"
        return report
    if character.lower() in GROUP_CUES:
        report.refused = "group_cue"
        return report
    if not category:
        report.refused = "no era basis: category is required and must come from a verified year"
        return report

    if max_words is None:
        max_words = max_words_for(copyright_status, license_type)
    spoken = strip_artifacts(to_display_text(display))
    word_count = len(spoken.split())
    if not may_store_text(copyright_status, license_type, word_count=word_count):
        report.refused = f"excerpt too long for its rights basis: {word_count} words"
        return report

    report.candidates = 1
    fp = text_fingerprint(display)
    if rejected is not None and fp in rejected:
        report.already_rejected = 1
        return report

    verdict = assess_monologue_quality(
        display, spoken=spoken, min_words=min_words, max_words=max_words
    )
    if not verdict.ok:
        for reason in verdict.reasons:
            report._bump(reason)
        return report

    # Already stored, word for word? Checked before the play row and before
    # the analyser, so a re-run of a source costs nothing for what it has.
    if rest.duplicate_of(display):
        report.duplicates = 1
        return report

    analysis = analyzer.analyze_monologue(
        text=display, character=character, play_title=play_title, author=author,
    )
    vectors = embed([display], model="text-embedding-3-large", dimensions=1536)
    vector = vectors[0] if vectors else None
    if not vector:
        report.refused = "no embedding"
        return report
    # Near-identical, or the same speech in another cut, anywhere in the library.
    if rest.duplicate_of(display, vector):
        report.duplicates = 1
        return report

    # --- play: get or create, rights rule identical to ingest_monologue ------
    # After the analyser and the embedding, not before: a run whose OpenAI
    # calls fail (no credits, 2026-11-12) must not leave empty play rows that
    # make `library_check` say a title is in the library.
    found = rest.get(
        "plays", select="id,copyright_status,license_type,year_written",
        title=f"eq.{play_title}", author=f"eq.{author}", limit="1",
    )
    if found:
        play = found[0]
        fix: dict[str, Any] = {}
        if not may_store_text(play["copyright_status"], play["license_type"]):
            fix.update(copyright_status=copyright_status, license_type=license_type)
        if play.get("year_written") is None and year_written is not None:
            fix["year_written"] = year_written
        if fix:
            rest.patch("plays", fix, id=f"eq.{play['id']}")
        play_id = play["id"]
    else:
        play_id = rest.post("plays", {
            "title": play_title, "author": author, "category": category,
            "genre": genre, "source_type": source_type, "language": language,
            "copyright_status": copyright_status, "license_type": license_type,
            "source_url": source_url, "year_written": year_written,
        })[0]["id"]
        report.play_created = True
    report.play_id = play_id

    # What the SOURCE states (a publisher's "Age: Teen", "Gender: Female") wins
    # over what the analyser infers, when it normalises to a value we can query.
    meta = resolve_metadata(provided or {}, analysis)
    row = {
        "play_id": play_id,
        "title": f"{character}, {play_title}",
        "character_name": character,
        "text": display,
        "character_gender": meta.values.get("character_gender"),
        "character_age_range": meta.values.get("character_age_range"),
        "tone": meta.values.get("tone"),
        "word_count": len(display.split()),
        "estimated_duration_seconds": estimate_duration_seconds(spoken),
        "difficulty_level": analysis.get("difficulty_level"),
        "primary_emotion": analysis.get("primary_emotion"),
        "emotion_scores": analysis.get("emotion_scores"),
        "themes": analysis.get("themes"),
        "embedding_vector": _vector_literal(vector),
        "search_tags": analyzer.generate_search_tags(analysis, display, character),
        "text_segments": None,
    }
    report.inserted_ids.append(rest.post("monologues", row)[0]["id"])
    return report
