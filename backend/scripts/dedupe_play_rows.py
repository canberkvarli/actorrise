#!/usr/bin/env python
"""
Merge duplicate `plays` rows that hold the same work.

The 2026-08-20 corpus audit found 231 duplicate groups covering 358 redundant
rows: "The X Files" is 16 rows holding 79 monologues between them, "Hamlet" is
14 rows / 162, "The Night Manager" is 5 rows / 39. Ingest creates a play row per
run without checking for an existing one, so a show re-scraped five times
becomes five plays.

Why it matters beyond tidiness: `detect_catalogue_title` returns the FIRST
matching row's title and source_type, so which of 16 X-Files rows wins is
arbitrary, and the admin views count one show as sixteen.

What this does: pick a canonical row per group, repoint every monologue and
scene at it, delete the emptied duplicates.

SAFETY — the grouping key is (normalised title, source_type, normalised author),
NOT title alone. Two different works can share a title: "The Father" is both
Strindberg and Zeller. Groups whose rows disagree on author are never merged;
they are reported for manual review instead. This is the same collapsed-
collection failure the 2026-08 play-attribution audit had to undo by hand, and
it is not worth repeating automatically.

Canonical row = most monologues, then most complete metadata, then lowest id.
Canonical metadata is never overwritten; anything that would be lost is listed
in the backup.

Reversal: backups/dedupe_play_rows_<UTC>.json holds every deleted row in full
plus every (monologue_id -> old play_id) and (scene_id -> old play_id) mapping,
so the split can be reconstructed exactly.

Usage:
    uv run python scripts/dedupe_play_rows.py                 # dry run
    uv run python scripts/dedupe_play_rows.py --apply
    uv run python scripts/dedupe_play_rows.py --apply --limit 20
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import text

from app.core.database import engine

NORM_TITLE = (
    "regexp_replace(regexp_replace(lower(title),'[^\\w\\s]','','g'),"
    "'^(the|a|an)\\s+','')"
)
NORM_AUTHOR = "regexp_replace(lower(COALESCE(author,'')),'[^\\w\\s]','','g')"

BACKUP_DIR = backend_dir / "backups"

# Normalised author values that mean "we don't know", not a name.
_PLACEHOLDER_AUTHORS = {"unknown", "various", "anonymous", "n a", "na", "none"}


def load_groups(conn):
    """Duplicate groups keyed by (norm title, source_type). Author is carried
    per row so mixed-author groups can be detected rather than merged."""
    rows = conn.execute(
        text(
            f"""
            SELECT {NORM_TITLE} AS n,
                   COALESCE(source_type,'play') AS st,
                   id, title, author, {NORM_AUTHOR} AS na,
                   (SELECT count(*) FROM monologues m WHERE m.play_id = p.id) AS monos,
                   (SELECT count(*) FROM scenes s WHERE s.play_id = p.id) AS scenes
            FROM plays p
            ORDER BY 1, 2, id
            """
        )
    ).mappings().fetchall()

    groups: dict[tuple, list] = {}
    for r in rows:
        groups.setdefault((r["n"], r["st"]), []).append(dict(r))
    return {k: v for k, v in groups.items() if len(v) > 1}


def pick_canonical(members: list) -> dict:
    """Most monologues, then most complete metadata, then lowest id."""

    def completeness(m):
        return sum(1 for f in ("author",) if (m.get(f) or "").strip())

    return sorted(
        members, key=lambda m: (-m["monos"], -completeness(m), m["id"])
    )[0]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write the changes")
    ap.add_argument("--limit", type=int, default=None, help="max groups to merge")
    args = ap.parse_args()

    with engine.begin() as conn:
        groups = load_groups(conn)

        mergeable, mixed_author = [], []
        for key, members in groups.items():
            authors = {m["na"] for m in members}
            # An empty author is not evidence of a different work, so it does
            # not by itself make a group mixed. Neither is a placeholder: the
            # TV ingest writes the literal string "Unknown" when no reference
            # matched, and treating that as a rival name made every re-scraped
            # show unmergeable — "Unknown" vs "Vince Gilligan" is a MISSING
            # author, not a conflicting one. The real guard this protects is
            # Strindberg's "The Father" vs Zeller's, where both names are real.
            named = {a for a in authors if a and a not in _PLACEHOLDER_AUTHORS}
            if len(named) > 1:
                mixed_author.append((key, members))
            else:
                mergeable.append((key, members))

        mergeable.sort(key=lambda kv: -sum(m["monos"] for m in kv[1]))
        if args.limit:
            mergeable = mergeable[: args.limit]

        print(f"duplicate groups:      {len(groups)}")
        print(f"  mergeable:           {len(mergeable)}")
        print(f"  mixed author (skip): {len(mixed_author)}")

        if mixed_author:
            print("\nSKIPPED - same title, different authors. Review by hand:")
            for (n, st), members in mixed_author[:15]:
                names = sorted({(m["author"] or "?")[:24] for m in members})
                print(f"  [{st:<4}] {n[:34]:<36} {' | '.join(names)[:60]}")

        plan, redundant = [], 0
        for (n, st), members in mergeable:
            canon = pick_canonical(members)
            dups = [m for m in members if m["id"] != canon["id"]]
            if not dups:
                continue
            redundant += len(dups)
            plan.append({"norm": n, "source_type": st, "canonical": canon, "dups": dups})

        print(f"\nrows to delete: {redundant}")
        print("\ntop merges:")
        for p in plan[:12]:
            moving = sum(d["monos"] for d in p["dups"])
            print(
                f"  [{p['source_type']:<4}] {p['norm'][:32]:<34} "
                f"{len(p['dups'])+1} rows -> 1   moving {moving} monologues"
            )

        if not args.apply:
            print("\n(dry run - pass --apply)")
            return

        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup = {
            "created_at": stamp,
            "note": "dedupe_play_rows: deleted play rows + reparented children",
            "merges": [],
        }

        moved_m = moved_s = deleted = 0
        for p in plan:
            canon_id = p["canonical"]["id"]
            dup_ids = [d["id"] for d in p["dups"]]

            monos = [
                r[0]
                for r in conn.execute(
                    text("SELECT id FROM monologues WHERE play_id = ANY(:ids)"),
                    {"ids": dup_ids},
                ).fetchall()
            ]
            scenes = [
                r[0]
                for r in conn.execute(
                    text("SELECT id FROM scenes WHERE play_id = ANY(:ids)"),
                    {"ids": dup_ids},
                ).fetchall()
            ]

            backup["merges"].append(
                {
                    "canonical_id": canon_id,
                    "deleted_rows": [
                        {k: v for k, v in d.items() if k not in ("na", "n")}
                        for d in p["dups"]
                    ],
                    "monologue_reparents": [
                        {"monologue_id": mid, "old_play_id": old}
                        for old in dup_ids
                        for mid in [
                            r[0]
                            for r in conn.execute(
                                text("SELECT id FROM monologues WHERE play_id=:o"),
                                {"o": old},
                            ).fetchall()
                        ]
                    ],
                    "scene_reparents": [
                        {"scene_id": sid, "old_play_id": old}
                        for old in dup_ids
                        for sid in [
                            r[0]
                            for r in conn.execute(
                                text("SELECT id FROM scenes WHERE play_id=:o"),
                                {"o": old},
                            ).fetchall()
                        ]
                    ],
                }
            )

            if monos:
                conn.execute(
                    text("UPDATE monologues SET play_id=:c WHERE play_id = ANY(:ids)"),
                    {"c": canon_id, "ids": dup_ids},
                )
                moved_m += len(monos)
            if scenes:
                conn.execute(
                    text("UPDATE scenes SET play_id=:c WHERE play_id = ANY(:ids)"),
                    {"c": canon_id, "ids": dup_ids},
                )
                moved_s += len(scenes)

            conn.execute(
                text("DELETE FROM plays WHERE id = ANY(:ids)"), {"ids": dup_ids}
            )
            deleted += len(dup_ids)

        BACKUP_DIR.mkdir(exist_ok=True)
        path = BACKUP_DIR / f"dedupe_play_rows_{stamp}.json"
        path.write_text(json.dumps(backup, indent=2, default=str))

        print(f"\nmoved {moved_m} monologues, {moved_s} scenes")
        print(f"deleted {deleted} duplicate play rows")
        print(f"backup: {path}")


if __name__ == "__main__":
    main()
