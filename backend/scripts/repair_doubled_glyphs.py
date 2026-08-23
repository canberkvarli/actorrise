#!/usr/bin/env python
"""Repair monologues whose text renders every glyph twice.

A vintage of ScriptSlug PDFs draws some type double-struck (bold cues, and on a
few scripts the whole dialogue block), so pdfplumber extracts each glyph twice:
"Dearest Scottie" comes out "DDeeaarreesstt SSccoottttiiee", and a character cue
"Gloria" as "Gglloorriiaa". The doubling is perfectly uniform — every character
appears exactly twice — so it is losslessly reversible by keeping one of each
adjacent identical pair. That is safer than it sounds: a genuinely repeated
letter ("moon") was itself doubled to four ("mmoooonn"), and folding pairs
returns it to two.

Two damage sites, found by scanning the film corpus 2026-08-23:
  - 14 character NAMES doubled (e.g. "SSCCOOTTTTIIEE", "Gglloorriiaa )")
  - 5 monologue BODIES doubled (4 Vertigo speeches, 1 Silence of the Lambs) —
    real, well-known monologues that were unsearchable as stored.

A repaired body has a new word_count and a stale embedding, so both are
refreshed: the embedding is regenerated from the fixed text and
estimated_duration_seconds recomputed, the same as the admin edit path.

Detection is deliberately conservative — a row is only touched when its text is
uniformly doubled (>= _DOUBLED_RATIO of adjacent letter pairs match across a
sample), so an ordinary monologue with a few coincidental double letters is
never rewritten.

Usage (from backend/):
    uv run python scripts/repair_doubled_glyphs.py            # dry run
    uv run python scripts/repair_doubled_glyphs.py --apply
    uv run python scripts/repair_doubled_glyphs.py --restore backups/<file>.json
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

# Uniform glyph-doubling scores 1.0 — every adjacent letter pair matches. A real
# name with one incidental double ("Kaffee", "Colleen") scores ~0.67, so the bar
# sits at 0.9 to fold only the genuinely double-struck text and never a correctly
# spelled double letter.
_DOUBLED_RATIO = 0.9
_SAMPLE = 200


def _letter_pairs_match(sample: str) -> float:
    # Floor of 6 letters: character cues are short ("Amy" doubles to a 6-letter
    # "aammyy") and must still be measurable, while 6 is far too few for a normal
    # word to reach the 0.6 ratio by chance. Bodies are always far longer.
    s = re.sub(r"[^a-z]", "", sample.lower())
    if len(s) < 6:
        return 0.0
    pairs = len(s) // 2
    return sum(1 for i in range(0, 2 * pairs, 2) if s[i] == s[i + 1]) / pairs


def is_doubled(text: str) -> bool:
    return _letter_pairs_match(text[:_SAMPLE]) >= _DOUBLED_RATIO


def dedouble(s: str) -> str:
    """Fold each adjacent identical pair in half, greedily.

    Walk the string keeping one of every adjacent pair. The comparison is
    case-insensitive because character cues double their leading capital as
    cap+lowercase ("Teen" -> "Tteeeenn", the T pairing with a t), while body
    glyphs double case-exact ("This" -> "TThhiiss"); folding case-insensitively
    handles both and keeps the first char's own case. A genuinely repeated
    letter survives: "Dutton" doubled to "Dduuttttoonn" folds the "tttt" back to
    "tt", not "t". Only ever called on a string already detected as uniformly
    doubled, so a normal name with one incidental double is never reached.
    """
    out = []
    i = 0
    n = len(s)
    while i < n:
        out.append(s[i])
        if i + 1 < n and s[i + 1].lower() == s[i].lower():
            i += 2
        else:
            i += 1
    return "".join(out)


def _clean_name(name: str) -> str:
    fixed = dedouble(name)
    # Cues arrive as "Gloria )" / "Gloria (CONT'D)"; keep just the name.
    fixed = re.sub(r"\s*\(?(cont'?d|v\.?o\.?|o\.?s\.?)\)?\s*$", "", fixed, flags=re.I)
    return fixed.strip(" )(").strip()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--restore", type=str, default="")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        if args.restore:
            data = json.loads(Path(args.restore).read_text(encoding="utf-8"))
            for row in data:
                m = db.get(Monologue, row["id"])
                if not m:
                    continue
                m.character_name = row["character_name"]
                m.text = row["text"]
                m.word_count = row["word_count"]
                m.estimated_duration_seconds = row["estimated_duration_seconds"]
                if row.get("embedding_vector") is not None:
                    m.embedding_vector = row["embedding_vector"]
            db.commit()
            print(f"restored {len(data)} rows")
            return

        # Only film rows are affected (the doubled PDFs are all films), but the
        # scan is cheap enough to run over everything with text.
        rows = db.query(Monologue).filter(Monologue.text.isnot(None)).all()

        name_fixes, body_fixes = [], []
        for m in rows:
            name = m.character_name or ""
            body = m.text or ""
            new_name = _clean_name(name) if _letter_pairs_match(name) >= _DOUBLED_RATIO else None
            new_body = dedouble(body) if is_doubled(body) else None
            if new_name and new_name != name:
                name_fixes.append((m, new_name))
            if new_body and new_body != body:
                body_fixes.append((m, new_body))

        print(f"scanned {len(rows)} rows")
        print(f"  doubled names: {len(name_fixes)}")
        print(f"  doubled bodies: {len(body_fixes)}")
        for m, nn in name_fixes[:20]:
            print(f"    name  [{m.id}] {m.character_name!r} -> {nn!r}")
        for m, nb in body_fixes[:20]:
            print(f"    body  [{m.id}] {m.word_count}w -> "
                  f"{len(nb.split())}w :: {nb[:60]!r}")

        if not args.apply:
            print("\n(dry run - pass --apply)")
            return

        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        touched = {m.id for m, _ in name_fixes} | {m.id for m, _ in body_fixes}
        by_id = {m.id: m for m in rows if m.id in touched}
        path = backend_dir / "backups" / f"doubled_glyph_repair_{stamp}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps([
            {"id": m.id, "character_name": m.character_name, "text": m.text,
             "word_count": m.word_count,
             "estimated_duration_seconds": m.estimated_duration_seconds,
             "embedding_vector": [float(x) for x in m.embedding_vector]
                 if m.embedding_vector is not None else None}
            for m in by_id.values()
        ], ensure_ascii=False), encoding="utf-8")
        print(f"\nbackup written: {path}")

        for m, nn in name_fixes:
            m.character_name = nn

        # Bodies changed => word_count, duration and embedding must follow.
        from app.services.ai.langchain.embeddings import generate_embedding
        for m, nb in body_fixes:
            m.text = nb
            m.word_count = len(nb.split())
            m.estimated_duration_seconds = estimate_duration_seconds(nb)
            try:
                vec = generate_embedding(nb)
                if vec:
                    m.embedding_vector = vec
            except Exception as exc:  # noqa: BLE001
                print(f"  re-embed failed for {m.id}: {exc}")

        db.commit()
        print(f"repaired {len(name_fixes)} names, {len(body_fixes)} bodies "
              f"(bodies re-embedded)")
    finally:
        db.close()


if __name__ == "__main__":
    main()
