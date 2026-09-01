#!/usr/bin/env python
"""Remove other-characters' lines and stage directions welded into a monologue.

Some stored monologues read as clean prose to the quality gate yet still carry
their scene partners' interjections inline. The extractor kept a story-telling
speech whole, but left the listeners' one-line reactions cued in:

    ...it dawned on me that I had lost my way. The Sentimental High School Girl.
    Oh! Grandmother. I was all ears...

"The Sentimental High School Girl." is a SPEAKER CUE and "Oh! Grandmother." is
that other character's line. Neither belongs in the Grandmother's monologue, but
both sit in `text`, inflate word_count / duration, poison the embedding, and
show up in the audition copy and the reader's cut. The June repair pass never
touched these because they PASS `assess_monologue_quality` — the pollution is
grammatical prose, not `(...)` artifacts or screenplay action.

Two shapes are handled here:

  * STAGE DIRECTIONS — "Enter Rosencrantz.", "Exit.", "Exeunt Lords." welded into
    the body (a lot of the Shakespeare). Removed deterministically so verse line
    structure is preserved and no LLM is spent.

  * INTERLEAVED DIALOGUE — a co-character's speaker cue + their line(s) mixed into
    the speech (the Grandmother case). This needs judgement about where the
    interjection ends and the target resumes, so it goes to the SAME LLM extractor
    the June repair used (`ai_extract_monologue`), which is prompted to return
    ONLY the target character's words, verbatim.

DETECTION is cast-aware: for each monologue we know its play's full cast, so a
"cue" is a DIFFERENT character's name followed by '.'/':'. To avoid firing on a
character merely ADDRESSING someone ("my sweet Richard."), only DISTINCTIVE
co-character names count as cues — multi-word ("The Vivacious Girl") or >= 8
chars ("Rosencrantz", "Madeleine"). Short single names ("Tracy.", "Oliver.")
are excluded from cue detection; an "Enter Oliver." still gets caught by the
stage-direction rule.

SAFETY. The AI can only ever DELETE, never rewrite:
  * verbatim-subsequence guard — the AI output must be a subsequence of the
    original word stream (normalised); if it added or reordered a word, reject.
  * drop-ratio ceiling — if the AI dropped > 50% of the words, it is likely
    eating the speech, not an interjection; reject.
Rejected rows are NOT auto-edited; they go to the manual review queue
(`review_status='pending'`, best attempt in `proposed_text`) exactly like the
June pipeline. Everything else applies, re-embeds, nulls the now-stale
`text_segments` (the reader falls back to plain `text`), and resyncs word_count
and duration. Every original text + segments is backed up first for one-command
undo.

Usage (from backend/):
    uv run python scripts/clean_interleaved_dialogue.py                 # dry run, free
    uv run python scripts/clean_interleaved_dialogue.py --ai-sample 8   # preview 8 AI cuts
    uv run python scripts/clean_interleaved_dialogue.py --no-ai         # deterministic only
    uv run python scripts/clean_interleaved_dialogue.py --apply         # write + AI + re-embed
    uv run python scripts/clean_interleaved_dialogue.py --restore backups/<file>.json
"""

from __future__ import annotations

import argparse
import collections
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

# pylint: disable=wrong-import-position
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models.actor import Monologue, Play
from app.services.extraction.monologue_repair import ai_extract_monologue
from app.utils.duration import estimate_duration_seconds
# pylint: enable=wrong-import-position

# Dedicated pre-pinging engine: this script keeps working across hundreds of slow
# LLM round-trips, and the Supabase pooler silently drops a connection that idles
# between them. pool_pre_ping revalidates before each checkout; pool_recycle
# refreshes before pgbouncer's idle timeout. Mirrors segment_monologues.py.
_engine = create_engine(
    settings.database_url,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
    pool_recycle=1800,
)
SessionLocal = sessionmaker(
    autocommit=False, autoflush=False, expire_on_commit=False, bind=_engine
)

BACKUP_DIR = backend_dir / "backups"
REPORT = backend_dir.parent / "docs" / "reports" / "2026-08-29-interleaved-dialogue-cleanup.md"

MIN_WORDS = 75            # matches the purge bar; never auto-apply below this
MAX_DROP_RATIO = 0.50     # AI dropping more than this looks like eating the speech

# Stage directions welded into the body. Anchored to a leading capital name/word
# and kept short so it cannot swallow a sentence a character actually speaks
# ("Enter the room, close the door, and listen to me." is 10+ words, not matched).
STAGE_DIRECTION = re.compile(
    r"(?<![\w'’])(?:Re-enter|Enter|Exeunt|Exit)\b(?:\s+[A-Z][^.!?;]{0,55})?[.!?;]",
)
# A stage direction is only removed when it is short and free of first-person
# speech, so "Enter Rosencrantz." goes but a spoken line starting with "Enter"
# survives.
_FIRST_PERSON = re.compile(r"\b(?:I|I'|me|my|mine|we|us|our)\b")


def _distinctive(name: str) -> bool:
    """Would this co-character name, used as `Name.`, be a real speaker cue?

    Multi-word or long names ("The Vivacious Girl", "Rosencrantz") are cues.
    Short single names ("Tracy", "Oliver") are excluded — they show up when a
    character simply addresses another, and would cause false positives.
    """
    n = (name or "").strip()
    if not n:
        return False
    return len(n.split()) >= 2 or len(n) >= 8


def _cue_pattern(name: str) -> re.Pattern:
    """`Name.` or `Name:` as a speaker cue (case-insensitive, word-anchored)."""
    return re.compile(r"(?<![\w'’])" + re.escape(name.strip()) + r"\s*[.:]", re.IGNORECASE)


def _norm_tokens(text: str) -> list[str]:
    """Lowercase alphanumeric word stream, for the verbatim-subsequence guard."""
    return re.findall(r"[a-z0-9]+", (text or "").lower())


def _is_subsequence(sub: list[str], full: list[str]) -> bool:
    """True if every token of `sub` appears in `full` in order (deletions only)."""
    it = iter(full)
    return all(tok in it for tok in sub)


def strip_stage_directions(text: str, cast: list[str]) -> tuple[str, bool]:
    """Remove short `Enter/Exit/Exeunt X` directions. Returns (text, changed)."""
    changed = False

    def _repl(m: re.Match) -> str:
        nonlocal changed
        span = m.group(0)
        # Keep anything that reads like speech rather than a cue.
        if _FIRST_PERSON.search(span) or len(span.split()) > 7:
            return span
        # "Enter <word>" must name a cast member (or be a bare Exit/Exeunt).
        head = span.split()[0].lower()
        if head in ("enter", "re-enter"):
            tail = " ".join(span.split()[1:]).rstrip(".!?;:").strip()
            cast_l = {c.lower() for c in cast}
            if tail and not any(tail.lower().startswith(c) or c.startswith(tail.lower()) for c in cast_l):
                return span
        changed = True
        return " "

    out = STAGE_DIRECTION.sub(_repl, text)
    out = re.sub(r"\s{2,}", " ", out).strip()
    return out, changed


_LABEL_CONNECTORS = {"the", "a", "an", "of", "and", "de", "la", "le", "young", "old"}


def _is_speaker_label(clause: str, others: list[str]) -> bool:
    """Is this trailing clause a speaker label rather than spoken words?

    A label is short, ends on (or equals) a co-character's name, and every word
    is capitalised or a small connector. This distinguishes the FULL cue label
    "The Sentimental High School Girl" (a superset of the cast name "High School
    Girl") from a line a character actually speaks that merely names someone.
    """
    core = clause.strip().rstrip(".:").strip()
    if not core or len(core.split()) > 8:
        return False
    cl = core.lower()
    if not any(cl == n.lower() or cl.endswith(" " + n.lower()) for n in others):
        return False
    for w in core.split():
        if w[:1].isalpha() and not w[:1].isupper() and w.lower().strip(",") not in _LABEL_CONNECTORS:
            return False
    return True


def strip_trailing_cue(text: str, others: list[str]) -> tuple[str, bool]:
    """Drop a dangling co-character speaker label that is the LAST sentence.

    Splits on sentence boundaries and removes the final segment whole when it
    reads as a speaker label, so "...lost my way. The Sentimental High School
    Girl." becomes "...lost my way." with no "The Sentimental" fragment left.
    """
    stripped = text.rstrip()
    parts = re.split(r"(?<=[.!?])\s+", stripped)
    if len(parts) >= 2 and _is_speaker_label(parts[-1], others):
        return " ".join(parts[:-1]).rstrip(), True
    return text, False


def body_has_cue(text: str, others: list[str]) -> bool:
    """Is there a co-character speaker cue in the body (mid-text interleave)?"""
    for name in others:
        m = _cue_pattern(name).search(text)
        if not m:
            continue
        # Ignore a cue that is only the opening address of the whole speech.
        if m.start() > 3:
            return True
    return False


def restore(path: Path) -> None:
    """Undo: restore original text + segments, resync counts, re-embed, clear flags."""
    data = json.loads(path.read_text(encoding="utf-8"))
    db = SessionLocal()
    try:
        from app.services.ai.content_analyzer import ContentAnalyzer

        analyzer = ContentAnalyzer()
        n = 0
        for mid, rec in data.items():
            row = db.get(Monologue, int(mid))
            if row is None:
                continue
            original = rec["text"] if isinstance(rec, dict) else rec
            row.text = original
            row.word_count = len(original.split())
            row.estimated_duration_seconds = estimate_duration_seconds(original)
            row.text_segments = rec.get("segments") if isinstance(rec, dict) else None
            row.review_status = None
            row.review_reasons = None
            row.proposed_text = None
            try:
                row.embedding_vector = analyzer.generate_embedding(original)
            except Exception as exc:  # noqa: BLE001
                print(f"  embed-on-restore failed id={mid}: {exc}")
            n += 1
            if n % 20 == 0:
                db.commit()
        db.commit()
        print(f"Restored {n} monologues from {path}")
    finally:
        db.close()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write fixes + review flags + re-embed")
    ap.add_argument("--no-ai", dest="use_ai", action="store_false",
                    help="deterministic only; route interleaved rows to review")
    ap.add_argument("--ai-sample", type=int, default=0,
                    help="in dry-run, actually call the LLM on N interleaved rows to preview")
    ap.add_argument("--limit", type=int, default=0, help="cap candidates processed")
    ap.add_argument("--no-reembed", action="store_true", help="write text but skip embeddings")
    ap.add_argument("--reattempt-review", action="store_true",
                    help="re-run ONLY rows already in the review queue (implies --apply)")
    ap.add_argument("--restore", type=str, default="", help="undo from a backup file")
    args = ap.parse_args()

    if args.restore:
        restore(Path(args.restore))
        return

    if args.reattempt_review:
        args.apply = True

    # ---- Phase 1: detect candidates and detach them from the DB session ----
    # We must NOT hold a session open across the 269 slow LLM calls (pgbouncer
    # kills an idle SSL connection mid-run), so everything needed downstream is
    # copied into plain dicts and the read session is closed immediately.
    def _load():
        for attempt in range(5):
            db = SessionLocal()
            try:
                cast: dict[int, list[str]] = collections.defaultdict(list)
                for pid, cname in (
                    db.query(Monologue.play_id, Monologue.character_name)
                    .filter(Monologue.character_name.isnot(None)).distinct().all()
                ):
                    cast[pid].append(cname)
                q = (
                    db.query(
                        Monologue.id, Monologue.play_id, Monologue.character_name,
                        Monologue.text, Play.title, Play.author,
                    )
                    .join(Play, Play.id == Monologue.play_id)
                    .filter(Monologue.text.isnot(None))
                )
                if args.reattempt_review:
                    # Only rows already parked in the review queue; their text is
                    # still the untouched original (queue set flags, not text).
                    q = q.filter(Monologue.review_status == "pending")
                rows = q.order_by(Monologue.id).all()
                return cast, rows
            except OperationalError:
                db.rollback()
                if attempt == 4:
                    raise
                time.sleep(2)
            finally:
                db.close()

    cast, rows = _load()

    counts = collections.Counter()
    deterministic: list[dict] = []   # {id, cleaned}
    needs_ai: list[dict] = []        # {id, base, character, title, author, others}

    for mid, play_id, character_name, text, title, author in rows:
        others = [c for c in cast.get(play_id, []) if c and c != character_name and _distinctive(c)]

        has_sd = bool(STAGE_DIRECTION.search(text))
        has_trailing = strip_trailing_cue(text, others)[1]
        has_body_cue = body_has_cue(text, others)
        if not (has_sd or has_trailing or has_body_cue):
            continue
        counts["candidates"] += 1

        cleaned, c1 = strip_stage_directions(text, cast.get(play_id, []))
        cleaned, c2 = strip_trailing_cue(cleaned, others)
        changed_det = c1 or c2

        if body_has_cue(cleaned, others):
            needs_ai.append({"id": mid, "base": cleaned, "character": character_name or "",
                             "title": title or "", "author": author or "", "others": others})
        elif changed_det and cleaned != text and len(cleaned.split()) >= MIN_WORDS:
            deterministic.append({"id": mid, "cleaned": cleaned})
            counts["deterministic"] += 1
        # else: candidate whose only signal was an address false-positive → skip.

    counts["needs_ai"] = len(needs_ai)
    if args.limit:
        deterministic = deterministic[: args.limit]
        needs_ai = needs_ai[: args.limit]

    print(f"candidates: {counts['candidates']}")
    print(f"  deterministic (stage-dir / trailing cue): {len(deterministic)}")
    print(f"  interleaved dialogue -> AI: {counts['needs_ai']}")

    # ---- dry run: optionally preview a few AI repairs, then stop ----
    if not args.apply:
        if args.ai_sample and args.use_ai:
            print(f"\n--- AI preview ({min(args.ai_sample, len(needs_ai))} rows) ---")
            for it in needs_ai[: args.ai_sample]:
                try:
                    cand = ai_extract_monologue(
                        it["base"], character_name=it["character"], play_title=it["title"],
                        author=it["author"], source_type="play")
                except Exception as exc:  # noqa: BLE001
                    print(f"\n#{it['id']} LLM error: {exc}")
                    continue
                ok_sub = cand and _is_subsequence(_norm_tokens(cand), _norm_tokens(it["base"]))
                print(f"\n#{it['id']} {it['character']} / {it['title']}  verbatim={bool(ok_sub)}")
                print(f"  before: {' '.join(it['base'].split())[:240]}")
                print(f"  after:  {' '.join((cand or '').split())[:240]}")
        print("\n(dry run — pass --apply to write)")
        return

    # ---- Phase 2: compute edits (LLM + embeddings, no DB), write in short batches ----
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    backup_path = BACKUP_DIR / f"interleaved_cleanup_{stamp}.json"
    backup: dict[int, dict] = {}
    applied = collections.Counter()

    analyzer = None
    if not args.no_reembed:
        from app.services.ai.content_analyzer import ContentAnalyzer
        analyzer = ContentAnalyzer()

    def _embed(text: str):
        if analyzer is None:
            return None
        try:
            return analyzer.generate_embedding(text)
        except Exception as exc:  # noqa: BLE001
            print(f"  embed failed: {exc}")
            return None

    def _write(ops: list[dict]) -> None:
        """Apply a small batch in a fresh short-lived transaction (pooler-safe)."""
        if not ops:
            return
        for attempt in range(5):
            db = SessionLocal()
            try:
                for op in ops:
                    row = db.get(Monologue, op["id"])
                    if row is None:
                        continue
                    backup.setdefault(op["id"], {"text": row.text, "segments": row.text_segments})
                    if op["kind"] == "apply":
                        row.text = op["text"]
                        row.word_count = len(op["text"].split())
                        row.estimated_duration_seconds = estimate_duration_seconds(op["text"])
                        row.text_segments = None
                        row.review_status = None
                        row.review_reasons = None
                        row.proposed_text = None
                        if op.get("embedding") is not None:
                            row.embedding_vector = op["embedding"]
                    elif op["kind"] == "release":
                        # Confirmed clean on reattempt: clear the review flags,
                        # leave text / segments / embedding as they are.
                        row.review_status = None
                        row.review_reasons = None
                        row.proposed_text = None
                    else:  # queue
                        row.review_status = "pending"
                        row.review_reasons = op["reasons"]
                        row.proposed_text = op["proposal"] or None
                db.commit()
                return
            except OperationalError:
                db.rollback()
                if attempt == 4:
                    raise
                time.sleep(2)
            finally:
                db.close()

    def _flush(ops: list[dict]) -> None:
        _write(ops)
        backup_path.write_text(json.dumps(backup, ensure_ascii=False), encoding="utf-8")

    BATCH = 15
    ops: list[dict] = []

    for it in deterministic:
        ops.append({"id": it["id"], "kind": "apply", "text": it["cleaned"],
                    "embedding": _embed(it["cleaned"])})
        applied["deterministic"] += 1
        if len(ops) >= BATCH:
            _flush(ops); ops = []

    for i, it in enumerate(needs_ai, 1):
        if not args.use_ai:
            ops.append({"id": it["id"], "kind": "queue", "proposal": it["base"],
                        "reasons": ["interleaved_dialogue"]})
            applied["queued_no_ai"] += 1
        else:
            try:
                cand = ai_extract_monologue(
                    it["base"], character_name=it["character"], play_title=it["title"],
                    author=it["author"], source_type="play")
            except Exception as exc:  # noqa: BLE001 — never let one row kill the run
                print(f"  LLM error id={it['id']}: {exc}")
                cand = ""
            orig_tok = _norm_tokens(it["base"])
            cand_tok = _norm_tokens(cand)
            drop = 1 - (len(cand_tok) / len(orig_tok)) if orig_tok else 1.0
            # Decide, most-specific failure first. A candidate that comes back
            # byte-for-byte (nothing removed) AND no longer trips the cue detector
            # was a false-positive flag — leave the row completely untouched so we
            # don't needlessly re-embed or discard its good text_segments.
            if not cand:
                op = {"kind": "queue", "reasons": ["interleaved_dialogue", "ai_unsalvageable"]}
            elif not _is_subsequence(cand_tok, orig_tok):
                op = {"kind": "queue", "reasons": ["interleaved_dialogue", "ai_not_verbatim"]}
            elif drop > MAX_DROP_RATIO:
                op = {"kind": "queue", "reasons": ["interleaved_dialogue", "ai_over_dropped"]}
            elif cand_tok == orig_tok:
                applied["no_change"] += 1
                # First pass: this was never queued, so leave it untouched.
                # Reattempt: the row IS parked in review, but the AI confirms
                # nothing to remove (the "cue" was a name-drop, not another
                # speaker) — release it instead of leaving a false positive there.
                op = {"kind": "release"} if args.reattempt_review else None
            elif len(cand.split()) < MIN_WORDS:
                op = {"kind": "queue", "reasons": ["interleaved_dialogue", "ai_too_short"]}
            else:
                ops.append({"id": it["id"], "kind": "apply", "text": cand.strip(),
                            "embedding": _embed(cand.strip())})
                applied["ai"] += 1
                op = None
            if op is not None:
                op["id"] = it["id"]
                if op["kind"] == "queue":
                    op["proposal"] = cand
                    applied["queued"] += 1
                else:  # release
                    applied["released"] += 1
                ops.append(op)
        if len(ops) >= BATCH:
            _flush(ops); ops = []
            print(f"  ...{i}/{len(needs_ai)} AI rows processed")

    _flush(ops)

    print(f"\nbackup: {backup_path}")
    print(f"applied: {dict(applied)}")
    print(f"Undo: uv run python scripts/clean_interleaved_dialogue.py --restore {backup_path}")

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(
        f"# Interleaved-dialogue cleanup — {stamp}\n\n"
        f"- candidates scanned: {counts['candidates']}\n"
        f"- deterministic (stage-dir / trailing cue): {applied['deterministic']}\n"
        f"- AI-cleaned (verbatim-guarded): {applied['ai']}\n"
        f"- routed to /admin/monologues/review: {applied['queued'] + applied['queued_no_ai']}\n"
        f"- backup: `{backup_path.name}`\n",
        encoding="utf-8",
    )
    print(f"report: {REPORT}")


if __name__ == "__main__":
    main()
