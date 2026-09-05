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
from concurrent.futures import ThreadPoolExecutor
import re
import sys
import time
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import create_engine, text, update
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session as DBSession, joinedload, load_only, sessionmaker

from app.core.config import settings
from app.models.actor import Monologue, Play
from app.services.extraction.monologue_quality import (
    SEGMENT_MIN_FIDELITY,
    segment_fidelity,
)


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

# Default gpt-4o-mini for cost (~$0.0005/monologue vs ~$0.01 for gpt-4o): a full
# 14k re-segment is ~$8 vs ~$150. The improved prompt + _normalize_segments carry
# most of the quality; mini's residual misses are the hardest attribution cases
# (a character's rhetorical questions to a crowd, over-greying descriptive spoken
# lines). Set SEGMENT_MODEL=gpt-4o for a premium pass over just those.
MODEL = os.getenv("SEGMENT_MODEL", "gpt-4o-mini")
ALLOWED_TYPES = {"dialogue", "interjection", "direction"}
BATCH_SIZE = 25
FETCH_BATCH_SIZE = 250  # rows per DB page (keeps pooler happy)
PAGE_FETCH_RETRIES = 5
FLUSH_RETRIES = 5

SYSTEM_PROMPT = """You segment a monologue into structured parts for a theatre/film study app.

You receive:
- The target CHARACTER name
- The PLAY / FILM title
- The raw TEXT, which mixes three kinds of content:
  (1) The target character's spoken lines (their actual lines of dialogue)
  (2) Brief lines from OTHER characters (cues, reactions, questions)
  (3) Stage directions, parentheticals, AND screenplay narration (description, not speech)

Return ONLY a JSON object: { "segments": [...] }. Each segment is one of:
  { "type": "dialogue",     "text": "..." }                       // the TARGET character speaking aloud
  { "type": "interjection", "speaker": "NAME", "text": "..." }    // a DIFFERENT named character speaking aloud
  { "type": "direction",    "text": "..." }                       // anything NOT spoken aloud

How to choose the type — apply this test to every span:
- "DIALOGUE" — the TARGET character speaking aloud in performance. This is the DEFAULT for spoken words. It includes their rhetorical questions, asides, and lines shouted to a crowd. If the words are spoken by the target character, the type is ALWAYS dialogue — NEVER interjection. Interjection is only ever a DIFFERENT character.
- "INTERJECTION" — a DIFFERENT, specific character speaking aloud: a short cue, question, or reply from a named scene partner. Two hard requirements: (a) it is clearly NOT the target character, and (b) it is an actual spoken line, not a description of one. Set "speaker" to that other character's name; use "OTHER" only when a real different character speaks but is unnamed. NEVER put the target character's name as the interjection speaker — that span is dialogue.
- "DIRECTION" — anything that describes what is happening rather than a specific character's spoken words. This INCLUDES:
    * Parentheticals: "(laughing)", "(he turns away)"
    * Action lines: "She crosses to the window and stares out."
    * Screenplay narration (third-person prose describing the scene): "The fireball barrels through the sky.", "His mouth is agape."
    * Scene-setting prose: "In the sky above, a star is moving toward us."
    * Crowd / group / offstage reaction described in the third person: "Individuals in the crowd start shouting 'Yes!'", "The crowd chants.", "Voices cry out in the dark." These describe a SOUND the audience hears, not a scripted line for a named character, so they are DIRECTION — never interjection.
  If the words describe what the audience SEES or HEARS happening (rather than a specific character SAYING them), it is direction.

Bias rules:
- When unsure between dialogue and direction, choose DIRECTION. Better to mute narration than to spotlight it as the character's speech.
- When unsure between interjection and direction, choose DIRECTION. Interjection is only for an unmistakable line from a specific other character.

Strict preservation rules:
- Preserve original ordering and wording exactly. Do not rephrase, summarize, or expand.
- The concatenation of all segment texts (in order) must reconstruct the original text closely.
- Do not split a single sentence across segments unless it actually shifts type mid-sentence.
- Conversely, when the text DOES shift type — a spoken line immediately followed by a stage direction, or vice versa — you MUST split them into separate segments. Never bundle a spoken line and a direction into one segment.

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


def _flush_updates_with_retry(session_factory, updates: list[tuple[int, list]]) -> None:
    """
    Persist a batch of (monologue_id, segments) updates in a fresh transaction.
    Retries on OperationalError with exponential backoff.
    """
    last_err = None
    for attempt in range(1, FLUSH_RETRIES + 1):
        session = session_factory()
        try:
            for mono_id, segs in updates:
                session.execute(
                    update(Monologue)
                    .where(Monologue.id == mono_id)
                    .values(text_segments=segs)
                )
            session.commit()
            return
        except OperationalError as e:
            last_err = e
            try:
                session.rollback()
            except Exception:
                pass
            backoff = min(30, 2 ** attempt)
            print(
                f"  !! batch commit failed (attempt {attempt}/{FLUSH_RETRIES}): "
                f"{type(e).__name__}; retrying in {backoff}s",
                file=sys.stderr,
            )
            time.sleep(backoff)
        finally:
            session.close()
    raise RuntimeError(f"batch commit failed after {FLUSH_RETRIES} attempts") from last_err


def _strip_fences(raw: str) -> str:
    """Strip surrounding ```json ... ``` code fences if present."""
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    return raw.strip()


def _normalize_segments(segs, character: str):
    """Deterministic post-fixes the LLM cannot be trusted to always get right.

    An interjection attributed to the TARGET character is a contradiction —
    interjection means a DIFFERENT character speaking — so the span is really the
    target's own line: convert it to dialogue and drop the speaker. In the
    2026-08-27 audit this single rule corrected 287 segments across 156
    monologues (e.g. Bane's "Do you accept this man's resignation?" was tagged
    interjection/Bane). Applied BEFORE validation so a monologue whose lines were
    all mis-tagged this way still passes the has-dialogue check.
    """
    if not isinstance(segs, list) or not character:
        return segs
    target = character.strip().lower()
    for seg in segs:
        if (
            isinstance(seg, dict)
            and seg.get("type") == "interjection"
            and (seg.get("speaker") or "").strip().lower() == target
        ):
            seg["type"] = "dialogue"
            seg.pop("speaker", None)
    return segs


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

    # HARD check: the segments must be the same words as the text.
    #
    # This used to print a warning and write the row anyway, which is how 703
    # rows ended up rendering something other than their own text — including
    # 292 where a 39-word excerpt ending in "..." acquired a 509-word
    # continuation nobody can attribute to the playwright. The reader shows
    # segments in preference to `text`, so an unfaithful segmentation is not a
    # cosmetic problem; it is the actor reading invented words.
    #
    # Rejecting leaves `text_segments` NULL, and the renderer falls back to
    # `text` — the copy that came from the source. A row we cannot segment
    # faithfully is better left unsegmented than segmented wrong.
    if original_text is not None:
        # Speaker included: an interjection carries the name in its own field
        # while the monologue reads "(HORATIO: Ay, my lord.)". Joining only the
        # text fields drops the name, and a correct segmentation then looks like
        # drift — it rejected 352 of 838 rows, exactly the share containing an
        # interjection.
        ratio = segment_fidelity(
            original_text,
            " ".join(
                f"{s.get('speaker') or ''} {s['text']}".strip() for s in segs
            ),
        )
        if ratio < SEGMENT_MIN_FIDELITY:
            return False, f"segments drift from text (similarity {ratio:.2f})"

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
    # Rate limits are a pause, not a verdict.
    #
    # A 429 used to fall into the generic handler below, get written down as
    # "api error", and the row moved on unsegmented. That is silent, unbounded
    # data loss: a run at 8 workers tripped the account's limit a third of the
    # way in and lost 2,078 of 8,000 rows, while the log still scrolled past at
    # full speed and the totals looked like progress.
    #
    # Retrying makes the run slower under load and correct instead of fast and
    # lossy. The DB paths in this script already do this; the API path did not.
    last_error = None
    for attempt in range(5):
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
            break
        except Exception as e:
            last_error = e
            text_of = str(e)
            low = text_of.lower()
            # A 429 is NOT automatically transient. OpenAI returns the same
            # status for "slow down" and for "you have no credits remaining",
            # and the second one never resolves by waiting. Retrying it just
            # parks every worker in a sleep loop: three of them sat at 0% CPU
            # for four minutes, having written nothing, and the run looked
            # alive. Fail fast and loudly on quota so it is obvious what to fix.
            out_of_credit = ("insufficient_quota" in low
                             or "no credits remaining" in low
                             or "exceeded your current quota" in low
                             or "billing" in low)
            if out_of_credit:
                return None, f"OUT OF API CREDIT: {e}"
            transient = ("429" in text_of or "rate limit" in low
                         or "overloaded" in low or "timeout" in low
                         or "503" in text_of or "502" in text_of)
            if not transient or attempt == 4:
                return None, f"api error: {e}"
            # 4, 8, 16, 32 seconds. Jittered by the worker's own position in the
            # pool simply by virtue of when it failed, which is enough to stop
            # every thread retrying in lockstep.
            time.sleep(min(60, 4 * (2 ** attempt)))
    else:
        return None, f"api error: {last_error}"

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

    segs = _normalize_segments(segs, character)
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
    parser.add_argument("--ids", type=str, default=None,
                        help="Comma-separated monologue IDs to target (implies --force)")
    parser.add_argument("--source-type", type=str, default=None,
                        help="Comma-separated Play.source_type values: film,tv,play")
    parser.add_argument("--workers", type=int, default=12,
                        help="Concurrent segmentation API calls per page (the API is the "
                             "bottleneck; DB fetch/flush stay sequential). Default 12.")
    parser.add_argument("--min-id", type=int, default=0,
                        help="Resume: skip monologues with id <= this (keyset start). "
                             "Use to continue an interrupted --force run without redoing "
                             "the rows already processed.")
    args = parser.parse_args()

    target_ids: list[int] | None = None
    if args.ids:
        target_ids = [int(x.strip()) for x in args.ids.split(",") if x.strip()]
        args.force = True  # --ids implies re-segment those specific records

    target_source_types: list[str] | None = None
    if args.source_type:
        target_source_types = [s.strip() for s in args.source_type.split(",") if s.strip()]

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
            if target_ids:
                q = q.filter(Monologue.id.in_(target_ids))
            elif not args.force:
                q = q.filter(Monologue.text_segments.is_(None))
            if target_source_types:
                q = q.join(Play, Monologue.play_id == Play.id).filter(
                    Play.source_type.in_(target_source_types)
                )
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
        last_id = args.min_id  # resume point; 0 = from the start
        page_num = 0
        done = False
        pending_updates: list[tuple[int, list]] = []

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
                if target_ids:
                    q = q.filter(Monologue.id.in_(target_ids))
                elif not args.force:
                    q = q.filter(Monologue.text_segments.is_(None))
                if target_source_types:
                    q = q.join(Play, Monologue.play_id == Play.id).filter(
                        Play.source_type.in_(target_source_types)
                    )
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

            # Build this page's jobs first (skip empty text, respect --limit),
            # then segment them concurrently. The OpenAI call is the whole cost;
            # doing them one at a time is why a full run took ~30h. DB fetch and
            # flush stay sequential and single-session so the pooler is untouched.
            page_jobs: list[tuple[int, str, str, str]] = []
            for mono in page_rows:
                if args.limit is not None and args.limit > 0 and attempted + len(page_jobs) >= args.limit:
                    done = True
                    break
                text = mono.text or ""
                if not text.strip():
                    print(f"  id={mono.id} SKIP: empty text")
                    continue
                page_jobs.append((
                    mono.id,
                    mono.character_name or "UNKNOWN",
                    mono.play.title if mono.play else "UNKNOWN",
                    text,
                ))

            def _seg_one(job):
                mid, ch, title, txt = job
                try:
                    segs, reason = segment_monologue(client, character=ch, play_title=title, text=txt)
                    return mid, ch, segs, reason
                except Exception as e:  # noqa: BLE001 - a thread failure must not kill the page
                    return mid, ch, None, f"thread error: {type(e).__name__}: {e}"

            if page_jobs:
                with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
                    results = list(pool.map(_seg_one, page_jobs))
            else:
                results = []

            for mono_id, character, segs, reason in results:
                attempted += 1
                if segs is None:
                    print(f"  [{attempted}/{total_to_process}] id={mono_id} {character!r} WARN: {reason}")
                    continue

                type_counts: dict[str, int] = {}
                for s in segs:
                    type_counts[s["type"]] = type_counts.get(s["type"], 0) + 1
                counts_str = ", ".join(f"{k}={v}" for k, v in sorted(type_counts.items()))
                print(
                    f"  [{attempted}/{total_to_process}] id={mono_id} {character!r} "
                    f"OK: {len(segs)} segments ({counts_str})"
                )

                if args.write:
                    pending_updates.append((mono_id, segs))
                success += 1

                if args.write and len(pending_updates) >= BATCH_SIZE:
                    _flush_updates_with_retry(SessionLocal, pending_updates)
                    pending_updates.clear()
                    print(f"  .. committed batch (total written: {success})")

            # Advance cursor regardless of whether args.limit cut us off; if
            # done=True we'll exit the outer loop on the next check.
            last_id = page_rows[-1].id

            if len(page_rows) < FETCH_BATCH_SIZE:
                # No more rows to fetch.
                break

        if args.write and pending_updates:
            _flush_updates_with_retry(SessionLocal, pending_updates)
            print(f"  .. committed final batch (total written: {success})")
            pending_updates.clear()
        if args.write and success > 0:
            print(f"Committed {success} updates to DB.")

        print(f"\nOK: {success} / {attempted}")
    finally:
        if db is not None:
            db.close()


if __name__ == "__main__":
    main()
