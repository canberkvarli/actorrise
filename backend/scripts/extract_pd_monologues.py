#!/usr/bin/env python
"""Re-extract monologues from the public-domain play library. DRY-RUN by default.

Originally scoped to comedy, widened after the audit found the ORIGINAL
ingestion was format-blind: Folger-style texts (bare CAPS speaker lines,
FTLN prefixes) yielded ZERO monologues because PlainTextParser only knows
'NAME:' / 'NAME. ' formats. The comedy gap partially IS this bug.

Why: the 2026-07 search audit found comedy is 26% of search demand but 8% of
the corpus — while the library's 132 PD comedy plays yielded only 140
monologues in the original ingestion (min_words=50 favored long dramatic
speeches; comedies skew shorter). This pass re-runs extraction with a lower
floor over play texts we already have (plays.full_text) or re-fetch from each
play's own Gutenberg source_url (public domain).

Dry-run: extracts + gates + dedupes, writes candidates to a JSON report,
inserts NOTHING. --apply: AI metadata (ContentAnalyzer) + embeddings, inserts
Monologue rows, records every inserted id in
backups/comedy_extraction_ids_<ts>.json (undo = delete those ids via
--purge <file>), and stores fetched full_text back on the play row.

Usage (from backend/):
    .venv/bin/python scripts/extract_comedy_monologues.py               # dry-run
    .venv/bin/python scripts/extract_comedy_monologues.py --limit-plays 10
    .venv/bin/python scripts/extract_comedy_monologues.py --apply
    .venv/bin/python scripts/extract_comedy_monologues.py --purge backups/comedy_extraction_ids_*.json
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

MIN_WORDS = 75   # ≈30s at 150wpm — anything shorter is clip-length, the same
                 # bar the tv-clip search gate enforces
MAX_WORDS = 600
BACKUP_DIR = backend_dir / "backups"
CACHE_DIR = backend_dir / "backups" / "gutenberg_cache"


def gutenberg_id_from_url(url) -> int | None:
    """Pull the numeric book id out of any gutenberg.org URL form."""
    if not url or "gutenberg.org" not in str(url):
        return None
    m = re.search(r"/(?:ebooks|files|epub)/(\d+)", str(url))
    return int(m.group(1)) if m else None


def dedupe_key(text: str) -> str:
    """Normalized opening of a speech — same speech in two extractions collides."""
    words = re.sub(r"[^a-z0-9\s]", "", (text or "").lower()).split()
    return " ".join(words[:30])


_CAPS_SPEAKER_RE = re.compile(r"^[A-Z][A-Z'\-\. ]{1,30}$")
_FTLN_RE = re.compile(r"^FTLN\s+\d+\s*")
_TRAILING_VERSE_NUM_RE = re.compile(r"\s+\d+\s*$")
_DIRECTION_LINE_RE = re.compile(r"^[\[\(]?\s*(re-?enter|enter|exit|exeunt)\b", re.I)
_HEADING_RE = re.compile(r"^(ACT|SCENE|PROLOGUE|EPILOGUE)\b", re.I)


def folger_speeches(text: str) -> list[tuple[str, str]]:
    """Segment Folger/Gutenberg-format plays: speaker as a bare ALL-CAPS line,
    dialogue lines prefixed 'FTLN nnnn' with trailing verse numbers. This
    format is invisible to PlainTextParser (it expects 'NAME:' or 'NAME. '),
    which is why famous Shakespeare comedies yielded zero monologues at
    original ingestion."""
    speeches: list[tuple[str, str]] = []
    speaker: str | None = None
    lines: list[str] = []

    def flush():
        nonlocal lines
        if speaker and lines:
            speeches.append((speaker.title(), " ".join(lines)))
        lines = []

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if _HEADING_RE.match(line) or _DIRECTION_LINE_RE.match(line):
            continue
        if _CAPS_SPEAKER_RE.match(line) and not line.startswith("FTLN"):
            flush()
            speaker = line.rstrip(".").strip()
            continue
        if speaker is None:
            continue
        line = _FTLN_RE.sub("", line)
        line = _TRAILING_VERSE_NUM_RE.sub("", line)
        line = re.sub(r"[\[\(][^\]\)]*[\]\)]", "", line).strip()
        if line:
            lines.append(line)
    flush()
    return [(s, t) for s, t in speeches if t]


def _get_play_text(play, scraper) -> str | None:
    if play.full_text and len(play.full_text) > 5000:
        return play.full_text
    book_id = gutenberg_id_from_url(play.source_url) or gutenberg_id_from_url(play.full_text_url)
    if not book_id:
        return None
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cached = CACHE_DIR / f"pg{book_id}.txt"
    if cached.exists():
        return cached.read_text(encoding="utf-8", errors="replace")
    raw = scraper.download_text(book_id)
    if not raw:
        return None
    clean = scraper.clean_gutenberg_text(raw)
    cached.write_text(clean, encoding="utf-8")
    time.sleep(0.5)  # be polite to Gutenberg
    return clean


def purge(ids_path: Path) -> None:
    from app.core.database import SessionLocal
    from app.models.actor import Monologue

    ids = json.loads(ids_path.read_text(encoding="utf-8"))
    db = SessionLocal()
    try:
        n = (
            db.query(Monologue)
            .filter(Monologue.id.in_([int(i) for i in ids]))
            .delete(synchronize_session=False)
        )
        db.commit()
    finally:
        db.close()
    print(f"Purged {n} monologues listed in {ids_path}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--limit-plays", type=int)
    ap.add_argument("--genre", help="substring genre filter (e.g. 'comed'); default: ALL plays")
    ap.add_argument("--purge", metavar="IDS_JSON")
    args = ap.parse_args()

    if args.purge:
        purge(Path(args.purge))
        return 0

    from app.core.database import SessionLocal
    from app.models.actor import Monologue, Play
    from app.services.data_ingestion.gutenberg_scraper import GutenbergScraper
    from app.services.extraction.monologue_quality import assess_monologue_quality
    from app.services.extraction.plain_text_parser import PlainTextParser
    from app.utils.duration import estimate_duration_seconds

    db = SessionLocal()
    parser = PlainTextParser()
    scraper = GutenbergScraper(db)

    try:
        q = db.query(Play).filter(Play.source_type == "play")
        if args.genre:
            q = q.filter(Play.genre.ilike(f"%{args.genre}%"))
        all_rows = q.order_by(Play.id).all()
        # Dedupe duplicate play rows (e.g. A Midsummer Night's Dream exists
        # 19x): canonical = lowest id that has full_text, else lowest id.
        by_work: dict[tuple[str, str], list] = {}
        for p in all_rows:
            by_work.setdefault(((p.title or "").strip().lower(), (p.author or "").strip().lower()), []).append(p)
        plays = [
            next((p for p in group if p.full_text), group[0])
            for group in by_work.values()
        ]
        plays.sort(key=lambda p: p.id)
        dup_groups = sum(1 for g in by_work.values() if len(g) > 1)
        print(f"{len(all_rows)} play rows -> {len(plays)} distinct works ({dup_groups} duplicated)")
        if args.limit_plays:
            plays = plays[: args.limit_plays]

        # Openings of every existing monologue (all plays) so re-extraction
        # can't re-insert something we already carry.
        existing_keys = {
            dedupe_key(t or "")
            for (t,) in db.query(Monologue.text).all()
        }

        candidates: list[dict] = []
        no_text: list[str] = []
        for play in plays:
            text = _get_play_text(play, scraper)
            if not text:
                no_text.append(f"{play.title} ({play.author})")
                continue
            found = parser.extract_monologues(text, min_words=MIN_WORDS, max_words=MAX_WORDS)
            if len(found) < 3:
                # Folger-format fallback (bare CAPS speaker lines, FTLN prefixes)
                found = [
                    {"character": ch, "text": sp}
                    for ch, sp in folger_speeches(text)
                    if MIN_WORDS <= len(sp.split()) <= MAX_WORDS
                ]
            kept = 0
            seen_this_play: set[str] = set()
            for m in found:
                speech = (m.get("text") or "").strip()
                key = dedupe_key(speech)
                if not key or key in existing_keys or key in seen_this_play:
                    continue
                q = assess_monologue_quality(speech)
                if not q.ok:
                    continue
                seen_this_play.add(key)
                kept += 1
                candidates.append(
                    {
                        "play_id": int(play.id),
                        "play_title": play.title,
                        "play_author": play.author,
                        "character": m.get("character") or "Unknown",
                        "text": speech,
                        "word_count": q.word_count,
                    }
                )
            if kept:
                print(f"  {play.title[:45]:45} ({play.author[:20]:20}) +{kept}")

        print(f"\nplays scanned: {len(plays)}  no-text: {len(no_text)}  candidates: {len(candidates)}")
        wc = [c["word_count"] for c in candidates]
        if wc:
            wc.sort()
            print(f"word counts: min {wc[0]}  median {wc[len(wc)//2]}  max {wc[-1]}")

        report = BACKUP_DIR / "comedy_extraction_candidates.json"
        BACKUP_DIR.mkdir(exist_ok=True)
        report.write_text(json.dumps(candidates, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"candidate report: {report}")
        for c in candidates[:6]:
            print(f"  sample [{c['play_title'][:30]}] {c['character']}: {c['text'][:90]!r}")

        if not args.apply or not candidates:
            if no_text:
                print(f"no-text plays (first 10): {no_text[:10]}")
            return 0

        from app.services.ai.content_analyzer import ContentAnalyzer

        analyzer = ContentAnalyzer()
        inserted: list[int] = []
        ids_path = BACKUP_DIR / f"comedy_extraction_ids_{time.strftime('%Y%m%d-%H%M%S')}.json"
        for i, c in enumerate(candidates, 1):
            try:
                analysis = analyzer.analyze_monologue(
                    text=c["text"],
                    character=c["character"],
                    play_title=c["play_title"],
                    author=c["play_author"],
                )
                embedding = analyzer.generate_embedding(c["text"])
                tags = analyzer.generate_search_tags(analysis, c["text"], c["character"])
                mono = Monologue(
                    play_id=c["play_id"],
                    title=f"{c['character']}'s speech from {c['play_title']}",
                    character_name=c["character"],
                    text=c["text"],
                    character_gender=analysis.get("character_gender"),
                    character_age_range=analysis.get("character_age_range"),
                    word_count=c["word_count"],
                    estimated_duration_seconds=estimate_duration_seconds(c["text"]),
                    difficulty_level=analysis.get("difficulty_level"),
                    primary_emotion=analysis.get("primary_emotion"),
                    emotion_scores=analysis.get("emotion_scores"),
                    themes=analysis.get("themes"),
                    tone=analysis.get("tone"),
                    scene_description=analysis.get("scene_description"),
                    search_tags=tags,
                    is_verified=False,
                )
                if embedding:
                    mono.embedding_vector = embedding
                db.add(mono)
                db.commit()
                inserted.append(int(mono.id))
                ids_path.write_text(json.dumps(inserted), encoding="utf-8")
                if i % 25 == 0:
                    print(f"  inserted {i}/{len(candidates)}")
                time.sleep(0.3)
            except Exception as exc:  # noqa: BLE001 — keep going, report at end
                db.rollback()
                print(f"  ! skipped candidate {i} ({type(exc).__name__}: {str(exc)[:80]})")

        print(f"\ninserted {len(inserted)} monologues; undo file: {ids_path}")
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
