"""The same speech stored twice, one copy with another character inside it.

WHAT THIS IS. 103 groups of visible monologues share their opening 200
characters without being byte-identical, so the exact-match dedupe never saw
them. An actor searching gets the same speech twice.

They are not one problem:

    ~50  one copy clean, another carrying a co-character's line
         "(HELENA: Good madam, pardon me.)" spliced into the Countess's speech
    ~36  copies alike, same play, differing by edition or punctuation
         Juliet at 252w and 184w; "face, Else" against "face; Else"
    ~16  spread across different play rows
         Macbeth the play and Macbeth the 2021 film

ONLY THE FIRST GROUP IS RESOLVED HERE, and only where the choice is not a
judgement. The rest go to a report for somebody who knows the plays: picking
wrong files a speech under the wrong work and nothing ever surfaces it again.
The volume splitter moved 75 rows on a rule that looked equally obvious and got
38 of them wrong.

THE GUARD THAT NEARLY DID NOT EXIST. "Prefer the copy without a co-character's
line" reads as self-evidently safe. Run on this corpus it proposed:

    keep   #18709  The Tragedy Of Macbeth   (the 2021 FILM)
    retire #144    Macbeth                  (the PLAY)

because the play's copy happened to carry a cue. A theatre actor wants the
play. So a cue is only decisive BETWEEN COPIES OF THE SAME WORK; the moment the
two rows come from different source types, the cleaner text stops being the
better answer and the pair goes to the report.

WHAT RETIRING MEANS. `review_status='duplicate'`, which search already hides.
The row and its text stay. It goes through `monologue_visibility.hide`, so the
embedding is released with it and any future un-hide re-buys one.

    python -m scripts.retire_cue_duplicates --out reports/near_duplicates.md
    python -m scripts.retire_cue_duplicates --apply --out reports/near_duplicates.md
    python -m scripts.retire_cue_duplicates --restore backups/cue_dupes_<ts>.json
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

from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.models.actor import Monologue  # noqa: E402
from app.services.monologue_visibility import hide  # noqa: E402

_engine = create_engine(settings.database_url, pool_pre_ping=True, pool_recycle=1800)
SessionLocal = sessionmaker(autocommit=False, autoflush=False,
                            expire_on_commit=False, bind=_engine)

BACKUP_DIR = backend_dir / "backups"
VISIBLE = ("(review_status IS NULL OR review_status NOT IN "
           "('pending','too_short','not_monologue','duplicate'))")
NORM = "regexp_replace(lower(text), '[^a-z0-9]', '', 'g')"
KEY_LEN = 200

#: "(HELENA: Good madam, pardon me.)" — a co-character speaking inside the
#: piece. Deliberately narrow: an ALL-CAPS name followed by a colon, which is
#: the extractor's own shape. A parenthesis holding a stage direction
#: ("(Laying his hand on Laertes's head.)") must NOT match — those are kept on
#: purpose and the reader italicises them.
CUE = re.compile(r"\([A-Z][A-Z '\.]{2,24}:")


def load_groups(db):
    rows = db.execute(text(f"""
        SELECT left({NORM}, {KEY_LEN}) AS k, m.id, m.text, m.word_count,
               m.play_id, m.character_name, p.title, p.source_type
        FROM monologues m JOIN plays p ON p.id = m.play_id
        WHERE {VISIBLE} AND left({NORM}, {KEY_LEN}) IN (
            SELECT left({NORM}, {KEY_LEN}) FROM monologues
            WHERE {VISIBLE} GROUP BY 1 HAVING count(*) > 1)
    """)).fetchall()
    groups: dict[str, list] = {}
    for r in rows:
        groups.setdefault(r.k, []).append(r)
    return groups


def _src(row) -> str:
    return (row.source_type or "play").lower()


def split(groups):
    """(resolvable, needs_human).

    Resolvable needs all three of:
      * exactly one copy free of a co-character cue, so there is a single winner;
      * at least one copy carrying one, so there is something to retire;
      * every copy from the SAME source type, so "cleaner text" is actually the
        better answer (see the module docstring — otherwise this retires the
        play and keeps the film).
    """
    resolvable, human = [], []
    for k, rows in groups.items():
        clean = [r for r in rows if not CUE.search(r.text or "")]
        dirty = [r for r in rows if CUE.search(r.text or "")]
        one_winner = len(clean) == 1 and bool(dirty)
        one_medium = len({_src(r) for r in rows}) == 1
        if one_winner and one_medium:
            resolvable.append((clean[0], dirty))
        else:
            human.append((k, rows))
    return resolvable, human


def restore(path: Path) -> int:
    rows = json.loads(path.read_text())["rows"]
    db = SessionLocal()
    try:
        for r in rows:
            db.query(Monologue).filter(Monologue.id == r["id"]).update(
                {Monologue.review_status: r["was_status"]}, synchronize_session=False)
        db.commit()
        print(f"restored {len(rows)} rows from {path.name}")
        print("NOTE: embeddings were released on retire and are NOT restored.")
        print("      Run the embedding backfill to make them searchable again.")
        return len(rows)
    finally:
        db.close()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--out", default=None)
    ap.add_argument("--restore", type=Path, default=None)
    args = ap.parse_args()

    if args.restore:
        restore(args.restore)
        return 0

    db = SessionLocal()
    try:
        groups = load_groups(db)
        resolvable, human = split(groups)
        n_retire = sum(len(d) for _, d in resolvable)

        print(f"{len(groups)} near-duplicate groups among visible monologues")
        print(f"  resolvable  {len(resolvable):>4} groups -> retire {n_retire} rows")
        print(f"  needs human {len(human):>4} groups -> report only\n")

        for keep, dirty in sorted(resolvable, key=lambda x: -x[0].word_count)[:8]:
            print(f"  keep #{keep.id} ({keep.word_count}w) "
                  f"{str(keep.character_name)[:16]:<16} {str(keep.title)[:30]}")
            for d in dirty:
                hit = CUE.search(d.text)
                print(f"    retire #{d.id} ({d.word_count}w) carries "
                      f"{hit.group(0) if hit else ''}...")

        if args.out:
            lines = [f"# Near-duplicate monologues — {datetime.now():%Y-%m-%d}", "",
                     "Visible monologues sharing their first 200 characters. None are",
                     "byte-identical, which is why exact dedupe never caught them.", "",
                     f"- {len(resolvable)} groups resolved automatically "
                     f"({n_retire} rows retired): within one work, one copy carries",
                     "  a co-character's line and exactly one does not.",
                     f"- **{len(human)} groups need a human.** No basis to prefer a copy:",
                     "  different editions, punctuation, several clean copies, or the",
                     "  play against its film — where the cleaner TEXT is not the better",
                     "  answer, because a theatre actor wants the play.", "",
                     f"## Needs a human — {len(human)}", ""]
            for k, rows in sorted(human,
                                  key=lambda g: -max(r.word_count for r in g[1])):
                titles = sorted({str(r.title) for r in rows})
                lines.append(f"### {rows[0].character_name} — {' / '.join(titles)}")
                for r in sorted(rows, key=lambda r: -r.word_count):
                    flag = " **carries a co-character cue**" if CUE.search(r.text or "") else ""
                    lines.append(f"- `#{r.id}` {r.word_count}w, play {r.play_id} "
                                 f"({_src(r)}){flag} — {(r.text or '')[:80]}…")
                lines.append("")
            out = Path(args.out)
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text("\n".join(lines))
            print(f"\nreport written to {out}")

        if not args.apply:
            print("\nDRY RUN — nothing written. Re-run with --apply.")
            return 0
        if not n_retire:
            print("\nnothing to retire")
            return 0

        BACKUP_DIR.mkdir(exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        bk = BACKUP_DIR / f"cue_dupes_{stamp}.json"
        bk.write_text(json.dumps({"rows": [
            {"id": d.id, "was_status": None, "kept": keep.id, "words": d.word_count}
            for keep, dirty in resolvable for d in dirty]}, indent=1))

        retired = 0
        for keep, dirty in resolvable:
            for d in dirty:
                row = db.query(Monologue).filter(Monologue.id == d.id).first()
                if row is not None:
                    hide(row, "duplicate")
                    retired += 1
            db.commit()

        print(f"\nretired {retired} rows (review_status='duplicate', embedding released)")
        print(f"undo: python -m scripts.retire_cue_duplicates --restore {bk}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
