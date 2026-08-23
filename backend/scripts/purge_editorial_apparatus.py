#!/usr/bin/env python
"""Remove scholarly apparatus that leaked into the play corpus as monologues.

Gutenberg editions of the classics carry editorial matter around the play —
textual footnotes ("2. 298. The metre of this line ... is defective"), a
bibliography, a critical preface, a printed cast list, an acrostic Argument,
even manuscript collation notes ("Changed to 2 in violet pencil"). The play
extractor occasionally captured one of these as a speech, so a search could
return a footnote where a monologue should be. 2026-08-23 scan: ~20 such rows,
found by a character_name that is a structural label ("Note IV", "Preface",
"Characters", "Scene IV") rather than a person.

Two actions:

  PURGE — the apparatus rows, matched by name label + body shape (a footnote
          opens with a "N. NNN." citation, an annotation with "Note :", a cast
          list is a run of role names, etc.). A short explicit list covers the
          few that need human judgement (a two-speaker block mis-joined, two
          critical prefaces) and cannot be pattern-matched safely.

  FIX   — four rows that ARE real soliloquies whose name got set to the scene
          heading and whose text kept a leaked speaker tag ("MASKWELL alone.",
          "Cho."). These are good audition pieces (Maskwell's Double Dealer
          soliloquies, Henry V's Chorus, Fondlewife's Old Bachelor soliloquy),
          so the tag is stripped, the name corrected, and the row re-embedded.

Everything is backed up first and restorable.

Usage (from backend/):
    uv run python scripts/purge_editorial_apparatus.py            # dry run
    uv run python scripts/purge_editorial_apparatus.py --apply
    uv run python scripts/purge_editorial_apparatus.py --restore backups/<file>.json
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
from dotenv import load_dotenv

from app.core.database import SessionLocal
from app.models.actor import Monologue
from app.utils.duration import estimate_duration_seconds
# pylint: enable=wrong-import-position

load_dotenv(backend_dir / ".env")

# A character_name that is a structural label, not a person.
_LABEL = re.compile(
    r"^\s*(note|notes|footnote|preface|argument|contents|introduction|appendix|"
    r"glossary|dramatis|characters?|persons?)\b",
    re.I,
)
# Bodies that betray apparatus regardless of the name.
_CITATION = re.compile(r"^\s*\d+\.\s*\d")               # "2. 298. ..."
_ANNOTATION = re.compile(r"^\s*Note\s*:", re.I)         # collation notes
_STAGE_DIR = re.compile(r"^\s*(A hall|A room|A street|Trumpets|Alarum|Enter )", re.I)
_SONNET = "fairest creatures we desire increase"        # Sonnet 1, misfiled

# Judgement calls that no safe pattern catches: a Strindberg two-hander joined
# into one block, and two critical prefaces cued as "II"/"XI".
_EXPLICIT_JUNK = {
    7719: "two-speaker dialogue (Thekla/Gustav) mis-joined into one block",
    17398: "editorial preface to the Every Man volume, not dialogue",
    17430: "editorial essay ('Having hastily gone over the organs of...')",
}

# Real soliloquies to keep: id -> (correct name, leaked-tag regex to strip).
_FIX = {
    17221: ("Chorus", re.compile(r"^\s*Cho\.\s*")),
    18331: ("Maskwell", re.compile(r"^\s*MASKWELL\s+alone\.\s*", re.I)),
    18332: ("Maskwell", re.compile(r"^\s*MASKWELL\s+alone\.\s*", re.I)),
    8687: ("Fondlewife", re.compile(r"^\s*FONDLEWIFE\s+_?alone_?\.\s*", re.I)),
}


def _is_junk(name: str, text: str) -> bool:
    n = (name or "").strip()
    head = (text or "")[:80]
    if _LABEL.match(n):
        return True
    if _CITATION.match(text or "") or _ANNOTATION.match(head):
        return True
    if _SONNET in (text or "")[:60].lower():
        return True
    # A "Scene N" name whose body is a stage direction, not speech.
    if re.match(r"^\s*scene\b", n, re.I) and _STAGE_DIR.match(head):
        return True
    return False


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--restore", type=str, default="")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        if args.restore:
            data = json.loads(Path(args.restore).read_text(encoding="utf-8"))
            from sqlalchemy import text as sa_text
            for row in data["purged"]:
                db.execute(sa_text(
                    "INSERT INTO monologues (id, play_id, title, character_name, text, "
                    "word_count, estimated_duration_seconds) VALUES (:id,:play_id,:title,"
                    ":character_name,:text,:word_count,:estimated_duration_seconds) "
                    "ON CONFLICT (id) DO NOTHING"), row)
            for row in data["fixed"]:
                m = db.get(Monologue, row["id"])
                if m:
                    m.character_name = row["character_name"]
                    m.text = row["text"]
                    m.word_count = row["word_count"]
            db.commit()
            print(f"restored {len(data['purged'])} purged, {len(data['fixed'])} fixed")
            return

        rows = db.query(Monologue).join(Monologue.play).filter(
            Monologue.character_name.isnot(None)
        ).all()

        purge, fix = [], []
        for m in rows:
            if m.id in _FIX:
                name, tag = _FIX[m.id]
                new_text = tag.sub("", m.text or "").strip()
                fix.append((m, name, new_text))
            elif m.id in _EXPLICIT_JUNK or _is_junk(m.character_name, m.text):
                purge.append(m)

        print(f"scanned {len(rows)} named rows")
        print(f"  PURGE (apparatus): {len(purge)}")
        for m in purge:
            print(f"    [{m.id}] {(m.character_name or '').strip()[:16]!r:<18} "
                  f"{(m.text or '')[:46]!r}")
        print(f"  FIX (real soliloquies): {len(fix)}")
        for m, name, txt in fix:
            print(f"    [{m.id}] -> {name:<10} {txt[:44]!r}")

        if not args.apply:
            print("\n(dry run - pass --apply)")
            return

        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        path = backend_dir / "backups" / f"editorial_apparatus_{stamp}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({
            "purged": [
                {"id": m.id, "play_id": m.play_id, "title": m.title,
                 "character_name": m.character_name, "text": m.text,
                 "word_count": m.word_count,
                 "estimated_duration_seconds": m.estimated_duration_seconds}
                for m in purge],
            "fixed": [
                {"id": m.id, "character_name": m.character_name, "text": m.text,
                 "word_count": m.word_count}
                for m, _n, _t in fix],
        }, ensure_ascii=False), encoding="utf-8")
        print(f"\nbackup written: {path}")

        from app.services.ai.langchain.embeddings import generate_embedding
        for m, name, txt in fix:
            m.character_name = name
            m.text = txt
            m.word_count = len(txt.split())
            m.estimated_duration_seconds = estimate_duration_seconds(txt)
            try:
                vec = generate_embedding(txt)
                if vec:
                    m.embedding_vector = vec
            except Exception as exc:  # noqa: BLE001
                print(f"  re-embed failed for {m.id}: {exc}")

        for m in purge:
            db.delete(m)
        db.commit()
        print(f"purged {len(purge)} apparatus rows, fixed {len(fix)} soliloquies")
    finally:
        db.close()


if __name__ == "__main__":
    main()
