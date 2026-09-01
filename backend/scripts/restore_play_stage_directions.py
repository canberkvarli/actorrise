"""Put the stage directions back into play monologues, in position.

`plain_text_parser` used to delete every `(...)`, `[...]` and `_..._` span from a
speech before storing it, copying a flattened join of them into the
`stage_directions` COLUMN. So Polonius's "_Laying his hand on Laertes's head._"
survived as a detached string with no position, and the reading view — which
renders directions from `text_segments`, not from that column — never showed it.
The same substitution also deleted italicised EMPHASIS ("I said _no_"), which was
never a direction at all and simply went missing from the line.

The parser now keeps both (see PlainTextParser._to_display). This pass replays it
over the plays whose `full_text` is stored and rewrites the matching rows.

Matching is on the SPOKEN text, because that is the one thing both parsers agree
on: old stored text == new spoken text, modulo the emphasis words the old one
dropped. A candidate is accepted only at >=0.90 similarity, so a speech that has
drifted for any other reason is left alone rather than overwritten.

`text_segments` is set to NULL on every row touched: the stored segments describe
the old direction-free text, and leaving them would render the old words. Re-run
`segment_monologues.py --write` afterwards to tag the restored directions so the
reader shows them italic.

    python -m scripts.restore_play_stage_directions [--apply] [--limit N]
    python -m scripts.restore_play_stage_directions --restore backups/sd_<ts>.json
"""

from __future__ import annotations

import argparse
import difflib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.models.actor import Monologue, Play  # noqa: E402
from app.services.extraction.monologue_quality import (  # noqa: E402
    assess_monologue_quality,
)
from app.services.extraction.plain_text_parser import PlainTextParser  # noqa: E402
from app.utils.duration import estimate_duration_seconds  # noqa: E402

_engine = create_engine(settings.database_url, pool_size=5, max_overflow=10,
                        pool_pre_ping=True, pool_recycle=1800)
SessionLocal = sessionmaker(autocommit=False, autoflush=False,
                            expire_on_commit=False, bind=_engine)

BACKUP_DIR = backend_dir / "backups"

#: Deliberately below the 75-word floor. Retired rows are still rows, and if the
#: floor is ever revisited they should already be whole.
MIN_WORDS = 40
MAX_WORDS = 500

#: How close the spoken text must be to call it the same speech. The only
#: expected difference is the emphasis words the old parser deleted, which is a
#: few tokens; anything further apart is a different speech.
MIN_RATIO = 0.90

_NORM = re.compile(r"[^a-z0-9 ]+")


def _key(text: str) -> str:
    """Normalised token string for comparison.

    Curly and straight apostrophes are folded together: the stored rows and the
    Gutenberg source disagree about which one they use, and that alone was
    enough to push otherwise identical speeches under the similarity bar.
    """
    t = (text or "").lower().replace("’", "'")
    return " ".join(_NORM.sub(" ", t).split())


def _similar(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, a, b).ratio()


def restore(path: Path) -> None:
    rows = json.loads(path.read_text())["rows"]
    db = SessionLocal()
    try:
        for i, r in enumerate(rows, 1):
            db.query(Monologue).filter(Monologue.id == r["id"]).update(
                {
                    Monologue.text: r["text"],
                    Monologue.word_count: r["word_count"],
                    Monologue.estimated_duration_seconds: r["duration"],
                    Monologue.text_segments: r["text_segments"],
                },
                synchronize_session=False,
            )
            if i % 200 == 0:
                db.commit()
                print(f"    restored {i}/{len(rows)}", flush=True)
        db.commit()
        print(f"restored {len(rows)} rows from {path.name}")
    finally:
        db.close()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--limit", type=int, default=None, help="max plays to process")
    ap.add_argument("--restore", type=Path, default=None)
    args = ap.parse_args()

    if args.restore:
        restore(args.restore)
        return 0

    parser = PlainTextParser()
    db = SessionLocal()
    stats = {"plays": 0, "rows": 0, "matched": 0, "gained": 0, "unmatched": 0,
             "rejected": 0}
    changes: list[dict] = []
    samples: list[tuple[str, str, str]] = []

    try:
        plays = (
            db.query(Play)
            .filter(Play.source_type == "play", Play.full_text.isnot(None))
            .order_by(Play.id)
            .all()
        )
        plays = [p for p in plays if p.full_text and len(p.full_text) > 5000]
        if args.limit:
            plays = plays[: args.limit]

        for play in plays:
            rows = db.query(Monologue).filter(Monologue.play_id == play.id).all()
            if not rows:
                continue
            stats["plays"] += 1
            stats["rows"] += len(rows)

            cands = parser.extract_monologues(
                play.full_text, min_words=MIN_WORDS, max_words=MAX_WORDS)
            if not cands:
                stats["unmatched"] += len(rows)
                continue

            # Index by character so a speech can only match its own speaker.
            by_char: dict[str, list[dict]] = {}
            for c in cands:
                by_char.setdefault((c["character"] or "").strip().lower(), []).append(c)

            for m in rows:
                stored = _key(m.text)
                if not stored:
                    continue
                pool = by_char.get((m.character_name or "").strip().lower(), [])
                best, best_r = None, 0.0
                for c in pool:
                    r = _similar(stored, _key(c["dialogue"]))
                    if r > best_r:
                        best, best_r = c, r
                if best is None or best_r < MIN_RATIO:
                    stats["unmatched"] += 1
                    continue
                stats["matched"] += 1

                display = best["text"]
                if "(" not in display or display.strip() == (m.text or "").strip():
                    continue    # nothing to give back

                # The restored text must still be a monologue. A direction that
                # dominates, or a cue the old strip was accidentally hiding,
                # must not be written back in.
                verdict = assess_monologue_quality(
                    best["dialogue"], min_words=MIN_WORDS, max_words=MAX_WORDS)
                if not verdict.ok:
                    stats["rejected"] += 1
                    continue

                changes.append({
                    "id": m.id,
                    "text": m.text,
                    "word_count": m.word_count,
                    "duration": m.estimated_duration_seconds,
                    "text_segments": m.text_segments,
                    # what it becomes
                    "new_text": display,
                    "new_word_count": len(display.split()),
                    # Duration is what the actor SPEAKS. A direction is not
                    # performed aloud, so timing it would overstate the piece.
                    "new_duration": estimate_duration_seconds(best["dialogue"]),
                })
                stats["gained"] += 1
                if len(samples) < 5:
                    samples.append((m.character_name, play.title, display[:220]))

        print(f"plays with stored text   {stats['plays']}")
        print(f"rows examined            {stats['rows']}")
        print(f"matched to a candidate   {stats['matched']}")
        print(f"unmatched (left alone)   {stats['unmatched']}")
        print(f"rejected by the gate     {stats['rejected']}")
        print(f"WOULD REGAIN DIRECTIONS  {stats['gained']}")
        for ch, title, txt in samples:
            print(f"\n  {ch} — {title}\n    {txt}")

        if not args.apply:
            print("\nDRY RUN — nothing written. Re-run with --apply.")
            return 0
        if not changes:
            print("\nnothing to do")
            return 0

        # Backup written before the first write and appended per chunk, so an
        # interrupted run still has a complete undo list for what it did.
        BACKUP_DIR.mkdir(exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        bk = BACKUP_DIR / f"sd_{stamp}.json"
        done: list[dict] = []

        for i, ch in enumerate(changes, 1):
            done.append({k: ch[k] for k in
                         ("id", "text", "word_count", "duration", "text_segments")})
            if i % 200 == 0 or i == len(changes):
                bk.write_text(json.dumps({"rows": done}, indent=1))
            db.query(Monologue).filter(Monologue.id == ch["id"]).update(
                {
                    Monologue.text: ch["new_text"],
                    Monologue.word_count: ch["new_word_count"],
                    Monologue.estimated_duration_seconds: ch["new_duration"],
                    # Stale: they describe the direction-free text.
                    Monologue.text_segments: None,
                },
                synchronize_session=False,
            )
            if i % 200 == 0:
                db.commit()
                print(f"    updated {i}/{len(changes)}", flush=True)
        db.commit()
        bk.write_text(json.dumps({"rows": done}, indent=1))

        print(f"\nrestored directions on {len(changes)} monologues")
        print(f"undo: python -m scripts.restore_play_stage_directions --restore {bk}")
        print("NEXT: python -m scripts.segment_monologues --write   "
              "(re-tags the cleared text_segments so the reader shows them italic)")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
