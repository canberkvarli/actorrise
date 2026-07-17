#!/usr/bin/env python
"""Golden-query regression harness for monologue search.

Replays ~50 real user queries (sanitized, from the 2026-07 search-log audit)
against the search stack and checks graded expectations, so parser/ranking
changes can't silently regress relevance. Companion data: golden_queries.json.

Modes:
    --parse-only   Check only KeywordExtractor intent + title-gap expectations.
                   No DB, no OpenAI. Safe anywhere (CI).
    (default)      Full run: SemanticSearch against the configured DATABASE_URL.
                   Read-only apart from the app's own query-embedding cache.

    --baseline out.json    Save per-check outcomes.
    --compare  base.json   Exit 1 if any check that passed in the baseline fails.

Usage:
    .venv/bin/python scripts/run_golden_search.py --parse-only
    .venv/bin/python scripts/run_golden_search.py --baseline golden_baseline.json

Expectation keys (all optional; only present keys are checked):
    min_results             total results >= N
    expect_strong           weak_match must be False
    parse.<key>             KeywordExtractor.extract() must yield this value
                            (null means: key must be absent)
    top_author_ilike        substring found in an author of the top-5 results
    top_play_ilike          substring found in a play title of the top-5
    results_gender          every result's gender is this / 'any' / null
    results_max_duration_s  every result within limit (+10% tolerance)
    gap_play_ilike          content_gap fired and names this title
    known_fail              documents a currently-failing check set; still
                            reported, but never fails --compare on its own
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

Check = tuple[str, bool, str]


def score_query(expect: dict, observed: dict) -> list[Check]:
    """Compare one golden query's expectations against what search did.

    observed: {parsed, results [{play_title, author, gender, duration_s}],
               total, weak, content_gap}
    """
    checks: list[Check] = []
    results = observed.get("results") or []
    top5 = results[:5]

    if "min_results" in expect:
        n = observed.get("total", 0)
        checks.append(("min_results", n >= expect["min_results"], f"got {n}, want >= {expect['min_results']}"))

    if expect.get("expect_strong"):
        weak = bool(observed.get("weak"))
        checks.append(("expect_strong", not weak, "weak_match banner shown" if weak else "strong"))

    for key, want in (expect.get("parse") or {}).items():
        got = (observed.get("parsed") or {}).get(key)
        if want is None:
            ok = got is None
        else:
            ok = got == want
        checks.append((f"parse.{key}", ok, f"got {got!r}, want {want!r}"))

    if "top_author_ilike" in expect:
        needle = expect["top_author_ilike"].lower()
        ok = any(needle in (r.get("author") or "").lower() for r in top5)
        checks.append(("top_author_ilike", ok, f"{needle!r} not in top-5 authors" if not ok else needle))

    if "top_play_ilike" in expect:
        needle = expect["top_play_ilike"].lower()
        ok = any(needle in (r.get("play_title") or "").lower() for r in top5)
        checks.append(("top_play_ilike", ok, f"{needle!r} not in top-5 plays" if not ok else needle))

    if "results_gender" in expect:
        want = expect["results_gender"]
        bad = [r for r in results if r.get("gender") not in (want, "any", None)]
        checks.append(("results_gender", not bad, f"{len(bad)} results with other gender"))

    if "results_max_duration_s" in expect:
        cap = expect["results_max_duration_s"] * 1.1
        bad = [r for r in results if (r.get("duration_s") or 0) > cap]
        checks.append(("results_max_duration_s", not bad, f"{len(bad)} results over {expect['results_max_duration_s']}s"))

    if "gap_play_ilike" in expect:
        gap = observed.get("content_gap") or {}
        play = (gap.get("play") or "") if isinstance(gap, dict) else ""
        ok = expect["gap_play_ilike"].lower() in play.lower()
        checks.append(("gap_play_ilike", ok, f"content_gap={gap!r}"))

    return checks


PARSE_ONLY_KEYS = {"parse", "gap_play_ilike"}


def _observe_parse_only(query: str) -> dict:
    from app.services.search.query_optimizer import KeywordExtractor

    parsed = KeywordExtractor.extract(query)
    content_gap = None
    try:
        from app.services.search.title_lookup import detect_title_lookup

        hit = detect_title_lookup(query)
        if hit:
            content_gap = {"play": hit["title"], "author": None}
    except ImportError:
        pass
    return {"parsed": parsed, "results": [], "total": 0, "content_gap": content_gap}


def _observe_full(query: str, filters: dict | None) -> dict:
    from app.core.database import SessionLocal
    from app.services.search.query_optimizer import KeywordExtractor
    from app.services.search.semantic_search import STRONG_COSINE_SIM, SemanticSearch

    db = SessionLocal()
    try:
        svc = SemanticSearch(db)
        results_with_scores, _ = svc.search(query, limit=20, filters=dict(filters or {}))
        best_cosine = getattr(svc, "_best_cosine_sim", None)
        if best_cosine is not None:
            weak = best_cosine < STRONG_COSINE_SIM
        else:
            scores = [s for _, s in results_with_scores if s is not None]
            weak = bool(scores) and max(scores) < 0.48

        content_gap = None
        intended = getattr(svc, "_intended_play", None)
        if intended and not any(
            intended.lower() in (m.play.title or "").lower() for m, _ in results_with_scores
        ):
            content_gap = {"play": intended, "author": getattr(svc, "_intended_author", None)}
        if content_gap is None:
            try:
                from app.services.search.title_lookup import detect_title_lookup

                hit = detect_title_lookup(query)
                if hit and not any(
                    hit["title"].lower() in (m.play.title or "").lower()
                    for m, _ in results_with_scores
                ):
                    content_gap = {"play": hit["title"], "author": None}
            except ImportError:
                pass

        return {
            "parsed": KeywordExtractor.extract(query),
            "results": [
                {
                    "play_title": m.play.title if m.play else None,
                    "author": m.play.author if m.play else None,
                    "gender": m.character_gender,
                    "duration_s": m.estimated_duration_seconds,
                }
                for m, _ in results_with_scores
            ],
            "total": len(results_with_scores),
            "weak": weak,
            "content_gap": content_gap,
        }
    finally:
        db.close()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--parse-only", action="store_true")
    ap.add_argument("--baseline", metavar="OUT_JSON")
    ap.add_argument("--compare", metavar="BASE_JSON")
    ap.add_argument("--only", metavar="ID_SUBSTR", help="run just queries whose id contains this")
    args = ap.parse_args()

    golden = json.loads((Path(__file__).parent / "golden_queries.json").read_text())
    if args.only:
        golden = [g for g in golden if args.only in g["id"]]

    outcomes: dict[str, dict[str, bool]] = {}
    by_class: dict[str, list[bool]] = {}
    failed_lines: list[str] = []

    for item in golden:
        expect = item.get("expect") or {}
        if args.parse_only:
            expect = {k: v for k, v in expect.items() if k in PARSE_ONLY_KEYS}
            if not expect:
                continue
            observed = _observe_parse_only(item["query"])
        else:
            observed = _observe_full(item["query"], item.get("filters"))

        checks = score_query(expect, observed)
        outcomes[item["id"]] = {name: ok for name, ok, _ in checks}
        for name, ok, detail in checks:
            by_class.setdefault(item.get("class", "other"), []).append(ok)
            if not ok:
                tag = " [known_fail]" if item.get("known_fail") else ""
                failed_lines.append(f"  FAIL{tag} {item['id']} :: {name}: {detail}")

    total = sum(len(v) for v in outcomes.values())
    passed = sum(ok for v in outcomes.values() for ok in v.values())
    print(f"golden checks: {passed}/{total} passed  ({'parse-only' if args.parse_only else 'full'})")
    for cls, oks in sorted(by_class.items()):
        print(f"  {cls:16} {sum(oks)}/{len(oks)}")
    for line in failed_lines:
        print(line)

    if args.baseline:
        Path(args.baseline).write_text(json.dumps(outcomes, indent=1, sort_keys=True))
        print(f"baseline written: {args.baseline}")

    if args.compare:
        base = json.loads(Path(args.compare).read_text())
        known_fail_ids = {g["id"] for g in golden if g.get("known_fail")}
        regressions = [
            f"{qid}::{name}"
            for qid, base_checks in base.items()
            for name, base_ok in base_checks.items()
            if base_ok and not outcomes.get(qid, {}).get(name, True) and qid not in known_fail_ids
        ]
        if regressions:
            print("REGRESSIONS vs baseline:")
            for r in regressions:
                print(f"  {r}")
            return 1
        print("no regressions vs baseline")

    return 0


if __name__ == "__main__":
    sys.exit(main())
