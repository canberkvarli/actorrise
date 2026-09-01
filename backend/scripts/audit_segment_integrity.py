"""Two things `audit_segments.py` does not check: does the render match the
text, and is the piece actually a monologue.

**Fidelity.** `text_segments` is a second copy of the same words, produced by an
LLM, and the reader shows the segments rather than `text` whenever they exist.
The segmenter only WARNS on length drift and writes the row anyway, so a
hallucinated or truncated segmentation silently becomes what the actor reads.
Nothing has ever compared the two. Rows that disagree get their segments
cleared, not repaired: `MonologueTextRenderer` falls back to `text` when
segments are absent, so clearing restores the true words immediately and a later
`segment_monologues.py --write` can try again.

**Dominance.** Segmentation is also the first thing that can measure whether a
row is a monologue at all. A piece is one person talking; the directions and the
occasional interruption are the margin. When another character's `interjection`
segments carry a quarter of the spoken words, the row is a scene with a name on
it — Priscilla #23900 is one dialogue line against two of Diantha's — and no
word-count or format check can see it.

    python -m scripts.audit_segment_integrity            # report only
    python -m scripts.audit_segment_integrity --fix
    python -m scripts.audit_segment_integrity --restore backups/seg_<ts>.json
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
    SEGMENT_MIN_FIDELITY,
    segment_fidelity,
)

_engine = create_engine(settings.database_url, pool_size=5, max_overflow=10,
                        pool_pre_ping=True, pool_recycle=1800)
SessionLocal = sessionmaker(autocommit=False, autoflush=False,
                            expire_on_commit=False, bind=_engine)

BACKUP_DIR = backend_dir / "backups"

#: Imported, not redefined. The writer rejects below this and the auditor flags
#: below it; two different numbers would have the auditor clearing rows the
#: writer had just accepted, forever.
MIN_FIDELITY = SEGMENT_MIN_FIDELITY

#: Share of SPOKEN words belonging to somebody other than the target character.
#: A quarter is already a scene. Below it the interruption is a beat the actor
#: plays through, which is exactly what the interjection segment type is for.
MAX_INTERJECTION_SHARE = 0.25

#: Retired rows carry this. Distinct from 'too_short' (intact but clip-length)
#: and 'pending' (broken, needs a human) so each population stays countable.
NOT_MONOLOGUE = "not_monologue"

_NORM = re.compile(r"[^a-z0-9]+")


def _key(text: str) -> str:
    return _NORM.sub(" ", (text or "").lower().replace("’", "'")).strip()


def restore(path: Path) -> None:
    rows = json.loads(path.read_text())["rows"]
    db = SessionLocal()
    try:
        for i, r in enumerate(rows, 1):
            db.query(Monologue).filter(Monologue.id == r["id"]).update(
                {Monologue.text_segments: r["text_segments"],
                 Monologue.review_status: r["review_status"]},
                synchronize_session=False)
            if i % 200 == 0:
                db.commit()
        db.commit()
        print(f"restored {len(rows)} rows from {path.name}")
    finally:
        db.close()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fix", action="store_true")
    ap.add_argument("--restore", type=Path, default=None)
    args = ap.parse_args()

    if args.restore:
        restore(args.restore)
        return 0

    db = SessionLocal()
    try:
        rows = (
            db.query(Monologue, Play.source_type)
            .join(Play, Play.id == Monologue.play_id)
            .filter(Monologue.text_segments.isnot(None))
            .all()
        )

        infidel: list[Monologue] = []
        scenes: list[tuple[Monologue, float]] = []
        by_source = {"play": [0, 0], "film": [0, 0], "tv": [0, 0]}

        for m, src in rows:
            segs = m.text_segments
            if not isinstance(segs, list) or not segs:
                continue

            joined = " ".join(str(s.get("text") or "") for s in segs)
            ratio = segment_fidelity(m.text, joined)
            if ratio < MIN_FIDELITY:
                infidel.append(m)
                if src in by_source:
                    by_source[src][0] += 1

            # Spoken words only: a direction is not said, so it belongs to
            # neither side of this ratio.
            own = sum(len(str(s.get("text") or "").split())
                      for s in segs if s.get("type") == "dialogue")
            other = sum(len(str(s.get("text") or "").split())
                        for s in segs if s.get("type") == "interjection")
            spoken = own + other
            if spoken and other / spoken > MAX_INTERJECTION_SHARE:
                scenes.append((m, other / spoken))
                if src in by_source:
                    by_source[src][1] += 1

        print("── Segment integrity ─────────────────────────")
        print(f"segmented rows examined      {len(rows)}")
        print(f"segments DISAGREE with text  {len(infidel)}   "
              f"(<{MIN_FIDELITY:.0%} similar; the render shows the wrong words)")
        print(f"NOT a monologue              {len(scenes)}   "
              f"(>{MAX_INTERJECTION_SHARE:.0%} of spoken words are another character)")
        print("\n            drifted  scene-like")
        for src, (a, b) in by_source.items():
            print(f"  {src:5s}     {a:5d}    {b:5d}")

        for m, share in sorted(scenes, key=lambda r: -r[1])[:5]:
            print(f"\n  scene {m.id} {m.character_name!r} "
                  f"{share:.0%} another character:\n    {(m.text or '')[:150]}")
        for m in infidel[:3]:
            joined = " ".join(str(s.get("text") or "") for s in (m.text_segments or []))
            print(f"\n  drift {m.id} {m.character_name!r}"
                  f"\n    TEXT: {(m.text or '')[:120]}"
                  f"\n    SEGS: {joined[:120]}")

        if not args.fix:
            print("\nREPORT ONLY — nothing written. Re-run with --fix.")
            return 0

        BACKUP_DIR.mkdir(exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        bk = BACKUP_DIR / f"seg_{stamp}.json"
        done: list[dict] = []
        touched = {m.id for m in infidel} | {m.id for m, _ in scenes}

        for i, mid in enumerate(sorted(touched), 1):
            m = db.query(Monologue).filter(Monologue.id == mid).first()
            done.append({"id": m.id, "text_segments": m.text_segments,
                         "review_status": m.review_status})
            update: dict = {}
            if any(x.id == mid for x in infidel):
                # Clear, do not repair: the renderer falls back to `text`, which
                # is the copy we know is right.
                update[Monologue.text_segments] = None
            if any(x.id == mid for x, _ in scenes) and m.review_status is None:
                update[Monologue.review_status] = NOT_MONOLOGUE
            if update:
                db.query(Monologue).filter(Monologue.id == mid).update(
                    update, synchronize_session=False)
            if i % 200 == 0 or i == len(touched):
                bk.write_text(json.dumps({"rows": done}, indent=1))
                db.commit()
                print(f"    fixed {i}/{len(touched)}", flush=True)
        db.commit()
        bk.write_text(json.dumps({"rows": done}, indent=1))

        print(f"\ncleared segments on {len(infidel)}, retired {len(scenes)} as "
              f"{NOT_MONOLOGUE!r}")
        print(f"undo: python -m scripts.audit_segment_integrity --restore {bk}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
