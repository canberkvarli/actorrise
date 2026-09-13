"""Replay real searches and check whether the results did what was asked.

WHY THIS EXISTS. On 2026-09-13 an actor asked for "Rosalind's Act 3, Scene 2".
That speech exists. Search returned Act 4 Scene 3, confidently, and every metric
recorded a success: contemporary-style specific searches score a 5% weak-match
rate against a 21% baseline, and that query's confidence was above average.

Nothing in the instrumentation could see it. `weak_match`, `content_gap` and
`best_cosine` all measure how SURE the search is, never whether it was RIGHT.
The failure only surfaced because somebody typed it into the feedback box.

So this asks the one question the logs cannot: the actor named something
checkable -- an act, a scene, a length, a gender -- did the results satisfy it?

HOW IT AVOIDS MARKING ITS OWN HOMEWORK. The constraints are re-extracted here,
deterministically, and NOT taken from QueryOptimizer. That is the whole point:
the Rosalind bug was the optimizer failing to extract act/scene on tier 3, and
an audit that asked the optimizer what the query meant would have agreed with
it and found nothing.

Extraction is deliberately conservative. A constraint is only claimed when the
phrasing is unambiguous ("act 3", "under 90 seconds", "for a woman"), because a
false violation costs more attention than a missed one.

    python -m scripts.audit_search_constraints --limit 150
    python -m scripts.audit_search_constraints --all --out reports/search_constraints.md
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

os.environ.setdefault("LANGCHAIN_TRACING_V2", "false")

from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.core.config import settings  # noqa: E402

_engine = create_engine(settings.database_url, pool_pre_ping=True, pool_recycle=1800)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine)

# --------------------------------------------------------------------------
# Constraint extraction. Independent of the search's own parsing, on purpose.
# --------------------------------------------------------------------------

_ACT = re.compile(r"\bact\s+(\d+|[ivx]+)\b", re.I)
_SCENE = re.compile(r"\bscene\s+(\d+|[ivx]+)\b", re.I)

#: Only an explicit ceiling. A bare "2 minute monologue" is a window in the
#: product's own reading (a 25-second clip is technically under 2 minutes but
#: useless), so judging it here would test my opinion, not the system's.
_MAX_DUR = re.compile(
    r"\b(?:under|below|less than|(?:no|not) longer than|shorter than|"
    r"max(?:imum)?(?: of)?|at most|within)\s+"
    r"(\d+)\s*(seconds?|secs?|minutes?|mins?)\b", re.I)
#: "longer than" needs the negative lookbehind: "no longer than 2 minutes" is a
#: CEILING, and without it that phrase registers as a floor of 120s as well,
#: so a correct result set gets reported as violating both bounds at once.
_MIN_DUR = re.compile(
    r"\b(?:over|more than|at least|(?<!no )(?<!not )longer than|minimum(?: of)?|"
    r"no shorter than)\s+"
    r"(\d+)\s*(seconds?|secs?|minutes?|mins?)\b", re.I)

#: Unambiguous gender phrasing only. "for a woman", "male monologue". Anything
#: that could describe the SUBJECT rather than the speaker is left alone:
#: "a monologue about his mother" is not a request for a female character.
_FEMALE = re.compile(
    r"\b(?:for a |for an |a |an )?(?:female|woman|girl|actress|women)\b"
    r"|(?:\bshe\b|\bher\b)\s+(?:monologue|piece|speech)", re.I)
_MALE = re.compile(
    r"\b(?:for a |for an |a |an )?(?:male|man|boy|actor(?!ess))\b"
    r"|(?:\bhe\b|\bhis\b)\s+(?:monologue|piece|speech)", re.I)

_ROMAN = {"i": 1, "ii": 2, "iii": 3, "iv": 4, "v": 5, "vi": 6, "vii": 7,
          "viii": 8, "ix": 9, "x": 10}


def _num(raw: str):
    raw = raw.strip().lower()
    return int(raw) if raw.isdigit() else _ROMAN.get(raw)


def _seconds(value: str, unit: str) -> int:
    n = int(value)
    return n * 60 if unit.lower().startswith(("min", "m")) else n


def constraints(query: str) -> dict:
    """What this query unambiguously asked for. Empty when nothing is checkable."""
    q = query or ""
    out: dict = {}

    for key, rx in (("act", _ACT), ("scene", _SCENE)):
        m = rx.search(q)
        if m:
            n = _num(m.group(1))
            if n:
                out[key] = n

    m = _MAX_DUR.search(q)
    if m:
        out["max_duration"] = _seconds(m.group(1), m.group(2))
    m = _MIN_DUR.search(q)
    if m:
        out["min_duration"] = _seconds(m.group(1), m.group(2))

    fem, male = bool(_FEMALE.search(q)), bool(_MALE.search(q))
    if fem != male:                      # both, or neither, is not a request
        out["gender"] = "female" if fem else "male"

    return out


# --------------------------------------------------------------------------
# Checking
# --------------------------------------------------------------------------

#: The search deliberately keeps pieces playable by anyone, so these satisfy a
#: gendered request. Mirrors semantic_search's own filter.
_ANY_GENDER = {"any", "either gender", "either", "neutral", None, ""}

#: Duration tolerance. estimated_duration_seconds is a words-per-minute
#: estimate, not a stopwatch, so a piece a few seconds over an explicit ceiling
#: is not the bug this is hunting.
_DUR_SLACK = 10


def violations(asked: dict, rows: list) -> list:
    """Which constraints the result set failed, and by how much."""
    out = []
    if not rows:
        return out

    for key in ("act", "scene"):
        if key not in asked:
            continue
        want = asked[key]
        got = [getattr(m, key) for m, _ in rows]
        # A row with no act recorded cannot be judged; only a row that HAS one
        # and disagrees is a miss.
        known = [g for g in got if g is not None]
        if known and not any(g == want for g in known):
            out.append((key, f"asked {key} {want}, every dated result was "
                             f"{sorted(set(known))[:4]}"))
        elif known:
            wrong = sum(1 for g in known if g != want)
            if wrong and wrong == len(known) - sum(1 for g in known if g == want):
                if wrong > len(known) / 2:
                    out.append((f"{key}_mixed",
                                f"asked {key} {want}, {wrong}/{len(known)} results were not"))

    if "max_duration" in asked:
        cap = asked["max_duration"] + _DUR_SLACK
        over = [(m.id, m.estimated_duration_seconds) for m, _ in rows
                if (m.estimated_duration_seconds or 0) > cap]
        if len(over) > len(rows) / 2:
            out.append(("max_duration",
                        f"asked under {asked['max_duration']}s, {len(over)}/{len(rows)} "
                        f"were longer (up to {max(s for _, s in over)}s)"))

    if "min_duration" in asked:
        floor = asked["min_duration"] - _DUR_SLACK
        under = [(m.id, m.estimated_duration_seconds) for m, _ in rows
                 if (m.estimated_duration_seconds or 0) < floor]
        if len(under) > len(rows) / 2:
            out.append(("min_duration",
                        f"asked at least {asked['min_duration']}s, {len(under)}/{len(rows)} "
                        f"were shorter (down to {min(s for _, s in under)}s)"))

    if "gender" in asked:
        want = asked["gender"]
        bad = [m.id for m, _ in rows
               if (m.character_gender or "") .lower() not in _ANY_GENDER
               and (m.character_gender or "").lower() != want]
        if len(bad) > len(rows) / 2:
            out.append(("gender",
                        f"asked {want}, {len(bad)}/{len(rows)} were another gender"))

    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=150)
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    from app.services.search.semantic_search import SemanticSearch

    db = SessionLocal()
    rows = db.execute(text("""
        SELECT query, max(created_at) last_seen, count(*) times
        FROM search_logs
        WHERE query IS NOT NULL AND length(trim(query)) > 2
        GROUP BY query ORDER BY count(*) DESC, max(created_at) DESC
    """)).fetchall()

    checkable = [(r.query, r.times, constraints(r.query)) for r in rows]
    checkable = [c for c in checkable if c[2]]
    print(f"{len(rows)} distinct queries logged")
    print(f"{len(checkable)} carry a constraint this can check\n")

    if not args.all:
        checkable = checkable[: args.limit]

    svc = SemanticSearch(db)
    found: list = []
    kinds: Counter = Counter()
    asked_counts: Counter = Counter()
    errors = 0

    for i, (query, times, asked) in enumerate(checkable, 1):
        for k in asked:
            asked_counts[k] += 1
        try:
            results, _ = svc.search(query, limit=10)
        except Exception as exc:              # a crash is itself a finding
            errors += 1
            found.append((query, times, asked, [("error", f"{type(exc).__name__}: {exc}")], []))
            continue
        v = violations(asked, results)
        if v:
            for key, _ in v:
                kinds[key] += 1
            found.append((query, times, asked, v, results[:3]))
        if i % 25 == 0:
            print(f"  {i}/{len(checkable)} replayed, {len(found)} with violations",
                  flush=True)

    print(f"\n{'='*70}")
    print(f"replayed {len(checkable)} queries")
    print(f"{len(found)} returned results that did not satisfy what was asked")
    if errors:
        print(f"{errors} raised an exception")
    print("\nconstraints present in the sample:")
    for k, n in asked_counts.most_common():
        print(f"  {k:<16} asked {n:>4}   violated {kinds.get(k,0):>4}"
              f"   ({100.0*kinds.get(k,0)/max(n,1):>4.0f}%)")

    print("\nworst offenders:")
    for query, times, asked, v, sample in sorted(found, key=lambda f: -f[1])[:15]:
        print(f"\n  x{times}  {query[:76]}")
        print(f"        asked: {asked}")
        for key, why in v:
            print(f"        MISS   {why}")

    if args.out:
        lines = [f"# Search constraint audit — {datetime.now():%Y-%m-%d}", "",
                 "Real queries from `search_logs`, replayed against live search.",
                 "A finding means the actor named something checkable and the",
                 "results did not satisfy it. Constraints are re-extracted here",
                 "rather than read from QueryOptimizer, so a parsing failure",
                 "shows up as a finding instead of being agreed with.", "",
                 f"- {len(rows)} distinct queries logged",
                 f"- {len(checkable)} replayed",
                 f"- **{len(found)} did not satisfy what was asked**", ""]
        lines.append("| constraint | asked | violated | rate |")
        lines.append("|---|---|---|---|")
        for k, n in asked_counts.most_common():
            lines.append(f"| {k} | {n} | {kinds.get(k,0)} | "
                         f"{100.0*kinds.get(k,0)/max(n,1):.0f}% |")
        lines += ["", "## Findings", ""]
        for query, times, asked, v, sample in sorted(found, key=lambda f: -f[1]):
            lines.append(f"### `{query[:100]}`  (searched {times}x)")
            lines.append(f"asked: `{asked}`")
            for key, why in v:
                lines.append(f"- **{key}** — {why}")
            if sample:
                lines.append("")
                lines.append("top results:")
                for m, s in sample:
                    ttl = (m.play.title if m.play else m.title) or ""
                    lines.append(f"  - {s:.3f} #{m.id} {m.character_name} / "
                                 f"{ttl[:40]} act={m.act} scene={m.scene} "
                                 f"{m.estimated_duration_seconds}s "
                                 f"{m.character_gender}")
            lines.append("")
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text("\n".join(lines))
        print(f"\nreport written to {out}")

    db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
