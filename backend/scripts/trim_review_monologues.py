#!/usr/bin/env python
"""AI trim pass over the monologue review queue. DRY-RUN by default.

The queue (~433 pieces as of 2026-07-19) holds monologues polluted by other
speakers' lines, stage directions, screenplay action, or OCR junk. For each,
the AI extracts ONLY the primary character's spoken monologue; code-side
guards then decide the outcome:

  auto-fixed   trim >= 75 words, >= 90% of its words verifiably from the
               original (no hallucination), no residual leaks, quality gate ok
               -> text replaced, review flag cleared
  proposed     AI produced something but a guard failed
               -> stored in proposed_text, stays in the review queue
  unfixable    AI returned null -> stays queued untouched

Reversible: originals in backups/trim_review_backup_<ts>.json (--restore).

Usage (from backend/):
    .venv/bin/python scripts/trim_review_monologues.py            # dry-run
    .venv/bin/python scripts/trim_review_monologues.py --limit 10
    .venv/bin/python scripts/trim_review_monologues.py --apply
    .venv/bin/python scripts/trim_review_monologues.py --restore backups/trim_review_backup_*.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from collections import Counter
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))
sys.path.insert(0, str(backend_dir / "scripts"))

MIN_WORDS = 75
BACKUP_DIR = backend_dir / "backups"

_PROMPT = (
    "You are a script editor for actors. Below is a passage attributed to the "
    "character {character!r} from {source!r}, but it is polluted with other "
    "characters' lines, stage directions, camera/action description, or OCR "
    "artifacts. Extract ONLY {character!r}'s own spoken words as one coherent "
    "monologue, in the original order, quoting the source verbatim (fix obvious "
    "OCR misspellings only). Do NOT invent or paraphrase text. If no coherent "
    "single-speaker monologue of at least {min_words} words exists, return null.\n"
    'Reply as JSON: {{"monologue": "<text>" | null}}\n\nPASSAGE:\n{text}'
)


def parse_trim(raw) -> str | None:
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None
    mono = data.get("monologue")
    return mono.strip() if isinstance(mono, str) and mono.strip() else None


def _wordbag(text: str) -> Counter:
    return Counter(re.sub(r"[^a-z0-9\s]", "", (text or "").lower()).split())


def accept_trim(original: str, trimmed, min_words: int = MIN_WORDS, min_overlap: float = 0.97) -> bool:
    """Guard: long enough, and its words verifiably come from the original."""
    if not trimmed:
        return False
    t_bag = _wordbag(trimmed)
    n = sum(t_bag.values())
    if n < min_words:
        return False
    o_bag = _wordbag(original)
    covered = sum(min(c, o_bag.get(w, 0)) for w, c in t_bag.items())
    return covered / n >= min_overlap


_CUE_RE = re.compile(r"([.?!”\"]) ([A-Z][a-z]{2,12})\.\s+[A-Z“\"]")


def cut_at_first_leak(text: str):
    """Cut the trim just before the first leaked cue/direction; None if clean."""
    from extract_pd_monologues import (_DIRECTION_LEAK_RE, _HONORIFICS,
                                       _SPEAKER_LEAK_RE)

    positions = []
    m = _SPEAKER_LEAK_RE.search(text)
    if m:
        positions.append(m.start())
    m = _DIRECTION_LEAK_RE.search(text)
    if m:
        positions.append(m.start())
    for m in _CUE_RE.finditer(text):
        if m.group(2) not in _HONORIFICS:
            positions.append(m.start() + 1)  # keep the closing punctuation
            break
    if not positions:
        return None
    cut = text[: min(positions)].rstrip()
    return cut or None


def restore(backup_path: Path) -> None:
    from app.core.database import SessionLocal
    from app.models.actor import Monologue
    from app.utils.duration import estimate_duration_seconds

    data = json.loads(backup_path.read_text(encoding="utf-8"))
    db = SessionLocal()
    try:
        for mid, payload in data.items():
            db.query(Monologue).filter(Monologue.id == int(mid)).update(
                {
                    Monologue.text: payload["text"],
                    Monologue.word_count: len(payload["text"].split()),
                    Monologue.estimated_duration_seconds: estimate_duration_seconds(payload["text"]),
                    Monologue.review_status: payload.get("review_status"),
                    Monologue.review_reasons: payload.get("review_reasons"),
                    Monologue.proposed_text: None,
                },
                synchronize_session=False,
            )
        db.commit()
    finally:
        db.close()
    print(f"Restored {len(data)} monologues from {backup_path}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--model", default="gpt-4o-mini")
    ap.add_argument("--restore", metavar="BACKUP_JSON")
    args = ap.parse_args()

    if args.restore:
        restore(Path(args.restore))
        return 0

    from app.core.database import SessionLocal
    from app.models.actor import Monologue, Play
    from app.services.extraction.monologue_quality import assess_monologue_quality
    from app.utils.duration import estimate_duration_seconds
    from extract_pd_monologues import piece_has_leaks
    from score_overdone import _make_invoke

    db = SessionLocal()
    try:
        q = (
            db.query(Monologue, Play.title)
            .join(Play, Play.id == Monologue.play_id)
            .filter(Monologue.review_status == "pending")
            .order_by(Monologue.id)
        )
        if args.limit:
            q = q.limit(args.limit)
        rows = q.all()
        print(f"{len(rows)} queued piece(s) (model={args.model}, {'APPLY' if args.apply else 'DRY-RUN'})")
        if not rows:
            return 0

        invoke = _make_invoke(args.model)
        outcomes: Counter = Counter()
        backup: dict[str, dict] = {}
        backup_path = BACKUP_DIR / f"trim_review_backup_{time.strftime('%Y%m%d-%H%M%S')}.json"
        BACKUP_DIR.mkdir(exist_ok=True)

        for i, (m, ptitle) in enumerate(rows, 1):
            original = m.text or ""
            raw = invoke(_PROMPT.format(
                character=m.character_name or "the speaker",
                source=ptitle or "",
                min_words=MIN_WORDS,
                text=original[:8000],
            ))
            def _save_backup():
                backup[str(m.id)] = {
                    "text": original,
                    "review_status": m.review_status,
                    "review_reasons": list(m.review_reasons or []),
                }
                backup_path.write_text(json.dumps(backup, ensure_ascii=False), encoding="utf-8")

            def _clean(t) -> bool:
                return bool(t) and accept_trim(original, t) and not piece_has_leaks(t) \
                    and assess_monologue_quality(t).ok

            trimmed = parse_trim(raw)
            candidate = trimmed if _clean(trimmed) else None
            if candidate is None and trimmed:
                cut = cut_at_first_leak(trimmed)
                if _clean(cut):
                    candidate = cut

            if candidate:
                outcomes["auto_fixed"] += 1
                if args.apply:
                    _save_backup()
                    db.query(Monologue).filter(Monologue.id == m.id).update(
                        {
                            Monologue.text: candidate,
                            Monologue.word_count: len(candidate.split()),
                            Monologue.estimated_duration_seconds: estimate_duration_seconds(candidate),
                            Monologue.review_status: None,
                            Monologue.review_reasons: None,
                            Monologue.proposed_text: None,
                        },
                        synchronize_session=False,
                    )
                    db.commit()
            elif trimmed and len(trimmed.split()) >= MIN_WORDS:
                # A real trim exists but a guard disagrees — human decides.
                outcomes["proposed"] += 1
                if args.apply:
                    db.query(Monologue).filter(Monologue.id == m.id).update(
                        {Monologue.proposed_text: trimmed}, synchronize_session=False
                    )
                    db.commit()
            else:
                # No coherent >=75-word single-speaker monologue exists in the
                # source — by policy such pieces are never carried.
                outcomes["purged_not_a_monologue"] += 1
                if args.apply:
                    _save_backup()
                    db.query(Monologue).filter(Monologue.id == m.id).delete(synchronize_session=False)
                    db.commit()
            if i % 25 == 0:
                print(f"  {i}/{len(rows)}  {dict(outcomes)}")
            time.sleep(0.2)

        print(f"\noutcomes: {dict(outcomes)}")
        if args.apply:
            print(f"backup: {backup_path}")
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
