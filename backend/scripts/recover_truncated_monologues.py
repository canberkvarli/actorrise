#!/usr/bin/env python
"""
Recover full canonical text for monologues whose stored `text` was truncated by
an old scraper (ends with literal '...' and is under 500 chars). Asks
gpt-4o-mini to produce the full canonical version, verifies the LLM kept the
existing prefix (so it identified the right monologue), then updates `text`,
recomputes `word_count`, and clears `text_segments` so the user can re-run
`segment_monologues.py --write` later to regenerate structured segments.

Dry-run by default; pass --write to persist.

Usage:
    uv run python -m scripts.recover_truncated_monologues --limit 3            # dry run
    uv run python -m scripts.recover_truncated_monologues --limit 10 --write   # persist
    uv run python -m scripts.recover_truncated_monologues --write              # full backfill
    uv run python -m scripts.recover_truncated_monologues --force --write      # also try LEN >= 500
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import create_engine, func, text as sql_text, update
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session as DBSession, joinedload, load_only, sessionmaker

from app.core.config import settings
from app.models.actor import Monologue, Play


# Dedicated engine. Mirrors segment_monologues.py — pool_pre_ping detects
# connections the Supabase pooler has silently closed between slow LLM
# round-trips, pool_recycle refreshes them before pgbouncer's idle timeout.
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
    expire_on_commit=False,
    bind=_engine,
)


# ── Constants ────────────────────────────────────────────────────────────────

MODEL = "gpt-4o-mini"
BATCH_SIZE = 25
FETCH_BATCH_SIZE = 250
PAGE_FETCH_RETRIES = 5
FLUSH_RETRIES = 5
TRUNCATION_LEN_THRESHOLD = 500

SYSTEM_PROMPT = """You recover the full canonical text of theatre or film monologues for an actor study app.

You receive:
- CHARACTER name
- PLAY/FILM title
- AUTHOR
- TRUNCATED_PREFIX: a short truncated excerpt that ends with "..."

Return ONLY a JSON object:
{ "text": "<the full canonical monologue text>" }

Rules:
- The returned text must START with the exact words and punctuation of TRUNCATED_PREFIX (minus its trailing "..."). This proves you identified the right monologue.
- Return the COMPLETE monologue as it appears in the standard published version. Preserve original line breaks where they're natural (paragraph boundaries).
- If you cannot identify the specific monologue with high confidence, return: { "text": "" }
- Do NOT include character names or stage directions unless they're integral to the printed text.
- No prose, no code fences, no apology. Just the JSON object."""


# ── Helpers ──────────────────────────────────────────────────────────────────

def _cleanup_stale_sessions(engine_) -> None:
    """Best-effort: kill our own leaked 'idle in transaction' Supavisor sessions
    from prior crashed runs. Failure is non-fatal."""
    try:
        with engine_.connect() as conn:
            killed = conn.execute(sql_text("""
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
        print(f"  cleanup skipped: {type(e).__name__}: {e}", file=sys.stderr)


def _fetch_page_with_retry(session_factory, build_query):
    """Fetch one page, retrying on transient DB connection failures."""
    last_err = None
    for attempt in range(1, PAGE_FETCH_RETRIES + 1):
        session = session_factory()
        try:
            rows = build_query(session).all()
            return session, rows
        except OperationalError as e:
            last_err = e
            session.close()
            backoff = min(30, 2 ** attempt)
            print(
                f"  !! DB fetch failed (attempt {attempt}/{PAGE_FETCH_RETRIES}): {type(e).__name__}; "
                f"retrying in {backoff}s",
                file=sys.stderr,
            )
            time.sleep(backoff)
    raise RuntimeError(f"page fetch failed after {PAGE_FETCH_RETRIES} attempts") from last_err


def _flush_updates_with_retry(session_factory, updates: list[tuple[int, str, int]]) -> None:
    """
    Persist a batch of (monologue_id, new_text, new_word_count) updates in a
    fresh transaction. text_segments is set to NULL so the user can re-run
    segment_monologues.py --write later. Retries on OperationalError.
    """
    last_err = None
    for attempt in range(1, FLUSH_RETRIES + 1):
        session = session_factory()
        try:
            for mono_id, new_text, new_wc in updates:
                session.execute(
                    update(Monologue)
                    .where(Monologue.id == mono_id)
                    .values(
                        text=new_text,
                        word_count=new_wc,
                        text_segments=None,  # invalidate; user re-runs segment_monologues
                    )
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


def _normalize(s: str) -> str:
    """Lower-case, collapse whitespace, normalize curly quotes to straight."""
    out = s.lower()
    out = out.replace("‘", "'").replace("’", "'")
    out = out.replace("“", '"').replace("”", '"')
    out = " ".join(out.split())
    return out


def _verify_prefix(existing: str, recovered: str) -> bool:
    """Strip trailing '...' from existing, compare first 80 chars normalized."""
    e = existing.rstrip()
    if e.endswith("..."):
        e = e[:-3].rstrip()
    e_head = _normalize(e)[:80]
    r_head = _normalize(recovered)[:80]
    if not e_head or not r_head:
        return False
    return r_head.startswith(e_head) or e_head.startswith(r_head)


def recover_monologue(
    client,
    *,
    character: str,
    play_title: str,
    author: str,
    truncated_text: str,
) -> tuple[str | None, str]:
    """Call gpt-4o-mini to recover the full canonical monologue text.
    Returns (recovered_text, error_reason). recovered_text is None on failure."""
    user_content = (
        f"CHARACTER: {character}\n"
        f"PLAY/FILM: {play_title}\n"
        f"AUTHOR: {author}\n"
        f"TRUNCATED_PREFIX: {truncated_text.rstrip()}"
    )
    try:
        response = client.chat.completions.create(
            model=MODEL,
            max_tokens=4096,
            temperature=0,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
        )
    except Exception as e:
        return None, f"api error: {e}"

    if response.choices[0].finish_reason == "length":
        return None, "max_tokens_truncation"

    try:
        raw = (response.choices[0].message.content or "").strip()
    except Exception as e:
        return None, f"response parse error: {e}"

    if not raw:
        return None, "empty response"

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as e:
        return None, f"json decode error: {e}"

    if not isinstance(parsed, dict) or "text" not in parsed:
        return None, "response missing 'text' key"
    recovered = parsed["text"]
    if not isinstance(recovered, str) or not recovered.strip():
        return None, "model declined (empty text)"

    return recovered.strip(), ""


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Recover truncated monologue text via OpenAI gpt-4o-mini"
    )
    parser.add_argument("--limit", type=int, default=None, help="Max records to process (default: all)")
    parser.add_argument("--write", action="store_true", help="Persist to DB (default: dry-run)")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Also attempt records with text >= 500 chars that end in '...' (advanced)",
    )
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

    _cleanup_stale_sessions(_engine)

    def _apply_filter(q):
        # Always: text ends with '...'
        q = q.filter(Monologue.text.like("%...")).filter(Monologue.text.isnot(None))
        if not args.force:
            q = q.filter(func.length(Monologue.text) < TRUNCATION_LEN_THRESHOLD)
        return q

    db: DBSession | None = None
    try:
        # Initial count (with retry)
        last_err = None
        total_matching = None
        for attempt in range(1, PAGE_FETCH_RETRIES + 1):
            count_session = SessionLocal()
            try:
                total_matching = _apply_filter(count_session.query(Monologue)).count()
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
            f"[{mode}] Processing {total_to_process} truncated monologues "
            f"(model={MODEL}, force={args.force}, fetch_page={FETCH_BATCH_SIZE})"
        )
        if not args.write:
            print("  (no database writes will occur; pass --write to persist)")

        success = 0
        attempted = 0
        last_id = 0
        page_num = 0
        done = False
        pending_updates: list[tuple[int, str, int]] = []

        while not done:
            def _build_page(session, _last_id=last_id):
                q = session.query(Monologue).options(
                    load_only(
                        Monologue.id,
                        Monologue.character_name,
                        Monologue.text,
                        Monologue.word_count,
                        Monologue.play_id,
                    ),
                    joinedload(Monologue.play).load_only(
                        Play.id, Play.title, Play.author
                    ),
                )
                q = _apply_filter(q)
                return (
                    q.filter(Monologue.id > _last_id)
                    .order_by(Monologue.id.asc())
                    .limit(FETCH_BATCH_SIZE)
                )

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
                author = (mono.play.author if mono.play else "") or "UNKNOWN"
                existing_text = mono.text or ""
                old_wc = mono.word_count or len(existing_text.split())

                if not existing_text.strip():
                    print(
                        f"  [{attempted}/{total_to_process}] id={mono_id} "
                        f"{character!r} SKIP: empty text"
                    )
                    continue

                recovered, reason = recover_monologue(
                    client,
                    character=character,
                    play_title=play_title,
                    author=author,
                    truncated_text=existing_text,
                )

                if recovered is None:
                    print(
                        f"  [{attempted}/{total_to_process}] id={mono_id} "
                        f"{character!r} WARN: api error - skipping ({reason})"
                    )
                    continue

                if not _verify_prefix(existing_text, recovered):
                    print(
                        f"  [{attempted}/{total_to_process}] id={mono_id} "
                        f"{character!r} WARN: prefix mismatch - likely wrong monologue, skipping"
                    )
                    continue

                new_wc = len(recovered.split())

                # Sanity: recovered should be longer than truncated (else what
                # did we gain?). Don't hard-fail — just warn.
                if new_wc <= old_wc:
                    print(
                        f"  [{attempted}/{total_to_process}] id={mono_id} "
                        f"{character!r} WARN: recovered ({new_wc}w) not longer "
                        f"than existing ({old_wc}w) - skipping"
                    )
                    continue

                print(
                    f"  [{attempted}/{total_to_process}] id={mono_id} "
                    f"{character!r} OK: {old_wc} -> {new_wc} words"
                )

                if args.write:
                    pending_updates.append((mono_id, recovered, new_wc))

                success += 1

                if args.write and len(pending_updates) >= BATCH_SIZE:
                    _flush_updates_with_retry(SessionLocal, pending_updates)
                    pending_updates.clear()
                    print(f"  .. committed batch (total written: {success})")

            last_id = page_rows[-1].id

            if len(page_rows) < FETCH_BATCH_SIZE:
                break

        if args.write and pending_updates:
            _flush_updates_with_retry(SessionLocal, pending_updates)
            print(f"  .. committed final batch (total written: {success})")
            pending_updates.clear()
        if args.write and success > 0:
            print(f"Committed {success} updates to DB.")

        suffix = (
            f"; {success} records re-segmentation pending "
            f"(run segment_monologues --write to populate text_segments)"
            if success > 0
            else ""
        )
        print(f"\nOK: {success} / {attempted}{suffix}")
    finally:
        if db is not None:
            db.close()


if __name__ == "__main__":
    main()
