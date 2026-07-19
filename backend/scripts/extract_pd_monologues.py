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
_CAPS_SPEAKER_INLINE_RE = re.compile(r"^([A-Z][A-Z'\- ]{1,25})\s*\.\s+(\S.*)$")
_PURE_NUMBER_LINE_RE = re.compile(r"^[\dIVXLC\.\s]+$")
_FTLN_RE = re.compile(r"^FTLN\s+\d+\s*")

# Words common in English (incl. verse: thou/thee/thy). A text whose word
# stream barely touches this set is a foreign-language source that slipped
# into the library mislabeled (audit: Dutch pieces inserted as English).
_EN_STOPWORDS = {
    "the", "and", "of", "to", "a", "in", "that", "is", "you", "it", "for",
    "not", "with", "he", "she", "but", "my", "me", "i", "this", "what",
    "all", "are", "so", "no", "on", "at", "we", "his", "her", "thy",
    "thou", "thee", "was", "be", "have", "your", "will", "shall", "as",
}


_SPEAKER_LEAK_RE = re.compile(r"[A-ZÀ-Þ]{3,}\s*\.\s")
_DIRECTION_LEAK_RE = re.compile(r"\b(?:Re-enter|Enter|Exit|Exeunt)\s+[A-Z]")
# Title-case cue lines woven into prose ("...aren't they? Anne. What do you
# mean?"). Two distinct non-honorific names = interleaved dialogue.
_INTERLEAVE_RE = re.compile(r"(?:[.?!”\"] )([A-Z][a-z]{2,12})\.\s+[A-Z“\"]")
_HONORIFICS = {
    "Mr", "Mrs", "Dr", "St", "Ms", "Sir", "Mme", "Mlle", "Rev", "Prof",
    "Capt", "Lieut", "Col", "Gen", "Sgt", "Jr", "Sr",
}


def piece_has_leaks(text: str) -> bool:
    """Mid-speech speaker headers ('... FRANÇOISE . Where are you'),
    unbracketed stage directions ('Re-enter Ophelia'), or interleaved
    Title-case cue lines — always another speaker's material, never
    monologue text."""
    if _SPEAKER_LEAK_RE.search(text) or _DIRECTION_LEAK_RE.search(text):
        return True
    names = [n for n in _INTERLEAVE_RE.findall(text) if n not in _HONORIFICS]
    return len(names) >= 2 and len(set(names)) >= 2


def looks_foreign(text: str) -> bool:
    """True when the text is probably not English (low English-stopword density)."""
    words = re.sub(r"[^a-z\s]", " ", (text or "").lower()).split()
    if len(words) < 15:
        return False
    hits = sum(1 for w in words if w in _EN_STOPWORDS)
    return hits / len(words) < 0.12
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
        if _HEADING_RE.match(line) or _DIRECTION_LINE_RE.match(line) or _PURE_NUMBER_LINE_RE.match(line):
            continue
        if _CAPS_SPEAKER_RE.match(line) and not line.startswith("FTLN"):
            flush()
            speaker = line.rstrip(".").strip()
            continue
        inline = _CAPS_SPEAKER_INLINE_RE.match(line)
        if inline and not line.startswith("FTLN"):
            # "PIERROT. But the moon..." — speaker header and speech on one
            # line (audit: 193 pieces leaked these headers into the text).
            flush()
            name = inline.group(1).strip()
            rest = inline.group(2)
            # Abbreviated multi-part names ("MRS. LEZINSKY. No, no...") —
            # keep consuming leading CAPS-word-period chunks into the name.
            while True:
                more = re.match(r"^([A-Z][A-Z'\-]{1,15})\s*\.\s+(\S.*)$", rest)
                if not more or len(name) + len(more.group(1)) > 25:
                    break
                name += ". " + more.group(1)
                rest = more.group(2)
            speaker = name
            line = rest
        elif speaker is None:
            continue
        line = _FTLN_RE.sub("", line)
        line = _TRAILING_VERSE_NUM_RE.sub("", line)
        line = re.sub(r"[\[\(][^\]\)]*[\]\)]", "", line)
        line = line.replace("_", "")  # Gutenberg _italics_ markup
        line = re.sub(r"\s{2,}", " ", line).strip()
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
        skipped_foreign: list[str] = []
        skipped_nondramatic: list[str] = []
        for play in plays:
            text = _get_play_text(play, scraper)
            if not text:
                no_text.append(f"{play.title} ({play.author})")
                continue
            if looks_foreign(text[:8000]):
                skipped_foreign.append(f"{play.title} ({play.author})")
                continue
            found = parser.extract_monologues(text, min_words=MIN_WORDS, max_words=MAX_WORDS)
            if len(found) < 3:
                # Folger-format fallback (bare CAPS speaker lines, FTLN prefixes)
                speeches = folger_speeches(text)
                # Non-dramatic sources (books mislabeled as plays) have almost
                # no speaker transitions; real drama switches constantly.
                words_total = len(text.split())
                if words_total and len(speeches) / (words_total / 1000) < 2:
                    skipped_nondramatic.append(f"{play.title} ({play.author})")
                    speeches = []
                found = [
                    {"character": ch, "text": sp}
                    for ch, sp in speeches
                    if MIN_WORDS <= len(sp.split()) <= MAX_WORDS
                ]
            kept = 0
            seen_this_play: set[str] = set()
            for m in found:
                speech = (m.get("text") or "").replace("_", "").strip()
                character = (m.get("character") or "").strip()
                key = dedupe_key(speech)
                if not key or key in existing_keys or key in seen_this_play:
                    continue
                q = assess_monologue_quality(speech)
                if not q.ok:
                    continue
                # Final piece-level sanity (audit-derived): no foreign text, no
                # caps residue (leaked headers), plausible character name.
                if looks_foreign(speech):
                    continue
                if len(re.findall(r"\b[A-Z]{4,}\b", speech)) >= 3:
                    continue
                if piece_has_leaks(speech):
                    continue
                if (not character or len(character) > 25
                        or character.lower() in {"all", "chorus", "both", "unknown", "omnes"}):
                    continue
                seen_this_play.add(key)
                kept += 1
                candidates.append(
                    {
                        "play_id": int(play.id),
                        "play_title": play.title,
                        "play_author": play.author,
                        "character": character,
                        "text": speech,
                        "word_count": q.word_count,
                    }
                )
            if kept:
                print(f"  {play.title[:45]:45} ({play.author[:20]:20}) +{kept}")

        print(f"\nplays scanned: {len(plays)}  no-text: {len(no_text)}  "
              f"foreign-skipped: {len(skipped_foreign)}  non-dramatic-skipped: {len(skipped_nondramatic)}  "
              f"candidates: {len(candidates)}")
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
