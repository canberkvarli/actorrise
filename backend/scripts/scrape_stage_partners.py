#!/usr/bin/env python
"""Scrape contemporary monologues from Stage Partners — permission-gated.

Stage Partners (yourstagepartners.com) publishes new plays and puts a free
monologue set on its own site for actors to use in auditions, asking only for a
credit: play title, playwright, publisher. They are the PUBLISHER, so unlike an
excerpt aggregator they can actually grant us a basis for the underlying work.

That grant is to the performing actor, though, not to us. Their free-monologues
page does not by itself let ActorRise copy the text into a database and serve it
to subscribers. So this script will not write anything until a written
permission is on file — see PERMISSION below. Until then `--write` refuses and
only `--dry-run` runs, which is the whole point of shipping it now: the ask to
Stage Partners is much easier to make when the ingest is already built and you
can tell them exactly what you would store and how it would be credited.

Why this source and not an aggregator: see
`docs/licensing/contemporary-source-survey-2026-09-17.md`. Short version — 19 of
the 19 copyrighted monologues the StageAgent scraper collected fail our own
quality gate, because that site shows a ~35-word teaser and keeps the real text
behind its paywall. A publisher's free-monologue page publishes the whole
speech, because the speech is the advertisement.

Usage:
    uv run python -m scripts.scrape_stage_partners --self-check    # offline, no network
    uv run python -m scripts.scrape_stage_partners --dry-run --limit 10
    uv run python -m scripts.scrape_stage_partners --write         # refuses without PERMISSION
"""

from __future__ import annotations

import argparse
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.services.extraction.monologue_quality import (
    DEFAULT_MIN_WORDS,
    assess_monologue_quality,
    strip_artifacts,
    to_display_text,
)
from app.services.licensing import (
    COPYRIGHTED,
    LICENSE_LICENSED,
    max_words_for,
    may_store_text,
)

def _era_cutoff_year() -> Optional[int]:
    """The contemporary cutoff, from its one home in `semantic_search`.

    Imported lazily and never copied. `semantic_search` pulls in the models, the
    DB engine and the whole LangChain stack on import, which a scraper has no
    business needing in order to learn that the cutoff is 1980 — so a dry run
    must not pay for it, and `--self-check` must still work where that stack is
    not installed. Returns None when the module cannot be imported.

    The duplicated-literal trap here is the same one `DEFAULT_MIN_WORDS`
    documents: eight parsers carried their own copy of the word floor and would
    have silently kept the old value when it moved. So this never falls back to
    a hardcoded 1980 — it reports that it could not check.

    See the survey document: the fix is to move the era constants into a light
    module both callers can import.
    """
    try:
        from app.services.search.semantic_search import ERA_CUTOFF_YEAR
    except Exception:
        return None
    return ERA_CUTOFF_YEAR


# ── Permission ───────────────────────────────────────────────────────────────

#: Set this to the path of the written permission once Stage Partners replies,
#: e.g. "docs/licensing/permissions/stage-partners-2026-10-01.md". The file must
#: name the titles covered, the excerpt ceiling, the required credit line and a
#: takedown commitment. `--write` refuses while this is None.
#:
#: This is deliberately a constant in the source rather than an env var: the
#: basis for holding somebody's copyrighted text should be reviewable in a diff.
PERMISSION: Optional[str] = None

COPYRIGHT_STATUS = COPYRIGHTED
LICENSE_TYPE = LICENSE_LICENSED

#: Required on every piece, per their free-monologues page.
CREDIT_TEMPLATE = "{title} by {author}. Published by Stage Partners."


# ── Era ──────────────────────────────────────────────────────────────────────

#: Real first-publication / first-production years, filled in per title from the
#: publisher's own catalogue page.
#:
#: This map is the ONLY source of `year_written`. It is never read off a page
#: label, a collection title, or the word "contemporary" appearing anywhere. A
#: title absent from this map gets `year_written = None` and is NOT categorised
#: contemporary, however modern it obviously is — that is what H-20 cost us.
YEAR_BY_TITLE: dict[str, int] = {}


def era_fields(title: str) -> tuple[Optional[int], Optional[str]]:
    """Return ``(year_written, category)`` for a play title.

    A known year decides the band, matching `era_year_clause` in
    semantic_search: contemporary is >= ERA_CUTOFF_YEAR (1980). An unknown year
    returns ``(None, None)`` — unknown, never a guess.

    Raises if the cutoff cannot be read, rather than guessing at it.
    """
    year = YEAR_BY_TITLE.get(title.strip().casefold())
    if year is None:
        return None, None
    cutoff = _era_cutoff_year()
    if cutoff is None:
        raise RuntimeError(
            "cannot read ERA_CUTOFF_YEAR from semantic_search; refusing to "
            "assign an era band from a guessed cutoff"
        )
    return year, ("contemporary" if year >= cutoff else "modern")


# ── Parsing ──────────────────────────────────────────────────────────────────

BASE = "https://www.yourstagepartners.com"
INDEX_PATHS = (
    "/resources/free-monologues/monologues-for-women",
    "/resources/free-monologues/monologues-for-men",
    "/resources/free-monologues/monologues-for-non-binary-actors",
)
HEADERS = {
    "User-Agent": "ActorRise/1.0 (audition-prep; monologue-curation; canberk@actorrise.com)",
    "Accept": "text/html,application/xhtml+xml",
}
REQUEST_DELAY = 2.0
TIMEOUT = 30

#: NOTE: these selectors are UNVERIFIED. This session had no outbound network,
#: so the live markup was never opened. Confirm against a real page before the
#: first run; `--dry-run` will report parse failures loudly if they are wrong.
_TITLE_RE = re.compile(r"from\s+(?P<title>.+?)\s+by\s+(?P<author>.+?)\s*$", re.I)


@dataclass
class ParsedMonologue:
    url: str
    play_title: str
    author: str
    character_name: str
    text: str
    gender: Optional[str] = None


def parse_monologue_block(url: str, html: str) -> Optional[ParsedMonologue]:
    """Parse one monologue out of a Stage Partners page.

    Selectors unverified — see the note above.
    """
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "html.parser")
    body = soup.find("div", class_="monologue-text") or soup.find("article")
    if body is None:
        return None
    text = body.get_text("\n", strip=True)
    if not text:
        return None

    heading = soup.find(["h1", "h2"])
    attribution = heading.get_text(" ", strip=True) if heading else ""
    m = _TITLE_RE.search(attribution)
    if not m:
        return None

    character = None
    for tag in soup.find_all(["h3", "strong"]):
        candidate = tag.get_text(" ", strip=True)
        if candidate and len(candidate) < 60:
            character = candidate
            break

    return ParsedMonologue(
        url=url,
        play_title=m.group("title").strip(),
        author=m.group("author").strip(),
        character_name=character or "Unknown",
        text=text,
    )


# ── Evaluation (no writes) ───────────────────────────────────────────────────

def evaluate(parsed: ParsedMonologue) -> dict:
    """What this row WOULD become. Pure: touches neither DB nor network."""
    year, category = era_fields(parsed.play_title)
    display = parsed.text
    spoken = strip_artifacts(to_display_text(display))
    ceiling = max_words_for(COPYRIGHT_STATUS, LICENSE_TYPE)

    verdict = assess_monologue_quality(
        display, spoken=spoken, min_words=DEFAULT_MIN_WORDS, max_words=ceiling
    )
    return {
        "url": parsed.url,
        "play_title": parsed.play_title,
        "author": parsed.author,
        "character_name": parsed.character_name,
        "word_count": len(spoken.split()),
        "max_words": ceiling,
        "year_written": year,
        "category": category,
        "copyright_status": COPYRIGHT_STATUS,
        "license_type": LICENSE_TYPE,
        "credit": CREDIT_TEMPLATE.format(title=parsed.play_title, author=parsed.author),
        "ok": verdict.ok,
        "reasons": list(verdict.reasons),
    }


# ── Self check (offline) ─────────────────────────────────────────────────────

def self_check() -> int:
    """Assert the rights and era mapping without network or database.

    These are the invariants the survey document promises. Pinning them here
    means a later edit cannot quietly change what this scraper would store.
    """
    failures: list[str] = []

    def check(label: str, cond: bool) -> None:
        print(f"  {'ok  ' if cond else 'FAIL'}  {label}")
        if not cond:
            failures.append(label)

    print("rights:")
    check("licensed copyrighted text may be stored",
          may_store_text(COPYRIGHT_STATUS, LICENSE_TYPE) is True)
    check("ceiling is 900 words, not the 400-word fair-use cap",
          max_words_for(COPYRIGHT_STATUS, LICENSE_TYPE) == 900)
    check("the same text with no basis is refused",
          may_store_text(COPYRIGHT_STATUS, None) is False)

    print("era:")
    check("unknown title -> (None, None), never a guess",
          era_fields("A Title Nobody Dated") == (None, None))

    cutoff = _era_cutoff_year()
    if cutoff is None:
        print("  skip  cutoff checks: semantic_search not importable here "
              "(needs the DB and LangChain stack)")
    else:
        YEAR_BY_TITLE["seed contemporary"] = 2019
        YEAR_BY_TITLE["seed modern"] = 1955
        check("cutoff is 1980", cutoff == 1980)
        check("2019 -> contemporary",
              era_fields("Seed Contemporary") == (2019, "contemporary"))
        check("1955 -> modern", era_fields("Seed Modern") == (1955, "modern"))
        del YEAR_BY_TITLE["seed contemporary"], YEAR_BY_TITLE["seed modern"]

    print("write gate:")
    check("write refuses while no permission is on file", PERMISSION is None)

    print(f"\n{len(failures)} failure(s)")
    return 1 if failures else 0


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(description="Scrape Stage Partners free monologues")
    ap.add_argument("--limit", type=int, default=0, help="Max pages to process (0=all)")
    ap.add_argument("--write", action="store_true", help="Persist to DB (refuses without PERMISSION)")
    ap.add_argument("--dry-run", action="store_true", help="Parse and report only (default)")
    ap.add_argument("--self-check", action="store_true", help="Offline invariant check, no network")
    ap.add_argument("--debug", action="store_true")
    args = ap.parse_args()

    if args.self_check:
        sys.exit(self_check())

    write = args.write and not args.dry_run

    if write and PERMISSION is None:
        print(
            "REFUSING to write: no written permission from Stage Partners is on "
            "file.\nTheir free-monologues page grants performance use to actors, "
            "not redistribution\nrights to this platform. Set PERMISSION to the "
            "path of their written reply first.\nRe-run with --dry-run to see "
            "what would be stored.",
            file=sys.stderr,
        )
        sys.exit(2)

    if not YEAR_BY_TITLE:
        print(
            "WARN: YEAR_BY_TITLE is empty, so every row will get year_written=NULL "
            "and\n      will NOT be categorised contemporary. Fill it from the "
            "publisher's\n      catalogue before a real run.",
            file=sys.stderr,
        )

    import requests

    print(f"[{'WRITE' if write else 'DRY RUN'}] Stage Partners")
    urls: list[str] = [BASE + p for p in INDEX_PATHS]
    if args.limit:
        urls = urls[: args.limit]

    rows: list[dict] = []
    fetch_failed = 0
    parse_failed = 0

    for i, url in enumerate(urls, 1):
        time.sleep(REQUEST_DELAY)
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
        parsed = parse_monologue_block(url, html)
        if not parsed:
            parse_failed += 1
            print(f"  [{i}/{len(urls)}] PARSE FAIL {url}")
            continue
        rows.append(evaluate(parsed))

    kept = [r for r in rows if r["ok"]]
    rejected = [r for r in rows if not r["ok"]]

    print(f"\n{'='*60}")
    print(f"  pages:          {len(urls)}")
    print(f"  fetch failures: {fetch_failed}")
    print(f"  parse failures: {parse_failed}")
    print(f"  would insert:   {len(kept)}")
    print(f"  gate rejected:  {len(rejected)}")

    reasons: dict[str, int] = {}
    for r in rejected:
        for reason in r["reasons"]:
            reasons[reason] = reasons.get(reason, 0) + 1
    for reason, n in sorted(reasons.items(), key=lambda kv: -kv[1]):
        print(f"    {reason:22s} {n}")

    for r in kept[:5]:
        print(
            f"\n  {r['character_name']} — {r['play_title']} ({r['author']})\n"
            f"    words={r['word_count']} year_written={r['year_written']} "
            f"category={r['category']}\n"
            f"    {r['copyright_status']}/{r['license_type']}  credit: {r['credit']}"
        )

    if write:
        raise SystemExit("unreachable: write path is gated above")


if __name__ == "__main__":
    main()
