"""Pre-compute a repair proposal for the unambiguous `interleaved_dialogue` rows.

The flag means a second character's cue was found mid-text, so the row holds two
people's speech glued together. Most of the queue cannot be fixed mechanically:
with three cues you are reconstructing a scene, and the reviewer has to read it.

But a row with exactly ONE cue is a single cut. The cue splits the text in two,
one side is a real speech and the other is the neighbouring line that leaked in,
and picking the longer side is right nearly every time. That is a decision a
human can confirm in a glance, so this script does not apply anything: it writes
the result to `proposed_text`, which the review page already renders behind a
"Use proposal" button.

The tail flag `suggest: <Name>` is added to `review_reasons` when the surviving
half is the OTHER character's, because then the fix is not only a trim, it is
also a re-attribution and the reviewer needs to see that before clicking.

Nothing here is destructive, but the reviewer is working the same rows live, so
every row is re-read under its own transaction and skipped if it has moved on.

    python -m scripts.propose_interleaved_splits [--apply]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text as sql  # noqa: E402

from app.core.database import SessionLocal  # noqa: E402
from app.services.extraction.monologue_quality import _cue_pattern  # noqa: E402

#: Below this a fragment is a leaked cue line, not a speech worth keeping. Same
#: floor the corpus uses elsewhere, so a proposal can never create a row the
#: 50-word purge would have deleted.
MIN_KEPT_WORDS = 50

#: If both halves clear the floor the split is a genuine two-hander and the cut
#: is a judgement call, not arithmetic. Those go back to the human.
DOMINANCE = 3.0

BACKUP_DIR = Path(__file__).resolve().parents[1] / "backups"


def _cast_names(db, monologue_id: int) -> list[str]:
    """Every other character in the same play, longest first.

    Longest first matters: "Mrs Hardcastle" must be tried before "Hardcastle",
    or the shorter name matches inside the longer one and the split lands in the
    middle of a cue.
    """
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
    names = [n.strip() for n in rows if n and len(n.strip()) > 2]
    return sorted(names, key=len, reverse=True)


def _single_cut(body: str, cast: list[str]):
    """Return (kept_text, cue_name, kept_is_other) for a one-cue row, else None."""
    hits = []
    for name in cast:
        for m in _cue_pattern(name).finditer(body):
            hits.append((m.start(), m.end(), name))
    if len(hits) != 1:
        return None

    start, end, name = hits[0]
    before = body[:start].strip()
    after = body[end:].strip()
    n_before, n_after = len(before.split()), len(after.split())

    # The cue introduces `after`, so `after` is the other character speaking and
    # `before` is the row's own character. Whichever side survives, the OTHER
    # one is what the flag was complaining about.
    if n_after >= MIN_KEPT_WORDS and n_after >= n_before * DOMINANCE:
        return after, name, True
    if n_before >= MIN_KEPT_WORDS and n_before >= n_after * DOMINANCE:
        return before, name, False
    return None


#: A flattened row's surviving fragment has to carry this much of the text before
#: dropping the rest counts as a trim rather than a rewrite.
DOMINANT_SHARE = 0.6


def _dominant_fragment(body: str):
    """Return (kept_text, "", False) when one paragraph IS the whole monologue.

    A `flattened_scene` row is one character's side of a scene, so it arrives as
    a run of paragraphs with the other person's replies missing. Usually that is
    unrepairable, because every paragraph is a real line and choosing between
    them is editing rather than cleaning.

    The exception is the shape where a genuine speech has picked up a tail of
    two- and three-word exchanges: one paragraph holds most of the words and the
    rest are stubs. Then the speech is recoverable exactly, and the stubs are
    the noise the flag was pointing at.
    """
    # Same split the flag itself uses, so a proposal can never disagree with the
    # fragment boundaries the reviewer is looking at.
    frags = [f.strip() for f in re.split(r"\n\s*\n", body) if f.strip()]
    if len(frags) < 2:
        return None
    counts = [len(f.split()) for f in frags]
    total = sum(counts)
    top = max(counts)
    if counts.count(top) != 1:
        return None
    if top < MIN_KEPT_WORDS or top < total * DOMINANT_SHARE:
        return None
    return frags[counts.index(top)], "", False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write proposals to the DB")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        # Plain tuples, not ORM objects: the reviewer is deleting rows out from
        # under this loop and a detached instance raises ObjectDeletedError.
        rows = db.execute(
            sql(
                """
                SELECT id, character_name, text, proposed_text, review_reasons
                FROM monologues
                WHERE review_status = 'pending'
                  AND (   'interleaved_dialogue' = ANY(review_reasons)
                       OR 'flattened_scene'      = ANY(review_reasons))
                ORDER BY id
                """
            )
        ).all()
        print(f"pending rows a proposal could apply to: {len(rows)}")

        planned = []
        for mid, character, body, existing_proposal, reasons in rows:
            if existing_proposal and existing_proposal.strip():
                continue
            cut = None
            if "interleaved_dialogue" in (reasons or []):
                cut = _single_cut(body or "", _cast_names(db, mid))
            if cut is None and "flattened_scene" in (reasons or []):
                cut = _dominant_fragment(body or "")
            if not cut:
                continue
            kept, cue_name, kept_is_other = cut
            planned.append(
                {
                    "id": mid,
                    "character": character,
                    "cue": cue_name,
                    "reattribute": kept_is_other,
                    "old_words": len((body or "").split()),
                    "new_words": len(kept.split()),
                    "proposed_text": kept,
                    "old_reasons": list(reasons or []),
                }
            )

        reattr = sum(1 for p in planned if p["reattribute"])
        print(f"rows with a clean dominant side: {len(planned)}")
        print(f"  plain trim:      {len(planned) - reattr}")
        print(f"  re-attribution:  {reattr}  (kept half belongs to the cued name)")
        for p in planned:
            arrow = f" -> {p['cue']}" if p["reattribute"] else ""
            print(
                f"  #{p['id']:>6} {p['character']}{arrow}"
                f"  {p['old_words']}w -> {p['new_words']}w"
            )

        if not args.apply:
            print("\ndry run, nothing written. re-run with --apply")
            return 0

        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup = BACKUP_DIR / f"interleaved_proposals_{stamp}.json"
        backup.write_text(json.dumps(planned, indent=2))
        print(f"\nbackup: {backup}")

        written = skipped = 0
        for p in planned:
            reasons = list(p["old_reasons"])
            if p["reattribute"]:
                tag = f"suggest: {p['cue']}"
                if tag not in reasons:
                    reasons.append(tag)
            # The WHERE clause is the concurrency guard: if the reviewer already
            # approved, dismissed or edited this row it no longer matches and the
            # update is a no-op rather than a clobber.
            res = db.execute(
                sql(
                    """
                    UPDATE monologues
                    SET proposed_text = :proposal,
                        review_reasons = :reasons
                    WHERE id = :mid
                      AND review_status = 'pending'
                      AND (proposed_text IS NULL OR proposed_text = '')
                    """
                ),
                {"proposal": p["proposed_text"], "reasons": reasons, "mid": p["id"]},
            )
            if res.rowcount:
                written += 1
            else:
                skipped += 1
            db.commit()

        print(f"proposals written: {written}   skipped (row moved on): {skipped}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
