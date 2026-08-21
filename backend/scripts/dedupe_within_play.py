#!/usr/bin/env python
"""Collapse identical monologues that sit twice inside the SAME play.

No attribution question here — both rows already agree on which play the
speech belongs to, so one of them is simply redundant. Most are case variants
of the speaker created by two different ingest passes over the same script:
`ATTICUS` and `Atticus` in To Kill a Mockingbird, `MARK`/`Mark` in The Social
Network, `SHASTA`/`Shasta`, `DANIEL`/`Daniel`, `SOUAD`/`Souad`.

Deliberately narrow: only groups where every copy shares one play_id. Anything
spanning two plays is an attribution problem and belongs to
attribute_from_volume.py, which decides it from the source text rather than by
picking a winner.

The survivor is the row with the richer metadata (an embedding, then a
quality_score, then the lower id), and favourites and views are moved onto it
before the others go.

Usage (from backend/):
    uv run python scripts/dedupe_within_play.py           # dry run
    uv run python scripts/dedupe_within_play.py --apply
    uv run python scripts/dedupe_within_play.py --restore backups/<file>.json
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

# pylint: disable=wrong-import-position
from sqlalchemy import text as sa_text

from app.core.database import SessionLocal
# pylint: enable=wrong-import-position

FIND = """
SELECT md5(trim(m.text)) AS h, m.play_id, p.title,
       array_agg(m.id ORDER BY (m.embedding_vector IS NULL),
                              (m.quality_score IS NULL), m.id) AS ids,
       array_agg(m.character_name ORDER BY (m.embedding_vector IS NULL),
                              (m.quality_score IS NULL), m.id) AS names
FROM monologues m JOIN plays p ON p.id = m.play_id
GROUP BY 1, 2, 3
HAVING count(*) > 1
ORDER BY p.title
"""


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
                db.execute(sa_text(
                    "INSERT INTO monologues (id, play_id, title, character_name, "
                    "text, word_count, estimated_duration_seconds) VALUES "
                    "(:id,:play_id,:title,:character_name,:text,:word_count,"
                    ":estimated_duration_seconds) ON CONFLICT (id) DO NOTHING"), row)
            db.commit()
            print(f"restored {len(data)} monologues")
            return

        groups = db.execute(sa_text(FIND)).fetchall()
        keep_map: dict[int, int] = {}
        doomed: list[int] = []
        rename: dict[int, str] = {}
        for _h, _pid, title, ids, names in groups:
            survivor = ids[0]
            for extra in ids[1:]:
                keep_map[extra] = survivor
                doomed.append(extra)
            # The survivor is chosen for having an embedding, which the older
            # screenplay-ingest rows do — and those rows also shout the speaker
            # in caps ("ATTICUS"). The row being dropped often carries the
            # readable form. Keep the good row, take the good name.
            note = ""
            if names[0] and names[0].isupper():
                better = next((n for n in names[1:] if n and not n.isupper()), None)
                if better:
                    rename[survivor] = better
                    note = f"  [rename {names[0]!r} -> {better!r}]"
            print(f"  {title[:40]:<42} keep {survivor} ({names[0]!r}), "
                  f"drop {ids[1:]} ({', '.join(repr(n) for n in names[1:])}){note}")

        print(f"\n{len(groups)} duplicate groups inside a single play; "
              f"{len(doomed)} rows to delete")

        if not args.apply:
            print("\n(dry run - pass --apply)")
            return
        if not doomed:
            return

        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        path = backend_dir / "backups" / f"dedupe_within_play_{stamp}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        rows = [dict(r._mapping) for r in db.execute(sa_text(
            "SELECT id, play_id, title, character_name, text, word_count, "
            "estimated_duration_seconds FROM monologues WHERE id = ANY(:ids)"),
            {"ids": doomed})]
        path.write_text(json.dumps(rows, ensure_ascii=False, default=str),
                        encoding="utf-8")
        print(f"backup written: {path}")

        for mid, better in rename.items():
            db.execute(sa_text(
                "UPDATE monologues SET character_name=:n WHERE id=:i"),
                {"n": better, "i": mid})
        if rename:
            print(f"adopted the readable speaker name on {len(rename)} rows")

        for old, new in keep_map.items():
            db.execute(sa_text(
                "UPDATE monologue_favorites SET monologue_id=:new WHERE monologue_id=:old "
                "AND NOT EXISTS (SELECT 1 FROM monologue_favorites f2 "
                "  WHERE f2.user_id = monologue_favorites.user_id AND f2.monologue_id=:new)"),
                {"old": old, "new": new})
            db.execute(sa_text(
                "UPDATE monologue_views SET monologue_id=:new WHERE monologue_id=:old"),
                {"old": old, "new": new})
        for tbl in ("monologue_favorites", "monologue_views",
                    "monologue_submissions", "user_tapes"):
            db.execute(sa_text(f"DELETE FROM {tbl} WHERE monologue_id = ANY(:ids)"),
                       {"ids": doomed})
        db.execute(sa_text("DELETE FROM monologues WHERE id = ANY(:ids)"),
                   {"ids": doomed})
        db.commit()
        print(f"deleted {len(doomed)} redundant rows")
    finally:
        db.close()


if __name__ == "__main__":
    main()
