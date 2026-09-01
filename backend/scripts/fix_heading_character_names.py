"""Twenty-one rows whose "character" is a section heading the parser swallowed.

`PlainTextParser._is_plausible_character` exists to stop this, but it postdates
these rows. Running it over the corpus flags 26 searchable rows — and it is
wrong about 5 of them, which is why this is a hand-sorted list rather than a
sweep. `Vi` in Coming Home and `Mix` in The Slump are real people with short
names, `The Note Taker` is what Pygmalion calls Higgins for the whole of Act I,
`Epilogue` in Henry VIII is a speech an actor can actually perform, and `Chorus`
is a role in every Greek tragedy in the library.

Sorted on the TEXT, not the name, which is the more reliable signal:

  RETIRE  — the body is a set description, a costume note or an editor's
            footnote. "The Court of Justice: the walls are hung with stamped
            grey velvet" is not a speech no matter whose name is on it.
  RENAME  — the body is real verse or dialogue and only the cue was mangled by a
            heading running into it. Amiens's "Blow, blow, thou winter wind" was
            filed under "Song\\n\\n\\nAmiens" and is one of the better pieces in
            As You Like It.

    python -m scripts.fix_heading_character_names [--apply]
    python -m scripts.fix_heading_character_names --restore backups/names_<ts>.json
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.models.actor import Monologue  # noqa: E402

_engine = create_engine(settings.database_url, pool_pre_ping=True, pool_recycle=1800)
SessionLocal = sessionmaker(autocommit=False, autoflush=False,
                            expire_on_commit=False, bind=_engine)
BACKUP_DIR = backend_dir / "backups"

STATUS = "not_monologue"

#: Body is staging apparatus or editorial matter, not speech.
RETIRE = {
    19635: "Hedda Gabler — translator's footnotes",
    17248: "Hedda Gabler — 'The End' + footnotes",
    19637: "You Never Can Tell — set description for Act II",
    19666: "Dandy Dick — set description",
    17253: "The Duchess of Padua — set description, Act I",
    17255: "The Duchess of Padua — set description, Act III",
    23892: "Patriotic Plays — Pocahontas costume note",
    23914: "Patriotic Plays — Marie Antoinette costume note",
    24013: "Christmas Candles — snow scene staging note",
    24119: "Christmas Candles — fireplace construction note",
    24253: "Down the Chimney — chimney construction note",
    24254: "Down the Chimney — bed construction note",
    24256: "Up the Chimney — shrinking machine staging note",
    23884: "Nursery Comedies — two speakers, 'TOM.' cue left inside the body",
}

#: Body is real; only the cue was swallowed by a preceding heading.
RENAME = {
    4711: "Bluntschli",   # was 'Sergius\r\nNo\r\n\r\nBluntschli'
    1129: "Amiens",       # was 'Song\r\n\r\n\r\nAmiens'
    5355: "Chorus",       # was 'Of The Chorus\r\n\r\nChorus'
    5433: "Chorus",       # was 'Chorus\r\n\r\n    I'
    5434: "Chorus",       # was 'Chorus\r\n\r\n    Ode\r\n\r\n    I'
    15437: "Chorus",      # was 'Chorus\r\n\r\n    Ii'
    8809: "Prologue",     # The Critic — the verse prologue, cue lost to the heading
}


def restore(path: Path) -> None:
    rows = json.loads(path.read_text())["rows"]
    db = SessionLocal()
    try:
        for r in rows:
            db.query(Monologue).filter(Monologue.id == r["id"]).update(
                {Monologue.character_name: r["character_name"],
                 Monologue.review_status: r["review_status"]},
                synchronize_session=False)
        db.commit()
        print(f"restored {len(rows)} rows from {path.name}")
    finally:
        db.close()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--restore", type=Path, default=None)
    args = ap.parse_args()
    if args.restore:
        restore(args.restore)
        return 0

    db = SessionLocal()
    try:
        ids = sorted(set(RETIRE) | set(RENAME))
        rows = {m.id: m for m in
                db.query(Monologue).filter(Monologue.id.in_(ids)).all()}

        missing = [i for i in ids if i not in rows]
        if missing:
            print(f"WARNING: {len(missing)} ids no longer exist: {missing}")

        print("── retire ──")
        for i, why in sorted(RETIRE.items()):
            m = rows.get(i)
            if m:
                print(f"  {i:6d} {(m.character_name or '')[:34]!r:38s} {why}")
        print("── rename ──")
        for i, new in sorted(RENAME.items()):
            m = rows.get(i)
            if m:
                print(f"  {i:6d} {(m.character_name or '')[:34]!r:38s} -> {new}")

        if not args.apply:
            print("\nDRY RUN — nothing written. Re-run with --apply.")
            return 0

        BACKUP_DIR.mkdir(exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        bk = BACKUP_DIR / f"names_{stamp}.json"
        bk.write_text(json.dumps({"rows": [
            {"id": m.id, "character_name": m.character_name,
             "review_status": m.review_status} for m in rows.values()]}, indent=1))

        for i in RETIRE:
            if i in rows:
                db.query(Monologue).filter(Monologue.id == i).update(
                    {Monologue.review_status: STATUS}, synchronize_session=False)
        for i, new in RENAME.items():
            if i in rows:
                db.query(Monologue).filter(Monologue.id == i).update(
                    {Monologue.character_name: new}, synchronize_session=False)
        db.commit()

        print(f"\nretired {len(RETIRE)}, renamed {len(RENAME)}")
        print(f"undo: python -m scripts.fix_heading_character_names --restore {bk}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
