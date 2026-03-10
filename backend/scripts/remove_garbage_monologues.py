#!/usr/bin/env python
"""
AI-powered garbage monologue detector — scans ALL monologues.

Batches 20 texts per API call → ~481 total calls for 9600 monologues.
Stays well under the 500 RPM limit with concurrency=10.
Cost: ~$0.15. Time: ~3 minutes.

Runs in DRY-RUN mode by default. Always skips favorited monologues.

Usage:
    uv run python scripts/remove_garbage_monologues.py            # dry run
    uv run python scripts/remove_garbage_monologues.py --delete   # actually delete
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.database import SessionLocal
from app.models.actor import Monologue, MonologueFavorite

MODEL = "gpt-4o-mini"
BATCH_SIZE = 10   # texts per API call
CONCURRENCY = 3   # concurrent calls — keeps TPM well under 200k limit
EXCERPT_LEN = 120 # chars per excerpt — enough to classify, minimises token usage

SYSTEM_PROMPT = """You are a classifier for a theater monologue database.
You will receive a numbered list of text excerpts. For each one, decide:
  m — actual dramatic speech, character dialogue, or narrative from a play/script
  c — anything NOT a monologue: bibliographic listing, cast list, play catalog,
      author biography, stage directions reference, table of contents,
      publishing ad, or any non-dramatic text

Reply with ONLY a comma-separated list of labels in the same order, e.g.:
m,c,m,m,c
No spaces, no other text, just the labels."""


async def classify_batch(
    client: "openai.AsyncOpenAI",
    sem: asyncio.Semaphore,
    batch: list[tuple[int, str]],
) -> dict[int, str]:
    """Classify a batch of (id, excerpt) pairs. Returns {id: label}."""
    # Sanitize: short excerpt + strip quotes to keep tokens low and output clean
    numbered = "\n\n".join(
        f"{i+1}. {txt[:EXCERPT_LEN].replace(chr(34), chr(39))}"
        for i, (_, txt) in enumerate(batch)
    )

    async with sem:
        for attempt in range(4):
            try:
                resp = await client.chat.completions.create(
                    model=MODEL,
                    messages=[
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": numbered},
                    ],
                    max_tokens=60,   # 20 labels × "m," = 40 chars max
                    temperature=0,
                )
                raw = resp.choices[0].message.content.strip().lower()
                # Parse comma-separated "m,c,m,..." response
                labels = [l.strip() for l in raw.split(",")]
                result = {}
                for i, (mid, _) in enumerate(batch):
                    lbl = labels[i] if i < len(labels) else "m"
                    result[mid] = "catalog" if lbl == "c" else "monologue"
                return result

            except Exception as e:
                msg = str(e)
                if "429" in msg and attempt < 3:
                    await asyncio.sleep(2 ** attempt)
                    continue
                print(f"    [warn] batch failed (ids {[b[0] for b in batch[:3]]}…): {e}")
                return {mid: "monologue" for mid, _ in batch}

    return {mid: "monologue" for mid, _ in batch}


async def run_classification(
    all_monologues: list[Monologue],
    api_key: str,
) -> set[int]:
    import openai

    client = openai.AsyncOpenAI(api_key=api_key)
    sem = asyncio.Semaphore(CONCURRENCY)

    pairs = [(int(m.id), m.text or "") for m in all_monologues if m.text]
    batches = [pairs[i:i+BATCH_SIZE] for i in range(0, len(pairs), BATCH_SIZE)]

    print(f"  {len(pairs)} monologues → {len(batches)} batches of {BATCH_SIZE}, concurrency={CONCURRENCY}, excerpt={EXCERPT_LEN} chars")
    print(f"  Estimated TPM: ~{BATCH_SIZE * EXCERPT_LEN // 4 * CONCURRENCY * 60 // 1:,} — limit is 200,000\n")

    tasks = [classify_batch(client, sem, b) for b in batches]
    results_list = await asyncio.gather(*tasks)

    garbage: set[int] = set()
    for result in results_list:
        for mid, label in result.items():
            if label == "catalog":
                garbage.add(mid)

    return garbage


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--delete", action="store_true")
    args = parser.parse_args()
    dry_run = not args.delete

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("Error: OPENAI_API_KEY not set.")
        sys.exit(1)

    print(f"{'[DRY RUN]' if dry_run else '[LIVE DELETE]'}  model={MODEL}\n")

    from sqlalchemy import text as sa_text

    # Retry once on stale connection (pool may hold a dead SSL connection from a prior run)
    for _attempt in range(2):
        db = SessionLocal()
        try:
            db.execute(sa_text("SELECT 1"))  # ping — forces reconnect if stale
            break
        except Exception:
            db.close()
            if _attempt == 1:
                raise

    try:
        from app.models.actor import Play
        from sqlalchemy import text as sa_text2

        # Only fetch the columns we need — avoid joining plays.full_text (can be huge)
        monologues = (
            db.query(Monologue)
            .filter(Monologue.text.isnot(None))
            .all()
        )
        print(f"Loaded {len(monologues)} monologues.")

        # Lightweight play title lookup
        play_rows = db.query(Play.id, Play.title).all()
        play_title_map: dict[int, str] = {r[0]: r[1] for r in play_rows}

        favorited_ids: set[int] = {
            row[0] for row in db.query(MonologueFavorite.monologue_id).distinct().all()
        }
        print(f"Will protect {len(favorited_ids)} favorited monologues.\n")

        # Cache all data we need before the async call (DB connection will go idle during it)
        mono_by_id: dict[int, Monologue] = {int(m.id): m for m in monologues}
        play_title_by_mono: dict[int, str] = {
            int(m.id): play_title_map.get(int(m.play_id), "?") if m.play_id else "?"
            for m in monologues
        }

        db.close()  # explicitly close before the long async phase

        print("Running AI classification on all monologues…")
        t0 = time.time()
        garbage_ids = asyncio.run(run_classification(monologues, api_key))
        elapsed = time.time() - t0
        print(f"  Done in {elapsed:.1f}s — {len(garbage_ids)} garbage entries found.\n")

        to_delete = sorted(mid for mid in garbage_ids if mid not in favorited_ids)
        protected  = sorted(mid for mid in garbage_ids if mid in favorited_ids)

        print(f"{'─'*80}")

        if protected:
            print(f"⚠  Favorited but garbage — manual action needed ({len(protected)}):")
            for mid in protected:
                mono = mono_by_id.get(mid)
                if mono:
                    preview = (mono.text or "")[:120].replace("\n", " ")
                    print(f"   id={mid}  char={mono.character_name!r}  preview: {preview!r}")
            print()

        print(f"Flagged for deletion ({len(to_delete)}):\n")
        for mid in to_delete:
            mono = mono_by_id.get(mid)
            if not mono:
                continue
            preview = (mono.text or "")[:160].replace("\n", " ")
            print(f"  id={mid}  char={mono.character_name!r}  play={play_title_by_mono.get(mid, '?')!r}")
            print(f"  preview: {preview!r}\n")

        print(f"{'─'*80}")
        print(f"Total to delete: {len(to_delete)}")

        if dry_run:
            print("\n[DRY RUN] No changes made. Run with --delete to remove.")
            return

        if not to_delete:
            print("Nothing to delete.")
            return

        confirm = input(f"\nType 'yes' to permanently delete {len(to_delete)} monologues: ")
        if confirm.strip().lower() != "yes":
            print("Aborted.")
            return

        # Re-open a fresh connection for the delete phase
        db2 = SessionLocal()
        try:
            db2.query(Monologue).filter(Monologue.id.in_(to_delete)).delete(synchronize_session=False)
            db2.commit()
            print(f"\nDeleted {len(to_delete)} monologues.")
        finally:
            db2.close()

    finally:
        try:
            db.close()
        except Exception:
            pass


if __name__ == "__main__":
    main()
