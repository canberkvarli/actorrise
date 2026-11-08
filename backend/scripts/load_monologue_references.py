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
    uv run python -m scripts.load_monologue_references --csv path/to/sheet.csv --sql out.sql

`--write` inserts into `monologue_references` (run
scripts/add_monologue_references_table.py first). `--sql` writes the same
inserts to a file instead, for a session that cannot open a database connection
(run it through the Supabase SQL editor or MCP). Both skip a piece that is
already there (same play, character and author).

Notes may carry facts the columns do not: "teen; age 16; year 2017; source: <url>".
Those are read into is_teen, character_age, year and source_url.
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
    "character age": "character_age",
    "year": "year",
    "source url": "source_url",
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
    character_age: str = ""
    year: str = ""
    source_url: str = ""

    @property
    def author(self) -> str:
        return f"{self.author_first} {self.author_last}".strip()

    @property
    def purchase_url(self) -> Optional[str]:
        """Catalogue search at the publisher who actually licenses this play."""
        from urllib.parse import quote_plus
        base = PUBLISHER_SITES.get(self.publisher.strip().casefold())
        return base + quote_plus(self.play_title) if base else None

    def _note(self, pattern: str) -> str:
        import re
        m = re.search(pattern, self.notes or "", re.IGNORECASE)
        return m.group(1).strip() if m else ""

    @property
    def is_teen(self) -> bool:
        import re
        return bool(re.search(r"(^|;)\s*teen\s*(;|$)", self.notes or "", re.IGNORECASE))

    @property
    def age(self) -> str:
        return self.character_age or self._note(r"\bage\s+([^;]+)")

    @property
    def year_int(self) -> Optional[int]:
        y = self.year or self._note(r"\byear\s+(\d{4})")
        return int(y) if y.isdigit() and 1500 <= int(y) <= 2100 else None

    @property
    def source(self) -> str:
        return self.source_url or self._note(r"source:\s*(\S+)").rstrip(";,")

    @property
    def gender(self) -> Optional[str]:
        g = (self.character_gender or "").strip().casefold()
        return g if g in ("female", "male", "any") else None

    @property
    def get_script_url(self) -> Optional[str]:
        """The publisher's catalogue, or for a self-published piece the page it lives on."""
        return self.purchase_url or (self.source or None)

    def row(self) -> dict:
        """The table row. Built from named fields only: there is no speech to leak."""
        return {
            "play_title": self.play_title.strip()[:300],
            "character_name": self.character_name.strip()[:200],
            "author": self.author[:200],
            "publisher": self.publisher.strip()[:200] or None,
            "character_gender": self.gender,
            "character_age": (self.age or None) and self.age[:40],
            "is_teen": self.is_teen,
            "genre": (self.genre.strip().casefold() or None) and self.genre.strip().casefold()[:40],
            "year": self.year_int,
            "act": self.act.strip()[:20] or None,
            "scene": self.scene.strip()[:20] or None,
            "get_script_url": self.get_script_url,
            "source_url": self.source or None,
        }

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
        if not self.get_script_url:
            out.append("no_link")
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


_COLUMNS = (
    "play_title", "character_name", "author", "publisher", "character_gender",
    "character_age", "is_teen", "genre", "year", "act", "scene",
    "get_script_url", "source_url",
)

_CONFLICT = "ON CONFLICT (lower(play_title), lower(character_name), lower(author)) DO NOTHING"

_INSERT = (
    f"INSERT INTO monologue_references ({', '.join(_COLUMNS)}) "
    f"VALUES ({', '.join(':' + c for c in _COLUMNS)}) {_CONFLICT}"
)


def _sql_literal(v) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, int):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def to_sql(refs: list[Reference]) -> str:
    """Plain INSERTs for the SQL editor. Same skip-if-present rule as --write."""
    lines = []
    for r in refs:
        row = r.row()
        values = ", ".join(_sql_literal(row[c]) for c in _COLUMNS)
        lines.append(f"INSERT INTO monologue_references ({', '.join(_COLUMNS)}) VALUES ({values}) {_CONFLICT};")
    return "\n".join(lines) + "\n"


def _key(row: dict) -> tuple:
    return (row["play_title"].casefold(), row["character_name"].casefold(), row["author"].casefold())


def upload_rest(refs: list[Reference]) -> tuple[int, int]:
    """Same rows as --write, through PostgREST. A cloud session reaches web
    traffic only, so this is how it loads. Skips what is already there, by the
    same play/character/author key the unique index uses."""
    import json
    import os
    import urllib.request

    base = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1/monologue_references"
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}

    def call(url: str, body=None, extra=None):
        req = urllib.request.Request(
            url, data=None if body is None else json.dumps(body).encode(),
            headers={**headers, **(extra or {})}, method="GET" if body is None else "POST",
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read() or b"[]")

    have = {
        _key(r) for r in call(base + "?select=play_title,character_name,author&limit=100000")
    }
    fresh: dict[tuple, dict] = {}
    for r in refs:
        row = r.row()
        if _key(row) not in have:
            fresh.setdefault(_key(row), row)
    rows = list(fresh.values())
    for i in range(0, len(rows), 200):
        call(base, rows[i:i + 200], {"Prefer": "return=minimal"})
    return len(rows), len(refs) - len(rows)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--csv", required=True, type=Path)
    ap.add_argument("--report", action="store_true", help="Publisher/author breakdown")
    ap.add_argument("--dry-run", action="store_true", help="Report only (default)")
    ap.add_argument("--write", action="store_true", help="Persist to DB")
    ap.add_argument("--sql", type=Path, help="Write the inserts to this .sql file instead")
    ap.add_argument("--rest", action="store_true",
                    help="Insert through Supabase REST (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY), for a cloud session")
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

    if args.report or not (args.write or args.sql or args.rest):
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

    if args.rest:
        added, skipped = upload_rest(usable)
        print(f"\ninserted {added} new references over REST ({skipped} already there)")

    if args.sql:
        args.sql.write_text(to_sql(usable), encoding="utf-8")
        print(f"\nwrote {len(usable)} inserts to {args.sql}")

    if args.write:
        from sqlalchemy import text as sql_text

        sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
        from app.core.database import engine

        with engine.begin() as conn:
            before = conn.execute(sql_text("SELECT count(*) FROM monologue_references")).scalar()
            for r in usable:
                conn.execute(sql_text(_INSERT), r.row())
            after = conn.execute(sql_text("SELECT count(*) FROM monologue_references")).scalar()
        print(f"\ninserted {after - before} new references ({len(usable) - (after - before)} already there)")

if __name__ == "__main__":
    main()
