"""Extract the plays whose speaker cues are set in Title Case.

Tartuffe, Rosmersholm and An Enemy of the People have sat in the library with
their full text stored and zero monologues each, because both of the parser's
original patterns require an ALL-CAPS speaker name and Gutenberg's Ibsen and
Molière transcriptions use Title Case. Measure for Measure parsed and Tartuffe
did not, on the case of the cue alone.

The parser reads those cues now, so this mines the `full_text` already on the
play rows. Nothing is downloaded: the text is here, it was only unreadable.

Cymbeline is deliberately NOT in the list. It parses, but the First Folio names
its speakers in abbreviations — Clo, Cor, Bel — and a monologue credited to
"Clo" is worse than no monologue. It needs an expansion table first.

    python -m scripts.ingest_titlecase_pd_plays [--apply]
    python -m scripts.ingest_titlecase_pd_plays --purge backups/titlecase_<ts>.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.models.actor import Monologue, Play  # noqa: E402
from app.services.data_ingestion.cross_source_dedupe import find_duplicate  # noqa: E402
from app.services.extraction.monologue_quality import (  # noqa: E402
    assess_monologue_quality,
    looks_non_english,
    to_display_text,
)
from app.services.extraction.plain_text_parser import PlainTextParser  # noqa: E402
from app.services.extraction.source_adapter import resolve_metadata  # noqa: E402
from app.utils.duration import estimate_duration_seconds  # noqa: E402

# Long scrapes outlive Supabase's pooler idle timeout; same dedicated engine the
# other ingests use.
_engine = create_engine(settings.database_url, pool_size=5, max_overflow=10,
                        pool_pre_ping=True, pool_recycle=1800)
SessionLocal = sessionmaker(autocommit=False, autoflush=False,
                            expire_on_commit=False, bind=_engine)

BACKUP_DIR = backend_dir / "backups"

MIN_WORDS = 50
MAX_WORDS = 400
CHUNK = 25

#: Several actors speaking at once is not a monologue, whatever else it is.
GROUP_CUES = {"all", "both", "omnes", "chorus", "crowd", "others", "several"}

#: Title + author, matched against the existing rows. Only plays already marked
#: public_domain are touched, so the rights guard has nothing to re-decide.
TARGETS = [
    ("Tartuffe", "Molière"),
    ("An Enemy of the People", "Henrik Ibsen"),
    ("Rosmersholm", "Henrik Ibsen"),
]


def _still_interleaved(body: str, others: list[str]) -> bool:
    """True if another character's cue survived inside this speech.

    `assess_monologue_quality` runs the same idea, but against the parser's
    NORMALISED names — periods stripped, title-cased — so its "Mrs Stockmann"
    never matches the "Mrs. Stockmann." actually printed in the text, and the
    check passes a speech with three people in it. This re-checks with the
    punctuation put back, and is the last thing standing between the corpus and
    another 200 rows of glued-together dialogue.
    """
    for name in others:
        # "Mrs Stockmann" has to match "Mrs. Stockmann." as printed.
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
            synchronize_session=False
        ) if ids else 0
        db.commit()
        print(f"deleted {n} monologues listed in {path.name}")
    finally:
        db.close()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--purge", type=Path, default=None)
    args = ap.parse_args()

    if args.purge:
        purge(args.purge)
        return 0

    parser = PlainTextParser()
    analyzer = None
    embed_batch = None
    if args.apply:
        from app.services.ai.content_analyzer import ContentAnalyzer
        from app.services.ai.langchain.embeddings import generate_embeddings_batch

        analyzer = ContentAnalyzer()
        embed_batch = generate_embeddings_batch

    new_monos: list[int] = []
    totals = {"cands": 0, "gated": 0, "interleaved": 0, "dupe": 0, "kept": 0}

    for title, author in TARGETS:
        db = SessionLocal()
        try:
            play = (
                db.query(Play)
                .filter(Play.title == title, Play.author == author)
                .first()
            )
            if play is None or not play.full_text:
                print(f"{title[:40]:40s} NO STORED TEXT — skipped")
                continue
            if play.copyright_status != "public_domain":
                # Belt and braces. These are pre-1900 works, but the ingest
                # should never be the thing that decides that.
                print(f"{title[:40]:40s} not public_domain — skipped")
                continue

            cands = parser.extract_monologues(
                play.full_text, min_words=MIN_WORDS, max_words=MAX_WORDS
            )
            cast = sorted({c["character"] for c in cands})
            totals["cands"] += len(cands)

            kept = []
            for c in cands:
                if c["character"].strip().lower() in GROUP_CUES:
                    totals["gated"] += 1
                    continue
                body = to_display_text(c["text"])
                if looks_non_english(body):
                    totals["gated"] += 1
                    continue
                others = [n for n in cast if n != c["character"]]
                verdict = assess_monologue_quality(
                    body, min_words=MIN_WORDS, max_words=MAX_WORDS, cast=others
                )
                if not verdict.ok:
                    totals["gated"] += 1
                    continue
                if _still_interleaved(body, others):
                    totals["interleaved"] += 1
                    continue
                kept.append({**c, "text": body})

            print(f"{title[:40]:40s} cands={len(cands):3d} pass={len(kept):3d} "
                  f"cast={len(cast):2d}" + ("" if args.apply else "  [dry]"))
            if not args.apply:
                totals["kept"] += len(kept)
                continue

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

                # Must match ContentAnalyzer.generate_embedding
                # (text-embedding-3-large @ 1536). The batch helper defaults to
                # -small, which is the same width and a different vector space,
                # so the rows would look searchable and never match anything.
                vectors = embed_batch(
                    [c["text"] for c, _ in prepared],
                    model="text-embedding-3-large", dimensions=1536,
                )

                for (c, analysis), emb in zip(prepared, vectors):
                    if not emb:
                        continue
                    # No provided overrides: unlike the children's books, the age
                    # of these characters is not a fact about the source.
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
                        estimated_duration_seconds=estimate_duration_seconds(c["text"]),
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
    bk = BACKUP_DIR / f"titlecase_{stamp}.json"
    bk.write_text(json.dumps({"monologue_ids": new_monos}, indent=2))
    print(f"\ninserted {len(new_monos)} monologues")
    print(f"undo: python -m scripts.ingest_titlecase_pd_plays --purge {bk}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
