#!/usr/bin/env python
"""Un-collapse the two one-act anthologies that were ingested volume-wide.

1,690 of 12,435 monologues share only 136 byte-identical texts. Two Gutenberg
one-act anthologies were ingested so that EVERY play row in the volume received
EVERY monologue in the volume. A search could return the same speech 18 times
under 18 different play names, every one of them misattributed: Chekhov's
Smirnov and Strindberg's Mrs X were both filed under a row titled "A DOLLAR".

The two anthologies failed differently and are repaired differently.

GROUP A — plays 93-104 and 133 (13 rows x 53 identical monologues)
    These are duplicate SHELLS. Their `full_text` is 176-2,359 characters, i.e.
    front matter only, and their titles are raw parse debris ("A ComedyBy
    George AnceyTranslated from the French", "THE BA" / author "CARRIAGE").
    The same plays were ALSO ingested correctly as ids 123-136, with real
    full_text, correct titles and authors, and their own properly-attributed
    monologues — id 93's front matter is byte-identical to id 126 "Monsieur
    Lamblin", id 133's to id 134 "The Baby Carriage".

    Verified before writing this: all 53 shell texts already exist under
    123-136 and 0 are shell-only. So the shells carry nothing unique and are
    deleted outright. Favourites and views are repointed to the canonical row
    holding the identical text first, so no user data is orphaned.

GROUP B — plays 105-122 (18 rows x 52 identical monologues)
    These rows are CANONICAL: titles and authors are correct (THE TWELVE-POUND
    LOOK / Barrie, THE BOOR / Chekhov, HYACINTH HALVEY / Lady Gregory). Only
    the monologue-to-play mapping is wrong. There is no correct copy elsewhere
    to fall back on, so attribution has to be decided.

    It is decided from the source, not from what the model happens to know
    about these plays. Each row's front matter ends in a cast list ("PERSONS",
    "CHARACTERS", "PERSONS IN THE PLAY"), so a monologue belongs to the play
    whose cast contains its character. Every play already holds a copy of every
    text, so the repair is purely deletion: keep the copy sitting under the
    matching play, drop the other 17.

    A text whose character matches zero plays, or more than one, is LEFT
    EXACTLY AS IT IS and reported. Guessing here is how the corpus got into
    this state.

Usage (from backend/):
    uv run python scripts/fix_collapsed_anthologies.py              # dry run
    uv run python scripts/fix_collapsed_anthologies.py --verbose    # + mapping
    uv run python scripts/fix_collapsed_anthologies.py --apply
    uv run python scripts/fix_collapsed_anthologies.py --restore backups/<f>.json
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

SHELL_PLAY_IDS = [93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 133]
CANONICAL_RANGE = (123, 136)   # where the Group A plays live, correctly
COLLAPSED_RANGE = (105, 122)   # Group B

# The cast list is the last labelled block in the front matter. The volume is
# not consistent about the heading: TRADITION says "THE PEOPLE", THE LAST STRAW
# and WHERE BUT IN AMERICA say "CAST". Missing those two left six plays with no
# parsed cast at all, which silently turned "this character is not in that
# play" into "this character is in no play".
CAST_HEADING = re.compile(
    r"\b(?:PERSONS\s+IN\s+THE\s+PLAY|PERSONS\s+REPRESENTED|DRAMATIS\s+PERSONAE"
    r"|THE\s+PEOPLE|CHARACTERS|PERSONS|CAST)\b",
    re.IGNORECASE,
)
# Words that appear in a cast list as roles rather than names.
_GENERIC_ROLE = {
    "a", "an", "the", "and", "of", "in", "his", "her", "their", "who", "are",
    "given", "order", "appearance", "servant", "gardener", "coachman",
    "workmen", "several", "others", "etc", "voice", "voices", "man", "woman",
    "boy", "girl", "child", "children", "first", "second", "third", "role",
    "plays", "actor", "actress", "characters", "persons", "play",
}


def cast_blob(front_matter: str) -> str:
    """The cast block squashed to bare letters, for whole-name matching.

    Needed for casts whose names are entirely titles and initials. THE
    STRONGER lists "PERSONS Mrs. X. , an actress, married Miss Y. , an
    actress, unmarried": token matching drops "mrs" as a courtesy title and
    "x" as too short, so the play with the single most obvious attribution in
    the whole anthology matched nothing.
    """
    if not front_matter:
        return ""
    matches = list(CAST_HEADING.finditer(front_matter))
    if not matches:
        return ""
    return re.sub(r"[^a-z]", "", front_matter[matches[-1].end():].lower())


def parse_cast(front_matter: str) -> set[str]:
    """Character tokens named in a play's front-matter cast list.

    Returns lowercase single-word tokens (forenames and surnames both), because
    the monologue's `character_name` and the cast list rarely agree on form:
    the cast says "Helena Ivanovna Popov", the monologue says "Mrs Popov".
    """
    if not front_matter:
        return set()
    matches = list(CAST_HEADING.finditer(front_matter))
    if not matches:
        return set()
    block = front_matter[matches[-1].end():]
    # Descriptions sit in [brackets] or after a comma; drop both.
    block = re.sub(r"\[[^\]]*\]", " ", block)
    block = re.sub(r",[^.\n]*", " ", block)
    tokens: set[str] = set()
    for raw in re.split(r"[^A-Za-z'’-]+", block):
        w = raw.strip("'’-").lower()
        if len(w) < 3 or w in _GENERIC_ROLE:
            continue
        tokens.add(w)
    return tokens


def name_tokens(character_name: str) -> set[str]:
    """Distinctive tokens of a monologue's character name."""
    out: set[str] = set()
    for raw in re.split(r"[^A-Za-z'’-]+", (character_name or "")):
        w = raw.strip("'’-").lower()
        if len(w) < 3 or w in _GENERIC_ROLE:
            continue
        if w in {"mrs", "mr", "miss", "madame", "mme", "frau", "herr", "aunt",
                 "uncle", "sir", "lady", "dr", "doctor"}:
            continue
        out.add(w)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--restore", type=str, default="")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        if args.restore:
            restore(db, Path(args.restore))
            return

        report: dict = {}

        # ---------- GROUP A: redundant shells ----------
        shell_ids = ",".join(str(i) for i in SHELL_PLAY_IDS)
        shell_rows = db.execute(sa_text(
            f"SELECT m.id, md5(trim(m.text)) h FROM monologues m "
            f"WHERE m.play_id IN ({shell_ids})"
        )).fetchall()
        canonical = {
            h: mid
            for h, mid in db.execute(sa_text(
                "SELECT DISTINCT ON (md5(trim(text))) md5(trim(text)) h, id "
                "FROM monologues WHERE play_id BETWEEN :lo AND :hi "
                "ORDER BY md5(trim(text)), id"
            ), {"lo": CANONICAL_RANGE[0], "hi": CANONICAL_RANGE[1]}).fetchall()
        }
        a_delete, a_orphan = [], []
        for mid, h in shell_rows:
            (a_delete if h in canonical else a_orphan).append((mid, h))

        print(f"GROUP A (shell plays {SHELL_PLAY_IDS}):")
        print(f"  {len(shell_rows)} monologues, {len(a_delete)} have a canonical "
              f"twin under plays {CANONICAL_RANGE[0]}-{CANONICAL_RANGE[1]}")
        print(f"  {len(a_orphan)} would be orphaned -> NOT deleted")
        if a_orphan:
            print("  REFUSING to delete Group A: some texts exist nowhere else.")

        # ---------- GROUP B: collapsed, attribute by cast list ----------
        plays = db.execute(sa_text(
            "SELECT id, title, COALESCE(full_text,'') FROM plays "
            "WHERE id BETWEEN :lo AND :hi ORDER BY id"
        ), {"lo": COLLAPSED_RANGE[0], "hi": COLLAPSED_RANGE[1]}).fetchall()
        casts = {pid: (title, parse_cast(ft)) for pid, title, ft in plays}
        blobs = {pid: cast_blob(ft) for pid, _title, ft in plays}

        texts = db.execute(sa_text(
            "SELECT md5(trim(m.text)) h, min(m.character_name) ch, "
            "       count(*) n, min(left(m.text, 60)) sample "
            "FROM monologues m WHERE m.play_id BETWEEN :lo AND :hi "
            "GROUP BY 1 ORDER BY 2"
        ), {"lo": COLLAPSED_RANGE[0], "hi": COLLAPSED_RANGE[1]}).fetchall()

        resolved: dict[str, int] = {}
        unresolved: list[tuple] = []
        for h, ch, n, sample in texts:
            want = name_tokens(ch)
            if not want:
                # Fallback for title+initial names ("Mrs X"): look for the whole
                # name, squashed, inside the squashed cast block. Only ever used
                # when token matching has nothing to say, and only at >= 4
                # characters, so it cannot fire on a bare "He" or "She".
                key = re.sub(r"[^a-z]", "", (ch or "").lower())
                whole = ([pid for pid, b in blobs.items() if b and key in b]
                         if len(key) >= 4 else [])
                if len(whole) == 1:
                    resolved[h] = whole[0]
                else:
                    unresolved.append((h, ch, n, "no distinctive name", sample))
                continue
            hits = [pid for pid, (_t, cast) in casts.items() if want & cast]
            if len(hits) == 1:
                resolved[h] = hits[0]
            else:
                why = "no cast match" if not hits else (
                    "ambiguous: " + ",".join(str(x) for x in hits))
                unresolved.append((h, ch, n, why, sample))

        print(f"\nGROUP B (collapsed plays {COLLAPSED_RANGE[0]}-{COLLAPSED_RANGE[1]}):")
        print(f"  {len(texts)} distinct texts across {len(plays)} play rows")
        print(f"  attributed by cast list: {len(resolved)}")
        print(f"  left alone (reported below): {len(unresolved)}")

        if args.verbose and resolved:
            print("\n  --- attribution ---")
            by_play: dict[int, list[str]] = {}
            for h, pid in resolved.items():
                ch = next(c for hh, c, _n, _s in
                          ((t[0], t[1], t[2], t[3]) for t in texts) if hh == h)
                by_play.setdefault(pid, []).append(ch)
            for pid in sorted(by_play):
                print(f"  [{pid}] {casts[pid][0]}: {len(by_play[pid])} -> "
                      f"{', '.join(sorted(set(by_play[pid])))[:100]}")

        if unresolved:
            print("\n  --- NOT attributed (left exactly as they are) ---")
            for h, ch, n, why, sample in unresolved:
                print(f"    {ch!r:32} x{n:<3} {why}")

        # Rows to delete in Group B: every copy NOT under the attributed play.
        b_delete = []
        if resolved:
            rows = db.execute(sa_text(
                "SELECT m.id, md5(trim(m.text)) h, m.play_id FROM monologues m "
                "WHERE m.play_id BETWEEN :lo AND :hi"
            ), {"lo": COLLAPSED_RANGE[0], "hi": COLLAPSED_RANGE[1]}).fetchall()
            kept: set[str] = set()
            for mid, h, pid in sorted(rows, key=lambda r: r[0]):
                if h not in resolved:
                    continue
                if pid == resolved[h] and h not in kept:
                    kept.add(h)
                else:
                    b_delete.append(mid)
            missing = set(resolved) - kept
            if missing:
                # Every play holds every text, so this should be empty. If it
                # is not, the assumption is wrong and deleting would lose text.
                print(f"\n  ABORT: {len(missing)} attributed texts have no copy "
                      f"under their own play. Not deleting Group B.")
                b_delete = []

        print(f"\n  Group B rows to delete: {len(b_delete)}")

        total = (len(a_delete) if not a_orphan else 0) + len(b_delete)
        print(f"\nTOTAL monologues to delete: {total}")
        print(f"Shell play rows to delete: "
              f"{len(SHELL_PLAY_IDS) if not a_orphan else 0}")

        if not args.apply:
            print("\n(dry run - pass --apply)")
            return

        if a_orphan:
            print("\nAborting: Group A orphan check failed.")
            return

        # ---------- write ----------
        doomed = [mid for mid, _h in a_delete] + b_delete
        backup = {
            "deleted_monologues": [
                dict(r._mapping) for r in db.execute(sa_text(
                    "SELECT id, play_id, title, character_name, text, word_count "
                    "FROM monologues WHERE id = ANY(:ids)"), {"ids": doomed})
            ],
            "deleted_plays": [
                dict(r._mapping) for r in db.execute(sa_text(
                    "SELECT id, title, author, source_type, full_text "
                    "FROM plays WHERE id = ANY(:ids)"), {"ids": SHELL_PLAY_IDS})
            ],
        }
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        path = backend_dir / "backups" / f"collapsed_anthologies_{stamp}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(backup, ensure_ascii=False, default=str),
                        encoding="utf-8")
        print(f"\nbackup written: {path}")

        # Repoint user data onto the surviving twin before deleting anything.
        twin = {mid: canonical[h] for mid, h in a_delete}
        moved_fav = moved_view = 0
        for old, new in twin.items():
            moved_fav += db.execute(sa_text(
                "UPDATE monologue_favorites SET monologue_id=:new "
                "WHERE monologue_id=:old AND NOT EXISTS ("
                "  SELECT 1 FROM monologue_favorites f2 "
                "  WHERE f2.user_id = monologue_favorites.user_id "
                "    AND f2.monologue_id = :new)"), {"old": old, "new": new}).rowcount
            moved_view += db.execute(sa_text(
                "UPDATE monologue_views SET monologue_id=:new WHERE monologue_id=:old"
            ), {"old": old, "new": new}).rowcount
        print(f"repointed {moved_fav} favourites, {moved_view} views")

        for tbl in ("monologue_favorites", "monologue_views",
                    "monologue_submissions", "user_tapes"):
            db.execute(sa_text(f"DELETE FROM {tbl} WHERE monologue_id = ANY(:ids)"),
                       {"ids": doomed})
        db.execute(sa_text("DELETE FROM monologues WHERE id = ANY(:ids)"),
                   {"ids": doomed})
        db.execute(sa_text("DELETE FROM plays WHERE id = ANY(:ids)"),
                   {"ids": SHELL_PLAY_IDS})
        db.commit()
        print(f"deleted {len(doomed)} monologues and "
              f"{len(SHELL_PLAY_IDS)} shell play rows")
    finally:
        db.close()


def restore(db, path: Path) -> None:
    data = json.loads(path.read_text(encoding="utf-8"))
    for p in data.get("deleted_plays", []):
        db.execute(sa_text(
            "INSERT INTO plays (id, title, author, source_type, full_text) "
            "VALUES (:id,:title,:author,:source_type,:full_text) "
            "ON CONFLICT (id) DO NOTHING"), p)
    for m in data.get("deleted_monologues", []):
        db.execute(sa_text(
            "INSERT INTO monologues (id, play_id, title, character_name, text, "
            "word_count) VALUES (:id,:play_id,:title,:character_name,:text,"
            ":word_count) ON CONFLICT (id) DO NOTHING"), m)
    db.commit()
    print(f"restored {len(data.get('deleted_plays', []))} plays and "
          f"{len(data.get('deleted_monologues', []))} monologues")
    print("NOTE: embeddings are NOT restored; re-run the embedding pass if needed.")


if __name__ == "__main__":
    main()
