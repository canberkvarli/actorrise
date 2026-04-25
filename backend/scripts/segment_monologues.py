#!/usr/bin/env python
"""
Segment monologues: parse the `text` field into structured segments
(dialogue / interjection / direction) via OpenAI GPT-4o-mini, and write them to
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
import time
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session as DBSession, joinedload, load_only, sessionmaker

from app.core.config import settings
from app.models.actor import Monologue, Play


# Dedicated engine for this long-running script. pool_pre_ping detects connections
# the Supabase pooler has silently closed between slow LLM round-trips, and
# pool_recycle refreshes them before pgbouncer's idle timeout kicks in. Mirrors
# app/core/database.py config so SSL/pooler behaviour is identical, but scoped
# locally so we don't touch the app-wide engine.
_engine = create_engine(
    settings.database_url,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
    pool_recycle=1800,
)
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,  # keep attributes populated after batch commits to avoid lazy-load refresh on a flaky pooler connection
    bind=_engine,
)


# ── Constants ────────────────────────────────────────────────────────────────

MODEL = "gpt-4o-mini"
ALLOWED_TYPES = {"dialogue", "interjection", "direction"}
BATCH_SIZE = 25
FETCH_BATCH_SIZE = 250  # rows per DB page (keeps pooler happy)
PAGE_FETCH_RETRIES = 5

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

Output: a JSON object with exactly one key "segments" whose value is the array of segments. No prose, no code fences."""


# ── Helpers ──────────────────────────────────────────────────────────────────

def _cleanup_stale_sessions(engine_) -> None:
    """Best-effort: kill our own leaked 'idle in transaction' Supavisor sessions
    from prior crashed runs. Failure is non-fatal."""
    try:
        with engine_.connect() as conn:
            killed = conn.execute(text("""
                SELECT pg_terminate_backend(pid), pid, state
                FROM pg_stat_activity
                WHERE application_name = 'Supavisor'
                  AND state IN ('idle in transaction', 'idle in transaction (aborted)')
                  AND pid <> pg_backend_pid()
            """)).fetchall()
            conn.commit()
        if killed:
            print(f"  cleanup: terminated {len(killed)} stale 'idle in transaction' session(s)")
    except Exception as e:
        # Best-effort. Continue — the main retry loop will surface real DB errors.
        print(f"  cleanup skipped: {type(e).__name__}: {e}", file=sys.stderr)


def _fetch_page_with_retry(session_factory, build_query):
    """
    Fetch one page of monologues, retrying on transient DB connection failures.
    session_factory: a callable returning a new Session (e.g. SessionLocal).
    build_query: a callable that takes a Session and returns the configured Query.
    Returns (session, rows). Caller is responsible for closing the session when finished.
    """
    last_err = None
    for attempt in range(1, PAGE_FETCH_RETRIES + 1):
        session = session_factory()
        try:
            rows = build_query(session).all()
            return session, rows
        except OperationalError as e:
            last_err = e
            session.close()
            backoff = min(30, 2 ** attempt)  # 2, 4, 8, 16, 30
            print(
                f"  !! DB fetch failed (attempt {attempt}/{PAGE_FETCH_RETRIES}): {type(e).__name__}; "
                f"retrying in {backoff}s",
                file=sys.stderr,
            )
            time.sleep(backoff)
    raise RuntimeError(f"page fetch failed after {PAGE_FETCH_RETRIES} attempts") from last_err


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
    """Call GPT-4o-mini to segment a monologue. Returns (segments, error_reason)."""
    user_content = (
        f"CHARACTER: {character}\n"
        f"PLAY / FILM: {play_title}\n\n"
        f"TEXT:\n{text}"
    )
    try:
        response = client.chat.completions.create(
            model=MODEL,
            max_tokens=8192,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
        )
    except Exception as e:
        return None, f"api error: {e}"

    if response.choices[0].finish_reason == "length":
        print(
            "  !! output truncated at max_tokens - monologue too long?",
            file=sys.stderr,
        )
        return None, "max_tokens_truncation"

    try:
        raw = response.choices[0].message.content or ""
    except Exception as e:
        return None, f"response parse error: {e}"

    raw = _strip_fences(raw)
    if not raw:
        return None, "empty response"

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as e:
        return None, f"json decode error: {e}"

    if not isinstance(parsed, dict) or "segments" not in parsed:
        return None, "response object missing 'segments' key"
    segs = parsed["segments"]

    ok, reason = _validate_segments(segs, original_text=text)
    if not ok:
        return None, reason
    return segs, ""


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill monologue text_segments via OpenAI GPT-4o-mini")
    parser.add_argument("--limit", type=int, default=None, help="Max records to process (default: all)")
    parser.add_argument("--write", action="store_true", help="Persist to DB (default: dry-run, no writes)")
    parser.add_argument("--force", action="store_true", help="Re-segment records that already have text_segments")
    args = parser.parse_args()

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("ERROR: OPENAI_API_KEY environment variable is not set.", file=sys.stderr)
        sys.exit(1)

    try:
        from openai import OpenAI  # noqa: F401
    except ImportError:
        print("ERROR: openai not installed. Install the 'openai' package.", file=sys.stderr)
        raise

    from openai import OpenAI
    client = OpenAI(api_key=api_key)

    # Kill any leftover 'idle in transaction' Supavisor sessions from prior
    # crashed runs of this script. Best-effort; safe to no-op if it can't connect.
    _cleanup_stale_sessions(_engine)

    db: DBSession | None = None
    try:
        # Count total matching rows up front (small query, reliable) so we can
        # show [i/N] progress without materializing all rows at once. Wrap in
        # the same retry pattern as page fetches since COUNT(*) is equally
        # vulnerable to SSL EOF mid-query.
        def _build_count(session):
            q = session.query(Monologue)
            if not args.force:
                q = q.filter(Monologue.text_segments.is_(None))
            # We only want the count; return a trivial query and .count() below
            # won't work with _fetch_page_with_retry (which calls .all()), so
            # handle count inline with its own retry loop.
            return q

        last_err = None
        total_matching = None
        for attempt in range(1, PAGE_FETCH_RETRIES + 1):
            count_session = SessionLocal()
            try:
                total_matching = _build_count(count_session).count()
                count_session.close()
                break
            except OperationalError as e:
                last_err = e
                count_session.close()
                backoff = min(30, 2 ** attempt)
                print(
                    f"  !! DB count failed (attempt {attempt}/{PAGE_FETCH_RETRIES}): "
                    f"{type(e).__name__}; retrying in {backoff}s",
                    file=sys.stderr,
                )
                time.sleep(backoff)
        if total_matching is None:
            raise RuntimeError(
                f"initial count failed after {PAGE_FETCH_RETRIES} attempts"
            ) from last_err

        if args.limit is not None and args.limit > 0:
            total_to_process = min(total_matching, args.limit)
        else:
            total_to_process = total_matching

        mode = "WRITE" if args.write else "DRY RUN"
        print(
            f"[{mode}] Processing {total_to_process} monologues "
            f"(model={MODEL}, force={args.force}, fetch_page={FETCH_BATCH_SIZE})"
        )
        if not args.write:
            print("  (no database writes will occur; pass --write to persist)")

        success = 0
        attempted = 0
        last_id = 0
        page_num = 0
        done = False

        # Outer fetch loop: paginate via keyset on id to avoid huge result sets
        # that trip the Supabase pooler ("SSL SYSCALL error: EOF detected").
        while not done:
            def _build_page(session, _last_id=last_id):
                q = session.query(Monologue).options(
                    load_only(
                        Monologue.id,
                        Monologue.character_name,
                        Monologue.text,
                        Monologue.play_id,
                        Monologue.text_segments,
                    ),
                    joinedload(Monologue.play).load_only(Play.id, Play.title),
                )
                if not args.force:
                    q = q.filter(Monologue.text_segments.is_(None))
                return (
                    q.filter(Monologue.id > _last_id)
                    .order_by(Monologue.id.asc())
                    .limit(FETCH_BATCH_SIZE)
                )

            # Close old session before refetching so we don't hold stale
            # connections (the previous one may have been poisoned by an
            # OperationalError during the per-record work).
            if db is not None:
                db.close()
            db, page_rows = _fetch_page_with_retry(SessionLocal, _build_page)
            if not page_rows:
                break

            page_num += 1
            print(
                f"  -- fetched page {page_num}: {len(page_rows)} rows "
                f"(id range {page_rows[0].id}..{page_rows[-1].id})"
            )

            for mono in page_rows:
                if args.limit is not None and args.limit > 0 and attempted >= args.limit:
                    done = True
                    break

                attempted += 1
                mono_id = mono.id
                character = mono.character_name or "UNKNOWN"
                play_title = mono.play.title if mono.play else "UNKNOWN"
                text = mono.text or ""

                if not text.strip():
                    print(f"  [{attempted}/{total_to_process}] id={mono_id} {character!r} SKIP: empty text")
                    continue

                segs, reason = segment_monologue(
                    client,
                    character=character,
                    play_title=play_title,
                    text=text,
                )

                if segs is None:
                    print(f"  [{attempted}/{total_to_process}] id={mono_id} {character!r} WARN: {reason}")
                    continue

                # Count by type for logging
                type_counts: dict[str, int] = {}
                for s in segs:
                    type_counts[s["type"]] = type_counts.get(s["type"], 0) + 1
                counts_str = ", ".join(f"{k}={v}" for k, v in sorted(type_counts.items()))

                print(
                    f"  [{attempted}/{total_to_process}] id={mono_id} {character!r} "
                    f"OK: {len(segs)} segments ({counts_str})"
                )

                if args.write:
                    mono.text_segments = segs
                    db.add(mono)

                success += 1

                if args.write and success > 0 and success % BATCH_SIZE == 0:
                    db.commit()
                    print(f"  .. committed batch (total written: {success})")

            # Advance cursor regardless of whether args.limit cut us off; if
            # done=True we'll exit the outer loop on the next check.
            last_id = page_rows[-1].id

            if len(page_rows) < FETCH_BATCH_SIZE:
                # No more rows to fetch.
                break

        if args.write and db is not None:
            # Final commit can also hit SSL EOF — retry a few times so we don't
            # lose work already processed in memory.
            for attempt in range(1, 4):
                try:
                    db.commit()
                    break
                except OperationalError as e:
                    print(
                        f"  !! final commit failed (attempt {attempt}/3): {e}; retrying",
                        file=sys.stderr,
                    )
                    time.sleep(2 ** attempt)
            else:
                raise RuntimeError("final commit failed after 3 attempts")
            if success > 0:
                print(f"Committed {success} updates to DB.")

        print(f"\nOK: {success} / {attempted}")
    finally:
        if db is not None:
            db.close()


if __name__ == "__main__":
    main()
