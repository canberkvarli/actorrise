"""Extract plays whose First Folio text abbreviates its speaker cues.

Cymbeline parses fine and was still not worth ingesting, because the Folio names
its speakers "Imo.", "Post.", "Clot." — and a monologue credited to "Clo" is
worse than no monologue at all.

The expansion is derived from the play's own stage directions rather than from
anything I happen to know about Cymbeline: "Enter Imogen" and "Exeunt Belarius"
name people in full, and every cue is a prefix of one of them. A cue that no
direction accounts for is skipped rather than guessed at, which is why "French"
and "Sicil" do not make it in.

    python -m scripts.ingest_folio_plays [--apply]
    python -m scripts.ingest_folio_plays --purge backups/folio_<ts>.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
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
MIN_WORDS = 50
MAX_WORDS = 400
CHUNK = 25

TARGETS = [("Cymbeline", "William Shakespeare")]

#: Folio orthography, not editorial taste. The Folio sets medial v as u
#: ("Aruiragus") and doubles terminal consonants, and an actor searching the
#: modern spelling should still find the part. Applied only where the text
#: itself supplies the old form.
FOLIO_SPELLINGS = {
    "Aruiragus": "Arviragus",
    "Clotten": "Cloten",
    "Queene": "Queen",
}

#: A cue that resolves to a plural is a crowd, not a person: "Lords", "Ladies".
#: Several actors speaking together is not a monologue.
GROUP_SUFFIXES = ("s",)
GROUP_CUES = {"all", "both", "omnes", "chorus", "lords", "ladies", "captaines"}


def full_names(text: str) -> Counter:
    """Character names as the stage directions give them."""
    names: Counter = Counter()
    for m in re.finditer(
        r"(?:Enter|Exeunt|Exit)\s+([A-Z][A-Za-z]+(?:[, ]+(?:and\s+)?[A-Z][A-Za-z]+)*)",
        text,
    ):
        for word in re.split(r"[, ]+|\s+and\s+", m.group(1)):
            if len(word) > 4:
                names[word] += 1
    return names


def resolve_cues(text: str, parser: PlainTextParser) -> dict[str, str]:
    """Map each abbreviated cue to the full name that starts with it."""
    names = full_names(text)
    # Named twice or more, or it is a passing noun rather than a character.
    candidates = {n for n, k in names.items() if k >= 2}
    cues = Counter(m.group(1).strip() for m in parser._TITLE_CUE.finditer(text))

    mapping: dict[str, str] = {}
    for cue, hits in cues.items():
        if hits < parser._MIN_CUE_REPEATS:
            continue
        matches = [n for n in candidates if n.lower().startswith(cue.lower())]
        if not matches:
            continue
        # Most-named wins; shorter breaks the tie, so "Cloten" beats "Clotens".
        best = max(matches, key=lambda n: (names[n], -len(n)))
        best = FOLIO_SPELLINGS.get(best, best)
        if best.lower() in GROUP_CUES or (
            best.lower().endswith(GROUP_SUFFIXES) and best.lower()[:-1] in
            {c.lower() for c in candidates}
        ):
            continue
        mapping[cue] = best
    return mapping


def _still_interleaved(body: str, others: list[str]) -> bool:
    """Another speaker's cue left inside the speech.

    Checked against the ABBREVIATIONS, because that is what the page prints.
    Expanding the names first and then looking for "Imogen." would find
    nothing, since the text says "Imo." throughout.
    """
    for name in others:
        if re.search(r"(?<=[.!?])\s*" + re.escape(name) + r"\s*\.", body):
            return True
    return False


def purge(path: Path) -> None:
    ids = json.loads(path.read_text()).get("monologue_ids", [])
    db = SessionLocal()
    try:
        n = db.query(Monologue).filter(Monologue.id.in_(ids)).delete(
            synchronize_session=False) if ids else 0
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
    analyzer = embed_batch = None
    if args.apply:
        from app.services.ai.content_analyzer import ContentAnalyzer
        from app.services.ai.langchain.embeddings import generate_embeddings_batch
        analyzer = ContentAnalyzer()
        embed_batch = generate_embeddings_batch

    new_monos: list[int] = []
    totals = {"cands": 0, "unmapped": 0, "gated": 0, "interleaved": 0,
              "dupe": 0, "kept": 0}

    for title, author in TARGETS:
        db = SessionLocal()
        try:
            play = db.query(Play).filter(
                Play.title == title, Play.author == author).first()
            if play is None or not play.full_text:
                print(f"{title}: no stored text")
                continue
            if play.copyright_status != "public_domain":
                print(f"{title}: not public_domain — skipped")
                continue

            mapping = resolve_cues(play.full_text, parser)
            print(f"{title}: {len(mapping)} cues resolved")
            for cue, name in sorted(mapping.items()):
                print(f"    {cue:<8} -> {name}")

            cands = parser.extract_monologues(
                play.full_text, min_words=MIN_WORDS, max_words=MAX_WORDS)
            totals["cands"] += len(cands)

            kept = []
            for c in cands:
                cue = c["character"]
                if cue not in mapping:
                    totals["unmapped"] += 1
                    continue
                body = to_display_text(c["text"])
                others = [k for k in mapping if k != cue]
                verdict = assess_monologue_quality(
                    body, min_words=MIN_WORDS, max_words=MAX_WORDS, cast=others)
                if not verdict.ok:
                    totals["gated"] += 1
                    continue
                if _still_interleaved(body, others):
                    totals["interleaved"] += 1
                    continue
                kept.append({**c, "text": body, "character": mapping[cue]})

            print(f"  candidates={len(cands)} kept={len(kept)}"
                  + ("" if args.apply else "  [dry]"))
            if not args.apply:
                totals["kept"] += len(kept)
                continue

            for start in range(0, len(kept), CHUNK):
                prepared = []
                for c in kept[start:start + CHUNK]:
                    if find_duplicate(db, c["text"]):
                        totals["dupe"] += 1
                        continue
                    prepared.append((c, analyzer.analyze_monologue(
                        text=c["text"], character=c["character"],
                        play_title=title, author=author)))
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

    print(f"\ncands={totals['cands']} unmapped={totals['unmapped']} "
          f"gated={totals['gated']} interleaved={totals['interleaved']} "
          f"dupes={totals['dupe']} kept={totals['kept']}")
    if not args.apply:
        print("\nDRY RUN — nothing written. Re-run with --apply.")
        return 0

    BACKUP_DIR.mkdir(exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    bk = BACKUP_DIR / f"folio_{stamp}.json"
    bk.write_text(json.dumps({"monologue_ids": new_monos}, indent=2))
    print(f"\ninserted {len(new_monos)} monologues")
    print(f"undo: python -m scripts.ingest_folio_plays --purge {bk}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
