#!/usr/bin/env python
"""Ingest public-domain children's plays from Project Gutenberg. DRY-RUN by default.

The `child` age bucket exists and holds 18 pieces. The vocabulary works —
teachers can search it, "kid" and "children" map to it — but the shelf is empty,
and pointing an educator at an empty filter is worse than not having the filter.
ActorRise gives teachers and their students free Plus, so this is the gap that
offer actually runs into.

It has to come from the public domain. The audition aggregators do carry youth
monologues, but those are contemporary and copyrighted, so the rights guard
(services/licensing.py) holds them at metadata-only. Gutenberg's "Children's
plays", "Juvenile drama" and "Fairy plays" subjects are out of copyright and
free to host in full.

Two things this does differently from the other ingests:

* **Playing age comes from the source, not the model.** ContentAnalyzer would
  guess an age from the character — Santa Claus reads as elderly, a king as
  middle-aged — but playing age is about who PERFORMS the piece, and a
  children's play is performed by children. The book's own subject heading is
  better evidence than an inference from the text, so it is passed as provided
  metadata (services/extraction/source_adapter.py) and wins.

* **A lower word floor.** Children's speeches are short. The library's usual
  floor is tuned for adult audition pieces and would reject nearly everything
  here. See MIN_WORDS.

Usage (from backend/):
    uv run python scripts/ingest_childrens_plays.py --limit 3     # dry run
    uv run python scripts/ingest_childrens_plays.py               # dry run, all
    uv run python scripts/ingest_childrens_plays.py --apply
    uv run python scripts/ingest_childrens_plays.py --purge backups/childrens_<ts>.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

import requests
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models.actor import Monologue, Play
from app.services.data_ingestion.cross_source_dedupe import find_duplicate
from app.services.extraction.monologue_quality import (
    assess_monologue_quality,
    looks_non_english,
    to_display_text,
)
from app.services.extraction.plain_text_parser import PlainTextParser
from app.services.extraction.source_adapter import resolve_metadata
from app.utils.duration import estimate_duration_seconds

_engine = create_engine(settings.database_url, pool_size=5, max_overflow=10,
                        pool_pre_ping=True, pool_recycle=1800)
SessionLocal = sessionmaker(autocommit=False, autoflush=False,
                            expire_on_commit=False, bind=_engine)

BACKUP_DIR = backend_dir / "backups"
DOWNLOAD = "https://www.gutenberg.org/cache/epub/{0}/pg{0}.txt"
UA = {"User-Agent": "ActorRise/1.0 (+https://actorrise.com) monologue ingest"}

#: The library's standard floor, kept deliberately.
#:
#: 30 was tried first, on the theory that children's speeches are short. It more
#: than doubled the yield and the extra material was conversational rather than
#: performable — "No, Mr. Wolf, only about half a mile" is a line in a scene, not
#: a piece anyone auditions with. Real speeches start around 50 and are clearly
#: themselves by 60.
#:
#: Staying at 50 also keeps purge_sub_50_word_monologues.py harmless; a lower
#: floor here would have quietly queued this whole shelf for deletion.
MIN_WORDS = 50

#: Rows per commit + per embedding request. Small enough that an interrupted
#: run loses little, large enough that embedding round-trips stop dominating.
CHUNK = 25
MAX_WORDS = 400

#: Curated from Gutendex subjects "Children's plays", "Juvenile drama",
#: "Fairy plays" and "Pageants". Fiction, criticism, staging manuals and
#: Shakespeare reprints are deliberately absent — the subject heading alone is
#: not enough, each of these was checked to be an actual playscript for children.
BOOKS: list[tuple[int, str, str]] = [
    (10541, "Children's Classics in Dramatic Form", "Augusta Stevenson"),
    (16379, "Children's Classics in Dramatic Form, Book Two", "Augusta Stevenson"),
    (27764, "Dramatic Reader for Lower Grades", "Florence Holbrook"),
    (53245, "Little Dramas for Primary Grades", "Ada M. Skinner"),
    (28415, "History Plays for the Grammar Grades", "Mary Ella Lyng"),
    (35688, "Alice in Wonderland: A Dramatization", "Lewis Carroll"),
    (47609, "Nursery Comedies: Twelve Tiny Plays for Children", "Florence Bell"),
    (34763, "The Cat and Fiddle Book: Eight Dramatised Nursery Rhymes", "Florence Bell"),
    (18131, "The Rescue of the Princess Winsome", "Annie F. Johnston"),
    (18163, "Patriotic Plays and Pageants for Young People", "Constance D'Arcy Mackay"),
    (58546, "Christmas Candles: Plays for Boys and Girls", "Elsie Hobart Carter"),
    (65920, "St. Nicholas Book of Plays & Operettas", "Various"),
    (74498, "Festival Plays: One-Act Pieces", "Marguerite Merington"),
    (14508, "The Christmas Dinner", "Shepherd Knapp"),
    (14785, "Down the Chimney", "Shepherd Knapp"),
    (14786, "Up the Chimney", "Shepherd Knapp"),
    (47875, "Santa Claus' Frolics", "George M. Baker"),
    (53236, "A Thanksgiving Dream", "Effa E. Preston"),
    (53786, "The Dolls on Dress Parade", "Effa E. Preston"),
    (53832, "A Strike in Santa Land", "Effa E. Preston"),
    (54141, "A Party in Mother Goose Land", "Effa E. Preston"),
    (55001, "In a Toy Shop: A Christmas Play for Small Children", "Effa E. Preston"),
    (53426, "Uncle Sam's Right Arm: A Patriotic Exercise", "Effa E. Preston"),
    (56362, "A Troublesome Flock: A Mother Goose Play", "Elizabeth F. Guptill"),
    (53389, "An Uninvited Member: A Play for Girls", "Elizabeth F. Guptill"),
    (77302, "Tommy's Thanksgiving Dinner", "Mary Taylor Cornish"),
    (77929, "The Sleeping Beauty: A Play in Three Acts", "Theodora Du Bois"),
    (62183, "Maiden Mona the Mermaid: A Fairy Play", "Frederick A. Dixon"),
    (39022, "The Dramatization of Bible Stories", "Elizabeth M. Lobingier"),
    (36195, "Dr. Hardhack's Prescription: A Play for Children", "Harriet Beecher Stowe"),
]

#: Cues that name a group rather than a character.
GROUP_CUES = {
    "all", "both", "children", "chorus", "omnes", "together", "everyone",
    "the children", "boys", "girls", "crowd", "voices", "several", "others",
}

_GUT_START = re.compile(r"\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG[^*]*\*\*\*")
_GUT_END = re.compile(r"\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG[^*]*\*\*\*")


def strip_gutenberg_boilerplate(text: str) -> str:
    """Drop the licence header/footer so it cannot be parsed as dialogue."""
    m = _GUT_START.search(text)
    if m:
        text = text[m.end():]
    m = _GUT_END.search(text)
    if m:
        text = text[: m.start()]
    return text.strip()


def download(book_id: int) -> str | None:
    for attempt in range(3):
        try:
            r = requests.get(DOWNLOAD.format(book_id), headers=UA, timeout=60)
            if r.status_code == 200 and len(r.text) > 2000:
                return r.text
        except Exception as e:  # noqa: BLE001
            if attempt == 2:
                print(f"    download failed: {e}")
        time.sleep(2 * (attempt + 1))
    return None


def purge(path: Path) -> None:
    ids = json.loads(path.read_text())
    db = SessionLocal()
    try:
        n = db.query(Monologue).filter(Monologue.id.in_(ids["monologues"])).delete(
            synchronize_session=False
        )
        p = db.query(Play).filter(Play.id.in_(ids["plays"])).delete(
            synchronize_session=False
        )
        db.commit()
        print(f"deleted {n} monologues and {p} plays from {path.name}")
    finally:
        db.close()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--purge", type=Path, default=None)
    args = ap.parse_args()

    if args.purge:
        purge(args.purge)
        return

    books = BOOKS[: args.limit] if args.limit else BOOKS
    parser = PlainTextParser()
    analyzer = None
    if args.apply:
        from app.services.ai.content_analyzer import ContentAnalyzer
        from app.services.ai.langchain.embeddings import generate_embeddings_batch
        analyzer = ContentAnalyzer()
        embed_batch = generate_embeddings_batch

    new_plays, new_monos = [], []
    totals = {"books": 0, "candidates": 0, "gated": 0, "dupe": 0, "kept": 0,
              "non_english": 0}

    for book_id, title, author in books:
        raw = download(book_id)
        if not raw:
            print(f"{title[:44]:44s} DOWNLOAD FAILED")
            continue
        totals["books"] += 1
        text = strip_gutenberg_boilerplate(raw)

        # Gutenberg carries translations INTO other languages under an English
        # title and author, so neither can be trusted. Two Dutch Ibsen volumes
        # and a Hindi screenplay reached the library as English this way.
        # Checked on the whole book, where the signal is unambiguous.
        if looks_non_english(text):
            print(f"{title[:44]:44s} SKIPPED — not English")
            totals["non_english"] += 1
            continue
        cands = parser.extract_monologues(text, min_words=MIN_WORDS, max_words=MAX_WORDS)
        totals["candidates"] += len(cands)

        cast = sorted({c["character"] for c in cands})
        kept = []
        for c in cands:
            # "Both", "All", "Children" are chorus cues — several actors saying
            # a line together. Whatever that is, it is not a monologue.
            if c["character"].strip().lower() in GROUP_CUES:
                totals["gated"] += 1
                continue
            body = to_display_text(c["text"])
            others = [n for n in cast if n != c["character"]]
            verdict = assess_monologue_quality(
                body, min_words=MIN_WORDS, max_words=MAX_WORDS, cast=others
            )
            if not verdict.ok:
                totals["gated"] += 1
                continue
            kept.append({**c, "text": body, "word_count": verdict.word_count})

        print(f"{title[:44]:44s} cands={len(cands):3d} pass={len(kept):3d} "
              f"cast={len(cast):2d}" + ("" if args.apply else "  [dry]"))

        if not args.apply or not kept:
            totals["kept"] += len(kept)
            continue

        db = SessionLocal()
        try:
            play = db.query(Play).filter(
                Play.title == title, Play.author == author
            ).first()
            if play is None:
                play = Play(
                    title=title, author=author, genre="children",
                    category="classical", source_type="play",
                    copyright_status="public_domain",   # read by the rights guard
                    license_type="public_domain",
                    source_url=f"https://www.gutenberg.org/ebooks/{book_id}",
                )
                db.add(play)
                db.flush()
                new_plays.append(play.id)

            # Work in chunks: one embedding request per chunk instead of one per
            # row, and a commit after each so an interrupted run loses a handful
            # of rows rather than a whole book. The per-row LLM analysis cannot
            # be batched — ContentAnalyzer.batch_analyze is a loop over
            # analyze_monologue — so it stays the floor on how fast this goes.
            for start in range(0, len(kept), CHUNK):
                chunk = kept[start:start + CHUNK]
                prepared = []
                for c in chunk:
                    if find_duplicate(db, c["text"]):
                        totals["dupe"] += 1
                        continue
                    analysis = analyzer.analyze_monologue(
                        text=c["text"], character=c["character"],
                        play_title=title, author=author)
                    prepared.append((c, analysis))
                if not prepared:
                    continue

                # model/dimensions must match ContentAnalyzer.generate_embedding
                # (text-embedding-3-large @ 1536); the batch helper defaults to
                # -small, which is a different vector space entirely.
                vectors = embed_batch(
                    [c["text"] for c, _ in prepared],
                    model="text-embedding-3-large", dimensions=1536,
                )

                for (c, analysis), emb in zip(prepared, vectors):
                    if not emb:
                        continue
                    # Playing age is a fact about the book, not a guess about
                    # the character. See the module docstring.
                    meta = resolve_metadata({"character_age_range": "child"}, analysis)
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
                        estimated_duration_seconds=estimate_duration_seconds(c["text"]),
                        difficulty_level=analysis.get("difficulty_level"),
                        primary_emotion=analysis.get("primary_emotion"),
                        emotion_scores=analysis.get("emotion_scores"),
                        themes=analysis.get("themes"),
                        embedding_vector=emb,
                        search_tags=(analyzer.generate_search_tags(
                            analysis, c["text"], c["character"]) + ["children", "youth"]),
                    )
                    db.add(mono)
                    db.flush()
                    new_monos.append(mono.id)
                    totals["kept"] += 1
                db.commit()
                print(f"    +{totals['kept']} inserted", flush=True)
        finally:
            db.close()

    print(f"\nbooks={totals['books']} candidates={totals['candidates']} "
          f"gated_out={totals['gated']} non_english={totals['non_english']} "
          f"duplicates={totals['dupe']} kept={totals['kept']}")

    if not args.apply:
        print("\nDRY RUN — nothing written. Re-run with --apply.")
        return

    BACKUP_DIR.mkdir(exist_ok=True)
    ts = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    bk = BACKUP_DIR / f"childrens_{ts}.json"
    bk.write_text(json.dumps({"plays": new_plays, "monologues": new_monos}, indent=2))
    print(f"\ninserted {len(new_monos)} monologues across {len(new_plays)} plays")
    print(f"undo: uv run python scripts/ingest_childrens_plays.py --purge {bk}")


if __name__ == "__main__":
    main()
