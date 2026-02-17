#!/usr/bin/env python
"""
Backfill used_in_recent_major_production for monologues using LLM.

Asks the model, per play: "Has this play (or its famous monologues) been used in
a major film, TV, or theatre production in the last 10 years?" If yes, marks all
monologues from that play so the "Exclude used in recent major productions"
toggle can filter them out.

Usage (from backend directory):
    # Dry run: only generate CSV, no DB updates
    uv run python scripts/backfill_used_in_recent_major_productions.py --dry-run

    # Process first 20 plays (testing)
    uv run python scripts/backfill_used_in_recent_major_productions.py --limit 20 --dry-run

    # Apply to DB (after reviewing CSV)
    uv run python scripts/backfill_used_in_recent_major_productions.py --apply

    # Full run and apply
    uv run python scripts/backfill_used_in_recent_major_productions.py --apply --output results.csv

Requires: OPENAI_API_KEY. Run add_used_in_recent_major_production_column.py first.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import time
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.database import SessionLocal
from app.models.actor import Monologue, Play
from app.services.ai.langchain.config import get_llm
from langchain_core.messages import HumanMessage
from sqlalchemy import func

# Prompt: one play at a time, return JSON
PROMPT_TEMPLATE = """You are an expert on theatre, film, and TV. Answer based on public knowledge only.

Play: "{title}" by {author}

Has this play (or any of its well-known monologues/scenes) been used or prominently featured in a major film, TV series, or major theatre production in the last 10 years? "Used" includes: dialogue from the play in the production, auditions for the production asking for this play, or the production being an adaptation of this play.

Major = widely released films, notable streaming/TV series, Broadway/West End or similar.

Reply with ONLY a JSON object (no markdown, no explanation), exactly this shape:
{{ "used": true or false, "productions": ["Production Name (Year)", ...] }}

If used is false, productions must be an empty array. If used is true, list at least one production with approximate year."""


def ask_llm_for_play(play_title: str, play_author: str, llm) -> dict:
    """Return { used: bool, productions: list } from LLM."""
    prompt = PROMPT_TEMPLATE.format(title=play_title, author=play_author)
    try:
        response = llm.invoke([HumanMessage(content=prompt)])
        if hasattr(response, "content"):
            text = response.content
        else:
            text = str(response)
        # Strip markdown code block if present
        text = text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
        data = json.loads(text)
        used = bool(data.get("used", False))
        productions = data.get("productions") or []
        if not isinstance(productions, list):
            productions = []
        return {"used": used, "productions": productions}
    except Exception as e:
        print(f"  [LLM error] {e}", file=sys.stderr)
        return {"used": False, "productions": []}


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backfill used_in_recent_major_production via LLM (play-level)."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only write CSV; do not update DB",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Update monologues.used_in_recent_major_production in DB for plays where used=true",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Process at most N plays (default: all)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="used_in_recent_major_productions.csv",
        help="Output CSV path (default: used_in_recent_major_productions.csv)",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=0.5,
        help="Seconds between LLM calls (default: 0.5)",
    )
    args = parser.parse_args()

    if not args.dry_run and not args.apply:
        print("Use --dry-run to only generate CSV, or --apply to update DB.", file=sys.stderr)
        sys.exit(1)

    print("=" * 60)
    print("Backfill: used_in_recent_major_production (LLM, play-level)")
    print("=" * 60)

    db = SessionLocal()
    llm = get_llm(temperature=0.1, use_json_format=False)  # We ask for JSON in prompt

    # All plays that have monologues
    plays_query = (
        db.query(Play.id, Play.title, Play.author, func.count(Monologue.id).label("mono_count"))
        .join(Monologue, Monologue.play_id == Play.id)
        .group_by(Play.id, Play.title, Play.author)
        .order_by(Play.author, Play.title)
    )
    if args.limit:
        plays_query = plays_query.limit(args.limit)
    rows = plays_query.all()

    total = len(rows)
    print(f"Plays to process: {total}")
    print(f"Output CSV: {args.output}")
    print(f"Apply to DB: {args.apply}")
    print("=" * 60)

    results = []
    for i, (play_id, title, author, mono_count) in enumerate(rows, 1):
        print(f"[{i}/{total}] {title} by {author} ({mono_count} monologues)...", end=" ", flush=True)
        out = ask_llm_for_play(title or "", author or "", llm)
        used = out["used"]
        productions = out.get("productions") or []
        results.append({
            "play_id": play_id,
            "play_title": title,
            "author": author,
            "monologue_count": mono_count,
            "used": used,
            "productions": " | ".join(productions) if productions else "",
        })
        print("used" if used else "no")
        if args.delay > 0:
            time.sleep(args.delay)

    # Write CSV
    out_path = Path(args.output)
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["play_id", "play_title", "author", "monologue_count", "used", "productions"])
        w.writeheader()
        w.writerows(results)
    print(f"Wrote {out_path}")

    # Apply to DB
    if args.apply and not args.dry_run:
        used_play_ids = [r["play_id"] for r in results if r["used"]]
        if not used_play_ids:
            print("No plays marked as used; nothing to update.")
        else:
            updated = (
                db.query(Monologue)
                .filter(Monologue.play_id.in_(used_play_ids))
                .update(
                    {Monologue.used_in_recent_major_production: True},
                    synchronize_session=False,
                )
            )
            db.commit()
            print(f"Updated {updated} monologues (used_in_recent_major_production=True) for {len(used_play_ids)} plays.")

    db.close()
    print("Done.")


if __name__ == "__main__":
    main()
