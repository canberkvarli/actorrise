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
import io
import json
import re
from html import unescape
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
    #: index url + html -> the monologue links on that page
    discover: Callable[[str, str], list["Link"]]
    #: a link + the bytes behind it -> the speech, or a reason it is not usable
    extract: Callable[["Link", bytes], tuple[Optional["Parsed"], Optional[str]]]
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

#: Stage Partners sits behind CloudFront, which answers 403 to every User-Agent
#: that is not a browser's — the honest one below included. It is a blanket bot
#: shield, not a block aimed at us: robots.txt allows both paths this script
#: reads (/resources/ and /media/wysiwyg/PDF/).
#:
#: So the script keeps identifying itself and STOPS on a 403 rather than quietly
#: dressing up as Chrome. Presenting as a browser to a filter that is
#: deliberately excluding non-browsers is a decision about how we treat a
#: publisher we want a relationship with, and it belongs to a person, not to a
#: default value.
UA_HELP = """
  403 from the CDN. Every non-browser User-Agent gets this, including ours.

  robots.txt permits the paths this script reads, so the block is a blanket bot
  shield rather than a refusal aimed at ActorRise. Two honest ways forward:

    1. Ask them. docs/licensing/draft-stage-partners-email.md is already written;
       an allowed UA (or an outright yes to the excerpts) makes this moot.
    2. Decide to send a browser User-Agent anyway, and pass it explicitly:
         --user-agent "Mozilla/5.0 ..."

  The flag has no default on purpose. Option 2 is a choice about a publisher we
  want to be on good terms with, so the script will not make it silently.
"""


# ── Discovery and extraction ─────────────────────────────────────────────────
#
# Verified against live pages on 2026-09-17. Stage Partners does NOT put the
# speech in the HTML: the index page carries one link per monologue, and the
# speech lives in the PDF behind it. An earlier draft parsed the index directly
# and would have harvested the 30-word loglines printed under each link, which
# is exactly the StageAgent failure (191 rows, median 35 words, all synopsis).
#
# PDF shape, constant across the 25 sampled:
#
#     MONOLOGUES                      <- fixed 4-line masthead
#     This monologue is from a
#     Stage Partners play, free to read
#     in full at yourstagepartners.com.
#     TITLE by Author                 <- wraps to 2 lines when the title is long
#     ...setup paragraph, sometimes absent...
#     CHARACTER                       <- cue, alone on its line
#     ...the speech...
#     TITLE by Author                 <- masthead repeats: the speech ended here
#     Length: ... Synopsis: ...
#     (c) Stage Partners

#: The 4-line masthead, dropped before anything is parsed.
_MASTHEAD = (
    "MONOLOGUES",
    "This monologue is from a",
    "Stage Partners play, free to read",
    "in full at yourstagepartners.com.",
)

#: "TITLE by Author". Author never contains a comma on these pages; title may.
_TITLE_BY = re.compile(r"^(?P<title>.+?)\s+by\s+(?P<author>[^,]+?)\s*$")

#: First line of the trailing sell sheet, for PDFs whose masthead does not repeat.
_SPEECH_END = re.compile(r"^(Length:|Synopsis:|Cast Size:|©|\(c\))", re.I)

#: Page furniture on the multi-page PDFs: "1 of 2", "Pg. 1 of 2", "Page 2 of 2".
#: It sits at the foot of page one, i.e. in the MIDDLE of the speech, so it has
#: to be dropped rather than used as an end marker.
_PAGE_FURNITURE = re.compile(r"^(pg\.?|page)?\s*\d+\s+of\s+\d+$", re.I)

#: An ellipsis alone on a line: the publisher's marker for a cut in the speech.
_ELLIPSIS_ONLY = re.compile(r"^[\u2026.\s]{1,6}$")

#: A final paragraph that is nothing but an exit/blackout direction. Anchored to
#: the whole string so a direction embedded in the speech is untouched.
_EXIT_DIRECTION = re.compile(
    r"^\((?=[^)]*\b(exits?|exeunt|exit\s|blackout|lights?\s+(down|out|fade)|"
    r"end\s+of\s+(scene|play)|curtain)\b)[^)]*\)[.]?$",
    re.I,
)

#: A title may arrive as "TUCK EVERLASTING adapted by Mark Frattaroli". The verb
#: belongs to the attribution, not to the title.
_ADAPT_TAIL = re.compile(r"\s+(adapted|translated|dramati[sz]ed)$", re.I)

_PDF_LINK = re.compile(
    r'<a[^>]*?href="(?P<href>[^"]*?/media/wysiwyg/PDF/[^"]*?\.pdf)"[^>]*>(?P<inner>.*?)</a>',
    re.I | re.S,
)
_TITLE_ATTR = re.compile(r'title="([^"]+)"', re.I)


@dataclass
class Link:
    """One monologue found on an index page, before its text has been fetched."""
    url: str
    character_name: str
    label: str


def discover_pdf_links(url: str, html: str) -> list[Link]:
    """Index page -> one :class:`Link` per monologue PDF.

    The link's ``title`` attribute reads "Character, TITLE by Author". Only the
    character is taken from it; title and author are read from the PDF itself,
    which is the publisher's own statement of them rather than a page label.
    """
    out: list[Link] = []
    seen: set[str] = set()
    for m in _PDF_LINK.finditer(html):
        href = unescape(m.group("href"))
        if href in seen:
            continue
        attr = _TITLE_ATTR.search(m.group(0))
        label = unescape(attr.group(1)).strip() if attr else ""
        if not label:
            label = unescape(re.sub(r"(?s)<[^>]+>", "", m.group("inner"))).strip()
        if "," not in label:
            continue
        character = label.split(",", 1)[0].strip()
        if not character or len(character) > 60:
            continue
        seen.add(href)
        out.append(Link(url=href, character_name=character, label=label))
    return out


def _pdf_lines(blob: bytes) -> list[tuple[str, float]]:
    """``(text, gap_above)`` for every line in the PDF, gap in points.

    The gap is what tells a wrapped line from a new paragraph. A plain text
    extract cannot: every line arrives looking the same, and treating each one as
    its own paragraph turns a flowing speech into two dozen one-line stubs, which
    is exactly the shape `has_flattened_scene` exists to reject. The corpus agrees
    with the gate here: 97% of stored monologues are a single prose paragraph.
    """
    import pdfplumber

    rows: list[tuple[str, float]] = []
    with pdfplumber.open(io.BytesIO(blob)) as pdf:
        for page in pdf.pages:
            previous_bottom = None
            for ln in page.extract_text_lines() or []:
                text = ln["text"].strip()
                if not text:
                    continue
                gap = 0.0 if previous_bottom is None else float(ln["top"]) - previous_bottom
                previous_bottom = float(ln["bottom"])
                rows.append((text, gap))
    return rows


def extract_speech(link: Link, blob: bytes) -> tuple[Optional[Parsed], Optional[str]]:
    """PDF bytes -> ``(Parsed, None)`` or ``(None, reason)``."""
    rows = [r for r in _pdf_lines(blob) if r[0] not in _MASTHEAD]
    if not rows:
        return None, "empty_pdf"

    # Title block: accumulate lines until one carries the " by " split, because a
    # long title wraps and leaves "by Author" on the line beneath.
    match = None
    title_index = None
    buf: list[str] = []
    for i, (text, _) in enumerate(rows[:8]):
        buf.append(text)
        if re.search(r"\bby\b", text):
            match = _TITLE_BY.match(" ".join(buf))
            if match:
                title_index = i
                break
    if title_index is None or match is None:
        return None, "no_title_line"
    play_title = _ADAPT_TAIL.sub("", match.group("title").strip()).strip()
    author = match.group("author").strip()
    masthead_head = buf[0]

    # The cue is the line that IS the character's name. Matching the name from
    # the link rather than guessing "first all-caps line" is what handles the
    # PDFs that open on another character's bracketed cue.
    wanted = link.character_name.casefold()
    cue_index = None
    for i in range(title_index + 1, len(rows)):
        text = rows[i][0]
        if len(text) < 60 and text.casefold().rstrip(":").strip() == wanted:
            cue_index = i
            break
    if cue_index is None:
        return None, "no_character_cue"

    # The masthead repeats at the foot to mark the end of the speech, but it is
    # not always broken the same way it was at the top: a long title wraps over
    # two lines in the header and fits on one in the footer. An equality test
    # misses that, and the sell sheet is then read as the last line of the
    # monologue — which is what `truncated_end` was reporting on 11 of 20.
    # Matching on the title does not work: the footer is free to shorten it.
    # "GAME NIGHT (HUMANS ONLY, PLEASE)" in the header comes back as plain
    # "GAME NIGHT by Laura Neill" at the foot, so a title test misses the repeat
    # and the masthead is read as the speech's last line — which is what both
    # `truncated_end` (10 of 20) and `caps_residue` (8 of 20) were really
    # reporting. The author is the stable half of that line, so match on it.
    _BY_AUTHOR = re.compile(
        r"\bby\s+" + re.escape(author) + r"\s*$", re.I
    )

    def _is_masthead_repeat(text: str) -> bool:
        return (
            text.startswith(masthead_head)
            or masthead_head.startswith(text)
            or bool(_BY_AUTHOR.search(text))
        )

    end_index = len(rows)
    for i in range(cue_index + 1, len(rows)):
        text = rows[i][0]
        if _is_masthead_repeat(text) or _SPEECH_END.match(text):
            end_index = i
            break

    body = [r for r in rows[cue_index + 1:end_index]
            if not _PAGE_FURNITURE.match(r[0])]

    # Stage Partners prints an ellipsis alone on a line to mark a cut inside the
    # speech. A trailing one means the excerpt simply stops, which the gate reads
    # as `truncated_end` - correctly, but the marker is presentation, not text.
    while body and _ELLIPSIS_ONLY.match(body[-1][0]):
        body.pop()
    if not body:
        return None, "empty_speech"

    # Paragraph breaks come from the vertical gaps, not from line ends. Anything
    # noticeably looser than this PDF's own leading is a real break; everything
    # else is a wrapped line and is joined back into flowing prose.
    gaps = sorted(g for _, g in body[1:] if g > 0)
    leading = gaps[len(gaps) // 2] if gaps else 0.0
    threshold = leading * 1.6 if leading else 0.0

    paragraphs: list[str] = []
    current: list[str] = [body[0][0]]
    for text, gap in body[1:]:
        if threshold and gap > threshold:
            paragraphs.append(" ".join(current))
            current = [text]
        else:
            current.append(text)
    paragraphs.append(" ".join(current))
    paragraphs = [para.strip() for para in paragraphs if para.strip()]

    # A speech that ends "(Exit SISTER and ASSISTANT.)" ends on the play's stage
    # management, not on the actor's last beat, and the other names in it read to
    # the quality gate as a second speaker. Only a WHOLLY parenthesised final
    # paragraph using exit vocabulary is dropped; a closing direction that plays,
    # like "(Darkly:)", is kept because the actor performs it.
    while paragraphs and _EXIT_DIRECTION.match(paragraphs[-1]):
        paragraphs.pop()

    speech = "\n\n".join(paragraphs)
    if not speech:
        return None, "empty_speech"

    return Parsed(
        url=link.url,
        play_title=play_title,
        author=author,
        character_name=link.character_name,
        text=speech,
    ), None


SOURCES: dict[str, Source] = {
    "stage_partners": Source(
        key="stage_partners",
        name="Stage Partners",
        index_urls=[
            "https://www.yourstagepartners.com/resources/free-monologues/monologues-for-women",
            "https://www.yourstagepartners.com/resources/free-monologues/monologues-for-men",
            "https://www.yourstagepartners.com/resources/free-monologues/monologues-for-non-binary-actors",
        ],
        discover=discover_pdf_links,
        extract=extract_speech,
        note=(
            "Publisher's own free-monologue PDFs. VERIFIED 2026-09-17 against 25 "
            "live files: the whole speech is present, 156-560 words, never "
            "truncated. robots.txt allows /resources/ and /media/wysiwyg/PDF/. "
            "They ask for a credit: play, playwright, publisher."
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
    ap.add_argument("--limit", type=int, default=0,
                    help="Only read the first N index pages")
    ap.add_argument("--max-items", type=int, default=0,
                    help="Only fetch the first N monologue PDFs")
    ap.add_argument("--user-agent", default="",
                    help="Override the User-Agent. See UA_HELP; this is a "
                         "deliberate choice, not a default.")
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

    session = requests.Session()
    headers = dict(HEADERS)
    if args.user_agent:
        headers["User-Agent"] = args.user_agent

    def fetch(url: str) -> tuple[Optional[bytes], Optional[str]]:
        time.sleep(source.delay)
        try:
            resp = session.get(url, headers=headers, timeout=TIMEOUT)
        except Exception as e:
            return None, f"{type(e).__name__}: {e}"
        if resp.status_code != 200:
            return None, f"HTTP {resp.status_code}"
        return resp.content, None

    urls = source.index_urls[: args.limit] if args.limit else source.index_urls

    links: list[Link] = []
    index_failed = 0
    for i, url in enumerate(urls, 1):
        blob, err = fetch(url)
        if blob is None:
            index_failed += 1
            print(f"  [{i}/{len(urls)}] INDEX FAIL {err}  {url}")
            if err == "HTTP 403":
                print(UA_HELP, file=sys.stderr)
                sys.exit(4)
            continue
        found = source.discover(url, blob.decode("utf-8", "replace"))
        print(f"  [{i}/{len(urls)}] {len(found):3d} links  {url}")
        if not found:
            index_failed += 1
        links.extend(found)

    # The same speech is listed on more than one index page (a piece filed under
    # both drama and comedy), at a different PDF url each time. Dedupe on the
    # play-and-character pair, not on the url, or find_duplicate does the work
    # later at the cost of a fetch and an embedding each.
    seen_pairs: set[tuple[str, str]] = set()
    unique: list[Link] = []
    for link in links:
        key = (link.character_name.casefold(), link.label.casefold())
        if key in seen_pairs:
            continue
        seen_pairs.add(key)
        unique.append(link)
    listed_twice = len(links) - len(unique)
    if args.max_items:
        unique = unique[: args.max_items]

    print(f"\n  {len(unique)} monologues to fetch"
          f"{f' ({listed_twice} listed twice)' if listed_twice else ''}\n")

    rows: list[Row] = []
    parsed_by_url: dict[str, Parsed] = {}
    fetch_failed = 0
    extract_failed: dict[str, int] = {}

    for i, link in enumerate(unique, 1):
        blob, err = fetch(link.url)
        if blob is None:
            fetch_failed += 1
            if args.debug:
                print(f"  [{i}/{len(unique)}] FETCH FAIL {err}  {link.url}")
            continue
        parsed, reason = source.extract(link, blob)
        if parsed is None:
            extract_failed[reason or "unknown"] = extract_failed.get(reason or "unknown", 0) + 1
            if args.debug:
                print(f"  [{i}/{len(unique)}] EXTRACT FAIL {reason}  {link.label}")
            continue
        parsed_by_url[parsed.url] = parsed
        rows.append(evaluate(parsed, years))

    kept = [r for r in rows if r.ok]
    rejected = [r for r in rows if not r.ok]
    contemporary = [r for r in kept if r.category == "contemporary"]

    print(f"\n{'='*60}")
    print(f"  index pages:      {len(urls)} ({index_failed} failed)")
    print(f"  monologues found: {len(unique)}")
    print(f"  fetch failures:   {fetch_failed}")
    print(f"  extract failures: {sum(extract_failed.values())}")
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
    for reason, n in sorted(extract_failed.items(), key=lambda kv: -kv[1]):
        print(f"    extract:{reason:14s} {n}")

    for r in kept[:5]:
        print(
            f"\n  {r.character_name} — {r.play_title} ({r.author})\n"
            f"    words={r.word_count} year_written={r.year_written} "
            f"category={r.category}\n"
            f"    {r.copyright_status}/{r.license_type}\n"
            f"    {r.credit}"
        )

    if not write:
        return

    from app.core.database import SessionLocal
    from app.services.data_ingestion.pipeline import ingest_monologue
    # The same pair every working ingest path uses. `embed` is a BATCH callable:
    # it is handed a list plus keyword model/dimensions, so a single-text
    # embedder is not a drop-in here.
    from app.services.ai.content_analyzer import ContentAnalyzer
    from app.services.ai.langchain.embeddings import generate_embeddings_batch

    analyzer = ContentAnalyzer()
    db = SessionLocal()
    inserted = refused = 0
    outcomes: dict[str, int] = {}
    try:
        for row in kept:
            parsed = parsed_by_url[row.source_url]
            report = ingest_monologue(
                db,
                play_title=parsed.play_title,
                author=parsed.author,
                character=parsed.character_name,
                text=parsed.text,
                copyright_status=COPYRIGHT_STATUS,
                license_type=LICENSE_TYPE,
                source_url=parsed.url,
                year_written=row.year_written,
                category=row.category,
                min_words=MIN_WORDS,
                max_words=MAX_WORDS,
                apply=True,
                analyzer=analyzer,
                embed=generate_embeddings_batch,
            )
            if report.inserted:
                inserted += report.inserted
            else:
                refused += 1
                why = report.refused or (
                    "duplicate" if report.duplicates else
                    "seen_before" if report.already_rejected else
                    next(iter(report.rejected), "unknown")
                )
                outcomes[why] = outcomes.get(why, 0) + 1
    finally:
        db.close()

    print(f"\n  inserted: {inserted}")
    print(f"  not inserted: {refused}")
    for why, n in sorted(outcomes.items(), key=lambda kv: -kv[1]):
        print(f"    {why:30s} {n}")


if __name__ == "__main__":
    main()
