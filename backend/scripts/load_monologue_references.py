#!/usr/bin/env python
"""Load contemporary monologue REFERENCES: metadata only, never the speech.

An actor searching "Marie Antoinette monologue" currently gets nothing, because
the corpus holds one stage play dated 1980 or later. That gap is real and it is
the thing this fills — not by hosting contemporary monologues we have no basis
to host, but by knowing they exist and saying where to get them:

    Marie, Act 2 Scene 6, of MARIE ANTOINETTE by David Adjmi.
    Published by Concord Theatricals. Here is where to buy the script.

That is a referral to the rights holder rather than a substitute for one, which
is also the only footing on which to later ask those same publishers for a
licence. The fields loaded are facts about a work — who wrote it, who licenses
it, which character speaks, in which act. The speech itself is the authorship,
and it is never read, never stored, never served. There is deliberately no
`text` column on this table, so there is nothing to serve by accident.

Input is a CSV with at minimum: Title, Character Name, Author First, Author Last.
Optional: Character Gender, Character Race (if specified), Publisher, Act, Scene,
Play Genre, Notes. A `Monologue Text` column, if present, is DROPPED on read and
never enters a row (see `_FORBIDDEN_COLUMNS`).

Usage:
    uv run python -m scripts.load_monologue_references --csv path/to/sheet.csv --dry-run
    uv run python -m scripts.load_monologue_references --csv path/to/sheet.csv --write
    uv run python -m scripts.load_monologue_references --csv path/to/sheet.csv --report
"""
from __future__ import annotations

import argparse
import csv
import sys
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

#: Columns that carry the authorship itself. Dropped at the reader, before any
#: row object exists, so that no later code path can reach them even by mistake.
#: This is the single most important line in the file.
_FORBIDDEN_COLUMNS = {
    "monologue text", "text", "monologue", "speech", "excerpt", "body", "content",
}

_WANTED = {
    "title": "play_title",
    "character name": "character_name",
    "character gender": "character_gender",
    "character race (if specified)": "character_race",
    "author first": "author_first",
    "author last": "author_last",
    "publisher": "publisher",
    "act": "act",
    "scene": "scene",
    "play genre": "genre",
    "notes": "notes",
}

#: Where to send an actor who wants the real thing. Keyed by the publisher name
#: as the source spells it; the values are catalogue search pages, not deep links,
#: because a deep link rots and a catalogue search does not.
PUBLISHER_SITES = {
    "concord": "https://www.concordtheatricals.com/search?q=",
    "concord theatricals": "https://www.concordtheatricals.com/search?q=",
    "concord theatricals, inc": "https://www.concordtheatricals.com/search?q=",
    "concord theatricals, inc.": "https://www.concordtheatricals.com/search?q=",
    "dramatists": "https://www.dramatists.com/dps/search.aspx?q=",
    "dramatists play service": "https://www.dramatists.com/dps/search.aspx?q=",
    "dramatists play service, inc.": "https://www.dramatists.com/dps/search.aspx?q=",
    "playscripts": "https://www.playscripts.com/search?q=",
    "playscripts, inc.": "https://www.playscripts.com/search?q=",
    "dramatic publishing": "https://www.dramaticpublishing.com/catalogsearch/result/?q=",
    "theatrical rights worldwide": "https://www.theatricalrights.com/?s=",
    "youthplays": "https://www.youthplays.com/search.php?q=",
    "your stage partners": "https://www.yourstagepartners.com/catalogsearch/result/?q=",
    "theatrefolk": "https://www.theatrefolk.com/search?q=",
    "eldridge publishing": "https://histage.com/search?q=",
    "eldridge plays": "https://histage.com/search?q=",
    "broadway play publishing inc.": "https://www.broadwayplaypublishing.com/?s=",
    "broadway play publishing inc": "https://www.broadwayplaypublishing.com/?s=",
    "broadway play publishing, inc.": "https://www.broadwayplaypublishing.com/?s=",
    "heuer publishing": "https://www.heuerpub.com/search?q=",
}


@dataclass
class Reference:
    """One monologue we know exists and can point at. No speech, by design."""
    play_title: str
    character_name: str
    author_first: str = ""
    author_last: str = ""
    character_gender: str = ""
    character_race: str = ""
    publisher: str = ""
    act: str = ""
    scene: str = ""
    genre: str = ""
    notes: str = ""

    @property
    def author(self) -> str:
        return f"{self.author_first} {self.author_last}".strip()

    @property
    def purchase_url(self) -> Optional[str]:
        """Catalogue search at the publisher who actually licenses this play."""
        from urllib.parse import quote_plus
        base = PUBLISHER_SITES.get(self.publisher.strip().casefold())
        return base + quote_plus(self.play_title) if base else None

    def problems(self) -> list[str]:
        out = []
        if not self.play_title.strip():
            out.append("no_play_title")
        if not self.character_name.strip():
            out.append("no_character")
        if not self.author.strip():
            out.append("no_author")
        if not self.publisher.strip():
            out.append("no_publisher")
        return out


def read_references(path: Path) -> tuple[list[Reference], list[str]]:
    """CSV -> references. Any column carrying the speech is dropped here."""
    rows = list(csv.reader(path.open(encoding="utf-8", errors="replace")))
    if not rows:
        return [], []
    header = [h.strip() for h in rows[0]]
    dropped = [h for h in header if h.strip().casefold() in _FORBIDDEN_COLUMNS]

    index: dict[str, int] = {}
    for i, name in enumerate(header):
        key = name.strip().casefold()
        if key in _FORBIDDEN_COLUMNS:
            continue           # never mapped, so never read
        if key in _WANTED:
            index[_WANTED[key]] = i

    refs: list[Reference] = []
    for row in rows[1:]:
        if not any(c.strip() for c in row):
            continue
        values = {
            field_name: (row[i].strip() if i < len(row) else "")
            for field_name, i in index.items()
        }
        if not values.get("play_title") and not values.get("character_name"):
            continue
        refs.append(Reference(**values))
    return refs, dropped


def report(refs: list[Reference]) -> None:
    """Who holds what, ranked. This is the licensing conversation on one page."""
    print(f"\n{'=' * 66}")
    print(f"  references:  {len(refs)}")
    print(f"  plays:       {len({(r.play_title.casefold(), r.author.casefold()) for r in refs})}")
    print(f"  authors:     {len({r.author.casefold() for r in refs if r.author})}")

    pubs = Counter(r.publisher.strip() for r in refs if r.publisher.strip())
    print(f"\n  BY PUBLISHER (who to ask, and for how much)")
    for name, n in pubs.most_common():
        plays = len({r.play_title.casefold() for r in refs
                     if r.publisher.strip() == name})
        linked = "  ->  " + (PUBLISHER_SITES.get(name.casefold(), "(no catalogue url yet)"))
        print(f"    {n:4d} monologues / {plays:3d} plays   {name[:38]:<40}{linked[:52]}")

    authors = Counter(r.author for r in refs if r.author)
    print(f"\n  BY AUTHOR, top 20 (who to write to first)")
    for name, n in authors.most_common(20):
        pub = Counter(r.publisher.strip() for r in refs
                      if r.author == name and r.publisher.strip())
        where = pub.most_common(1)[0][0] if pub else "?"
        print(f"    {n:3d}  {name[:32]:<34}{where[:34]}")

    missing = Counter(p for r in refs for p in r.problems())
    if missing:
        print(f"\n  INCOMPLETE ROWS")
        for reason, n in missing.most_common():
            print(f"    {reason:20s} {n}")

    unlinked = sorted({r.publisher.strip() for r in refs
                       if r.publisher.strip()
                       and r.publisher.strip().casefold() not in PUBLISHER_SITES})
    if unlinked:
        print(f"\n  PUBLISHERS WITH NO CATALOGUE URL (add to PUBLISHER_SITES)")
        for name in unlinked:
            print(f"    {name}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--csv", required=True, type=Path)
    ap.add_argument("--report", action="store_true", help="Publisher/author breakdown")
    ap.add_argument("--dry-run", action="store_true", help="Report only (default)")
    ap.add_argument("--write", action="store_true", help="Persist to DB")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    if not args.csv.exists():
        ap.error(f"no such file: {args.csv}")

    refs, dropped = read_references(args.csv)
    if dropped:
        print(f"DROPPED at the reader, never loaded: {dropped}")
        print("  That column is the authorship. It is not ours to store or serve.\n")

    if args.limit:
        refs = refs[: args.limit]

    usable = [r for r in refs if not r.problems()]
    print(f"parsed {len(refs)} references, {len(usable)} complete")

    if args.report or not args.write:
        report(refs)

    for r in usable[:5]:
        print(f"\n  {r.character_name} — {r.play_title} ({r.author})")
        bits = " · ".join(x for x in [r.genre, r.character_gender,
                                      f"Act {r.act}" if r.act else "",
                                      f"Sc. {r.scene}" if r.scene else ""] if x)
        if bits:
            print(f"    {bits}")
        print(f"    {r.publisher}")
        print(f"    {r.purchase_url or '(no catalogue url for this publisher)'}")

    if args.write:
        print(
            "\nWRITE path not implemented yet: needs a `monologue_references` table.\n"
            "Deliberately NO `text` column on it, so there is nothing to serve by\n"
            "accident. Model + migration is the next step; say go and I'll add it.",
            file=sys.stderr,
        )
        sys.exit(3)


if __name__ == "__main__":
    main()
