#!/usr/bin/env python
"""
Segment monologues: parse the `text` field into structured segments
(dialogue / interjection / direction) via Claude Haiku, and write them to
the `text_segments` JSONB column added in Task 5.

This is a backfill. Dry-run by default; pass --write to persist.

Usage:
    uv run python -m scripts.segment_monologues --limit 10            # dry run, 10 records
    uv run python -m scripts.segment_monologues --limit 10 --write    # write to DB
    uv run python -m scripts.segment_monologues --write               # full backfill
    uv run python -m scripts.segment_monologues --force --write       # re-segment all records
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy.orm import Session as DBSession

from app.core.database import SessionLocal
from app.models.actor import Monologue


# ── Constants ────────────────────────────────────────────────────────────────

MODEL = "claude-haiku-4-5-20251001"
ALLOWED_TYPES = {"dialogue", "interjection", "direction"}
BATCH_SIZE = 25

SYSTEM_PROMPT = """You segment a monologue into structured parts for a theatre/film study app.

You receive:
- The target CHARACTER name
- The PLAY / FILM title
- The raw TEXT, which may contain:
  - The target character's spoken lines (most of the text)
  - Brief interjections from other characters (cue lines, short responses)
  - Stage directions or parentheticals (e.g. "(laughing)", "She crosses to the window")

Return ONLY a JSON array of segments. Each segment is:
  { "type": "dialogue"    , "text": "..." }    // target character speaking
  { "type": "interjection", "speaker": "NAME", "text": "..." }  // another character
  { "type": "direction"   , "text": "..." }    // stage direction / parenthetical

Rules:
- Preserve the original ordering and wording exactly.
- Do not add, drop, or paraphrase content. The concatenation of all segment texts should match the original text.
- For interjections, infer speaker from context if possible; if unknown, use "OTHER".
- Parentheticals like "(laughing)" are type="direction".
- If unsure, default to type="dialogue".

Output: strictly the JSON array, no prose, no code fences."""


# ── Helpers ──────────────────────────────────────────────────────────────────

def _strip_fences(raw: str) -> str:
    """Strip surrounding ```json ... ``` code fences if present."""
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    return raw.strip()


def _validate_segments(segs, original_text: str | None = None) -> tuple[bool, str]:
    """Return (ok, reason). Non-list, empty, or malformed → not ok."""
    if not isinstance(segs, list):
        return False, "response is not a list"
    if not segs:
        return False, "empty segment list"
    has_dialogue = False
    for i, seg in enumerate(segs):
        if not isinstance(seg, dict):
            return False, f"segment[{i}] is not an object"
        stype = seg.get("type")
        if stype not in ALLOWED_TYPES:
            return False, f"segment[{i}].type={stype!r} not in {sorted(ALLOWED_TYPES)}"
        text_val = seg.get("text")
        if not isinstance(text_val, str) or not text_val.strip():
            return False, f"segment[{i}].text is missing or empty"
        if stype == "dialogue":
            has_dialogue = True
    if not has_dialogue:
        return False, "no dialogue segment found"

    # Soft check: warn if segment text length drifts >10% from original.
    if original_text is not None:
        orig_len = len(original_text.strip())
        segs_len = len("".join(s["text"] for s in segs).strip())
        if orig_len > 0 and abs(orig_len - segs_len) / orig_len > 0.10:
            print(
                f"  !! WARN len-drift: original={orig_len} chars, "
                f"segments={segs_len} chars "
                f"(diff={abs(orig_len - segs_len)}, "
                f"{abs(orig_len - segs_len) / orig_len * 100:.1f}%)",
                file=sys.stderr,
            )

    return True, ""


def segment_monologue(
    client,
    *,
    character: str,
    play_title: str,
    text: str,
) -> tuple[list | None, str]:
    """Call Haiku to segment a monologue. Returns (segments, error_reason)."""
    user_content = (
        f"CHARACTER: {character}\n"
        f"PLAY / FILM: {play_title}\n\n"
        f"TEXT:\n{text}"
    )
    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=8192,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_content}],
        )
    except Exception as e:
        return None, f"api error: {e}"

    if getattr(response, "stop_reason", None) == "max_tokens":
        print(
            "  !! output truncated at max_tokens - monologue too long?",
            file=sys.stderr,
        )
        return None, "max_tokens_truncation"

    # Concatenate all text blocks from the response
    try:
        parts = []
        for block in response.content:
            btext = getattr(block, "text", None)
            if btext:
                parts.append(btext)
        raw = "".join(parts)
    except Exception as e:
        return None, f"response parse error: {e}"

    raw = _strip_fences(raw)
    if not raw:
        return None, "empty response"

    try:
        segs = json.loads(raw)
    except json.JSONDecodeError as e:
        return None, f"json decode error: {e}"

    ok, reason = _validate_segments(segs, original_text=text)
    if not ok:
        return None, reason
    return segs, ""


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill monologue text_segments via Claude Haiku")
    parser.add_argument("--limit", type=int, default=None, help="Max records to process (default: all)")
    parser.add_argument("--write", action="store_true", help="Persist to DB (default: dry-run, no writes)")
    parser.add_argument("--force", action="store_true", help="Re-segment records that already have text_segments")
    args = parser.parse_args()

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY environment variable is not set.", file=sys.stderr)
        sys.exit(1)

    try:
        from anthropic import Anthropic  # noqa: F401
    except ImportError:
        print("ERROR: anthropic not installed. Install the 'anthropic' package.", file=sys.stderr)
        raise

    from anthropic import Anthropic
    client = Anthropic(api_key=api_key)

    db: DBSession = SessionLocal()
    try:
        query = db.query(Monologue)
        if not args.force:
            query = query.filter(Monologue.text_segments.is_(None))
        query = query.order_by(Monologue.id.asc())
        if args.limit is not None and args.limit > 0:
            query = query.limit(args.limit)

        monologues = query.all()
        mode = "WRITE" if args.write else "DRY RUN"
        print(f"[{mode}] Processing {len(monologues)} monologues (model={MODEL}, force={args.force})")
        if not args.write:
            print("  (no database writes will occur; pass --write to persist)")

        success = 0
        attempted = 0

        for i, mono in enumerate(monologues):
            attempted += 1
            mono_id = mono.id
            character = mono.character_name or "UNKNOWN"
            play_title = mono.play.title if mono.play else "UNKNOWN"
            text = mono.text or ""

            if not text.strip():
                print(f"  [{i+1}/{len(monologues)}] id={mono_id} {character!r} SKIP: empty text")
                continue

            segs, reason = segment_monologue(
                client,
                character=character,
                play_title=play_title,
                text=text,
            )

            if segs is None:
                print(f"  [{i+1}/{len(monologues)}] id={mono_id} {character!r} WARN: {reason}")
                continue

            # Count by type for logging
            type_counts: dict[str, int] = {}
            for s in segs:
                type_counts[s["type"]] = type_counts.get(s["type"], 0) + 1
            counts_str = ", ".join(f"{k}={v}" for k, v in sorted(type_counts.items()))

            print(
                f"  [{i+1}/{len(monologues)}] id={mono_id} {character!r} "
                f"OK: {len(segs)} segments ({counts_str})"
            )

            if args.write:
                mono.text_segments = segs
                db.add(mono)

            success += 1

            if args.write and success > 0 and success % BATCH_SIZE == 0:
                db.commit()
                print(f"  .. committed batch (total written: {success})")

        if args.write:
            db.commit()
            if success > 0:
                print(f"Committed {success} updates to DB.")

        print(f"\nOK: {success} / {attempted}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
