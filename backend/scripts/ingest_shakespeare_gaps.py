"""Fill the Shakespeare plays the corpus is missing, from the edition it already uses.

Cymbeline, Measure for Measure and Henry IV each had a play row holding a full
First Folio text and zero monologues. The Folio parses — once the abbreviated
cues are expanded it yields 150 speeches — and ingesting it would still have
been a mistake: all 2,868 Shakespeare rows already in the corpus are modern
spelling, and none are Folio. Dropping "Euill-ey'd vnto you" and "deliuer" in
beside them would give an actor a page they cannot read and would not perform.

So the fix was the source, not the parser. Gutenberg's 15xx series is where the
good rows came from, its gaps are exactly the missing plays, and each id below
was confirmed by reading the Title line off the file rather than recalled.

    python -m scripts.ingest_shakespeare_gaps [--apply]
    python -m scripts.ingest_shakespeare_gaps --purge backups/shakespeare_<ts>.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

import requests  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.models.actor import Monologue, Play  # noqa: E402
from app.services.data_ingestion.cross_source_dedupe import find_duplicate  # noqa: E402
from app.services.extraction.monologue_quality import (  # noqa: E402
    assess_monologue_quality,
    strip_artifacts,
    to_display_text,
)
from app.services.extraction.plain_text_parser import PlainTextParser  # noqa: E402
from app.services.extraction.source_adapter import resolve_metadata  # noqa: E402
from app.utils.duration import estimate_duration_seconds  # noqa: E402

_engine = create_engine(settings.database_url, pool_size=5, max_overflow=10,
                        pool_pre_ping=True, pool_recycle=1800)
SessionLocal = sessionmaker(autocommit=False, autoflush=False,
                            expire_on_commit=False, bind=_engine)

BACKUP_DIR = backend_dir / "backups"
DOWNLOAD = "https://www.gutenberg.org/cache/epub/{0}/pg{0}.txt"
HEADERS = {"User-Agent": "ActorRise/1.0 (+https://actorrise.com) monologue ingest"}
REQUEST_DELAY = 2.0

MIN_WORDS = 75
MAX_WORDS = 400
CHUNK = 25

AUTHOR = "William Shakespeare"

#: Titles follow the corpus convention, which drops the "King" the Gutenberg
#: files carry: the library already holds "Henry V" and "Richard III".
BOOKS: list[tuple[int, str]] = [
    (1538, "Cymbeline"),
    (1530, "Measure for Measure"),
    (1516, "Henry IV, Part 1"),
    (1518, "Henry IV, Part 2"),
    (1510, "Love's Labour's Lost"),
    (1517, "The Merry Wives of Windsor"),
    (1536, "Timon of Athens"),
    (1506, "The Two Noble Kinsmen"),
]

#: Several actors speaking at once.
GROUP_CUES = {"all", "both", "omnes", "chorus", "lords", "ladies", "citizens",
              "servants", "senators", "soldiers", "attendants"}


def _still_interleaved(body: str, others: list[str]) -> bool:
    """Another speaker's cue left inside the speech."""
    for name in others:
        loose = r"\.?\s*".join(re.escape(part) for part in name.split())
        if re.search(r"(?<=[.!?])\s*" + loose + r"\s*[.:]", body):
            return True
    return False


def purge(path: Path) -> None:
    data = json.loads(path.read_text())
    db = SessionLocal()
    try:
        ids = data.get("monologue_ids", [])
        n = db.query(Monologue).filter(Monologue.id.in_(ids)).delete(
            synchronize_session=False) if ids else 0
        for pid in data.get("play_ids", []):
            db.query(Play).filter(Play.id == pid).delete()
        db.commit()
        print(f"deleted {n} monologues from {path.name}")
    finally:
        db.close()


def fetch(book_id: int) -> str | None:
    for attempt in range(3):
        try:
            r = requests.get(DOWNLOAD.format(book_id), headers=HEADERS, timeout=45)
            if r.status_code == 200:
                return re.split(r"\*\*\*\s*START OF", r.text)[-1]
        except requests.RequestException:
            pass
        time.sleep(5 * (attempt + 1))
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--purge", type=Path, default=None)
    args = ap.parse_args()

    if args.purge:
        purge(args.purge)
        return 0

    parser = PlainTextParser()
    analyzer = embed_batch = None
    if args.apply:
        from app.services.ai.content_analyzer import ContentAnalyzer
        from app.services.ai.langchain.embeddings import generate_embeddings_batch
        analyzer = ContentAnalyzer()
        embed_batch = generate_embeddings_batch

    new_monos: list[int] = []
    new_plays: list[int] = []
    totals = {"cands": 0, "gated": 0, "interleaved": 0, "dupe": 0, "kept": 0}

    for book_id, title in BOOKS:
        text = fetch(book_id)
        time.sleep(REQUEST_DELAY)
        if not text:
            print(f"{title[:34]:36s} DOWNLOAD FAILED")
            continue

        cands = parser.extract_monologues(
            text, min_words=MIN_WORDS, max_words=MAX_WORDS)
        cast = sorted({c["character"] for c in cands})
        totals["cands"] += len(cands)

        kept = []
        for c in cands:
            if c["character"].strip().lower() in GROUP_CUES:
                totals["gated"] += 1
                continue
            body = to_display_text(c["text"])
            # Gate the SPOKEN words, store the display text. A stage
            # direction is not something the actor says, so it must not be
            # what a word floor or a cast-cue check measures — otherwise
            # "(He crosses to the window)" pads a thin speech over the floor
            # and a direction naming another character reads as an
            # interleave. This is the pattern screenplay_pdf_parser already
            # uses; the play ingests were missing it.
            spoken = strip_artifacts(body)
            others = [n for n in cast if n != c["character"]]
            if not assess_monologue_quality(
                body, spoken=spoken, min_words=MIN_WORDS, max_words=MAX_WORDS,
                cast=others
            ).ok:
                totals["gated"] += 1
                continue
            if _still_interleaved(body, others):
                totals["interleaved"] += 1
                continue
            kept.append({**c, "text": body})

        print(f"{title[:34]:36s} cands={len(cands):3d} pass={len(kept):3d} "
              f"cast={len(cast):2d}" + ("" if args.apply else "  [dry]"))
        if not args.apply:
            totals["kept"] += len(kept)
            continue
        if not kept:
            continue

        db = SessionLocal()
        try:
            play = db.query(Play).filter(
                Play.title == title, Play.author == AUTHOR).first()
            if play is None:
                play = Play(
                    title=title, author=AUTHOR, category="classical",
                    # NOT NULL, and the corpus convention for Shakespeare:
                    # 29 of his 32 rows say "drama" rather than splitting
                    # comedy/tragedy/history.
                    genre="drama",
                    source_type="play", language="en",
                    copyright_status="public_domain",
                    license_type="public_domain",
                    source_url=f"https://www.gutenberg.org/ebooks/{book_id}",
                )
                db.add(play)
                db.flush()
                new_plays.append(play.id)
            else:
                # An existing empty row pointed at a Folio text. Repoint it, or
                # the library keeps citing an edition none of its rows came from.
                play.source_url = f"https://www.gutenberg.org/ebooks/{book_id}"
                play.copyright_status = "public_domain"
                play.license_type = "public_domain"
                db.flush()

            for start in range(0, len(kept), CHUNK):
                prepared = []
                for c in kept[start:start + CHUNK]:
                    if find_duplicate(db, c["text"]):
                        totals["dupe"] += 1
                        continue
                    prepared.append((c, analyzer.analyze_monologue(
                        text=c["text"], character=c["character"],
                        play_title=title, author=AUTHOR)))
                if not prepared:
                    continue
                vectors = embed_batch(
                    [c["text"] for c, _ in prepared],
                    model="text-embedding-3-large", dimensions=1536)
                for (c, analysis), emb in zip(prepared, vectors):
                    if not emb:
                        continue
                    meta = resolve_metadata({}, analysis)
                    mono = Monologue(
                        play_id=play.id,
                        title=f"{c['character']}, {title}",
                        character_name=c["character"],
                        text=c["text"],
                        stage_directions=c.get("stage_directions"),
                        character_gender=meta.values.get("character_gender"),
                        character_age_range=meta.values.get("character_age_range"),
                        tone=meta.values.get("tone"),
                        word_count=len(c["text"].split()),
                        # Timed on the SPOKEN words. A direction is not performed
                        # aloud, so timing the display text overstates the
                        # piece and pushes it out of an actor's duration filter.
                        estimated_duration_seconds=estimate_duration_seconds(
                            strip_artifacts(c["text"])),
                        difficulty_level=analysis.get("difficulty_level"),
                        primary_emotion=analysis.get("primary_emotion"),
                        emotion_scores=analysis.get("emotion_scores"),
                        themes=analysis.get("themes"),
                        embedding_vector=emb,
                        search_tags=analyzer.generate_search_tags(
                            analysis, c["text"], c["character"]),
                    )
                    db.add(mono)
                    db.flush()
                    new_monos.append(mono.id)
                    totals["kept"] += 1
                db.commit()
                print(f"    +{totals['kept']} inserted", flush=True)
        finally:
            db.close()

    print(f"\ncands={totals['cands']} gated={totals['gated']} "
          f"interleaved={totals['interleaved']} dupes={totals['dupe']} "
          f"kept={totals['kept']}")
    if not args.apply:
        print("\nDRY RUN — nothing written. Re-run with --apply.")
        return 0

    BACKUP_DIR.mkdir(exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    bk = BACKUP_DIR / f"shakespeare_{stamp}.json"
    bk.write_text(json.dumps(
        {"monologue_ids": new_monos, "play_ids": new_plays}, indent=2))
    print(f"\ninserted {len(new_monos)} monologues across {len(new_plays)} new plays")
    print(f"undo: python -m scripts.ingest_shakespeare_gaps --purge {bk}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
