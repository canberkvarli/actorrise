#!/usr/bin/env python
"""Fill in the age and tone that some monologues were ingested without.

DRY-RUN by default — prints the proposed distribution and changes NOTHING.

359 live rows carry no usable character_age_range, and 151 of those carry no
usable tone either (every row missing a tone is also missing an age). It is not
spread evenly: Hamlet alone is 52 of the 151, and ten plays account for nearly
all of it, so this is a handful of ingests that skipped the tagging step rather
than a general gap.

Two things follow from an untagged row, and the second is the one that matters:

  1. The result card prints a bare running time where the other rows read
     "1:50 · 20s · dramatic".
  2. The piece cannot be reached by an age or tone filter AT ALL. Filtering is
     the actor's main tool for narrowing 19,000 pieces, so an untagged row is
     close to unfindable — 81% of Hamlet was in that state.

Sibling of retag_classical_ages.py, which fixes the opposite problem: rows
tagged with the bulk-ingest default "30-40" rather than rows tagged with
nothing. Same shape deliberately — dry-run, reversible, idempotent.

Vocabulary comes from app/services/search/vocabulary.py, not from this file.
Inventing a value here would write the row straight back out of the filters,
which is the bug being fixed; off-vocabulary answers from the model are
dropped rather than stored.

Reversible: originals go to backups/age_tone_backup.json (merged across runs,
first original wins), recording BOTH fields so a restore is exact. Idempotent:
ids already in the backup are skipped, so an interrupted run just continues.

Usage (from backend/):
    .venv/bin/python scripts/retag_missing_age_tone.py                 # dry-run
    .venv/bin/python scripts/retag_missing_age_tone.py --limit 20      # sample
    .venv/bin/python scripts/retag_missing_age_tone.py --apply
    .venv/bin/python scripts/retag_missing_age_tone.py --restore backups/age_tone_backup.json
"""

from __future__ import annotations

import argparse
import collections
import json
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.services.search.vocabulary import (  # noqa: E402
    CORPUS_AGE_VALUES,
    CORPUS_TONE_VALUES,
)

ALLOWED_AGES = set(CORPUS_AGE_VALUES)
ALLOWED_TONES = set(CORPUS_TONE_VALUES)

BACKUP_DIR = backend_dir / "backups"
BACKUP_PATH = BACKUP_DIR / "age_tone_backup.json"

_RUBRIC = (
    "You are a casting director. For each monologue below, give two things: "
    "the age range an actor would typically PLAY for this character, and the "
    "one word that best describes how the speech sounds. "
    f"age_range must be EXACTLY one of: {', '.join(sorted(ALLOWED_AGES))}. "
    f"tone must be EXACTLY one of: {', '.join(sorted(ALLOWED_TONES))}. "
    "Use 'any' for age only when the speech genuinely has no age anchor. "
    "Known characters (Juliet: teens; Hamlet: 20-30; Lear: 60+) should get "
    "their canonical playing age. Judge tone from the speech itself, not from "
    "the play's reputation: a comic character can have an anguished speech. "
    'Reply as JSON: {"tags": [{"id": <id>, "age_range": "<value>", "tone": "<value>"}, ...]}'
)


def parse_tags(raw) -> dict[int, dict]:
    """Parse the model's JSON into {id: {age_range?, tone?}}.

    Each field is validated on its own: a good age with a junk tone keeps the
    age. Anything off-vocabulary is dropped rather than written, because a
    value no filter asks for is the same as no value at all.
    """
    out: dict[int, dict] = {}
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return out
    for row in data.get("tags", []) or []:
        try:
            rid = int(row["id"])
        except (KeyError, TypeError, ValueError):
            continue
        picked: dict[str, str] = {}
        age = str(row.get("age_range", "")).strip().lower()
        if age in ALLOWED_AGES:
            picked["age_range"] = age
        tone = str(row.get("tone", "")).strip().lower()
        if tone in ALLOWED_TONES:
            picked["tone"] = tone
        if picked:
            out[rid] = picked
    return out


def _opening(text: str, words: int = 120) -> str:
    return " ".join((text or "").split()[:words])


def _build_prompt(batch: list[dict]) -> str:
    items = [
        {
            "id": m["id"],
            "character": m["character_name"],
            "play": m["play_title"],
            "author": m["play_author"],
            "opening": _opening(m["text"]),
        }
        for m in batch
    ]
    return _RUBRIC + "\n\nMonologues (JSON input):\n" + json.dumps(items, ensure_ascii=False)


def restore(backup_path: Path) -> None:
    from app.core.database import SessionLocal
    from app.models.actor import Monologue

    data = json.loads(backup_path.read_text(encoding="utf-8"))
    db = SessionLocal()
    try:
        for mid, original in data.items():
            db.query(Monologue).filter(Monologue.id == int(mid)).update(
                {
                    Monologue.character_age_range: original.get("character_age_range"),
                    Monologue.tone: original.get("tone"),
                },
                synchronize_session=False,
            )
        db.commit()
    finally:
        db.close()
    print(f"Restored age/tone for {len(data)} monologues from {backup_path}")


def _needs_work(m) -> dict[str, bool]:
    """Which fields this row is actually missing.

    "any" counts as missing for age because it is what the ingest wrote when it
    had nothing to say, and it matches no profile band. An existing real value
    is never overwritten — this script fills gaps, it does not re-judge work.
    """
    age = (m.character_age_range or "").strip().lower()
    tone = (m.tone or "").strip().lower()
    return {
        "age": age in ("", "any"),
        "tone": tone in ("", "unknown"),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--model", default="gpt-4o-mini")
    ap.add_argument("--batch-size", type=int, default=20)
    ap.add_argument("--play", help="Restrict to one play title (exact).")
    ap.add_argument(
        "--include-age-only",
        action="store_true",
        help="Also take rows that have a tone but no age. Off by default: a "
             "sample of 20 came back 18x 'any' and the model was RIGHT — they "
             "were Chorus, Puck, Time, Prologue, Epilogue, a Herald. Those "
             "roles have no playing age and forcing one invents data.",
    )
    ap.add_argument("--restore", metavar="BACKUP_JSON")
    args = ap.parse_args()

    if args.restore:
        restore(Path(args.restore))
        return 0

    from sqlalchemy import func, or_

    from app.core.database import SessionLocal
    from app.models.actor import Monologue, Play

    sys.path.insert(0, str(backend_dir / "scripts"))
    from score_overdone import _make_invoke  # reuse backoff/quota handling

    done_ids: set[int] = set()
    if BACKUP_PATH.exists():
        done_ids = {int(k) for k in json.loads(BACKUP_PATH.read_text(encoding="utf-8"))}

    db = SessionLocal()
    try:
        missing_age = or_(
            Monologue.character_age_range.is_(None),
            func.lower(func.trim(Monologue.character_age_range)).in_(("", "any")),
        )
        missing_tone = or_(
            Monologue.tone.is_(None),
            func.lower(func.trim(Monologue.tone)).in_(("", "unknown")),
        )
        q = (
            db.query(Monologue, Play.title, Play.author)
            .join(Play, Monologue.play_id == Play.id)
            # Retired rows are not served to anyone, so tagging them buys
            # nothing and would spend the quota on 4,000 dead pieces.
            .filter(Monologue.review_status.is_(None))
            # Missing TONE is the real gap: every speech has a sound, so a
            # blank there is always an ingest that skipped the step. Missing
            # AGE is not — see --include-age-only. Rows selected this way are
            # missing both in practice (all 151 are), and both get filled.
            .filter(or_(missing_age, missing_tone) if args.include_age_only else missing_tone)
            .order_by(Monologue.id)
        )
        if args.play:
            q = q.filter(Play.title == args.play)

        rows = [
            {
                "id": m.id,
                "character_name": m.character_name,
                "text": m.text,
                "play_title": ptitle,
                "play_author": pauthor,
                "needs": _needs_work(m),
                "before": {
                    "character_age_range": m.character_age_range,
                    "tone": m.tone,
                },
            }
            for (m, ptitle, pauthor) in q.all()
            if m.id not in done_ids
        ]
        if args.limit:
            rows = rows[: args.limit]

        n_age = sum(1 for r in rows if r["needs"]["age"])
        n_tone = sum(1 for r in rows if r["needs"]["tone"])
        print(
            f"{len(rows)} rows to tag ({n_age} missing age, {n_tone} missing tone; "
            f"model={args.model}, batch={args.batch_size}, "
            f"{'APPLY' if args.apply else 'DRY-RUN'}; {len(done_ids)} already done)"
        )
        if not rows:
            return 0

        invoke = _make_invoke(args.model)
        age_dist: collections.Counter = collections.Counter()
        tone_dist: collections.Counter = collections.Counter()
        filled_age = filled_tone = 0

        backup: dict[str, dict] = {}
        if args.apply:
            BACKUP_DIR.mkdir(exist_ok=True)
            if BACKUP_PATH.exists():
                backup = json.loads(BACKUP_PATH.read_text(encoding="utf-8"))

        for start in range(0, len(rows), args.batch_size):
            batch = rows[start:start + args.batch_size]
            raw = invoke(_build_prompt(batch))
            if raw is None:
                continue
            tags = parse_tags(raw)
            for m in batch:
                got = tags.get(m["id"])
                if not got:
                    continue
                # Only ever fills a gap. A row that already has a real tone
                # keeps it even if the model offers another one.
                set_age = m["needs"]["age"] and "age_range" in got
                set_tone = m["needs"]["tone"] and "tone" in got
                if not (set_age or set_tone):
                    continue

                update: dict = {}
                if set_age:
                    age_dist[got["age_range"]] += 1
                    update[Monologue.character_age_range] = got["age_range"]
                if set_tone:
                    tone_dist[got["tone"]] += 1
                    update[Monologue.tone] = got["tone"]

                if args.apply:
                    backup.setdefault(str(m["id"]), m["before"])
                    db.query(Monologue).filter(Monologue.id == m["id"]).update(
                        update, synchronize_session=False
                    )
                filled_age += int(set_age)
                filled_tone += int(set_tone)
            if args.apply:
                BACKUP_PATH.write_text(json.dumps(backup, ensure_ascii=False), encoding="utf-8")
                db.commit()
            done = min(start + args.batch_size, len(rows))
            print(f"  {done}/{len(rows)}  ages: {dict(age_dist)}")
            print(f"            tones: {dict(tone_dist)}")

        print(f"\nages  filled {filled_age}: {dict(age_dist)}")
        print(f"tones filled {filled_tone}: {dict(tone_dist)}")
        if args.apply:
            print(f"applied; backup: {BACKUP_PATH}")
        else:
            print("DRY-RUN — nothing written. Re-run with --apply.")
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
