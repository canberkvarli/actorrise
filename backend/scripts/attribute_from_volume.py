#!/usr/bin/env python
"""Attribute duplicated monologues by finding them in the anthology text itself.

The 2026-08-21 anthology repair placed 43 of 59 texts using each play's
front-matter cast list. The remaining 16 were left alone because their speaker
is a bare pronoun ("He", "She", "The Voice"), a name in two casts ("Jim",
"Mary"), or a play with no cast block at all (MANIKIN AND MINIKIN). Cast lists
genuinely cannot answer those.

The volume can. Gutenberg 37970 contains all 18 plays in sequence, each under
its own heading, so a speech's byte offset says which play it belongs to — no
cast list, no name matching, no guessing. Same for 36984 (51 plays) and 8499
(the Strindberg trio). All three are already in backups/gutenberg_cache/.

This is strictly better evidence than the cast list and it is worth saying why
it was not used first: the cast approach was cheap, needed no network, and
resolved 73% of the set. This resolves the tail.

Matching is done on a normalised fingerprint (lowercased, punctuation and
whitespace collapsed) because the stored text has been through extraction and
cleanup passes and no longer matches the source byte for byte. A speech that
cannot be located, or that lands outside every section, is reported and left
exactly as it is.

Usage (from backend/):
    uv run python scripts/attribute_from_volume.py            # dry run
    uv run python scripts/attribute_from_volume.py --apply
    uv run python scripts/attribute_from_volume.py --restore backups/<file>.json
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
from sqlalchemy import text as sa_text

from app.core.database import SessionLocal
# pylint: enable=wrong-import-position

CACHE_DIR = backend_dir / "backups" / "gutenberg_cache"

# Volumes we hold, and the play rows that were ingested from each. Titles are
# matched against plays.title so the section order is discovered from the text
# rather than hard-coded.
VOLUMES = {
    "pg37970": {"low": 105, "high": 122},
    "pg36984": {"low": 123, "high": 136},
    "pg8499": {"ids": [77, 1636, 1637]},          # Strindberg: Father/Julie/Outlaw
    "pg31": {"ids": [61, 62]},                     # Sophocles: Antigone / Oedipus at Colonus
    "pg27458": {"ids": [75, 76]},                  # Aeschylus: Prometheus / Seven Against Thebes
}

# How much of a speech to fingerprint. Long enough to be unique in a 560 kB
# volume, short enough to survive the trimming that extraction applied to the
# tail of a speech.
PROBE_CHARS = 120


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def load_volume(name: str) -> str | None:
    p = CACHE_DIR / f"{name}.txt"
    if not p.exists():
        return None
    return p.read_text(encoding="utf-8", errors="replace")


# Two volumes cannot be sectioned by matching plays.title against the text, and
# both fail in ways that would produce confident wrong answers rather than no
# answer, so their boundaries are pinned explicitly. Each offset was read off
# the cached file and checked against the plot summary printed immediately
# before it.
#
#   pg31 (Sophocles) — "ANTIGONE" occurs 120 times as a SPEAKER label inside
#   Oedipus at Colonus, where Antigone is a character. Title matching put
#   Theseus, who never appears in the Antigone, into it. The reliable marker is
#   the per-play ARGUMENT block: 346 / 72959 / 156024, each followed by its own
#   DRAMATIS PERSONAE at 1735 / 75095 / 156959.
#
#   pg27458 (Aeschylus) — the volume prints Prometheus Bound as "PROMETHEUS
#   CHAINED", so the stored title matches nothing and the whole book collapsed
#   to zero sections.
SECTION_OVERRIDES: dict[str, list[tuple[int, str]]] = {
    "pg31": [
        (346, "Oedipus the King"),
        (72959, "Oedipus at Colonus"),
        (156024, "Antigone"),
    ],
    "pg27458": [
        (9838, "Prometheus Bound"),          # printed as "PROMETHEUS CHAINED"
        (66520, "Seven Against Thebes"),
    ],
}


def find_sections(raw: str, titles: list[str]) -> list[tuple[int, str]]:
    """(offset, title) for each play's section, in document order.

    A title appears ~3 times: once in the table of contents near the top, then
    at its section. The contents block is skipped by ignoring hits in the first
    5% of the file, and the section start is taken as the FIRST remaining hit.
    """
    floor = int(len(raw) * 0.05)
    out: list[tuple[int, str]] = []
    for t in titles:
        # Titles carry parenthetical subtitles in the DB that the volume lacks.
        probe = re.sub(r"\(.*?\)", "", t).strip()
        if len(probe) < 4:
            continue
        hits = [m.start() for m in re.finditer(re.escape(probe), raw)
                if m.start() > floor]
        if hits:
            out.append((min(hits), t))
    out.sort()
    return out


def section_for(offset: int, sections: list[tuple[int, str]]) -> str | None:
    found = None
    for start, title in sections:
        if start <= offset:
            found = title
        else:
            break
    return found


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--restore", type=str, default="")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        if args.restore:
            data = json.loads(Path(args.restore).read_text(encoding="utf-8"))
            for mid, pid in data.items():
                db.execute(sa_text("UPDATE monologues SET play_id=:p WHERE id=:i"),
                           {"p": pid, "i": int(mid)})
            db.commit()
            print(f"restored play_id on {len(data)} monologues")
            return

        moves: dict[int, tuple[int, int, str, str]] = {}
        keeps: dict[int, tuple[int, int, str, str]] = {}
        drops: dict[int, tuple[int, int, str, str]] = {}
        unplaced: list[tuple[str, str, str]] = []

        for vol, spec in VOLUMES.items():
            raw = load_volume(vol)
            if not raw:
                print(f"{vol}: not cached, skipped")
                continue
            if "ids" in spec:
                where, params = "p.id = ANY(:ids)", {"ids": spec["ids"]}
            else:
                where, params = ("p.id BETWEEN :lo AND :hi",
                                 {"lo": spec["low"], "hi": spec["high"]})

            plays = db.execute(sa_text(
                f"SELECT p.id, p.title FROM plays p WHERE {where} ORDER BY p.id"
            ), params).fetchall()
            by_title = {t: pid for pid, t in plays}
            sections = SECTION_OVERRIDES.get(vol) or find_sections(
                raw, [t for _pid, t in plays])
            print(f"\n{vol}: {len(plays)} play rows, {len(sections)} sections located")
            if not sections:
                continue

            nraw = norm(raw)
            # Offsets shift once normalised, so search the normalised text and
            # map section starts through the same transform.
            nsections = []
            for start, title in sections:
                nstart = len(norm(raw[:start]))
                nsections.append((nstart, title))
            nsections.sort()

            rows = db.execute(sa_text(
                f"SELECT m.id, m.play_id, m.character_name, m.text "
                f"FROM monologues m JOIN plays p ON p.id = m.play_id "
                f"WHERE {where} AND md5(trim(m.text)) IN "
                f"  (SELECT md5(trim(text)) FROM monologues GROUP BY 1 HAVING count(*)>1)"
                f"ORDER BY m.id", ), params).fetchall()

            # Group the copies of each distinct speech, then resolve ONE home
            # for the group. Re-pointing every copy would just stack 18
            # identical rows under a single play — correct attribution, same
            # duplication. Exactly one row survives per speech.
            groups: dict[str, list[tuple[int, int, str]]] = {}
            for mid, pid, ch, txt in rows:
                probe = norm(txt)[:PROBE_CHARS]
                if len(probe) >= 40:
                    groups.setdefault(probe, []).append((mid, pid, ch or "?"))

            for probe, copies in groups.items():
                idx = nraw.find(probe)
                if idx < 0:
                    unplaced.append((vol, copies[0][2], probe[:60]))
                    continue
                target_title = section_for(idx, nsections) or ""
                target_pid = by_title.get(target_title)
                if not target_pid:
                    unplaced.append((vol, copies[0][2], probe[:60]))
                    continue
                copies.sort(key=lambda c: (c[1] != target_pid, c[0]))
                keeper = copies[0]
                keeps[keeper[0]] = (keeper[1], target_pid, keeper[2], target_title)
                if keeper[1] != target_pid:
                    moves[keeper[0]] = (keeper[1], target_pid, keeper[2], target_title)
                for mid, pid, ch in copies[1:]:
                    drops[mid] = (pid, target_pid, ch, target_title)

        print(f"\ndistinct speeches placed: {len(keeps)}  "
              f"(of which re-pointed: {len(moves)})   surplus copies deleted: {len(drops)}")
        by_target: dict[str, list[str]] = {}
        for _mid, (_old, _new, ch, title) in keeps.items():
            by_target.setdefault(title, []).append(ch)
        for title in sorted(by_target):
            chars = sorted(set(by_target[title]))
            dropped = sum(1 for _m, (_o, _n, _c, t) in drops.items() if t == title)
            print(f"  -> {title[:38]:<40} keeps {len(by_target[title]):>2}, "
                  f"drops {dropped:>3}  ({', '.join(chars)[:52]})")
        if unplaced:
            print(f"\nnot found in any volume ({len(unplaced)}), left alone:")
            for v, ch, p in unplaced[:12]:
                print(f"    [{v}] {ch!r}: {p!r}")

        if not args.apply:
            print("\n(dry run - pass --apply)")
            return

        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        path = backend_dir / "backups" / f"volume_attribution_{stamp}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        doomed = list(drops)
        payload = {
            "repointed": {str(m): old for m, (old, _n, _c, _t) in moves.items()},
            "deleted": [
                dict(r._mapping) for r in db.execute(sa_text(
                    "SELECT id, play_id, title, character_name, text, word_count, "
                    "estimated_duration_seconds FROM monologues WHERE id = ANY(:ids)"),
                    {"ids": doomed})
            ],
        }
        path.write_text(json.dumps(payload, ensure_ascii=False, default=str),
                        encoding="utf-8")
        print(f"\nbackup written: {path}")

        for mid, (_old, new, _ch, _t) in moves.items():
            db.execute(sa_text("UPDATE monologues SET play_id=:p WHERE id=:i"),
                       {"p": new, "i": mid})
        # Move any user data off a doomed row onto the survivor before deleting.
        keep_for = {}
        for mid, (_o, new, _c, title) in drops.items():
            keep_for[mid] = next(
                (k for k, (_oo, nn, _cc, tt) in moves.items() if tt == title and nn == new),
                None)
        for old, new in keep_for.items():
            if not new:
                continue
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
        db.execute(sa_text("DELETE FROM monologues WHERE id = ANY(:ids)"), {"ids": doomed})
        db.commit()
        print(f"re-pointed {len(moves)}, deleted {len(doomed)} surplus copies")
    finally:
        db.close()


if __name__ == "__main__":
    main()
