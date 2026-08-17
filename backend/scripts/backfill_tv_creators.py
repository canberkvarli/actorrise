"""
Backfill creators for TV shows whose `plays.author` is empty or "Unknown".

As of 2026-08-17: 354 TV titles / 2,168 monologues carry no creator, i.e. 99.6%
of the TV corpus. Film is 0% missing, so this is specific to how TV was ingested.
It matters because the author is what an actor says out loud in the room, and
because it lands in the meta description of 12,011 public monologue pages.

DRY-RUN by default: writes a report and changes nothing. Review the report, then
`--apply`. Every applied change is backed up and `--restore` undoes it.

A wrong attribution is worse than a blank one, so:
  - only titles with NO usable author are touched, never an existing one
  - the model must return a confidence, and anything below --min-confidence is
    left blank and listed as needs_human
  - "unsure" is an explicitly allowed answer and is not penalised

Usage:
    uv run python scripts/backfill_tv_creators.py                  # dry-run report
    uv run python scripts/backfill_tv_creators.py --limit 20       # sample first
    uv run python scripts/backfill_tv_creators.py --apply
    uv run python scripts/backfill_tv_creators.py --restore backups/tv_creators_backup_*.json
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

backend_dir = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(backend_dir))

# pylint: disable=wrong-import-position
from app.core.database import SessionLocal
from app.models.actor import Monologue, Play
# pylint: enable=wrong-import-position

BACKUP_DIR = backend_dir / "backups"
REPORT_DIR = backend_dir / "reports"

PLACEHOLDER_AUTHORS = {"", "unknown", "n/a", "na", "various", "anonymous", "uncredited"}

PROMPT = """You are cataloguing television series for an actors' monologue library.

For the series titled "{title}", name the person most commonly credited as its
creator (for US/UK series, the "Created by" credit). If a series is an adaptation,
still give the television creator, not the novelist.

Rules:
- If you are not confident this is a real, identifiable series, say unsure.
- Never guess a plausible-sounding name. "unsure" is a correct and useful answer.
- confidence is your honest probability that the credit is right, 0.0 to 1.0.

Return ONLY JSON:
{{"creator": "<name, or empty string if unsure>", "confidence": <0.0-1.0>, "note": "<short reason>"}}"""


def _is_placeholder(author: str | None) -> bool:
    return (author or "").strip().lower() in PLACEHOLDER_AUTHORS


def _make_invoke(model: str):
    from app.services.ai.langchain.config import get_llm

    llm = get_llm(model=model, temperature=0.0, use_json_format=True)

    def _invoke(prompt: str) -> str:
        try:
            return llm.invoke(prompt).content
        except Exception as exc:  # noqa: BLE001 - one bad title must not kill the run
            return json.dumps({"creator": "", "confidence": 0.0, "note": f"error: {exc}"})

    return _invoke


def restore(backup_path: Path) -> None:
    data = json.loads(backup_path.read_text(encoding="utf-8"))
    db = SessionLocal()
    try:
        for row in data:
            play = db.query(Play).filter(Play.id == row["play_id"]).first()
            if play:
                play.author = row["original_author"]
        db.commit()
        print(f"Restored {len(data)} plays from {backup_path}")
    finally:
        db.close()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true", help="write changes (default: dry run)")
    ap.add_argument("--limit", type=int, default=None, help="only process the first N titles")
    ap.add_argument("--model", default="gpt-4o-mini")
    ap.add_argument("--min-confidence", type=float, default=0.85)
    ap.add_argument("--restore", type=str, default=None)
    args = ap.parse_args()

    if args.restore:
        restore(Path(args.restore))
        return

    db = SessionLocal()
    try:
        plays = (
            db.query(Play)
            .filter(Play.source_type == "tv")
            .order_by(Play.id)
            .all()
        )
        targets = [p for p in plays if _is_placeholder(p.author)]
        if args.limit:
            targets = targets[: args.limit]

        counts = {
            p.id: db.query(Monologue).filter(Monologue.play_id == p.id).count()
            for p in targets
        }
        print(f"{len(targets)} TV titles missing a creator "
              f"({sum(counts.values())} monologues)\n")

        invoke = _make_invoke(args.model)
        proposals, needs_human = [], []

        for i, play in enumerate(targets, 1):
            raw = invoke(PROMPT.format(title=play.title))
            try:
                parsed = json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                parsed = {"creator": "", "confidence": 0.0, "note": "unparseable response"}

            creator = (parsed.get("creator") or "").strip()
            confidence = float(parsed.get("confidence") or 0.0)
            # The model sometimes answers the literal word rather than an empty
            # string. Storing "unsure" as a creator would be its own bad data.
            if creator.lower() in {"unsure", "unknown", "n/a", "none"}:
                creator, confidence = "", 0.0
            row = {
                "play_id": play.id,
                "title": play.title,
                "monologues": counts[play.id],
                "creator": creator,
                "confidence": round(confidence, 2),
                "note": (parsed.get("note") or "")[:200],
                "original_author": play.author,
            }
            (proposals if creator and confidence >= args.min_confidence else needs_human).append(row)
            print(f"[{i}/{len(targets)}] {play.title[:44]:<44} "
                  f"{creator[:28]:<28} {confidence:.2f}")

        REPORT_DIR.mkdir(exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        report_path = REPORT_DIR / f"tv_creators_report_{stamp}.json"
        report_path.write_text(
            json.dumps({"proposals": proposals, "needs_human": needs_human}, indent=2),
            encoding="utf-8",
        )

        print(f"\nconfident (>= {args.min_confidence}): {len(proposals)}")
        print(f"needs a human:                {len(needs_human)}")
        print(f"report: {report_path}")

        if not args.apply:
            print("\nDRY RUN. Nothing written. Review the report, then re-run with --apply.")
            return

        BACKUP_DIR.mkdir(exist_ok=True)
        backup_path = BACKUP_DIR / f"tv_creators_backup_{stamp}.json"
        backup_path.write_text(json.dumps(proposals, indent=2), encoding="utf-8")

        for row in proposals:
            play = db.query(Play).filter(Play.id == row["play_id"]).first()
            # Re-check: never overwrite an author that appeared since the report.
            if play and _is_placeholder(play.author):
                play.author = row["creator"]
        db.commit()
        print(f"\nApplied {len(proposals)} creators. Backup: {backup_path}")
        print(f"Undo: uv run python scripts/backfill_tv_creators.py --restore {backup_path}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
