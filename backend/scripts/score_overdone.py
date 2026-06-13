#!/usr/bin/env python
"""
AI-score how "overdone" each CLASSICAL monologue is as an audition piece.

Writes monologues.overdone_score (0.0 fresh .. 1.0 warhorse) plus a one-line
reason and a scored-at timestamp. Only touches monologues whose play is
category='classical' (~5k rows) — contemporary and film/TV are left as-is.

The score reflects how often a casting director actually sees the SPECIFIC
speech in the room, not the play's overall literary fame. An obscure speech
from a famous play scores low; "To be or not to be" scores ~1.0.

Reversible: the original overdone_score for every touched row is dumped to
backups/overdone_score_backup.json before any write. Restore with --restore.

Usage:
    # dry run on a 20-row calibration sample (writes nothing)
    uv run python scripts/score_overdone.py --limit 20

    # full apply
    uv run python scripts/score_overdone.py --apply

    # re-score rows already scored
    uv run python scripts/score_overdone.py --apply --rescore

    # undo
    uv run python scripts/score_overdone.py --restore backups/overdone_score_backup.json
"""

from __future__ import annotations

import argparse
import collections
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

# pylint: disable=wrong-import-position
from sqlalchemy import func
from app.core.database import SessionLocal
from app.models.actor import Monologue, Play
# pylint: enable=wrong-import-position

BACKUP_DIR = backend_dir / "backups"
BACKUP_PATH = BACKUP_DIR / "overdone_score_backup.json"

SYSTEM_RUBRIC = """\
You are a veteran casting director rating how OVERDONE each audition monologue is.
"Overdone" means: how often you, in a real audition room, see actors bring THIS
specific speech. Judge the specific speech, not the play's overall fame — a famous
play can have obscure monologues. Anchor to audition-room frequency, not literary
importance.

Return a number 0.0–1.0 per the bands:
- 0.85–1.0  Warhorse: the pieces casting directors beg actors to retire.
            e.g. "To be or not to be", Romeo's balcony, "Tomorrow and tomorrow",
            "Quality of mercy", "All the world's a stage", St. Crispin's Day,
            Lady Macbeth "unsex me here", Shylock "Hath not a Jew", Medea's revenge.
- 0.6–0.84  Very common: well-worn, instantly recognizable, still seen a lot.
- 0.3–0.59  Recognizable: from a known play but a less-common speech.
- 0.0–0.29  Fresh: obscure speech, rarely brought to auditions.

If you cannot confidently identify the piece, score it LOW (<=0.2): a false
"fresh" is far better than wrongly burying an unknown piece under "overdone".

For each item return: id, overdone_score (float), tier (warhorse|common|recognizable|fresh),
and reason (one sentence, <=15 words, plain language).

Respond ONLY as JSON: {"scores": [{"id": <int>, "overdone_score": <float>, "tier": <str>, "reason": <str>}, ...]}
Include exactly one object per input id."""


class QuotaExhausted(RuntimeError):
    """Raised when OpenAI returns insufficient_quota (out of credits/billing cap)."""


def _opening(text: str, words: int = 120) -> str:
    toks = (text or "").split()
    snippet = " ".join(toks[:words])
    return snippet + (" …" if len(toks) > words else "")


def _build_prompt(batch: list[dict]) -> str:
    items = [
        {
            "id": m["id"],
            "title": m["title"],
            "character": m["character_name"],
            "play": m["play_title"],
            "author": m["play_author"],
            "opening": _opening(m["text"]),
        }
        for m in batch
    ]
    return (
        SYSTEM_RUBRIC
        + "\n\nScore these monologues (JSON input):\n"
        + json.dumps(items, ensure_ascii=False)
    )


def _make_invoke(model: str):
    """Reusable LLM invoke with backoff on rate limits. A batch that still fails
    after retries returns None so its rows stay unscored and get retried on the
    next run (idempotency guard skips scored rows)."""
    import time

    from app.services.ai.langchain.config import get_llm

    llm = get_llm(model=model, temperature=0.0, use_json_format=True)

    def _invoke(prompt: str):
        for attempt in range(5):
            try:
                return llm.invoke(prompt).content
            except Exception as exc:  # noqa: BLE001 — broad on purpose; logged, not raised
                # Out of OpenAI credits / billing cap: not recoverable by retrying.
                # Abort the whole run so we don't burn time backing off every batch.
                if "insufficient_quota" in str(exc).lower():
                    raise QuotaExhausted(str(exc)[:200]) from exc
                transient = "ratelimit" in type(exc).__name__.lower() or "timeout" in type(exc).__name__.lower()
                if transient and attempt < 4:
                    wait = 5 * (2 ** attempt)  # 5, 10, 20, 40s
                    print(f"  … {type(exc).__name__}; backing off {wait}s (attempt {attempt + 1}/5)")
                    time.sleep(wait)
                    continue
                print(f"  ! LLM call failed ({type(exc).__name__}); leaving batch unscored")
                return None
        return None

    return _invoke


def _parse_scores(raw: str) -> dict[int, dict]:
    """Parse the model's JSON into {id: {score, tier, reason}}, clamped to 0..1."""
    out: dict[int, dict] = {}
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        print("  ! could not parse LLM JSON; leaving batch unscored")
        return out
    for row in data.get("scores", []):
        try:
            rid = int(row["id"])
            score = max(0.0, min(1.0, float(row["overdone_score"])))
        except (KeyError, TypeError, ValueError):
            continue
        reason = str(row.get("reason", ""))[:200]
        out[rid] = {"score": score, "tier": row.get("tier", ""), "reason": reason}
    return out


def restore(backup_path: Path) -> None:
    data = json.loads(backup_path.read_text(encoding="utf-8"))
    db = SessionLocal()
    for mid, original in data.items():
        db.query(Monologue).filter(Monologue.id == int(mid)).update(
            {
                Monologue.overdone_score: original,
                Monologue.overdone_reason: None,
                Monologue.overdone_scored_at: None,
            },
            synchronize_session=False,
        )
    db.commit()
    db.close()
    print(f"Restored overdone_score for {len(data)} monologues from {backup_path}")


def run(*, apply: bool, limit: int | None, model: str, batch_size: int, rescore: bool) -> None:
    db = SessionLocal()

    q = (
        db.query(Monologue, Play.title, Play.author)
        .join(Play, Monologue.play_id == Play.id)
        .filter(Play.category.ilike("%classical%"))
    )
    if not rescore:
        q = q.filter(Monologue.overdone_scored_at.is_(None))
    q = q.order_by(Monologue.id)
    if limit:
        q = q.limit(limit)

    rows = q.all()
    print(f"{len(rows)} classical monologue(s) to score "
          f"(model={model}, batch={batch_size}, {'APPLY' if apply else 'DRY-RUN'})")
    if not rows:
        db.close()
        return

    batch_data = [
        {
            "id": m.id,
            "title": m.title,
            "character_name": m.character_name,
            "text": m.text,
            "play_title": ptitle,
            "play_author": pauthor,
            "current": m.overdone_score,
        }
        for (m, ptitle, pauthor) in rows
    ]

    # Reversible backup (merge with any existing so a row's FIRST original wins).
    if apply:
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        backup: dict[str, float] = {}
        if BACKUP_PATH.exists():
            backup = json.loads(BACKUP_PATH.read_text(encoding="utf-8"))
        for m in batch_data:
            backup.setdefault(str(m["id"]), m["current"] if m["current"] is not None else 0.0)
        BACKUP_PATH.write_text(json.dumps(backup, ensure_ascii=False), encoding="utf-8")
        print(f"Backup written: {BACKUP_PATH} ({len(backup)} rows)")

    invoke = _make_invoke(model)
    dist = collections.Counter()
    scored = 0

    aborted = False
    for start in range(0, len(batch_data), batch_size):
        batch = batch_data[start:start + batch_size]
        try:
            raw = invoke(_build_prompt(batch))
        except QuotaExhausted as exc:
            print(f"\n!! OpenAI quota exhausted (out of credits): {exc}")
            print("   Top up at https://platform.openai.com/account/billing, then re-run")
            print("   `--apply` to finish the remaining rows (already-scored rows are skipped).")
            aborted = True
            break
        if raw is None:
            continue
        parsed = _parse_scores(raw)
        by_id = {m["id"]: m for m in batch}
        now = datetime.now(timezone.utc)
        for rid, res in parsed.items():
            if rid not in by_id:
                continue
            band = ("fresh" if res["score"] < 0.3 else
                    "recognizable" if res["score"] < 0.6 else
                    "common" if res["score"] < 0.85 else "warhorse")
            dist[band] += 1
            scored += 1
            m = by_id[rid]
            mark = "" if apply else "  [dry-run]"
            print(f"  {res['score']:.2f} {band:<12} {m['play_title'][:24]:<24} "
                  f"{m['title'][:34]:<34} — {res['reason']}{mark}")
            if apply:
                db.query(Monologue).filter(Monologue.id == rid).update(
                    {
                        Monologue.overdone_score: res["score"],
                        Monologue.overdone_reason: res["reason"],
                        Monologue.overdone_scored_at: now,
                    },
                    synchronize_session=False,
                )
        if apply:
            db.commit()
        print(f"  …{min(start + batch_size, len(batch_data))}/{len(batch_data)} processed")

    db.close()
    print(f"\nScored {scored}/{len(batch_data)} rows"
          f"{' (ABORTED early — quota)' if aborted else ''}. Distribution: {dict(dist)}")
    if not apply:
        print("DRY-RUN: nothing written. Re-run with --apply to persist.")


def main() -> None:
    ap = argparse.ArgumentParser(description="AI-score overdone-ness of classical monologues.")
    ap.add_argument("--apply", action="store_true", help="persist scores (default: dry-run)")
    ap.add_argument("--limit", type=int, default=None, help="only the first N rows (calibration)")
    ap.add_argument("--model", default="gpt-4o", help="OpenAI model (default: gpt-4o)")
    ap.add_argument("--batch-size", type=int, default=15, help="monologues per LLM call")
    ap.add_argument("--rescore", action="store_true", help="re-score already-scored rows")
    ap.add_argument("--restore", type=Path, default=None, help="restore from a backup JSON and exit")
    args = ap.parse_args()

    if args.restore:
        restore(args.restore)
        return

    run(apply=args.apply, limit=args.limit, model=args.model,
        batch_size=args.batch_size, rescore=args.rescore)


if __name__ == "__main__":
    main()
