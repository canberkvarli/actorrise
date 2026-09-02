"""One ingest path, so every source gets the same treatment.

`scrape_all_sources.py` orchestrates Gutenberg, Archive.org, Wikisource and
Perseus, and used none of this: no quality gate, no duplicate check, no language
check, no metadata, and no embedding. Rows it produced were invisible to
semantic search (nothing to search) AND to every filter (no gender, age or
tone), which is a strange kind of invisible — the count went up and the library
did not.

Meanwhile the four hand-written ingest scripts each carried their own near
identical copy of the right sequence, so a fix applied to one (the spoken-vs
display split, the direction share, the interjection merge) silently missed the
other three.

This is that sequence, once:

    language → parse → display/spoken split → skip list → quality gate →
    cast-aware interleave → duplicate → analyse → embed → insert

Two rules are enforced here rather than left to callers, because both have
already gone wrong in production:

* **Rights are a required argument.** 267 rows arrived `copyrighted` with no
  `license_type`, which `may_store_text` refuses, and nobody noticed for months.
  There is no default and no "unknown" — a source that cannot say what the basis
  is does not get ingested.
* **Anything that writes `text` clears `text_segments`.** They are two copies of
  the same words and the reader prefers the second, so a stale one is what the
  actor reads.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

from sqlalchemy.orm import Session

from app.models.actor import Monologue, Play
from app.services.data_ingestion.cross_source_dedupe import (
    find_duplicate,
    record_rejection,
    was_rejected,
)
from app.services.extraction.monologue_quality import (
    DEFAULT_MAX_WORDS,
    DEFAULT_MIN_WORDS,
    assess_monologue_quality,
    looks_non_english,
    strip_artifacts,
    to_display_text,
)
from app.services.extraction.plain_text_parser import PlainTextParser
from app.services.extraction.source_adapter import resolve_metadata
from app.services.licensing import may_store_text
from app.utils.duration import estimate_duration_seconds

logger = logging.getLogger(__name__)

#: Several actors speaking at once is not a monologue.
GROUP_CUES = frozenset({
    "all", "both", "omnes", "chorus", "lords", "ladies", "citizens", "servants",
    "senators", "soldiers", "attendants", "crowd", "guests", "children",
})

#: Rows are committed in batches so an interrupted run keeps what it earned and
#: the ids are available to the caller for an undo list.
CHUNK = 25


@dataclass
class IngestReport:
    """What happened, in enough detail to explain a disappointing number."""

    play_id: Optional[int] = None
    play_created: bool = False
    candidates: int = 0
    inserted_ids: list[int] = field(default_factory=list)
    #: reason -> count, straight from QualityResult.reasons
    rejected: dict[str, int] = field(default_factory=dict)
    duplicates: int = 0
    already_rejected: int = 0
    refused: Optional[str] = None

    @property
    def inserted(self) -> int:
        return len(self.inserted_ids)

    def _bump(self, reason: str) -> None:
        self.rejected[reason] = self.rejected.get(reason, 0) + 1

    def summary(self) -> str:
        worst = sorted(self.rejected.items(), key=lambda kv: -kv[1])[:4]
        return (
            f"candidates={self.candidates} inserted={self.inserted} "
            f"dupes={self.duplicates} seen-before={self.already_rejected} "
            + " ".join(f"{k}={v}" for k, v in worst)
        )


def ingest_play(
    db: Session,
    *,
    title: str,
    author: str,
    full_text: str,
    copyright_status: str,
    license_type: Optional[str],
    source_url: Optional[str] = None,
    source_type: str = "play",
    category: str = "classical",
    genre: str = "drama",
    language: str = "en",
    min_words: int = DEFAULT_MIN_WORDS,
    max_words: int = DEFAULT_MAX_WORDS,
    apply: bool = False,
    analyzer: Any = None,
    embed: Optional[Callable] = None,
    parser: Optional[PlainTextParser] = None,
) -> IngestReport:
    """Extract and store the monologues in ``full_text``.

    Dry by default: with ``apply=False`` nothing is written and the report still
    tells you what would have happened, which is how every ingest this year has
    been sized before it ran.

    ``analyzer`` and ``embed`` are injected rather than imported so a dry run
    costs nothing and tests need no API key. Both are required when ``apply``.
    """
    report = IngestReport()

    # --- rights, before anything else -------------------------------------
    if not may_store_text(copyright_status, license_type):
        report.refused = (
            f"no basis to store text: copyright_status={copyright_status!r} "
            f"license_type={license_type!r}"
        )
        logger.info("ingest refused for %s: %s", title, report.refused)
        return report

    if not full_text or len(full_text) < 2000:
        report.refused = "no usable full text"
        return report

    # Language is a property of the SOURCE, not of one speech — judged once on
    # the whole document. Judging it per monologue rejected real Shakespeare.
    if looks_non_english(full_text):
        report.refused = "source is not English"
        return report

    if apply and (analyzer is None or embed is None):
        raise ValueError("apply=True needs both analyzer and embed")

    parser = parser or PlainTextParser()
    candidates = parser.extract_monologues(
        full_text, min_words=min_words, max_words=max_words
    )
    report.candidates = len(candidates)
    cast = sorted({c["character"] for c in candidates})

    keep: list[dict] = []
    for cand in candidates:
        character = (cand.get("character") or "").strip()
        if character.lower() in GROUP_CUES:
            report._bump("group_cue")
            continue

        # The pair the whole pipeline is built around: `display` is what the
        # actor reads, directions kept; `spoken` is what they say, which is what
        # a word floor may measure.
        display = cand.get("text") or ""
        spoken = cand.get("dialogue") or strip_artifacts(to_display_text(display))

        # Have we already turned this exact candidate down? Costs one indexed
        # lookup and saves the gate, the analyser and the embedding.
        seen = was_rejected(db, display)
        if seen:
            report.already_rejected += 1
            continue

        others = [n for n in cast if n != character]
        verdict = assess_monologue_quality(
            display, spoken=spoken, min_words=min_words,
            max_words=max_words, cast=others,
        )
        if not verdict.ok:
            for reason in verdict.reasons:
                report._bump(reason)
            if apply:
                record_rejection(
                    db, display, verdict.reasons[0],
                    word_count=verdict.word_count,
                    character_name=character, play_title=title,
                    source_url=source_url,
                )
            continue

        keep.append({**cand, "text": display, "dialogue": spoken,
                     "character": character})

    if not apply or not keep:
        if apply:
            db.commit()          # persist any rejections we learned about
        return report

    # --- write ------------------------------------------------------------
    play = (
        db.query(Play)
        .filter(Play.title == title, Play.author == author)
        .first()
    )
    if play is None:
        play = Play(
            title=title, author=author, category=category, genre=genre,
            source_type=source_type, language=language,
            copyright_status=copyright_status, license_type=license_type,
            source_url=source_url,
        )
        db.add(play)
        db.flush()
        report.play_created = True
    report.play_id = play.id

    for start in range(0, len(keep), CHUNK):
        batch = keep[start:start + CHUNK]
        prepared = []
        for cand in batch:
            if find_duplicate(db, cand["text"]):
                report.duplicates += 1
                continue
            prepared.append((cand, analyzer.analyze_monologue(
                text=cand["text"], character=cand["character"],
                play_title=title, author=author,
            )))
        if not prepared:
            continue

        vectors = embed(
            [c["text"] for c, _ in prepared],
            model="text-embedding-3-large", dimensions=1536,
        )
        for (cand, analysis), vector in zip(prepared, vectors):
            if not vector:
                continue
            meta = resolve_metadata({}, analysis)
            mono = Monologue(
                play_id=play.id,
                title=f"{cand['character']}, {title}",
                character_name=cand["character"],
                text=cand["text"],
                stage_directions=cand.get("stage_directions"),
                character_gender=meta.values.get("character_gender"),
                character_age_range=meta.values.get("character_age_range"),
                tone=meta.values.get("tone"),
                # word_count describes the text we STORE, or the next
                # resync_word_counts.py run rewrites it. Duration is timed on
                # the spoken words, because nobody performs a stage direction.
                word_count=len(cand["text"].split()),
                estimated_duration_seconds=estimate_duration_seconds(
                    cand["dialogue"]),
                difficulty_level=analysis.get("difficulty_level"),
                primary_emotion=analysis.get("primary_emotion"),
                emotion_scores=analysis.get("emotion_scores"),
                themes=analysis.get("themes"),
                embedding_vector=vector,
                search_tags=analyzer.generate_search_tags(
                    analysis, cand["text"], cand["character"]),
                # Written fresh, so there is no stale second copy to serve.
                text_segments=None,
            )
            db.add(mono)
            db.flush()
            report.inserted_ids.append(mono.id)
        db.commit()

    logger.info("ingested %s: %s", title, report.summary())
    return report
