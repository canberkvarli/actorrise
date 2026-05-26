#!/usr/bin/env python
"""
Scrape monologues from StageAgent.

StageAgent (https://stageagent.com) curates ~420 monologues with rich
pre-tagged metadata (gender, age, style, length, time period, show type).
We map each page directly to our Play/Monologue schema — no LLM extraction
needed since the data is already structured.

Sitemap discovery: stageagent.com/sitemaps/monologues returns 14 child
sitemaps, each holding ~30 monologue URLs.

Usage:
    uv run python -m scripts.scrape_stageagent --limit 10 --dry-run   # parse-only test
    uv run python -m scripts.scrape_stageagent --limit 50 --write     # small real batch
    uv run python -m scripts.scrape_stageagent --write                # full run (~420 URLs)
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional
from xml.etree import ElementTree as ET

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

import requests
from bs4 import BeautifulSoup
from sqlalchemy import create_engine
from sqlalchemy.orm import Session as DBSession, sessionmaker

from app.core.config import settings
from app.models.actor import Monologue, Play


# ── Constants ────────────────────────────────────────────────────────────────

SITEMAP_INDEX = "https://stageagent.com/sitemaps/monologues"
HEADERS = {
    "User-Agent": "ActorRise/1.0 (audition-prep; monologue-curation)",
    "Accept": "text/html,application/xhtml+xml,application/xml",
}
REQUEST_DELAY = 2.0  # seconds between page fetches
TIMEOUT = 30
RETRY_BACKOFF = 5
SITEMAP_NS = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}


# Dedicated engine — Supabase pooler drops idle connections during long
# scrape runs. Mirrors the pattern in segment_monologues / extract_film_tv.
_engine = create_engine(
    settings.database_url,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
    pool_recycle=1800,
)
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
    bind=_engine,
)


@dataclass
class ParsedMonologue:
    """One monologue page from StageAgent, fully parsed."""
    url: str
    show_title: str
    character_name: str
    text: str
    gender: Optional[str] = None
    playing_age: Optional[str] = None
    style: Optional[str] = None
    act: Optional[int] = None
    scene: Optional[int] = None
    time_place: Optional[str] = None
    length: Optional[str] = None
    time_period: Optional[str] = None
    show_type: Optional[str] = None  # "Play" or "Musical"


# ── HTTP ─────────────────────────────────────────────────────────────────────

def _fetch(url: str, debug: bool = False) -> Optional[str]:
    """GET a URL with retry-once on 429/503. Returns text or None on failure."""
    for attempt in (1, 2):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
            if resp.status_code in (429, 503) and attempt == 1:
                if debug:
                    print(f"    rate-limited ({resp.status_code}); sleeping {RETRY_BACKOFF}s")
                time.sleep(RETRY_BACKOFF)
                continue
            if resp.status_code != 200:
                if debug:
                    print(f"    fetch {url} → {resp.status_code}")
                return None
            return resp.text
        except Exception as e:
            if attempt == 2:
                if debug:
                    print(f"    fetch {url} error: {e}")
                return None
            time.sleep(RETRY_BACKOFF)
    return None


# ── Discovery ────────────────────────────────────────────────────────────────

def _extract_locs(xml_text: str) -> list[str]:
    root = ET.fromstring(xml_text)
    return [loc.text for loc in root.findall(".//sm:loc", SITEMAP_NS) if loc.text]


def build_url_list(debug: bool = False) -> list[str]:
    """Walk the StageAgent sitemap tree to collect every monologue URL."""
    index_xml = _fetch(SITEMAP_INDEX, debug=debug)
    if not index_xml:
        return []
    child_sitemaps = _extract_locs(index_xml)
    print(f"sitemap index: {len(child_sitemaps)} child sitemaps")
    urls: list[str] = []
    for child in child_sitemaps:
        time.sleep(REQUEST_DELAY)
        xml = _fetch(child, debug=debug)
        if not xml:
            continue
        locs = _extract_locs(xml)
        urls.extend(locs)
    print(f"discovered {len(urls)} monologue URLs")
    return urls


# ── Parser ───────────────────────────────────────────────────────────────────

def _h_value(soup: BeautifulSoup, label: str) -> Optional[str]:
    """Find a StageAgent sidebar field by its label and return its value.

    The page renders each field as two adjacent divs:
      <div class="font-semibold ... uppercase ...">LABEL</div>
      <div class="mt-1 text-gray-900">VALUE</div>

    We match the label by exact text (case-insensitive) and return the next
    sibling div's text.
    """
    label_lower = label.lower()
    for div in soup.find_all("div", class_="font-semibold"):
        if div.get_text(strip=True).lower() != label_lower:
            continue
        for sib in div.next_siblings:
            if hasattr(sib, "get_text"):
                text = sib.get_text(" ", strip=True)
                if text:
                    return text
        return None
    return None


def _parse_act_scene(s: Optional[str]) -> tuple[Optional[int], Optional[int]]:
    if not s:
        return None, None
    act = scene = None
    m = re.search(r"Act\s*(\d+)", s, re.IGNORECASE)
    if m:
        act = int(m.group(1))
    m = re.search(r"Scene\s*(\d+)", s, re.IGNORECASE)
    if m:
        scene = int(m.group(1))
    return act, scene


def _extract_text_section(soup: BeautifulSoup) -> Optional[str]:
    """The monologue body sits right after the <h2>Text</h2> heading.
    Concatenate paragraph text until the next h2/h3 section."""
    for tag in soup.find_all("h2"):
        if tag.get_text(strip=True).lower() != "text":
            continue
        parts: list[str] = []
        for sib in tag.next_siblings:
            if getattr(sib, "name", None) in ("h2", "h3"):
                break
            if not hasattr(sib, "get_text"):
                continue
            text = sib.get_text(" ", strip=True)
            if text:
                parts.append(text)
        return "\n\n".join(parts).strip() or None
    return None


def parse_monologue_page(url: str, html: str) -> Optional[ParsedMonologue]:
    """Parse a StageAgent monologue HTML page into a ParsedMonologue."""
    soup = BeautifulSoup(html, "html.parser")

    show = _h_value(soup, "Show")
    character = _h_value(soup, "Character")
    text = _extract_text_section(soup)
    if not (show and character and text):
        return None

    act, scene = _parse_act_scene(_h_value(soup, "Act/Scene"))

    return ParsedMonologue(
        url=url,
        show_title=show,
        character_name=character,
        text=text,
        gender=_h_value(soup, "Gender"),
        playing_age=_h_value(soup, "Playing Age"),
        style=_h_value(soup, "Style"),
        act=act,
        scene=scene,
        time_place=_h_value(soup, "Time & Place"),
        length=_h_value(soup, "Length"),
        time_period=_h_value(soup, "Time Period"),
        show_type=_h_value(soup, "Show Type"),
    )


# ── DB ───────────────────────────────────────────────────────────────────────

def upsert_play(db: DBSession, parsed: ParsedMonologue) -> Play:
    """Find an existing Play by case-insensitive title match, or create one.

    The `plays` table requires non-null genre, category, copyright_status,
    so we derive sensible defaults from StageAgent's Style / Time Period
    fields when present, fall back to drama / contemporary / copyrighted.

    If StageAgent's Show Type is 'Musical' we also tag the play with
    themes += 'musical' so it surfaces in musical-theatre search filters.
    """
    play = db.query(Play).filter(Play.title.ilike(parsed.show_title)).first()

    is_musical = (parsed.show_type or "").strip().lower() == "musical"

    if play:
        # Existing play — backfill the musical tag if we now know it's one
        if is_musical:
            current = list(play.themes) if play.themes else []
            if "musical" not in {t.lower() for t in current}:
                play.themes = current + ["musical"]
        return play

    style = (parsed.style or "").lower()
    genre = "comedy" if "comed" in style else "drama"

    time_period = (parsed.time_period or "").lower()
    category = "classical" if "classical" in time_period or "period" in time_period else "contemporary"

    play = Play(
        title=parsed.show_title,
        author="Unknown",  # StageAgent doesn't expose author on monologue page
        genre=genre,
        category=category,
        copyright_status="copyrighted",  # curated excerpts; fair-use posture
        source_type="play",
        source_url=parsed.url,
        themes=["musical"] if is_musical else None,
    )
    db.add(play)
    db.flush()
    return play


def create_monologue(db: DBSession, play: Play, parsed: ParsedMonologue) -> Optional[Monologue]:
    """Insert a new Monologue or skip if a near-duplicate already exists."""
    existing = (
        db.query(Monologue)
        .filter(Monologue.play_id == play.id)
        .filter(Monologue.character_name.ilike(parsed.character_name))
        .all()
    )
    text_head = parsed.text[:100].strip()
    for m in existing:
        if m.text and m.text[:100].strip() == text_head:
            return None  # duplicate

    word_count = len(parsed.text.split())
    estimated_seconds = max(30, word_count * 60 // 150)  # ~150 wpm

    # If the play is a musical, seed search_tags with musical-theatre keywords
    # so users find it via "musical" / "broadway" / "show tune" queries.
    is_musical = (parsed.show_type or "").strip().lower() == "musical"
    search_tags = (
        ["musical", "broadway", "musical theater", "musical theatre"]
        if is_musical else None
    )

    mono = Monologue(
        play_id=play.id,
        title=f"{parsed.character_name}'s Monologue",
        character_name=parsed.character_name,
        text=parsed.text,
        character_gender=(parsed.gender or "any").lower() if parsed.gender else "any",
        character_age_range=parsed.playing_age,
        tone=(parsed.style or "").lower() or None,
        act=parsed.act,
        scene=parsed.scene,
        scene_description=parsed.time_place,
        word_count=word_count,
        estimated_duration_seconds=estimated_seconds,
        search_tags=search_tags,
        is_verified=True,  # curated source
        quality_score=0.85,
        overdone_score=0.3,
    )
    db.add(mono)
    return mono


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Scrape monologues from StageAgent")
    parser.add_argument("--limit", type=int, default=0, help="Max URLs to process (0=all)")
    parser.add_argument("--write", action="store_true", help="Persist to DB (default: dry-run)")
    parser.add_argument("--dry-run", action="store_true", help="Parse-only, no DB writes (default)")
    parser.add_argument("--start-from", type=str, default=None,
                        help="Skip URLs until this one (resume support)")
    parser.add_argument("--debug", action="store_true", help="Verbose error reporting")
    args = parser.parse_args()

    write = args.write and not args.dry_run
    mode = "WRITE" if write else "DRY RUN"

    urls = build_url_list(debug=args.debug)
    if not urls:
        print("ERROR: no URLs discovered", file=sys.stderr)
        sys.exit(1)

    if args.start_from:
        try:
            idx = urls.index(args.start_from)
            urls = urls[idx:]
            print(f"resuming from index {idx}")
        except ValueError:
            print(f"WARN: --start-from URL not in list; processing all", file=sys.stderr)

    if args.limit > 0:
        urls = urls[: args.limit]

    print(f"\n[{mode}] processing {len(urls)} URLs (delay={REQUEST_DELAY}s/request)")
    if not write:
        print("  (no DB writes; pass --write to persist)")

    db = SessionLocal()
    created = 0
    skipped_dupe = 0
    parse_failed = 0
    fetch_failed = 0
    new_plays = 0

    try:
        for i, url in enumerate(urls, 1):
            time.sleep(REQUEST_DELAY)
            html = _fetch(url, debug=args.debug)
            if not html:
                fetch_failed += 1
                print(f"  [{i}/{len(urls)}] FETCH FAIL {url}")
                continue
            parsed = parse_monologue_page(url, html)
            if not parsed:
                parse_failed += 1
                print(f"  [{i}/{len(urls)}] PARSE FAIL {url}")
                continue

            if write:
                # Track whether the play already existed (to count new plays)
                play_existed = (
                    db.query(Play).filter(Play.title.ilike(parsed.show_title)).first()
                    is not None
                )
                play = upsert_play(db, parsed)
                if not play_existed:
                    new_plays += 1
                mono = create_monologue(db, play, parsed)
                if mono is None:
                    skipped_dupe += 1
                    print(f"  [{i}/{len(urls)}] DUPE {parsed.character_name!r} / {parsed.show_title}")
                else:
                    created += 1
                    if created % 20 == 0:
                        db.commit()
                        print(f"  .. committed batch (total written: {created})")
                    print(f"  [{i}/{len(urls)}] OK {parsed.character_name!r} / {parsed.show_title} ({parsed.gender}, {parsed.playing_age})")
            else:
                # Dry-run: just print
                print(f"  [{i}/{len(urls)}] PARSED {parsed.character_name!r} / {parsed.show_title} ({parsed.gender}, {parsed.playing_age}, {len(parsed.text)} chars)")

        if write:
            db.commit()
    finally:
        db.close()

    print(f"\n{'='*60}")
    print(f"Done!")
    print(f"  URLs processed:    {len(urls)}")
    print(f"  Fetch failures:    {fetch_failed}")
    print(f"  Parse failures:    {parse_failed}")
    if write:
        print(f"  New plays:         {new_plays}")
        print(f"  Monologues saved:  {created}")
        print(f"  Duplicates:        {skipped_dupe}")

    if write and created > 0:
        print(f"\n=== Auto-segmenting {created} newly created monologues ===")
        result = subprocess.run(
            [sys.executable, "-m", "scripts.segment_monologues", "--write"],
            cwd=str(Path(__file__).resolve().parent.parent),
            check=False,
        )
        if result.returncode != 0:
            print(
                f"WARN: segment_monologues exited with code {result.returncode}; "
                "new records render via plain-text fallback until re-run.",
                file=sys.stderr,
            )


if __name__ == "__main__":
    main()
