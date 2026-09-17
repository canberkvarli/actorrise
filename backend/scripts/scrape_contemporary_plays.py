#!/usr/bin/env python
"""Scrape contemporary (post-1980) play monologues as bounded fair-use excerpts.

The posture here is the one the platform already runs for screen work: 5,505
film and TV monologues are stored today as `copyrighted` + `fair_use`, capped by
`EXCERPT_MAX_WORDS`, attributed, and linked back to source. This applies the
same treatment to stage work, which is the gap H-20 measured: one play dated
1980 or later, and no monologues on it.

What that basis requires, and what this script therefore enforces:

* **A hard 400-word ceiling.** `may_store_text` is called WITH the word count,
  so a `fair_use` row over `EXCERPT_MAX_WORDS` is refused by the licensing
  module itself rather than by a check here that could drift away from it.
* **A source link on every row.** An excerpt with no attribution and no way back
  to the original is the thing /sources promises we do not do. A row without
  `source_url` is dropped, not stored.
* **Never the whole script.** We take one speech. `ingest_play`'s full-text path
  is deliberately not used.

A note on where the text actually is, learned the expensive way. The StageAgent
ingest collected 191 rows and NONE of the 19 copyrighted ones clear our own
quality gate: median 35 words against a floor of 150, and 18 of 19 truncated
mid-sentence. That site publishes a teaser and keeps the speech behind its
login, so the words were never on the page. Prefer sources that publish the
whole speech in the clear, which in practice means publishers' own free
monologue pages, because there the speech is the advertisement.

Usage:
    uv run python -m scripts.scrape_contemporary_plays --self-check
    uv run python -m scripts.scrape_contemporary_plays --source stage_partners --dry-run
    uv run python -m scripts.scrape_contemporary_plays --source stage_partners --write
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.services.extraction.monologue_quality import (
    assess_monologue_quality,
    strip_artifacts,
    to_display_text,
)
from app.services.licensing import (
    COPYRIGHTED,
    EXCERPT_MAX_WORDS,
    LICENSE_FAIR_USE,
    may_store_text,
)

# ── Rights posture ───────────────────────────────────────────────────────────

COPYRIGHT_STATUS = COPYRIGHTED
LICENSE_TYPE = LICENSE_FAIR_USE

#: Floor is 150 rather than the corpus-wide 100. A stage audition piece wants to
#: be a real 60 to 90 seconds; 100 is calibrated to include shorter screen work.
MIN_WORDS = 150

#: Ceiling is NOT a local number. It is the fair-use bound from the licensing
#: module, so the legal ceiling and the extraction ceiling cannot drift apart.
MAX_WORDS = EXCERPT_MAX_WORDS

CREDIT_TEMPLATE = "{title} by {author}. Excerpt. Full play at {source_url}"


# ── Era ──────────────────────────────────────────────────────────────────────

#: Verified first-production / first-publication years, keyed by casefolded
#: title. Lives in a reviewable data file rather than in code because it is the
#: field H-20 got wrong: 325 plays were labelled contemporary because the word
#: appeared on a 1920 anthology cover.
#:
#: The rule this file exists to enforce: a year comes from a checked source
#: about the PLAY. It never comes from a page label, a collection title, a
#: "Time Period" sidebar, or the word "contemporary" appearing anywhere.
YEARS_PATH = backend_dir / "data" / "contemporary_play_years.json"


def load_years() -> dict[str, int]:
    if not YEARS_PATH.exists():
        return {}
    raw = json.loads(YEARS_PATH.read_text())
    # Keys beginning with "_" are documentation, not plays.
    return {
        k.strip().casefold(): int(v["year"])
        for k, v in raw.items()
        if not k.startswith("_")
    }


def _era_cutoff_year() -> Optional[int]:
    """The contemporary cutoff, from its one home in `semantic_search`.

    Imported lazily and never copied. `semantic_search` drags in the models, the
    DB engine, pgvector and LangChain on import, which a scraper should not need
    in order to learn that the cutoff is 1980. Returns None if unavailable, and
    callers then refuse to band rather than guessing.
    """
    try:
        from app.services.search.semantic_search import ERA_CUTOFF_YEAR
    except Exception:
        return None
    return ERA_CUTOFF_YEAR


def era_fields(title: str, years: dict[str, int]) -> tuple[Optional[int], Optional[str]]:
    """``(year_written, category)`` for a play title, or ``(None, None)``.

    No reliable year means unknown. It does NOT mean contemporary, however
    obviously modern the piece looks.
    """
    year = years.get(title.strip().casefold())
    if year is None:
        return None, None
    cutoff = _era_cutoff_year()
    if cutoff is None:
        raise RuntimeError(
            "cannot read ERA_CUTOFF_YEAR; refusing to band an era from a guess"
        )
    return year, ("contemporary" if year >= cutoff else "modern")


# ── Sources ──────────────────────────────────────────────────────────────────

@dataclass
class Source:
    """One site we pull from, and the terms we pull under."""
    key: str
    name: str
    index_urls: list[str]
    parse: Callable[[str, str], list["Parsed"]]
    #: Why we believe this page carries the whole speech rather than a teaser.
    note: str
    delay: float = 2.0


@dataclass
class Parsed:
    url: str
    play_title: str
    author: str
    character_name: str
    text: str

    def source_url_ok(self) -> bool:
        """An excerpt with no route back to the original is not attributable."""
        return bool(self.url and self.url.startswith("http"))


HEADERS = {
    "User-Agent": "ActorRise/1.0 (audition-prep; monologue-curation; canberk@actorrise.com)",
    "Accept": "text/html,application/xhtml+xml",
}
TIMEOUT = 30

_ATTRIB_RE = re.compile(r"from\s+(?P<title>.+?)\s+by\s+(?P<author>.+?)\s*$", re.I)


def _parse_generic(url: str, html: str) -> list[Parsed]:
    """Best-effort parse of a publisher free-monologue page.

    SELECTORS ARE UNVERIFIED. The session that wrote this had no outbound
    network, so no live page was ever opened. Confirm against real markup before
    the first `--write`; `--dry-run` reports parse failures loudly.
    """
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "html.parser")
    out: list[Parsed] = []
    for block in soup.find_all(["article", "section"]):
        body = block.find("div", class_="monologue-text") or block
        text = body.get_text("\n", strip=True)
        if not text:
            continue
        heading = block.find(["h1", "h2", "h3"])
        attribution = heading.get_text(" ", strip=True) if heading else ""
        m = _ATTRIB_RE.search(attribution)
        if not m:
            continue
        out.append(Parsed(
            url=url,
            play_title=m.group("title").strip(),
            author=m.group("author").strip(),
            character_name="Unknown",
            text=text,
        ))
    return out


SOURCES: dict[str, Source] = {
    "stage_partners": Source(
        key="stage_partners",
        name="Stage Partners",
        index_urls=[
            "https://www.yourstagepartners.com/resources/free-monologues/monologues-for-women",
            "https://www.yourstagepartners.com/resources/free-monologues/monologues-for-men",
            "https://www.yourstagepartners.com/resources/free-monologues/monologues-for-non-binary-actors",
        ],
        parse=_parse_generic,
        note=(
            "Publisher's own page. They print the whole speech because it sells "
            "the script, and they ask for a credit: play, playwright, publisher."
        ),
    ),
    "youthplays": Source(
        key="youthplays",
        name="YouthPLAYS",
        index_urls=["https://www.youthplays.com/monologues.php"],
        parse=_parse_generic,
        note=(
            "Publisher's own page, monologues drawn from their published plays, "
            "posted free for audition and classroom use with credit."
        ),
    ),
}


# ── Evaluation ───────────────────────────────────────────────────────────────

@dataclass
class Row:
    play_title: str
    author: str
    character_name: str
    source_url: str
    word_count: int
    year_written: Optional[int]
    category: Optional[str]
    ok: bool
    reasons: list[str] = field(default_factory=list)

    @property
    def copyright_status(self) -> str:
        return COPYRIGHT_STATUS

    @property
    def license_type(self) -> str:
        return LICENSE_TYPE

    @property
    def credit(self) -> str:
        return CREDIT_TEMPLATE.format(
            title=self.play_title, author=self.author, source_url=self.source_url
        )


def evaluate(parsed: Parsed, years: dict[str, int]) -> Row:
    """What this candidate would become. Touches neither DB nor network."""
    display = parsed.text
    spoken = strip_artifacts(to_display_text(display))
    word_count = len(spoken.split())
    year, category = era_fields(parsed.play_title, years)

    reasons: list[str] = []

    verdict = assess_monologue_quality(
        display, spoken=spoken, min_words=MIN_WORDS, max_words=MAX_WORDS
    )
    if not verdict.ok:
        reasons.extend(verdict.reasons)

    # The rights check runs WITH the word count, so the licensing module is what
    # enforces the excerpt ceiling.
    if not may_store_text(COPYRIGHT_STATUS, LICENSE_TYPE, word_count=word_count):
        reasons.append("no_rights_basis")

    # An excerpt with no route back to the original is not attributable.
    if not parsed.source_url_ok():
        reasons.append("no_source_url")

    return Row(
        play_title=parsed.play_title,
        author=parsed.author,
        character_name=parsed.character_name,
        source_url=parsed.url,
        word_count=word_count,
        year_written=year,
        category=category,
        ok=not reasons,
        reasons=sorted(set(reasons)),
    )


# ── Self check ───────────────────────────────────────────────────────────────

def self_check() -> int:
    """Assert the rights and era rules offline. No network, no database."""
    failures: list[str] = []

    def check(label: str, cond: bool) -> None:
        print(f"  {'ok  ' if cond else 'FAIL'}  {label}")
        if not cond:
            failures.append(label)

    print("rights (fair use):")
    check("a 300-word excerpt may be stored",
          may_store_text(COPYRIGHT_STATUS, LICENSE_TYPE, word_count=300) is True)
    check("a 401-word excerpt is refused by licensing, not by us",
          may_store_text(COPYRIGHT_STATUS, LICENSE_TYPE, word_count=401) is False)
    check("ceiling is EXCERPT_MAX_WORDS, not a local literal",
          MAX_WORDS == EXCERPT_MAX_WORDS == 400)
    check("floor is 150", MIN_WORDS == 150)
    check("no basis at all is refused",
          may_store_text(COPYRIGHT_STATUS, None) is False)

    print("attribution:")
    p = Parsed("https://example.org/m/1", "T", "A", "C", "x")
    check("a row with a source url is attributable", p.source_url_ok() is True)
    check("a row without one is not",
          Parsed("", "T", "A", "C", "x").source_url_ok() is False)

    print("era:")
    years = {"a dated play": 2019, "an older play": 1955}
    check("unknown title -> (None, None), never a guess",
          era_fields("Never Heard Of It", years) == (None, None))
    cutoff = _era_cutoff_year()
    if cutoff is None:
        print("  skip  cutoff checks: semantic_search not importable here")
    else:
        check("cutoff is 1980", cutoff == 1980)
        check("2019 -> contemporary",
              era_fields("A Dated Play", years) == (2019, "contemporary"))
        check("1955 -> modern", era_fields("An Older Play", years) == (1955, "modern"))

    print("year data:")
    loaded = load_years()
    check(f"year file loads ({len(loaded)} titles)", isinstance(loaded, dict))

    print(f"\n{len(failures)} failure(s)")
    return 1 if failures else 0


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(description="Scrape contemporary play monologues")
    ap.add_argument("--source", choices=sorted(SOURCES), help="Which source to pull")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--write", action="store_true", help="Persist to DB")
    ap.add_argument("--dry-run", action="store_true", help="Report only (default)")
    ap.add_argument("--self-check", action="store_true", help="Offline invariant check")
    ap.add_argument("--debug", action="store_true")
    args = ap.parse_args()

    if args.self_check:
        sys.exit(self_check())

    if not args.source:
        ap.error("--source is required (or use --self-check)")

    source = SOURCES[args.source]
    write = args.write and not args.dry_run
    years = load_years()

    if not years:
        print(
            f"WARN: {YEARS_PATH} is empty or missing, so every row gets "
            "year_written=NULL\n      and none will be categorised contemporary. "
            "That is the safe failure, but\n      it also means this run adds "
            "nothing an era filter can find.",
            file=sys.stderr,
        )

    print(f"[{'WRITE' if write else 'DRY RUN'}] {source.name}")
    print(f"  basis: {COPYRIGHT_STATUS}/{LICENSE_TYPE}, {MIN_WORDS}-{MAX_WORDS} words")
    print(f"  note:  {source.note}\n")

    import requests

    urls = source.index_urls[: args.limit] if args.limit else source.index_urls
    rows: list[Row] = []
    fetch_failed = parse_failed = 0

    for i, url in enumerate(urls, 1):
        time.sleep(source.delay)
        try:
            resp = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
            html = resp.text if resp.status_code == 200 else None
        except Exception as e:
            if args.debug:
                print(f"  fetch error {url}: {e}")
            html = None
        if not html:
            fetch_failed += 1
            print(f"  [{i}/{len(urls)}] FETCH FAIL {url}")
            continue
        parsed_list = source.parse(url, html)
        if not parsed_list:
            parse_failed += 1
            print(f"  [{i}/{len(urls)}] PARSE FAIL {url}")
            continue
        rows.extend(evaluate(p, years) for p in parsed_list)

    kept = [r for r in rows if r.ok]
    rejected = [r for r in rows if not r.ok]
    contemporary = [r for r in kept if r.category == "contemporary"]

    print(f"\n{'='*60}")
    print(f"  pages:            {len(urls)}")
    print(f"  fetch failures:   {fetch_failed}")
    print(f"  parse failures:   {parse_failed}")
    print(f"  candidates:       {len(rows)}")
    print(f"  would insert:     {len(kept)}")
    print(f"    of those, contemporary (year >= 1980): {len(contemporary)}")
    print(f"  rejected:         {len(rejected)}")

    reasons: dict[str, int] = {}
    for r in rejected:
        for reason in r.reasons:
            reasons[reason] = reasons.get(reason, 0) + 1
    for reason, n in sorted(reasons.items(), key=lambda kv: -kv[1]):
        print(f"    {reason:22s} {n}")

    for r in kept[:5]:
        print(
            f"\n  {r.character_name} — {r.play_title} ({r.author})\n"
            f"    words={r.word_count} year_written={r.year_written} "
            f"category={r.category}\n"
            f"    {r.copyright_status}/{r.license_type}\n"
            f"    {r.credit}"
        )

    if write:
        print(
            "\nWRITE path not implemented yet: pipeline.ingest_play cannot take a "
            "year_written\nand refuses text under 2000 characters, so a single "
            "excerpt never reaches the gate.\nSee "
            "docs/licensing/contemporary-source-survey-2026-09-17.md, "
            "'Pipeline changes needed'.",
            file=sys.stderr,
        )
        sys.exit(3)


if __name__ == "__main__":
    main()
