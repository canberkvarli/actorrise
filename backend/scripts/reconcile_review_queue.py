"""Re-run today's detectors over the queue and drop rows nothing flags anymore.

The review queue is a snapshot of what the detectors believed when the rows were
scanned. Every time a detector is tightened, the rows it used to flag stay
queued, and the reviewer pays for a bug that has already been fixed by reading
monologues that are fine.

This walks the pending rows, re-asks the current detectors, and clears the ones
that no longer trip anything. It never edits monologue text and it never deletes
a row: the worst it can do is take something out of a queue it should not have
been in, and re-running the scan would put it back.

    python -m scripts.reconcile_review_queue [--apply]
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text as sql  # noqa: E402

from app.core.database import SessionLocal  # noqa: E402
from app.services.extraction.monologue_quality import (  # noqa: E402
    _NARRATION,
    has_flattened_scene,
    has_interleaved_dialogue,
    has_stage_direction_residue,
)

#: Third-person screenplay action welded into the speech ("She takes the phone",
#: "Bromden watches"). `assess_monologue_quality` can detect this but ships with
#: check_narration off, so it never reached the queue and the reviewer sees a row
#: flagged only as a flattened scene with no hint that the real defect is a
#: paragraph of stage business the actor would read aloud.
NARRATION_REASON = "narration_residue"

#: Reasons this script is competent to re-check. Anything else (an AI repair
#: verdict, a hand-added note) is left alone: it was not produced by a detector
#: we can re-run, so we cannot know whether it still holds.
RECHECKABLE = {
    "flattened_scene": lambda body, cast: has_flattened_scene(body),
    "interleaved_dialogue": has_interleaved_dialogue,
    "stage_direction_residue": has_stage_direction_residue,
}

#: Present on nearly every queued row as an umbrella label. On its own it is not
#: a finding, so a row left holding only this has nothing left to review.
UMBRELLA = "quality"

BACKUP_DIR = Path(__file__).resolve().parents[1] / "backups"


def _cast_names(db, monologue_id: int) -> list[str]:
    rows = db.execute(
        sql(
            """
            SELECT DISTINCT m2.character_name
            FROM monologues m2
            JOIN monologues m1 ON m1.play_id = m2.play_id
            WHERE m1.id = :mid
              AND m2.character_name IS NOT NULL
              AND m2.character_name <> m1.character_name
            """
        ),
        {"mid": monologue_id},
    ).scalars()
    return sorted(
        (n.strip() for n in rows if n and len(n.strip()) > 2), key=len, reverse=True
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        rows = db.execute(
            sql(
                """
                SELECT id, character_name, text, review_reasons
                FROM monologues
                WHERE review_status = 'pending'
                ORDER BY id
                """
            )
        ).all()
        print(f"pending rows: {len(rows)}")

        stale, trimmed = [], []
        for mid, character, body, reasons in rows:
            reasons = list(reasons or [])
            cast = _cast_names(db, mid)
            kept = []
            for r in reasons:
                check = RECHECKABLE.get(r)
                if check is None or check(body or "", cast):
                    kept.append(r)
            # Checked after, not before: a row can lose its original reason and
            # still be wrong. Clearing it because the flattened-scene rule no
            # longer fires would drop a monologue with a paragraph of action
            # prose in it back into the corpus unexamined.
            if _NARRATION.search(body or "") and NARRATION_REASON not in kept:
                kept.append(NARRATION_REASON)
            if kept == reasons:
                continue
            record = {
                "id": mid,
                "character": character,
                "was": reasons,
                "now": kept,
            }
            if not [r for r in kept if r != UMBRELLA]:
                stale.append(record)
            else:
                trimmed.append(record)

        print(f"no longer flagged at all (clear from queue): {len(stale)}")
        for s in stale:
            print(f"   #{s['id']:>6} {s['character']:<18} {s['was']} -> {s['now']}")
        print(f"still flagged, reasons relabelled: {len(trimmed)}")
        for t in trimmed:
            print(f"   #{t['id']:>6} {t['character']:<18} {t['was']} -> {t['now']}")

        if not args.apply:
            print("\ndry run, nothing written. re-run with --apply")
            return 0
        if not stale and not trimmed:
            return 0

        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup = BACKUP_DIR / f"review_queue_reconcile_{stamp}.json"
        backup.write_text(json.dumps({"cleared": stale, "trimmed": trimmed}, indent=2))
        print(f"\nbackup: {backup}")

        cleared = 0
        for s in stale:
            # Matches _clear_review in the admin API, so a row leaving the queue
            # this way is indistinguishable from one the reviewer dismissed.
            res = db.execute(
                sql(
                    """
                    UPDATE monologues
                    SET review_status = NULL, review_reasons = NULL,
                        proposed_text = NULL
                    WHERE id = :mid AND review_status = 'pending'
                    """
                ),
                {"mid": s["id"]},
            )
            cleared += res.rowcount
            db.commit()

        for t in trimmed:
            db.execute(
                sql(
                    """
                    UPDATE monologues SET review_reasons = :reasons
                    WHERE id = :mid AND review_status = 'pending'
                    """
                ),
                {"reasons": t["now"], "mid": t["id"]},
            )
            db.commit()

        print(f"cleared {cleared}, trimmed {len(trimmed)}")
        left = db.execute(
            sql("SELECT count(*) FROM monologues WHERE review_status = 'pending'")
        ).scalar()
        print(f"queue now: {left}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
