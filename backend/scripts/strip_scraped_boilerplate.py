#!/usr/bin/env python
"""Remove scraped site chrome that was ingested as monologue body text.

100 monologues begin with a disclaimer the scraper lifted from the source
site's page furniture and stored as if a character had spoken it:

    Note: We are not able to display the full text for this monologue.
    However, to assist users who already have access to the script, starting
    and ending lines are presented below. Please visit our monologue database
    to find monologues that include text.

Two separate harms, and the second is the expensive one.

1. It advertises a competitor. "Please visit our monologue database" is on the
   results page of the product it competes with.

2. It poisons ranking. Embeddings are generated from the monologue text alone
   (`analyzer.generate_embedding(m.text)`), and this passage says "monologue"
   three times plus "text", "script", "users". Every one of the 100 rows
   therefore sits close to any query phrased as "... monologue", which is how
   actors phrase almost everything. Searching "comedic female monologue" on
   prod returned two of these in the top three, both badged "Best pick", both
   showing the disclaimer where the speech should be. They also all carry a
   flat quality_score of 0.85, so nothing else was holding them back.

Stripping the text without re-embedding would fix the display and leave the
ranking exactly as broken, so --apply re-embeds every row it edits.

WHAT IS AND IS NOT REMOVED

The header is byte-identical across all 100 rows, so it is removed outright.

Tails are bibliographic citations and vary. Two shapes:
  - editorial lead-in ("For full extended monologue, please refer to the
    script edition cited here: ...") — unambiguous, removed;
  - a bare citation welded onto the last line of real dialogue
    ("...make it that way-- Hnath, Lucas, A Doll's House, Part 2, Dramatists
    Play Service Inc., 2017, pp. 90-107.") — removed only on a strict match
    requiring BOTH a 4-digit year and a page marker, because the cost of
    over-stripping is deleting a character's closing line.

Rows whose remaining body is only "Start: ... End: ..." are excerpts, not
monologues — the source never had the full speech. They are counted and listed
but NOT deleted or downgraded here; that is a content decision, not a cleanup.

Usage (from backend/):
    uv run python scripts/strip_scraped_boilerplate.py            # dry run
    uv run python scripts/strip_scraped_boilerplate.py --limit 5  # sample
    uv run python scripts/strip_scraped_boilerplate.py --apply    # writes + re-embeds
    uv run python scripts/strip_scraped_boilerplate.py --restore backups/<file>.json
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

# pylint: disable=wrong-import-position
from app.core.database import SessionLocal
from app.models.actor import Monologue, Play
# pylint: enable=wrong-import-position

# The scraped header. Matched loosely on whitespace because the stored copies
# differ in line breaks, but otherwise anchored to the literal wording so it
# cannot fire on a character who happens to say "note" or "text".
HEADER = re.compile(
    r"^\s*Note:\s*We\s+are\s+not\s+able\s+to\s+display\s+the\s+full\s+text\s+for\s+this\s+"
    r"monologue\.\s*However,\s*to\s+assist\s+users\s+who\s+already\s+have\s+access\s+to\s+"
    r"the\s+script,\s*starting\s+and\s+ending\s+lines\s+are\s+presented\s+below\.\s*"
    r"Please\s+visit\s+our\s+monologue\s+database\s+to\s+find\s+monologues\s+that\s+"
    r"include\s+text\.?\s*",
    re.IGNORECASE,
)

# Editorial pointer to the published script. Always the last thing in the row.
# Wording varies more than it first looks: "For full extended monologue, please
# refer to...", "For the full monologue, refer to...", "For full, extended
# monologue see:", "For more monologues, see:".
EDITORIAL_TAIL = re.compile(
    r"\s*For\s+(?:the\s+|more\s+)?(?:full|extended)?[,]?\s*(?:and\s+)?"
    r"(?:extended\s+)?monologues?[,]?\s*"
    r"(?:please\s+)?(?:refer\s+to|see|visit)\b.*$",
    re.IGNORECASE | re.DOTALL,
)

# A bare citation welded onto the last line of dialogue. One regex cannot do
# this: the citation contains its own full stops ("Dramatists Play Service
# Inc., 1993, pp. 47." / "Scott McPherson. Marvin's Room.") so any pattern that
# stops at sentence punctuation cuts the citation in half and leaves the
# author's name sitting in the speech. Instead the tail is split into segments
# and consumed backwards while each one still looks bibliographic.
PUBLISHER = re.compile(
    r"Samuel French|Dramatists Play Service|Grove Press|Faber|Methuen|Nick Hern"
    r"|Theatre Communications Group|Playscripts|Oberon Books|Bloomsbury|Signet"
    r"|Applause|Tams-Witmark|Harper|Penguin|Vintage|Broadway Play Publishing"
    r"|Dramatic Publishing|Concord Theatricals|Playwrights Canada|Acting Edition"
    r"|Kindle Edition|Music Library",
    re.IGNORECASE,
)
PAGE = re.compile(r"\bpp?\.?\s*\d")
YEAR = re.compile(r"\b(?:19|20)\d{2}\b")
# Split on sentence enders and the em/double dashes these rows use. Titles of
# address must NOT end a segment: splitting "...speak to you Mr. | Condomine."
# makes "Condomine." look like a bare author line, and the walk below would
# then eat a word of actual dialogue.
_ABBREV = r"(?<!\bMr)(?<!\bMrs)(?<!\bMs)(?<!\bDr)(?<!\bSt)(?<!\bJr)(?<!\bSr)(?<!\bProf)(?<!\bCapt)(?<!\bMt)"
SEGMENT_SPLIT = re.compile(rf"{_ABBREV}(?<=[.!?…])\s+|(?<=--)\s+|(?<=—)\s+")

# Where a citation begins, when it begins with an author rather than a
# publisher: "Howe, Tina.", "Inge, William.", "Gurney, A.R.", "Brecht,
# Bertolt.". Surname-comma-forename is the single most reliable marker in this
# corpus, and it does not occur at the end of speech. It succeeds where the
# segment walk stalls, because the walk is stopped by ordinary lowercase words
# inside the WORK's title ("Approaching Zanzibar and other plays").
AUTHOR_START = re.compile(
    r"(?:(?<=[.!?…])|(?<=--)|(?<=—))\s+"
    r"([A-Z][A-Za-z’'\-]+,\s+[A-Z][A-Za-z.’'\-]*)"
)

# Citations run long once a publisher city gets its own sentence: "Howe, Tina.
# | Approaching Zanzibar and other plays. | Theatre Communications Group, New
# York, NY. | 1995. | p. 19." is five segments before the speech begins. A cap
# of 4 left fifteen rows with half a citation still attached.
MAX_TAIL_SEGMENTS = 10
MAX_TAIL_CHARS = 340

# Lowercase words that legitimately appear inside a citation and must not be
# read as evidence of speech. "Swerling, Jo, and Burrows, Abe." kept its author
# line purely because of the "and".
_CITATION_CONNECTORS = {
    "and", "&", "from", "with", "in", "of", "the", "a", "an", "by",
    "ed", "ed.", "eds", "eds.", "trans", "trans.", "et", "al.", "al",
    "new", "york", "london", "inc", "inc.", "ltd", "ltd.", "co", "co.",
}


def _is_biblio(seg: str) -> bool:
    """Does this trailing segment read as bibliography rather than speech?"""
    seg = seg.strip()
    if not seg:
        return False
    # Citations end in a full stop. A line ending in ! or ? is someone talking.
    if seg.endswith(("!", "?")):
        return False
    if PUBLISHER.search(seg) or PAGE.search(seg) or YEAR.search(seg):
        return True
    # A bare author or title fragment: short, and every word either capitalised
    # or a known citation connector.
    # "Scott McPherson." / "Williams, Tennessee." / "Marvin's Room." -> True.
    # "Stop it." -> False, because "it" is neither capitalised nor a connector.
    parts = seg.split()
    if 0 < len(parts) <= 8 and all(
        (not w[:1].isalpha())
        or w[:1].isupper()
        or w.lower().strip(",;:") in _CITATION_CONNECTORS
        for w in parts
    ):
        return True
    return False


def strip_citation_tail(text: str) -> str:
    """Drop a trailing bibliographic citation, or return the text unchanged.

    Only fires when the tail carries a page marker or a publisher name.
    A bare year is not enough on its own — a character may say "in 1985" —
    but a character does not say "Grove Press, 1983, p. 283".
    """
    window = text[-MAX_TAIL_CHARS:]
    if not (PAGE.search(window) or PUBLISHER.search(window)):
        return text

    candidates: list[str] = []

    # Strategy 1 — cut at a surname-comma-forename inside the tail window.
    offset = max(0, len(text) - MAX_TAIL_CHARS)
    for m in AUTHOR_START.finditer(text[offset:]):
        candidates.append(text[: offset + m.start(1)])

    # Strategy 2 — consume bibliographic segments backwards from the end.
    segments = SEGMENT_SPLIT.split(text)
    if len(segments) >= 2:
        cut_from = len(segments)
        for i in range(
            len(segments) - 1, max(-1, len(segments) - 1 - MAX_TAIL_SEGMENTS), -1
        ):
            if _is_biblio(segments[i]):
                cut_from = i
            else:
                break
        if cut_from < len(segments):
            candidates.append(" ".join(segments[:cut_from]))

    # Prefer the earliest valid cut: a citation that starts with the author
    # extends further left than one recognised only from its page number.
    best: str | None = None
    for kept in candidates:
        kept = kept.strip()
        dropped = text[len(kept):].strip() if text.startswith(kept) else text[len(kept):]
        # Refuse anything that looks like it is eating the speech itself.
        if len(dropped) > MAX_TAIL_CHARS or len(kept.split()) < 40:
            continue
        # The dropped run must be the bibliographic thing, not the whole ending.
        if not (PAGE.search(dropped) or PUBLISHER.search(dropped)):
            continue
        if best is None or len(kept) < len(best):
            best = kept
    return best if best is not None else text

EXCERPT_MARKERS = re.compile(r"\b(?:Start|End)\s*:", re.IGNORECASE)

MIN_WORDS = 75  # matches semantic_search.FILM_TV_MIN_WORDS / the purge bar


def words(text: str) -> int:
    return len((text or "").split())


def clean(text: str) -> tuple[str, list[str]]:
    """Return (cleaned_text, what_was_removed)."""
    removed: list[str] = []
    out = text

    stripped = HEADER.sub("", out, count=1)
    if stripped != out:
        removed.append("header")
        out = stripped

    stripped = EDITORIAL_TAIL.sub("", out, count=1)
    if stripped != out:
        removed.append("editorial_tail")
        out = stripped
    else:
        stripped = strip_citation_tail(out)
        if stripped != out:
            removed.append("bare_citation")
            out = stripped

    out = re.sub(r"[ \t]+", " ", out).strip()
    return out, removed


def restore(path: Path) -> None:
    data = json.loads(path.read_text(encoding="utf-8"))
    db = SessionLocal()
    try:
        for mid, original in data.items():
            row = db.get(Monologue, int(mid))
            if row is not None:
                row.text = original
        db.commit()
        print(f"Restored {len(data)} monologues from {path}")
        print("NOTE: embeddings were regenerated from the cleaned text and are")
        print("      NOT restored. Re-run the ingest embedding pass if needed.")
    finally:
        db.close()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write changes and re-embed")
    ap.add_argument("--limit", type=int, default=0, help="only look at N rows")
    ap.add_argument("--restore", type=str, default="", help="undo from a backup file")
    ap.add_argument("--no-reembed", action="store_true",
                    help="write text but skip embeddings (leaves ranking broken)")
    args = ap.parse_args()

    if args.restore:
        restore(Path(args.restore))
        return

    db = SessionLocal()
    try:
        q = (
            db.query(Monologue, Play)
            .join(Play, Play.id == Monologue.play_id)
            .filter(Monologue.text.ilike("%not able to display the full text%"))
            .order_by(Monologue.id)
        )
        if args.limit:
            q = q.limit(args.limit)
        rows = q.all()

        print(f"{len(rows)} monologues carry the scraped header\n")

        backup: dict[int, str] = {}
        edits: list[tuple[Monologue, str]] = []
        excerpts: list[tuple[int, str, int]] = []
        too_short: list[tuple[int, str, int]] = []
        counts: dict[str, int] = {}

        for m, play in rows:
            cleaned, removed = clean(m.text)
            for r in removed:
                counts[r] = counts.get(r, 0) + 1

            if not cleaned or cleaned == m.text:
                continue

            w = words(cleaned)
            if EXCERPT_MARKERS.search(cleaned):
                excerpts.append((m.id, play.title, w))
            if w < MIN_WORDS:
                too_short.append((m.id, play.title, w))

            backup[m.id] = m.text
            edits.append((m, cleaned))

            if args.limit:
                print(f"--- id={m.id} {play.title!r} ({words(m.text)} -> {w} words)")
                print(f"    removed: {', '.join(removed) or 'nothing'}")
                print(f"    after: {cleaned[:220]}\n")

        print(f"removals: {counts}")
        print(f"rows to edit: {len(edits)}")
        print(f"excerpt-only after cleaning (Start:/End:): {len(excerpts)}")
        print(f"under {MIN_WORDS} words after cleaning: {len(too_short)}")
        for mid, title, w in too_short[:15]:
            print(f"    id={mid} {title!r} -> {w} words")

        if not args.apply:
            print("\n(dry run — pass --apply)")
            return

        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup_path = backend_dir / "backups" / f"scraped_boilerplate_{stamp}.json"
        backup_path.parent.mkdir(parents=True, exist_ok=True)
        backup_path.write_text(json.dumps(backup, ensure_ascii=False), encoding="utf-8")
        print(f"\nbackup written: {backup_path}")

        for m, cleaned in edits:
            m.text = cleaned
        db.commit()
        print(f"text updated for {len(edits)} monologues")

        if args.no_reembed:
            print("SKIPPED re-embedding (--no-reembed): ranking is still poisoned.")
            return

        # Re-embed. Without this the vectors still encode the disclaimer and
        # these rows keep ranking on any query containing "monologue".
        from app.services.ai.content_analyzer import ContentAnalyzer

        analyzer = ContentAnalyzer()
        done = 0
        for m, _ in edits:
            try:
                m.embedding_vector = analyzer.generate_embedding(m.text)
                done += 1
                if done % 10 == 0:
                    db.commit()
                    print(f"  re-embedded {done}/{len(edits)}")
            except Exception as exc:  # keep going; a missed row is recoverable
                print(f"  embed failed id={m.id}: {exc}")
        db.commit()
        print(f"re-embedded {done}/{len(edits)}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
