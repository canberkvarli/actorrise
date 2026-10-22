"""Which model reads a scene best, measured instead of guessed.

    cd backend && PYTHONPATH=. .venv/bin/python scripts/eval_scene_reading.py
    cd backend && PYTHONPATH=. .venv/bin/python scripts/eval_scene_reading.py \
        --models gpt-4o-mini,gpt-5-mini --runs 3 --out /tmp/readings.json

Every fixture in tests/fixtures/scene_reader is a scene that broke, or would
break, a rule parser: the Word-file therapist scene (user script 132) with its
"MARK (continuing his act):" cue and its business paragraphs; Hamlet and
Ophelia from the Gutenberg text, cues alone on a line and an "[_Exit._]"; a
screenplay with parentheticals and action between the cues; a set of sides
with "NAME (beat):", "NAME, quietly:" and a "(beat)" in the middle of a line.
expected.json holds each one read by hand.

Each scene goes through scene_reader.read_scene exactly as an upload would,
retry included, and the lines it would store are scored against the hand
reading: the same line boundaries, the same speaker on every line, the same
directions on every line, and the reading grounded (no word changed or
dropped, which check_reading decides). A run is perfect only when all four
hold. The cheapest model with every run perfect is the one to use; when two
are close on cost, prefer the one with fewer retries.

Costs are list prices per million tokens as of 2026-10, in PRICES below. A
reasoning model's thinking is billed as output and is included.
"""

from __future__ import annotations

import argparse
import difflib
import json
import re
import statistics
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from openai import OpenAI  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.services.scene_map import detect_scene_spans  # noqa: E402
from app.services.scene_reader import items_to_lines, normalise, read_scene  # noqa: E402
from app.services.script_parser import (  # noqa: E402
    _preprocess_text,
    _strip_production_marks,
    whole_scenes,
)

FIXTURES = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "scene_reader"

CANDIDATES = ["gpt-4o-mini", "gpt-5-mini", "gpt-5.4-nano", "gpt-5.4-mini", "gpt-5.4", "gpt-5.5"]

# USD per million tokens (input, output). Check these against the pricing page
# before trusting a cost column; the ranking of models by cost is what matters.
PRICES = {
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-5-nano": (0.05, 0.40),
    "gpt-5-mini": (0.25, 2.00),
    "gpt-5": (1.25, 10.00),
    "gpt-5.4-nano": (0.20, 1.25),
    "gpt-5.4-mini": (0.75, 4.50),
    "gpt-5.4": (2.50, 15.00),
    "gpt-5.5": (5.00, 30.00),
}


def scene_from_fixture(name: str):
    """(source, rule lines) for a fixture, cut and parsed the way an upload is."""
    raw = (FIXTURES / f"{name}.txt").read_text()
    spans = detect_scene_spans(_preprocess_text(_strip_production_marks(raw)))
    scenes = whole_scenes(spans)
    if scenes:
        return scenes[0]["_source_text"], scenes[0]["lines"]
    return spans[0].text, []


def _dir_key(direction) -> tuple:
    parts = [p for p in re.split(r";", direction or "") if p.strip()]
    return tuple(re.sub(r"[^a-z0-9 ]+", "", normalise(p).casefold()).strip() for p in parts)


def score(expected_lines, got_lines) -> dict:
    """How far the stored lines are from the hand reading, three ways."""
    exp_text = [normalise(l["text"]) for l in expected_lines]
    got_text = [normalise(l["text"]) for l in got_lines]
    matcher = difflib.SequenceMatcher(a=exp_text, b=got_text, autojunk=False)
    pairs = [
        (block.a + k, block.b + k)
        for block in matcher.get_matching_blocks()
        for k in range(block.size)
    ]
    total = max(len(exp_text), len(got_text), 1)
    speakers = sum(
        expected_lines[i]["character"].upper() == got_lines[j]["character"].upper() for i, j in pairs
    )
    directions = sum(
        _dir_key(expected_lines[i].get("stage_direction")) == _dir_key(got_lines[j].get("stage_direction"))
        for i, j in pairs
    )
    return {
        "boundaries": len(pairs) / total,
        "speakers": speakers / total,
        "directions": directions / total,
        "exact": len(pairs) == len(exp_text) == len(got_text)
        and speakers == directions == len(pairs),
    }


def run_one(client, model: str, name: str, source: str, hint, expected_lines) -> dict:
    started = time.monotonic()
    result = read_scene(source, hint, client, model)
    seconds = time.monotonic() - started
    s = score(expected_lines, result["lines"])
    price_in, price_out = PRICES.get(model, (0.0, 0.0))
    usage = result["usage"]
    cost = usage["input"] / 1e6 * price_in + usage["output"] / 1e6 * price_out
    return {
        "model": model,
        "fixture": name,
        "grounded": not result["flagged"],
        "perfect": (not result["flagged"]) and s["exact"],
        "attempts": result["attempts"],
        "problems": result["problems"],
        "seconds": round(seconds, 1),
        "cost": cost,
        "usage": usage,
        **{k: s[k] for k in ("boundaries", "speakers", "directions")},
        "lines": result["lines"],
        "rejected": result.get("rejected") or [],
        "characters": result["characters"],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--models", default=",".join(CANDIDATES))
    parser.add_argument("--runs", type=int, default=2)
    parser.add_argument("--fixtures", default="")
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--out", default="")
    args = parser.parse_args()

    expected = json.loads((FIXTURES / "expected.json").read_text())
    names = [n for n in (args.fixtures.split(",") if args.fixtures else expected)]
    models = [m.strip() for m in args.models.split(",") if m.strip()]
    client = OpenAI(api_key=settings.openai_api_key)

    scenes = {n: scene_from_fixture(n) for n in names}
    jobs = [
        (m, n) for m in models for n in names for _ in range(args.runs)
    ]

    def job(pair):
        m, n = pair
        source, hint = scenes[n]
        return run_one(client, m, n, source, hint, items_to_lines(expected[n]))

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        results = list(pool.map(job, jobs))

    print(f"\n{len(names)} scenes x {args.runs} runs per model\n")
    header = (f"{'model':<14} {'perfect':>8} {'grounded':>9} {'bounds':>7} {'speaker':>8} "
              f"{'direct':>7} {'tries':>6} {'$/scene':>9} {'s/scene':>8}")
    print(header)
    print("-" * len(header))
    for m in models:
        rows = [r for r in results if r["model"] == m]
        n = len(rows)
        print(
            f"{m:<14} {sum(r['perfect'] for r in rows):>4}/{n:<3} "
            f"{sum(r['grounded'] for r in rows):>5}/{n:<3} "
            f"{statistics.mean(r['boundaries'] for r in rows):>7.3f} "
            f"{statistics.mean(r['speakers'] for r in rows):>8.3f} "
            f"{statistics.mean(r['directions'] for r in rows):>7.3f} "
            f"{statistics.mean(r['attempts'] for r in rows):>6.2f} "
            f"{statistics.mean(r['cost'] for r in rows):>9.5f} "
            f"{statistics.mean(r['seconds'] for r in rows):>8.1f}"
        )

    print("\nPer fixture (perfect runs):")
    print(f"{'model':<14} " + " ".join(f"{n[:18]:>19}" for n in names))
    for m in models:
        cells = []
        for n in names:
            rows = [r for r in results if r["model"] == m and r["fixture"] == n]
            cells.append(f"{sum(r['perfect'] for r in rows)}/{len(rows)}")
        print(f"{m:<14} " + " ".join(f"{c:>19}" for c in cells))

    failures = [r for r in results if not r["perfect"]]
    if failures:
        print("\nWhat went wrong:")
        for r in failures:
            why = "; ".join(r["problems"][:3]) if r["problems"] else (
                f"grounded, but bounds {r['boundaries']:.2f} speakers {r['speakers']:.2f} "
                f"directions {r['directions']:.2f}"
            )
            print(f"  {r['model']:<14} {r['fixture']:<20} {why[:220]}")

    if args.out:
        Path(args.out).write_text(json.dumps(results, indent=1, ensure_ascii=False))
        print(f"\nRaw results in {args.out}")


if __name__ == "__main__":
    main()
