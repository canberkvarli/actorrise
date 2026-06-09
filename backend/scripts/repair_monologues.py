#!/usr/bin/env python
"""Repair broken monologues across the whole library (play / film / TV).

For every monologue that fails the deterministic quality gate, try in order:
  1. strip      — remove (...)/[...] only (free)
  2. ai         — LLM extracts just the character's continuous spoken monologue
A fix is APPLIED only if the result passes `assess_monologue_quality`, so a
broken monologue is never replaced with another broken one.

Anything the AI still can't clean is flagged for manual review:
`review_status='pending'`, with the AI's best attempt in `proposed_text` and the
residual gate reasons in `review_reasons` — surfaced in the admin review queue.

DRY-RUN by default (writes a report, changes nothing). `--apply` writes text
fixes and review flags, backing up every original first for one-command undo.

Usage (from backend/):
    uv run python scripts/repair_monologues.py                      # dry-run, all, with AI
    uv run python scripts/repair_monologues.py --no-ai              # cheap strip-only preview
    uv run python scripts/repair_monologues.py --source film --limit 5   # small AI preview
    uv run python scripts/repair_monologues.py --apply             # write fixes + flags
    uv run python scripts/repair_monologues.py --restore backups/monologue_repair_backup_*.json
"""

from __future__ import annotations

import argparse
import collections
import json
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

# pylint: disable=wrong-import-position
from app.core.database import SessionLocal
from app.models.actor import Monologue, Play
from app.services.extraction.monologue_quality import assess_monologue_quality
from app.services.extraction.monologue_repair import (
    DEFAULT_REPAIR_MODEL,
    RepairResult,
    repair_monologue,
)
from app.utils.duration import estimate_duration_seconds
# pylint: enable=wrong-import-position

BACKUP_DIR = backend_dir / "backups"


_UNSALVAGEABLE = '{"monologue": "", "salvageable": false}'


def _make_invoke(model: str):
    """Build a single reusable LLM invoke callable (lazy import of langchain).

    Any per-call failure (content filter, rate limit, transient network error) is
    swallowed and reported as "unsalvageable" so a single bad row drops to the
    review queue instead of crashing the whole batch. Such rows keep their
    original text, so a later re-run retries them automatically.
    """
    from app.services.ai.langchain.config import get_llm

    llm = get_llm(model=model, temperature=0.0, use_json_format=True)

    def _invoke(prompt: str) -> str:
        try:
            return llm.invoke(prompt).content
        except Exception as exc:  # noqa: BLE001 — deliberately broad; logged, not raised
            print(f"  ! LLM call failed ({type(exc).__name__}); routing row to review")
            return _UNSALVAGEABLE

    return _invoke


def restore(backup_path: Path) -> None:
    """Undo: restore original text and clear review flags from a backup file."""
    data = json.loads(backup_path.read_text(encoding="utf-8"))
    db = SessionLocal()
    for mid, original in data.items():
        db.query(Monologue).filter(Monologue.id == int(mid)).update(
            {
                Monologue.text: original,
                Monologue.word_count: len(original.split()),
                Monologue.estimated_duration_seconds: estimate_duration_seconds(original),
                Monologue.review_status: None,
                Monologue.review_reasons: None,
                Monologue.proposed_text: None,
            },
            synchronize_session=False,
        )
    db.commit()
    db.close()
    print(f"Restored {len(data)} monologues from {backup_path}")


# Lowercase screenplay-narration detection only makes sense for screen sources;
# classical verse legitimately uses third-person constructions.
NARRATION_SOURCES = {"film", "tv"}


def run(
    sources: list[str],
    out_path: Path,
    *,
    apply: bool,
    use_ai: bool,
    limit: int | None,
    model: str,
    retry_queued: bool = False,
) -> None:
    db = SessionLocal()
    invoke = _make_invoke(model) if use_ai else None

    # Merge into any existing backup so re-runs never overwrite earlier originals
    # (a row's FIRST recorded original wins, keeping the file a complete undo).
    backup: dict[int, str] = {}
    _existing_backup = BACKUP_DIR / "monologue_repair_backup.json"
    if _existing_backup.exists():
        try:
            backup = {int(k): v for k, v in json.loads(
                _existing_backup.read_text(encoding="utf-8")).items()}
        except (json.JSONDecodeError, ValueError):
            backup = {}

    # Commit in small batches and flush the backup to disk alongside each commit,
    # so a dropped connection mid-run (the AI loop can take >1h) never loses
    # progress and the backup always matches what's committed.
    BATCH = 15
    applied_since_commit = 0
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    backup_path = BACKUP_DIR / "monologue_repair_backup.json"

    def _flush() -> None:
        nonlocal applied_since_commit
        if not apply:
            return
        backup_path.write_text(json.dumps(backup, ensure_ascii=False), encoding="utf-8")
        db.commit()
        applied_since_commit = 0

    title = "APPLIED" if apply else "dry run"
    lines = [f"# Monologue Repair — {title}", ""]
    lines.append(
        "Pipeline: strip → AI extract → gate. Fix applied only if it passes the "
        "quality gate; unsalvageable rows flagged `review_status=pending`.\n"
    )
    if use_ai:
        lines.append(f"AI model: `{model}`\n")
    else:
        lines.append("AI: **disabled** (strip-only pass)\n")

    grand = collections.Counter()

    for src in sources:
        q = (
            db.query(
                Monologue.id,
                Play.title,
                Play.author,
                Monologue.character_name,
                Monologue.text,
            )
            .join(Play, Monologue.play_id == Play.id)
            .filter(Play.source_type == src, Monologue.text.isnot(None))
        )
        # By default skip rows already sitting in the manual review queue — they've
        # had their AI attempt; re-running shouldn't re-spend on them.
        if not retry_queued:
            q = q.filter(Monologue.review_status.is_(None))
        rows = q.all()

        check_narration = src in NARRATION_SOURCES

        # Only spend effort on rows that actually fail the gate.
        flagged = [
            r
            for r in rows
            if not assess_monologue_quality(r.text, check_narration=check_narration).ok
        ]
        if limit is not None:
            flagged = flagged[:limit]

        counts = collections.Counter()
        counts["total"] = len(rows)
        counts["clean"] = len(rows) - len(flagged)
        ai_samples: list[tuple] = []
        review_ids: list[int] = []

        for mid, ptitle, author, char, text in flagged:
            try:
                res: RepairResult = repair_monologue(
                    text,
                    character_name=char or "",
                    play_title=ptitle or "",
                    author=author or "",
                    source_type=src,
                    use_ai=use_ai,
                    check_narration=check_narration,
                    invoke=invoke,
                )
            except Exception as exc:  # noqa: BLE001 — never let one row kill the batch
                print(f"  ! repair failed for #{mid} ({type(exc).__name__}); routing to review")
                res = RepairResult("", False, "ai_failed", ["repair_error"])
            counts[res.method] += 1

            if res.method in ("strip", "ai"):
                if res.method == "ai" and len(ai_samples) < 10:
                    ai_samples.append((mid, ptitle, char, text, res.cleaned_text))
                if apply:
                    backup.setdefault(mid, text)
                    db.query(Monologue).filter(Monologue.id == mid).update(
                        {
                            Monologue.text: res.cleaned_text,
                            Monologue.word_count: len(res.cleaned_text.split()),
                            Monologue.estimated_duration_seconds: estimate_duration_seconds(
                                res.cleaned_text
                            ),
                            Monologue.review_status: None,
                            Monologue.review_reasons: None,
                            Monologue.proposed_text: None,
                        },
                        synchronize_session=False,
                    )
                    applied_since_commit += 1
                    if applied_since_commit >= BATCH:
                        _flush()
            else:  # ai_failed / strip_failed → manual review queue
                review_ids.append(mid)
                if apply:
                    backup.setdefault(mid, text)  # recorded so restore clears flags
                    db.query(Monologue).filter(Monologue.id == mid).update(
                        {
                            Monologue.review_status: "pending",
                            Monologue.review_reasons: res.residual_reasons,
                            Monologue.proposed_text: res.cleaned_text or None,
                        },
                        synchronize_session=False,
                    )
                    applied_since_commit += 1
                    if applied_since_commit >= BATCH:
                        _flush()

        grand.update(counts)
        pct = 100 * counts["clean"] / counts["total"] if counts["total"] else 0.0
        lines.append(f"## source_type = `{src}`  (total {counts['total']})")
        lines.append("")
        lines.append(f"- clean (untouched): **{counts['clean']}** ({pct:.1f}%)")
        lines.append(f"- fixed_by_strip: **{counts['strip']}**")
        lines.append(f"- fixed_by_ai: **{counts['ai']}**")
        lines.append(
            f"- needs_review: **{counts['ai_failed'] + counts['strip_failed']}**"
        )
        lines.append("")
        lines.append("### Sample AI repairs (before → after)")
        lines.append("")
        for mid, ptitle, char, before, after in ai_samples:
            b = " ".join((before or "").split())
            a = " ".join((after or "").split())
            lines.append(f"**#{mid} — {char} / {ptitle}**")
            lines.append(f"- before: {b[:280]}{'…' if len(b) > 280 else ''}")
            lines.append(f"- after:  {a[:280]}{'…' if len(a) > 280 else ''}")
            lines.append("")
        lines.append(
            f"<details><summary>needs_review — {len(review_ids)} ids</summary>\n"
        )
        lines.append(", ".join(str(i) for i in review_ids))
        lines.append("\n</details>\n")

        print(
            f"[{src}] total={counts['total']} clean={counts['clean']} "
            f"strip={counts['strip']} ai={counts['ai']} "
            f"needs_review={counts['ai_failed'] + counts['strip_failed']}"
            + ("  APPLIED" if apply else "")
        )

    if apply:
        _flush()  # commit any remainder below the batch size
        print(f"\nCommitted changes for {len(backup)} monologues. Backup: {backup_path}")
        print(
            f"Undo with: uv run python scripts/repair_monologues.py --restore {backup_path}"
        )
    db.close()

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Report: {out_path}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", choices=["film", "play", "tv", "all"], default="all")
    ap.add_argument("--apply", action="store_true", help="write fixes + review flags")
    ap.add_argument("--no-ai", dest="use_ai", action="store_false", help="strip-only, no LLM")
    ap.add_argument("--limit", type=int, default=None, help="max flagged rows per source")
    ap.add_argument("--model", default=DEFAULT_REPAIR_MODEL)
    ap.add_argument(
        "--retry-queued",
        action="store_true",
        help="also re-attempt rows already in the review queue (default: skip them)",
    )
    ap.add_argument("--restore", metavar="BACKUP_JSON", help="undo from a backup file")
    ap.add_argument(
        "--out",
        default=str(backend_dir.parent / "docs" / "reports" / "2026-06-08-monologue-repair.md"),
    )
    args = ap.parse_args()

    if args.restore:
        restore(Path(args.restore))
        return

    sources = ["play", "film", "tv"] if args.source == "all" else [args.source]
    run(
        sources,
        Path(args.out),
        apply=args.apply,
        use_ai=args.use_ai,
        limit=args.limit,
        model=args.model,
        retry_queued=args.retry_queued,
    )


if __name__ == "__main__":
    main()
