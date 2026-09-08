"""One character, two names: find them, and let a person decide.

REPORTS ONLY. It does not rename anything, and that is the finding rather than
a limitation.

104 plays carry the same character under two names, because the extractor read
an abbreviated cue in one place and the full name in another. Prometheus Bound
holds 18 monologues under "Prometheus" and 9 under "Pr", so an actor searching
Prometheus finds two thirds of the part. 497 rows are affected, which sounds
like a tidy automated fix.

It is not. Three rounds of tightening the rule each left a different class of
wrong merge:

    'High-Priest' -> 'High-Priestess'   two different people
    'Prince'      -> 'Prince John Of Lancaster'  in a play with Prince Hal too
    'Czar'        -> 'Czare'            merging into another fragment
    'Bev'         -> 'Beverley Is Discovered Sitting'   a stage direction
    'Lud'         -> 'Lud Aside'        a cue with its direction attached
    'Charles'(15) -> 'Charles Von M'(4) the LONGER name is the broken one

A prefix match is not evidence of one character. It cannot distinguish an
abbreviation from a different person whose name starts the same way, and every
heuristic that fixes one of the cases above breaks another. The cost of being
wrong is a character's speeches filed under someone else's name, which is
invisible once done and would have to be caught by the same eyes that could
have approved the merge in the first place.

So the useful output is the list, ordered by how much it matters, for a human
who knows the plays.

    python -m scripts.merge_character_aliases --out reports/aliases.md
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import create_engine, text  # noqa: E402

from app.core.config import settings  # noqa: E402

VISIBLE = ("(m.review_status IS NULL OR m.review_status NOT IN "
           "('pending','too_short','not_monologue'))")

#: "Charles Von M", "Sir Sampson L." -- a name that stops mid-word. A trailing
#: initial is how the extractor leaves a surname it could not finish.
_LOOKS_CUT = re.compile(r"(?:^|\s)[A-Z]\.?$|\.\s*$")

#: Below this many characters a cue is an abbreviation rather than a name.
#: "Pr", "Et", "Ros", "Mask" -- never a form worth keeping when a fuller one
#: exists in the same play.
SHORT_CUE = 6


#: A prefix match is not proof of the same character. "High-Priest" is a prefix
#: of "High-Priestess" and they are two people; "Prince" is a prefix of "Prince
#: John Of Lancaster" in a play that also contains Prince Hal; "Czar" is a
#: prefix of "Czare", which is itself a truncation.
#:
#: What IS safe is a cue too short to be a name at all -- "Pr", "Et", "Ros",
#: "Isab". Nobody is called Pr. Everything longer goes to a review list instead
#: of being merged, because the cost of being wrong is a character's speeches
#: filed under someone else's name, and that is invisible once done.
AUTO_MERGE_MAX = 4

#: ...and even a short cue must not be an ordinary English word, or "Fort",
#: "Cod" and "Din" merge into whatever happens to start with them.
_REAL_WORDS = frozenset({
    "king", "lord", "lady", "duke", "earl", "maid", "boy", "girl", "man",
    "wife", "son", "aunt", "cook", "page", "fool", "monk", "nun", "czar",
    "fort", "cod", "din", "mask", "art", "hope", "love", "will", "grace",
})


def is_safe_to_merge(short: str, long: str) -> bool:
    """Only a cue that cannot be a name in its own right."""
    s = short.strip().rstrip(".")
    if len(s) > AUTO_MERGE_MAX:
        return False
    if s.lower() in _REAL_WORDS:
        return False
    # "High-Priest" / "High-Priestess": the extra text is a suffix that changes
    # who the person is, not a completion of a cut-off name.
    if not long.lower().startswith(s.lower() + " ") and len(s) > 3:
        return False
    return True


def better_name(a: str, count_a: int, b: str, count_b: int) -> tuple[str, str]:
    """Return (keep, drop) for two spellings of one character."""
    a_cut, b_cut = bool(_LOOKS_CUT.search(a)), bool(_LOOKS_CUT.search(b))
    if a_cut != b_cut:                       # a name that stops mid-word loses
        return (b, a) if a_cut else (a, b)
    # Neither looks cut: the longer form carries more information, unless it is
    # so much rarer that it is plainly the odd one out.
    long_, short_ = (a, b) if len(a) > len(b) else (b, a)
    long_n = count_a if long_ == a else count_b
    short_n = count_b if long_ == a else count_a
    if len(short_) > SHORT_CUE and long_n * 3 < short_n:
        return short_, long_
    return long_, short_


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=None, help="write the report here")
    args = ap.parse_args()

    engine = create_engine(settings.database_url, pool_pre_ping=True)
    with engine.connect() as c:
        rows = c.execute(text(f"""
            SELECT p.id, p.title, m.character_name, count(*) n
            FROM monologues m JOIN plays p ON p.id = m.play_id
            WHERE {VISIBLE} AND m.character_name IS NOT NULL
            GROUP BY 1,2,3
        """)).fetchall()

    cast: dict[tuple[int, str], dict[str, int]] = defaultdict(dict)
    for pid, ptitle, name, n in rows:
        if name and name.strip():
            cast[(pid, ptitle)][name.strip()] = n

    merges = []
    review = []
    for (pid, ptitle), names in cast.items():
        for short in list(names):
            for long in list(names):
                if long == short or len(long) <= len(short):
                    continue
                if not long.lower().startswith(short.lower()):
                    continue
                keep, drop = better_name(short, names[short], long, names[long])
                entry = {"play_id": pid, "play": ptitle, "keep": keep,
                         "drop": drop, "moves": names[drop]}
                if is_safe_to_merge(drop, keep):
                    merges.append(entry)
                else:
                    review.append(entry)

    # One play can produce a chain (Eu -> Eula -> Eulalia); resolve to the final
    # winner so a row is not moved twice into a name that itself gets merged.
    final: dict[tuple[int, str], str] = {}
    for m in merges:
        final[(m["play_id"], m["drop"])] = m["keep"]
    changed = True
    while changed:
        changed = False
        for key, keep in list(final.items()):
            onward = final.get((key[0], keep))
            if onward and onward != keep:
                final[key] = onward
                changed = True

    total = sum(m["moves"] for m in merges)
    print(f"NEEDS REVIEW (not merged): {len(review)} pairs a prefix test "
          f"cannot judge")
    for m in sorted(review, key=lambda x: -x["moves"])[:10]:
        print(f"     ? {m['play'][:28]:<28} '{m['drop']}' ({m['moves']}) "
              f"vs '{m['keep']}'")
    print()
    print(f"{len(final)} name merges across "
          f"{len({k[0] for k in final})} plays, {total} monologues affected")
    for m in sorted(merges, key=lambda x: -x["moves"])[:20]:
        keep = final[(m["play_id"], m["drop"])]
        print(f"   {m['play'][:30]:<30} '{m['drop']}' ({m['moves']}) -> '{keep}'")

    if args.out:
        lines = [f"# Character alias review — {datetime.now():%Y-%m-%d}", "",
                 "Same character, two names, in one play. Nothing is renamed by",
                 "this script: a prefix match cannot tell an abbreviation from a",
                 "different person whose name starts the same way.", "",
                 f"## Likely abbreviations — {len(merges)}", ""]
        for m in sorted(merges, key=lambda x: -x["moves"]):
            keep = final[(m["play_id"], m["drop"])]
            lines.append(f"- *{m['play'][:50]}* — `{m['drop']}` ({m['moves']} "
                         f"monologues) is probably `{keep}`")
        lines += ["", f"## Needs a human — {len(review)}", ""]
        for m in sorted(review, key=lambda x: -x["moves"]):
            lines.append(f"- *{m['play'][:50]}* — `{m['drop']}` ({m['moves']}) "
                         f"vs `{m['keep']}`")
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text("\n".join(lines))
        print(f"\nreport written to {out}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
