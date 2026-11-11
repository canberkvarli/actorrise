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

#: The corpus-wide floor (`monologue_quality.DEFAULT_MIN_WORDS`, 100 words). It
#: was 150 here, on the idea that a stage piece wants 60 to 90 seconds, but
#: actors ask for one-minute pieces by name and Daily Actor files dozens of them:
#: 150 threw away 38 of its 182 stage pieces. Film and TV already use 100.
MIN_WORDS = 100

#: Ceiling is NOT a local number. It is the fair-use bound from the licensing
#: module, so the legal ceiling and the extraction ceiling cannot drift apart.
MAX_WORDS = EXCERPT_MAX_WORDS

#: US works published before this year are public domain.
PUBLIC_DOMAIN_BEFORE = 1928

CREDIT_TEMPLATE ="{title} by {author}. Excerpt. Full play at {source_url}"


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
    #: `plays.genre`. A musical's book scene is `musical`, so a filter can find it.
    genre: str = "drama"
    #: A year the SOURCE dates for this one piece (the writer's own dated post,
    #: the copyright line on the piece). Used only when the title is not in the
    #: years file. It exists for standalone monologues with generic titles
    #: ("The Gift", "Sorry"): keying those in the title-only years file would hand
    #: their year to any later play that shares the name, the H-20 failure.
    year: Optional[int] = None

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


# ── Daily Actor ──────────────────────────────────────────────────────────────
#
# dailyactor.com/monologues/<slug>/ — one speech per page, in the clear, with a
# details box above it. Verified 2026-11-05 against the live page markup:
#
#     <div class="details ..."><h3>...'Other Desert Cities' by Jon Robin Baitz</h3>
#       <p><strong>From</strong>: <span>Play</span></p>        Play|Musical|Movie|TV
#       <p><strong>Character</strong>: <span>Trip Wyeth, a bright...</span></p>
#       ... <a href="http://amzn.to/...">Buy the Play</a> ...
#     </div>
#     <div class="entry-content ..."><p><strong>Trip</strong>: You know...</p>...
#
# 397 pages, listed in monologues-sitemap.xml. About half are film and TV, which
# this script never takes (no screen text on a public page, a standing rule).
# robots.txt allows /monologues/ HTML and disallows only the PDFs, which we do
# not read.

_DA_SITEMAP = "https://www.dailyactor.com/monologues-sitemap.xml"
_DA_LOC = re.compile(r"<loc>(https://www\.dailyactor\.com/monologues/[^<]+)</loc>")
_DA_DETAILS = re.compile(r'<div class="details[^"]*"[^>]*>(?P<box>.*?)</div>', re.S)
_DA_HEAD = re.compile(r"<h3[^>]*>(?P<h>.*?)</h3>", re.S)
_DA_FIELD = re.compile(
    r"<strong[^>]*>\s*(?P<k>[A-Za-z ]+?)\s*</strong>\s*:\s*<span[^>]*>(?P<v>.*?)</span>", re.S
)
_DA_BODY = re.compile(r'<div class="entry-content[^"]*"[^>]*>(?P<body>.*?)(<div id=.jp-relatedposts|</div>)', re.S)
_DA_BY = re.compile(r"^[\"'‘’“”]?(?P<title>.+?)[\"'‘’“”]?\s+by\s+(?P<author>.+?)\s*$")
_DA_STAGE = {"play": "drama", "musical": "musical"}


def _strip_tags(s: str) -> str:
    s = re.sub(r"<br\s*/?>", "\n", s, flags=re.I)
    return unescape(re.sub(r"<[^>]+>", "", s)).replace("\xa0", " ").strip()


#: Typos on the source page, corrected to the published title.
_DA_TITLE_FIXES = {"Pterodactylcs": "Pterodactyls"}

_SMALL_WORDS = {"a", "an", "and", "the", "of", "in", "on", "at", "to", "for", "or", "by"}


def _da_title(title: str) -> str:
    """'FENCES' -> 'Fences', '9 TO 5: THE MUSICAL' -> '9 to 5: The Musical'.

    Only an all-caps title is recased; 'Doubt: A Parable' is left alone, so the
    play matches the row other sources already filed it under.
    """
    # "Mean Girls, The Musical", "HAIRSPRAY the MUSICAL", "Footloose: The Musical":
    # the genre column already says musical, and one show should be one play row.
    title = re.sub(r"[\s,:]+the\s+musical\s*$", "", title, flags=re.I).strip()
    title = _DA_TITLE_FIXES.get(title, title)
    if title != title.upper():
        return title
    words = title.lower().split()
    out = [
        w if (i and w in _SMALL_WORDS and not words[i - 1].endswith(":")) else w[:1].upper() + w[1:]
        for i, w in enumerate(words)
    ]
    return " ".join(out)


def _spoken_words(text: str) -> int:
    return len(strip_artifacts(to_display_text(text)).split())


def fit_excerpt(paras: list[str], max_words: int = MAX_WORDS) -> list[str]:
    """Cut a speech that runs past the excerpt ceiling, at a clean place.

    Whole paragraphs come off the end first; if the last one kept still runs
    over, it is cut after its last sentence that fits. The words are measured
    exactly as `evaluate` measures them, so a cut piece always clears the
    ceiling. A speech already under it is returned untouched.
    """
    kept = list(paras)
    while kept and _spoken_words("\n\n".join(kept)) > max_words:
        if len(kept) > 1 and _spoken_words("\n\n".join(kept[:-1])) >= MIN_WORDS:
            kept.pop()
            continue
        sentences = re.split(r"(?<=[.!?…])\s+", kept[-1])
        while len(sentences) > 1 and _spoken_words("\n\n".join(kept[:-1] + [" ".join(sentences)])) > max_words:
            sentences.pop()
        kept[-1] = " ".join(sentences)
        break
    return kept


def discover_dailyactor(url: str, html: str) -> list[Link]:
    """Every monologue page in the sitemap. Labels are slugs; the page has the rest."""
    return [
        Link(url=u, character_name="", label=u.rstrip("/").rsplit("/", 1)[-1])
        for u in dict.fromkeys(_DA_LOC.findall(html))
    ]


def extract_dailyactor(link: Link, blob: bytes) -> tuple[Optional[Parsed], Optional[str]]:
    html = blob.decode("utf-8", "replace")
    box = _DA_DETAILS.search(html)
    if not box:
        return None, "no_details_box"
    fields = {
        m.group("k").strip().lower(): _strip_tags(m.group("v"))
        for m in _DA_FIELD.finditer(box.group("box"))
    }
    medium = fields.get("from", "").strip().lower()
    if medium not in _DA_STAGE:
        # Movie and TV are skipped by rule, not by accident.
        return None, f"not_stage:{medium or 'unknown'}"

    head = _DA_HEAD.search(box.group("box"))
    by = _DA_BY.match(_strip_tags(head.group("h"))) if head else None
    if not by:
        return None, "no_title_by_author"
    title = _da_title(by.group("title").strip(" '\"‘’“”"))
    # "Patricia Resnick. Music & Lyrics by Dolly Parton", "Michael Frayn (Adapted
    # from Anton Chekov's earlier play)": the writer is the part before the note.
    author = re.split(r"\.\s+Music|\s+\(", by.group("author"))[0].strip()

    body = _DA_BODY.search(html)
    if not body:
        return None, "no_body"
    paras = [
        _strip_tags(p)
        for p in re.findall(r"<p[^>]*>(.*?)</p>", body.group("body"), re.S)
    ]
    paras = [p for p in paras if p]
    # Site notes after the speech: "For more information on Reina Hardy and the
    # play, click here", "*From the Play ...", "**Both Male and Female can play".
    while paras and re.match(r"^(\*|for more information|click here)", paras[-1], re.I):
        paras.pop()
    if not paras:
        return None, "no_body"

    # The speech opens "<strong>Trip</strong>: You know..." — that cue is the
    # character as the script names them. Fall back to the details box, whose
    # value reads "Trip Wyeth, a bright, funny, TV producer".
    cue = re.match(r"^(?P<cue>[A-Z][\w .'\-]{0,40}?)\s*:\s+(?P<rest>.+)$", paras[0], re.S)
    character = ""
    if cue:
        character = cue.group("cue").strip()
        paras[0] = cue.group("rest").strip()
    if not character:
        character = fields.get("character", "").split(",")[0].strip()
    if not character:
        # Annie Wood's standalone pieces name nobody; the page still gives a gender.
        character = {"female": "Woman", "male": "Man"}.get(fields.get("gender", "").lower(), "")
    if not character:
        return None, "no_character"

    # A page that runs into a second speaker is a scene, not a monologue.
    for p in paras[1:]:
        other = re.match(r"^([A-Z][\w .'\-]{0,40}?)\s*:\s+", p)
        if other and other.group(1).strip().casefold() != character.casefold():
            return None, "two_speakers"

    # The page's "Buy the Play" link is Daily Actor's own Amazon affiliate link,
    # so it is not stored: the credit points at the page that carries it.
    return Parsed(
        url=link.url,
        play_title=title,
        author=author,
        character_name=character.title() if character.isupper() else character,
        text="\n\n".join(fit_excerpt(paras)),
        genre=_DA_STAGE[medium],
    ), None


# ── YouthPLAYS ───────────────────────────────────────────────────────────────
#
# youthplays.com/monologue/<slug>-<id> — about 110 free monologues from the
# publisher's own plays, nearly all teen and youth characters. Verified
# 2026-11-05:
#
#     <h3>Billy</h3>
#     <h4>from <i><a href="/play/...">Kid Turboni Brings the Rain</a></i> by <a>Mark J. Costello</a></h4>
#     <p><b>Genre:</b> Comedy, Dramedy</p>
#     ...<div class="col-md-6 ...">  setup paragraph, a "(Warning: ... used as
#        directed by YouthPLAYS ...)" paragraph, then the cue alone and centred:
#        <p style="text-align: center;"><strong>BILLY</strong></p>, then the speech,
#        ending at <div style="margin-top:30px;..."> (the mailing-list button).
#
# robots.txt: "Allow: /", with /admin/, /musical-score/ and the client login
# disallowed, none of which this reads.

_YP_INDEX = "https://www.youthplays.com/monologues.php"
_YP_LINK = re.compile(r'href="(/monologue/[^"]+)"')
_YP_H3 = re.compile(r"<h3>(?P<c>.*?)</h3>\s*<h4>\s*from\s*<i>(?P<t>.*?)</i>\s*by\s*(?P<a>.*?)</h4>", re.S)
_YP_GENRE = re.compile(r"<b>Genre:</b>(?P<g>.*?)</p>", re.S)
_YP_BODY = re.compile(
    r'<div class="row" style="background:#fff;[^"]*">\s*<div class="col[^"]*">(?P<body>.*?)<div style="margin-top:30px',
    re.S,
)


_YP_EDITION = re.compile(r"\s*\((full-length|one-act|the musical)( version)?\)\s*$", re.I)


def discover_youthplays(url: str, html: str) -> list[Link]:
    return [
        Link(url="https://www.youthplays.com" + href, character_name="", label=href.rsplit("/", 1)[-1])
        for href in dict.fromkeys(_YP_LINK.findall(html))
    ]


def extract_youthplays(link: Link, blob: bytes) -> tuple[Optional[Parsed], Optional[str]]:
    html = blob.decode("utf-8", "replace")
    head = _YP_H3.search(html)
    body = _YP_BODY.search(html)
    if not head or not body:
        return None, "unexpected_markup"
    character = _strip_tags(head.group("c"))
    # "Alice 5" is the fifth Alice monologue on the site, not her name.
    character = re.sub(r"\s+(\d+|\(\d+\))$", "", character)
    title, author = _strip_tags(head.group("t")), _strip_tags(head.group("a"))
    # One play, two editions: "Love (Awkwardly) (full-length version)".
    title = _YP_EDITION.sub("", title).strip()

    # Pages are hand-made in a WYSIWYG editor: paragraphs arrive as <p> or
    # <div>, and inside one the cue is often split off by a <br>. So lines are
    # found at every break (to find the cue), but kept grouped by paragraph.
    lines: list[tuple[int, str]] = []
    for b, block in enumerate(re.split(r"</p>|</div>", body.group("body"), flags=re.I)):
        for line in re.split(r"<br\s*/?>", block, flags=re.I):
            line = re.sub(r"[ \t\xa0\n]+", " ", _strip_tags(line)).strip()
            if line:
                lines.append((b, line))

    def is_cue(line: str) -> bool:
        return line.isupper() and len(line) <= 40 and not line.startswith("(")

    # The speech starts after the cue: the character's name in capitals, alone.
    # Everything above it is setup and the usage warning.
    start = next((i + 1 for i, (_, line) in enumerate(lines) if is_cue(line)), None)
    if start is None or start >= len(lines):
        return None, "no_cue"
    if any(is_cue(line) for _, line in lines[start:]):
        return None, "two_speakers"

    speech: list[str] = []
    last_block = None
    for b, line in lines[start:]:
        direction_only = line.startswith("(") and line.endswith((")", ".)"))
        if speech and (b == last_block or direction_only):
            # Same paragraph, or a lone "(Beat.)": it belongs with what precedes it.
            speech[-1] = f"{speech[-1]} {line}"
        else:
            speech.append(line)
        last_block = b

    genre_m = _YP_GENRE.search(html)
    genre = _strip_tags(genre_m.group("g")).split(",")[0].strip().lower() if genre_m else "drama"
    return Parsed(
        url=link.url,
        play_title=title,
        author=author,
        character_name=character.title() if character.isupper() else character,
        text="\n\n".join(fit_excerpt(speech)),
        genre={"dramedy": "comedy"}.get(genre, genre or "drama"),
    ), None


# ── NYCastings ───────────────────────────────────────────────────────────────
#
# nycastings.com/<play>-<age>-<gender>-<genre>/ — one speech per post, from the
# "play monologues" and "musical monologues" categories (about 160 posts).
# Verified 2026-11-05:
#
#     <div class="entry-content-text" itemprop="text">
#       <p><strong>"First line..." From the play, "Pretty Theft." In this
#          monologue ... Ideal for Teen Females – 1-3 Minutes.</strong></p>
#       <p>By: Adam Szymkowicz</p>
#       <div>ALLEGRA:<br/> And I'm working at this ...</div>
#       <div>fun. She was supposed to ...</div>        <- hard-wrapped lines
#       <div></div>                                    <- the paragraph break
#       ...
#       <p>————————<br/> Link to full play here: <a href="...">...</a></p>
#
# robots.txt disallows only account and legacy .asp paths.

_NYC_INDEX = [
    f"https://www.nycastings.com/category/monologues/{cat}/" + (f"page/{n}/" if n > 1 else "")
    for cat, pages in (("play-monologues", 6), ("musical-monologues", 3))
    for n in range(1, pages + 1)
]
_NYC_LINK = re.compile(r'href="(https://www\.nycastings\.com/[a-z0-9\-]+/)"')
_NYC_POST = re.compile(r"-(male|female|unisex)-|monologue", re.I)
_NYC_BODY = re.compile(r'<div class="entry-content-text"[^>]*>(?P<body>.*?)<div class=.entry-tag-cat', re.S)
_NYC_FROM = re.compile(
    r"From\s+(?:the\s+(?P<kind>play|musical|show)\s*,?\s*)?[\"“”‘'](?P<t>.+?)[.,]?[\"”’'](?!\w)", re.I
)
#: The site's slips, corrected to the published credit.
_NYC_AUTHOR_FIXES = {
    "Adam SzymkowiczA": "Adam Szymkowicz",
    "George Kaufman and Moss Heart": "George S. Kaufman and Moss Hart",
}
_NYC_TITLE_FIXES = {"Good Morning, Good Night!": "Good Morning, Good Night", "ubu": "Ubu"}
_NYC_BY = re.compile(r"^\s*(?:By|Written by)\s*:?\s*(?P<a>.+?)\s*$", re.I)
#: "...Came to Dinner." by George Kaufman and Moss Heart. — the credit in the intro.
_NYC_INLINE_BY = re.compile(r"[\"”]\.?\s*by\s+(?P<a>[A-Z][^.]+?)\.")
#: "ALLEGRA: And I'm..." or "THE PHOTOGRAPHER" alone on its line.
_NYC_CUE = re.compile(r"^(?P<cue>[A-Z][A-Z0-9 .'\-]{0,30}?)(?::\s*(?P<rest>.*)|\s*)$")


def discover_nycastings(url: str, html: str) -> list[Link]:
    return [
        Link(url=u, character_name="", label=u.rstrip("/").rsplit("/", 1)[-1])
        for u in dict.fromkeys(_NYC_LINK.findall(html))
        if _NYC_POST.search(u.rstrip("/").rsplit("/", 1)[-1])
    ]


def extract_nycastings(link: Link, blob: bytes) -> tuple[Optional[Parsed], Optional[str]]:
    html = blob.decode("utf-8", "replace")
    body = _NYC_BODY.search(html)
    if not body:
        return None, "unexpected_markup"
    html_body = re.sub(r"<div class='mailmunch[^>]*></div>", "", body.group("body"))

    # Blocks are <p> and <div>; an EMPTY block is a paragraph break, and lines
    # inside one paragraph were hard-wrapped by whoever pasted the text in.
    lines: list[str] = []
    for block in re.split(r"</p>|</div>", html_body, flags=re.I):
        for piece in re.split(r"<br\s*/?>", block, flags=re.I):
            lines.append(re.sub(r"[ \t\xa0\n]+", " ", _strip_tags(piece)).strip())

    intro = next((ln for ln in lines if _NYC_FROM.search(ln)), "")
    m = _NYC_FROM.search(intro)
    if not m:
        return None, "no_title"
    title = m.group("t").strip()
    kind = (m.group("kind") or ("musical" if "musical" in intro.lower() else "play")).lower()
    author = next((_NYC_BY.match(ln).group("a") for ln in lines if _NYC_BY.match(ln)), "")
    if not author:
        inline = _NYC_INLINE_BY.search(intro)
        author = inline.group("a").strip() if inline else ""
    if not author:
        return None, "no_author"
    author = _NYC_AUTHOR_FIXES.get(author.strip(), author.strip())
    title = _da_title(_NYC_TITLE_FIXES.get(title, title))

    # The cue comes after the intro, never inside it.
    after = lines.index(intro) + 1
    start = next((i for i in range(after, len(lines)) if _NYC_CUE.match(lines[i])), None)
    if start is None:
        return None, "no_cue"
    cue = _NYC_CUE.match(lines[start])
    character = cue.group("cue").strip()
    body_lines = [cue.group("rest") or ""] + lines[start + 1:]

    paras: list[str] = []
    current: list[str] = []
    for ln in body_lines:
        if re.match(r"^[—\-_=]{6,}", ln) or ln.lower().startswith("link to full"):
            break
        other = _NYC_CUE.match(ln)
        # Only "NAME: words" is a second speaker; a short all-caps line alone
        # can be a shout inside the speech.
        if other and other.group("rest") is not None and other.group("cue").strip() != character:
            return None, "two_speakers"
        if not ln:
            if current:
                paras.append(" ".join(current))
                current = []
            continue
        current.append(ln)
    if current:
        paras.append(" ".join(current))
    paras = [p for p in paras if p]
    if not paras:
        return None, "no_body"

    return Parsed(
        url=link.url,
        play_title=title,
        author=author,
        character_name=character.title(),
        text="\n\n".join(fit_excerpt(paras)),
        genre="musical" if kind == "musical" else "drama",
    ), None


# ── Adam Szymkowicz's blog ───────────────────────────────────────────────────
#
# aszym.blogspot.com "Monologues for Women" / "Monologues for Men": the
# playwright's own collection from his plays, posted for actors ("Yes you have
# my permission to do any of these monologues in class or in competition"),
# updated 2026-03-16. About 20,000 words on the women's page. robots.txt allows
# it. (His Squarespace site blocks AI crawlers; this blog does not, and it is
# the page he points actors to.) Verified 2026-11-05:
#
#     <span style="font-size: large;"><b><a href="https://...publisher.../">THE SEX WRITER</a></b></span>
#     <div>1.</div> <div>JANE</div> <div><p>Thank you, Jacob, but ...</p><p>...</p></div>
#     <div>2.</div> <div>JANE</div> ...
#
# One page carries many speeches, so discovery emits one link per speech,
# "<page>#<n>", and extraction parses the page and returns the nth.

SZ_AUTHOR = "Adam Szymkowicz"
_SZ_PAGES = [
    "https://aszym.blogspot.com/2014/11/monologues-for-women.html",
    "https://aszym.blogspot.com/2014/11/monologues-for-men.html",
]
_SZ_BODY = re.compile(r"class=.post-body entry-content[^>]*>(?P<body>.*?)<div class=.post-footer", re.S)
#: Every play heading is a link to its publisher (or NPX): that, not the font,
#: is what marks a title. The large bold span sometimes wraps a whole speech.
_SZ_PLAY_LINK = re.compile(r"<a [^>]*href=\"[^\"]+\"[^>]*>(?P<t>(?:(?!</a>).){2,90}?)</a>", re.S)
_SZ_NOT_PLAYS = re.compile(r"patreon|new play exchange|books by|amazon|see also|monologues for", re.I)
_SZ_MARK = "\u0001PLAY\u0001"
_SZ_END = "\u0001END\u0001"
#: "1." / "1" alone, or leading a line: a new piece.
_SZ_NUMBER = re.compile(r"^(?P<n>\d{1,3})\.?\s*(?P<rest>.*)$")
_CUE_WORDS = r"[A-Z][A-Z.'\-]*(?: [A-Z][A-Z.'\-]*){0,3}"
#: "JANEThank you", "DEATHHi.", "MAGPIEI know": the cue glued to the speech.
_SZ_GLUED = re.compile(rf"^(?P<cue>{_CUE_WORDS}?)(?=[A-Z](?:[a-z’']|\s))(?P<rest>.+)$")
#: "JULIE Because I want...", after a number or a title.
_SZ_SPACED = re.compile(rf"^(?P<cue>{_CUE_WORDS})\s+(?P<rest>[A-Z(“\"].*)$")


def _sz_pieces(html: str) -> list[dict]:
    body = _SZ_BODY.search(html)
    if not body:
        return []

    def mark(m: re.Match) -> str:
        title = re.sub(r"\s+", " ", _strip_tags(m.group("t"))).strip()
        if _SZ_NOT_PLAYS.search(title):
            # The page's own footer links: whatever speech was open has ended.
            return f"<br/>{_SZ_END}<br/>"
        if len(title) < 3:
            return m.group(0)
        return f"<br/>{_SZ_MARK}{title}<br/>"

    marked = _SZ_PLAY_LINK.sub(mark, body.group("body"))
    lines = [
        re.sub(r"[ \t\xa0\n]+", " ", _strip_tags(raw)).strip()
        for raw in re.split(r"</p>|</div>|<br\s*/?>", marked, flags=re.I)
    ]

    pieces: list[dict] = []
    play = ""
    current: Optional[dict] = None
    expect_cue = False

    def start(character: str) -> None:
        nonlocal current, expect_cue
        current = {"play": play, "character": character.strip(), "paras": []}
        pieces.append(current)
        expect_cue = False

    for line in lines:
        if not line or re.fullmatch(r"[-—_=\s]{6,}", line):
            continue
        if line == _SZ_END:
            play, current, expect_cue = "", None, False
            continue
        if line.startswith(_SZ_MARK):
            play = re.sub(r"\s*\(from [^)]*\)\s*$", "", line[len(_SZ_MARK):], flags=re.I).strip()
            play = re.sub(r"\s+\d+$", "", play) if not play.lower().startswith("clown bar") else play
            current, expect_cue = None, True
            continue
        if not play:
            continue
        num = _SZ_NUMBER.match(line)
        if num and (not num.group("rest") or _SZ_SPACED.match(num.group("rest")) or _SZ_GLUED.match(num.group("rest"))):
            current, expect_cue = None, True
            line = num.group("rest")
            if not line:
                continue
        if line.isupper() and len(line) <= 30 and not line.startswith("("):
            start(line)
            continue
        glued = _SZ_GLUED.match(line)
        spaced = _SZ_SPACED.match(line) if expect_cue else None
        hit = glued if (glued and len(glued.group("cue").replace(" ", "")) >= 2) else spaced
        if hit and (expect_cue or current is None or glued):
            start(hit.group("cue"))
            current["paras"].append(hit.group("rest").strip())
            continue
        if current is not None:
            current["paras"].append(line)
    return [p for p in pieces if p["paras"] and p["play"]]


#: Where the blog's markup splits a word across a link or a span.
_SZ_TITLE_FIXES = {
    "Hristmas Tree Farm": "The Christmas Tree Farm",
    "Christmas Tree Farm": "The Christmas Tree Farm",
}
_SZ_CHARACTER_FIXES = {"Allegr": "Allegra"}


def discover_szymkowicz(url: str, html: str) -> list[Link]:
    return [
        Link(url=f"{url}#{i}", character_name=p["character"], label=f"{p['play']}/{p['character']}/{i}")
        for i, p in enumerate(_sz_pieces(html))
    ]


def extract_szymkowicz(link: Link, blob: bytes) -> tuple[Optional[Parsed], Optional[str]]:
    index = int(link.url.rsplit("#", 1)[1])
    pieces = _sz_pieces(blob.decode("utf-8", "replace"))
    if index >= len(pieces):
        return None, "piece_missing"
    p = pieces[index]
    title = _da_title(p["play"])
    title = _SZ_TITLE_FIXES.get(title, title)
    character = re.sub(r"^\d+\.\s*|[.:,]+$", "", p["character"]).strip().title()
    character = _SZ_CHARACTER_FIXES.get(character, character)
    if character.lower().startswith("monologues for"):
        return None, "no_character"
    return Parsed(
        url=link.url,
        play_title=title,
        author=SZ_AUTHOR,
        character_name=character,
        text="\n\n".join(fit_excerpt(p["paras"])),
    ), None


# ── Jonathan Dorf ────────────────────────────────────────────────────────────
#
# jonathandorf.com/free-monologue/<slug>/ — 50 pieces from his plays, 37 of them
# teen, "free for auditions and classwork". robots.txt allows the public site and
# names ClaudeBot only to allow it ("AI crawlers. Allowed on the public site, kept
# out of the admin."). Verified 2026-11-06:
#
#     <h1>Achilles</h1> <p><span>Teen</span> <span>Any Gender</span></p>
#     <a class="source-play" ...><span class="source-play-title">Thank You for ...&nbsp;<span>→</span></span></a>
#     <div class="script-page"><p><strong><em>(Note: ...)</em></strong></p>
#       <p><strong>ACHILLES</strong></p><p>That's how it goes ...</p>
#       <p><strong><em>(Beat.)</em></strong></p> ...</div>

_JD_INDEX = "https://www.jonathandorf.com/free-scenes-and-monologues/free-monologues/"
_JD_LINK = re.compile(r'href="(https://(?:www\.)?jonathandorf\.com/free-monologue/[^"]+)"')
_JD_PLAY = re.compile(r'<span class="source-play-title">(?P<t>.*?)<span class="source-play-arrow"', re.S)
_JD_BODY = re.compile(r'<div class="script-page">(?P<body>.*?)</div>', re.S)


def discover_dorf(url: str, html: str) -> list[Link]:
    return [
        Link(url=u, character_name="", label=u.rstrip("/").rsplit("/", 1)[-1])
        for u in dict.fromkeys(_JD_LINK.findall(html))
    ]


def extract_dorf(link: Link, blob: bytes) -> tuple[Optional[Parsed], Optional[str]]:
    html = blob.decode("utf-8", "replace")
    play = _JD_PLAY.search(html)
    body = _JD_BODY.search(html)
    if not play or not body:
        return None, "unexpected_markup"
    title = _YP_EDITION.sub("", re.sub(r"\s+", " ", _strip_tags(play.group("t")))).strip()

    lines = [
        re.sub(r"[ \t\xa0\n]+", " ", _strip_tags(p)).strip()
        for p in re.split(r"</p>|<br\s*/?>", body.group("body"), flags=re.I)
    ]
    lines = [ln for ln in lines if ln]

    def is_cue(ln: str) -> bool:
        return ln.isupper() and len(ln) <= 40 and not ln.startswith("(")

    start = next((i for i, ln in enumerate(lines) if is_cue(ln)), None)
    if start is None:
        return None, "no_cue"
    character = lines[start]
    speech: list[str] = []
    for ln in lines[start + 1:]:
        if is_cue(ln):
            return None, "two_speakers"
        if speech and ln.startswith("(") and ln.endswith(")"):
            speech[-1] = f"{speech[-1]} {ln}"  # a lone "(Beat.)" stays with its line
        else:
            speech.append(ln)
    if not speech:
        return None, "no_body"
    return Parsed(
        url=link.url,
        play_title=title,
        author="Jonathan Dorf",
        character_name=character.title(),
        text="\n\n".join(fit_excerpt(speech)),
    ), None


# ── Reina Hardy ──────────────────────────────────────────────────────────────
#
# reinahardy.com/free-monologues-for-{women,men,teen-girls,teen-boys}/ — her
# monologues from published plays, "free to use for class, competitions, or
# auditions". robots.txt allows all but /wp-admin/. Verified 2026-11-06:
#
#     <p id="whole-story"><strong>Annie Jump, a 13 year old science genius, introduces herself.</strong></p>
#     <p>From <em><a href="...">Annie Jump and the Library of Heaven</a></em> (<a>Buy on Amazon</a>) ...</p>
#     <p><em>Lights shift as Annie steps forward ...</em></p>
#     <p>ANNIE: Yeah. So all of that stuff was ...</p>  <p>...</p>  <p>*</p>
#
# Many pieces per page: one link per piece, "<page>#<anchor id>".

_RH_PAGES = [
    f"https://www.reinahardy.com/free-monologues-for-{who}/"
    for who in ("women", "men", "teen-girls", "teen-boys")
]
_RH_PARA = re.compile(r"<p(?P<attrs>[^>]*)>(?P<inner>.*?)</p>", re.S)
_RH_ID = re.compile(r'\bid="(?P<id>[^"]+)"')
_RH_FROM = re.compile(r"^From\s+(?:<em>)?\s*<a [^>]*>(?P<t>.*?)</a>", re.S)
#: The page's own index: <a href="#whole-story">"quote"</a><br>Annie: 13<br>tags
_RH_INDEX = re.compile(r'<a href="#(?P<id>[^"]+)">.*?</a>\s*<br\s*/?>\s*(?P<name>[^:<]{1,40}):', re.S)
_RH_CUE = re.compile(r"^(?P<cue>[A-Z][A-Z .'\-]{0,30}):\s*(?P<rest>.+)$", re.S)


def _rh_pieces(html: str) -> dict[str, dict]:
    paras = [(m.group("attrs"), m.group("inner").strip()) for m in _RH_PARA.finditer(html)]
    named = {m.group("id"): _strip_tags(m.group("name")).strip() for m in _RH_INDEX.finditer(html)}
    pieces: dict[str, dict] = {}
    current: Optional[dict] = None
    for attrs, inner in paras:
        text = re.sub(r"[ \t\xa0\n]+", " ", _strip_tags(inner)).strip()
        anchor = _RH_ID.search(attrs)
        if anchor:
            current = {"play": "", "character": "", "paras": [], "done": False,
                       "indexed": named.get(anchor.group("id"), "")}
            pieces[anchor.group("id")] = current
            continue
        if current is None or current["done"]:
            continue
        if text == "*":
            current["done"] = True
            continue
        frm = _RH_FROM.match(inner)
        if frm and not current["play"]:
            current["play"] = re.sub(r"\s+", " ", _strip_tags(frm.group("t"))).strip()
            continue
        cue = _RH_CUE.match(text)
        if not current["play"]:
            continue
        if not current["character"]:
            if cue:
                current["character"] = cue.group("cue").strip()
                current["paras"].append(cue.group("rest").strip())
                continue
            if re.fullmatch(r"<em>.*</em>", inner, re.S) or not current["indexed"]:
                continue  # stage direction before the speech
            # No cue printed: the speech starts here; the index names the speaker.
            current["character"] = current["indexed"]
        if cue and cue.group("cue").strip() != current["character"]:
            current["two"] = True
        if text:
            current["paras"].append(text)
    return {k: v for k, v in pieces.items() if v["play"] and v["character"] and v["paras"]}


def discover_reinahardy(url: str, html: str) -> list[Link]:
    return [
        Link(url=f"{url}#{anchor}", character_name=p["character"], label=f"{p['play']}/{anchor}")
        for anchor, p in _rh_pieces(html).items()
    ]


def extract_reinahardy(link: Link, blob: bytes) -> tuple[Optional[Parsed], Optional[str]]:
    anchor = link.url.rsplit("#", 1)[1]
    p = _rh_pieces(blob.decode("utf-8", "replace")).get(anchor)
    if not p:
        return None, "piece_missing"
    if p.get("two"):
        return None, "two_speakers"
    return Parsed(
        url=link.url,
        play_title=p["play"],
        author="Reina Hardy",
        character_name=p["character"].title(),
        text="\n\n".join(fit_excerpt(p["paras"])),
    ), None


# ── Tristan B. Willis ────────────────────────────────────────────────────────
#
# tristanbwillis.com/{women,men,gender-neutral,non-binary}-characters — his
# monologues from his plays, "free to use for actors in auditions or the
# classroom". robots.txt: "Allow: /". Wix, but the text is in the server HTML.
# Verified 2026-11-06:
#
#     <h5 ...><span>SHERRY from <span style="font-style:italic;">Use All Available Doors</span> (Black, late 30s+)</span></h5>
#     <p ...>I've always loved stories. ...</p> ... until the next <h5>.

_TW_PAGES = [
    f"https://www.tristanbwillis.com/{who}-characters"
    for who in ("women", "men", "gender-neutral", "non-binary")
]
_TW_HEAD = re.compile(r"<h5[^>]*>(?P<h>.*?)</h5>", re.S)
_TW_TITLE = re.compile(r"^(?P<c>[A-Z][A-Z .'\-]{0,40}?)\s+from\s+(?P<t>.+?)\s*(?:\((?P<note>[^)]*)\))?\s*$")


def _tw_pieces(html: str) -> list[dict]:
    parts = _TW_HEAD.split(html)
    # split() with one group gives [before, head1, body1, head2, body2, ...]
    pieces = []
    for head, body in zip(parts[1::2], parts[2::2]):
        m = _TW_TITLE.match(re.sub(r"[ \t\xa0\n​]+", " ", _strip_tags(head)).strip())
        if not m:
            continue
        paras = []
        for p in re.findall(r"<p[^>]*>(.*?)</p>", body, re.S):
            text = re.sub(r"[ \t\xa0\n​]+", " ", _strip_tags(p)).strip()
            if not text:
                continue
            italic_only = re.fullmatch(r"\s*<span[^>]*font-style:italic[^>]*>.*</span>\s*", p, re.S)
            paras.append(f"({text})" if italic_only and not text.startswith("(") else text)
        if paras:
            pieces.append({"character": m.group("c"), "play": m.group("t"), "paras": paras})
    return pieces


def discover_willis(url: str, html: str) -> list[Link]:
    return [
        Link(url=f"{url}#{i}", character_name=p["character"], label=f"{p['play']}/{i}")
        for i, p in enumerate(_tw_pieces(html))
    ]


def extract_willis(link: Link, blob: bytes) -> tuple[Optional[Parsed], Optional[str]]:
    index = int(link.url.rsplit("#", 1)[1])
    pieces = _tw_pieces(blob.decode("utf-8", "replace"))
    if index >= len(pieces):
        return None, "piece_missing"
    p = pieces[index]
    speech = list(p["paras"])
    # A piece that opens or closes on a stage direction: the direction stays,
    # but folded into the speech so it is not a paragraph of its own.
    while speech and speech[-1].startswith("(") and len(speech) > 1:
        speech[-2] = f"{speech[-2]} {speech.pop()}"
    return Parsed(
        url=link.url,
        play_title=p["play"],
        author="Tristan B. Willis",
        character_name=p["character"].title(),
        text="\n\n".join(fit_excerpt(speech)),
    ), None


# ── Ian McWethy ──────────────────────────────────────────────────────────────
#
# ianmcwethy.com/monologues/ — "the best monologues from my plays", one PDF
# each, mostly high school characters. robots.txt disallows only /wp-admin/.
# Verified 2026-11-09. The index names the piece and the play for every link:
#
#     PAIGE 1 from Molly Denholtz  <a href=".../molly-paige-mono-11.pdf">
#
# The PDFs come in three templates (a title page, a "From the play" line, a
# screenplay shell with its placeholder fields left in), but all three put the
# character's cue in capitals above each speech. The play's full title is taken
# from the publisher's catalogue, not the index's shorthand ("Moly Denholtz").
# The site answers 406 to a client without a browser-like user agent.

_IM_INDEX = "https://ianmcwethy.com/monologues/"
_IM_LINK = re.compile(
    r'(?P<label>[A-Za-z][A-Za-z .\'’]{0,40}?)(?:\s+\d)?\s+from\s+(?P<play>[^<]{3,80}?)\s*'
    r'(?:<[^>]+>\s*)*<a [^>]*href="(?P<href>https://ianmcwethy\.com/wp-content/uploads/[^"]+\.pdf)"',
    re.S,
)
#: The index's shorthand -> the play's title as its publisher lists it.
_IM_PLAYS = {
    "molly denholtz": "The Incomplete Life & Random Death of Molly Denholtz",
    "moly denholtz": "The Incomplete Life & Random Death of Molly Denholtz",
    "last day of school": "Last Day of School",
    "the internet is distract": "The Internet Is Distract--OH LOOK A KITTEN!",
    "12 incompetent men (and women!)": "12 Incompetent Men (And Women!)",
    "bad auditions by bad actors (full length version)": "Bad Auditions by Bad Actors (full-length)",
    "superheroes": "Superheroes",
}
_IM_CUE_TAIL = re.compile(r"\s*\((?:cont[’']?d|CONT[’']?D)\)\s*$")


def discover_mcwethy(url: str, html: str) -> list[Link]:
    out: list[Link] = []
    seen: set[str] = set()
    for m in _IM_LINK.finditer(html):
        href = m.group("href")
        if href in seen:
            continue
        play = re.sub(r"[\s—–-]+$", "", unescape(_strip_tags(m.group("play")))).strip()
        title = _IM_PLAYS.get(play.casefold())
        if not title:
            continue  # an unknown play has no verified year anyway
        seen.add(href)
        out.append(Link(url=href, character_name=unescape(m.group("label")).strip(), label=title))
    return out


def extract_mcwethy(link: Link, blob: bytes) -> tuple[Optional[Parsed], Optional[str]]:
    """One speech from one of his PDFs: everything after the character's first cue."""
    rows = _pdf_lines(blob)
    if not rows:
        return None, "empty_pdf"
    # Paragraphs: a gap well above line spacing starts a new one. Line spacing in
    # these files is 0-9pt, paragraph breaks 12pt and up.
    paras: list[list[str]] = []
    for text, gap in rows:
        if not paras or gap > 10:
            paras.append([text])
        else:
            paras[-1].append(text)

    names = {w for w in re.split(r"\s+", link.character_name.upper()) if w}

    def cue(line: str) -> Optional[str]:
        """The speech on a cue line ('' when the cue stands alone), or None."""
        bare = _IM_CUE_TAIL.sub("", line).strip()
        if bare.isupper() and bare.split() and set(bare.split()) <= names:
            return ""
        inline = re.match(r"^([A-Z][A-Z ]{1,30})\.\s+(.+)$", line)
        if inline and set(inline.group(1).split()) <= names:
            return inline.group(2)
        return None

    speech: list[str] = []
    started = False
    for para in paras:
        first = cue(para[0])
        if first is not None:
            started = True
            body = " ".join(([first] if first else []) + para[1:]).strip()
            if body:
                speech.append(body)
            continue
        if not started:
            continue
        line = " ".join(para).strip()
        if re.search(r"end of monologue", line, re.I):
            break
        if line.isupper() and len(line) <= 40:
            return None, "two_speakers"
        if speech:  # a stage direction between speeches stays, as one
            speech.append(f"({line.rstrip('.')}.)")
    while speech and speech[-1].startswith("("):
        speech.pop()
    if not speech:
        return None, "no_cue"
    return Parsed(
        url=link.url,
        play_title=link.label,
        author="Ian McWethy",
        character_name=link.character_name.title(),
        text="\n\n".join(fit_excerpt(speech)),
        genre="comedy" if link.label in (
            "12 Incompetent Men (And Women!)", "Bad Auditions by Bad Actors (full-length)",
            "Superheroes", "The Internet Is Distract--OH LOOK A KITTEN!",
        ) else "drama",
    ), None


# ── PDFs whose stage directions are set in italics ───────────────────────────

def _pdf_styled_lines(blob: bytes) -> list[tuple[str, float, bool]]:
    """``(text, gap_above, italic)`` per line. Italic means most of its letters
    are in an italic face: how Doherty and Cafarella mark stage directions."""
    import pdfplumber

    rows: list[tuple[str, float, bool]] = []
    with pdfplumber.open(io.BytesIO(blob)) as pdf:
        for page in pdf.pages:
            words = page.extract_words(extra_attrs=["fontname"])
            previous_bottom = None
            for ln in page.extract_text_lines() or []:
                top, bottom = float(ln["top"]), float(ln["bottom"])
                mine = sorted(
                    (w for w in words
                     if float(w["top"]) >= top - 1 and float(w["bottom"]) <= bottom + 1),
                    key=lambda w: float(w["x0"]),
                )
                if not mine:
                    continue
                # A tab stop (a cue set in its own column, "CAM    There was a
                # kid...") is a wide jump between words: keep it as "\t".
                text = mine[0]["text"]
                for prev, w in zip(mine, mine[1:]):
                    text += ("\t" if float(w["x0"]) - float(prev["x1"]) > 12 else " ") + w["text"]
                text = re.sub(r"[\u200b-\u200d\ufeff]", "", text).strip()
                if not text:
                    continue
                italic = sum(
                    len(w["text"]) for w in mine if re.search(r"italic|oblique", w["fontname"], re.I)
                ) > sum(len(w["text"]) for w in mine) / 2
                gap = 0.0 if previous_bottom is None else top - previous_bottom
                previous_bottom = bottom
                rows.append((text, gap, italic))
    return rows


def _speech_from_styled(rows: list[tuple[str, float, bool]]) -> list[str]:
    """Lines -> paragraphs. Roman lines run together; an italic line is a
    direction, kept in parentheses inside the paragraph it interrupts."""
    paras: list[list[str]] = []
    for text, gap, italic in rows:
        piece = text
        if italic and not text.startswith("("):
            piece = f"({text.rstrip('.')}.)"
        if not paras or gap > 10:
            paras.append([piece])
        else:
            paras[-1].append(piece)
    out = [re.sub(r"\s+", " ", " ".join(p)).strip() for p in paras]
    out = [re.sub(r"\s+([.,!?;:)])", r"\1", re.sub(r"\(\s+", "(", p)) for p in out]
    out = [p for p in out if p]
    while out and out[-1].startswith("(") and out[-1].endswith(")"):
        out.pop()  # a closing direction alone ("She takes the photo.") is not speech
    return out


#: Contact lines and page numbers at the foot of these PDFs.
_FOOTER = re.compile(r"(@|https?://|www\.|^\+?\d[\d ]{6,}$|^\d{1,2}$|^©|free use on the condition)", re.I)


# ── Kristen Doherty ──────────────────────────────────────────────────────────
#
# kristendoherty.com.au/monologues-by-kristen-doherty: free PDF monologues from
# her published plays (Australian Plays Transform), mostly teen. robots.txt
# allows every page to every agent except a list of SEO bots. Verified
# 2026-11-11. Each PDF:
#
#     PIECE TITLE
#     From PLAY - https://apt.org.au/product/...   (or a scene line, or a setup)
#     CHARACTER                                    (or "CHARACTER:" with speech)
#     ...speech, directions in italics...
#     contact line
#
# No premiere year is published for any of her plays (not on APT, not in her
# interviews), so the year is a FLOOR: the PDF's own creation date, i.e. the
# piece existed in that year. Every file is dated 2022 or 2026. Era banding only.

_KD_INDEX = "https://www.kristendoherty.com.au/monologues-by-kristen-doherty"
_KD_PDF = re.compile(r'https://www\.kristendoherty\.com\.au/_files/ugd/[0-9a-f_]+\.pdf')
#: The From-line's play -> the play as its publisher lists it.
_KD_PLAYS = {
    "teen": "TEEN",
    "bully!": "Bully!",
    "shakespeare bachelor": "Shakespeare Bachelor",
    "the dream": "The Dream",
    "the grove: a gothic mystery": "The Grove: A Gothic Mystery",
    "grace": "Grace Under Pressure",
    "queens": "Queens",
}
#: Her shortened cues in Queens -> the queen's name.
_KD_CUES = {"JANE S": "JANE SEYMOUR", "KATHRYN H": "KATHRYN HOWARD"}
#: Comedies, from the genre her own index page gives each piece.
_KD_COMIC = {"CONFUSED", "POACHED PEARS", "SHAKESPEARE BACHELOR"}


def discover_doherty(url: str, html: str) -> list[Link]:
    out, seen = [], set()
    for href in _KD_PDF.findall(html):
        if href not in seen:
            seen.add(href)
            out.append(Link(url=href, character_name=href, label=href))
    return out


def _pdf_year(blob: bytes) -> Optional[int]:
    m = re.search(rb"/CreationDate\s*\(D:(\d{4})", blob)
    return int(m.group(1)) if m else None


def _is_cue(line: str) -> Optional[tuple[str, str]]:
    """``(character, speech on the same line)`` for a cue line, else None."""
    if "\t" in line:
        head, rest = line.split("\t", 1)
        head = head.strip().rstrip(":")
        if head and head.upper() == head and re.fullmatch(r"[A-Z][A-Z'’ .\-]{0,30}", head):
            return head.strip(" ."), rest.replace("\t", " ").strip()
        return None
    m = re.match(r"^([A-Z][A-Z'’ .\-]{1,30}?):?\s*$", line)
    if m and line.upper() == line:
        return m.group(1).strip(" ."), ""
    m = re.match(r"^([A-Z][A-Z'’ .\-]{1,30}?):\s+(.+)$", line)
    if m:
        return m.group(1).strip(), m.group(2)
    return None


def extract_doherty(link: Link, blob: bytes) -> tuple[Optional[Parsed], Optional[str]]:
    rows = _pdf_styled_lines(blob)
    if len(rows) < 3:
        return None, "empty_pdf"
    piece = rows[0][0].strip()
    play = None
    cue_at = None
    for i, (text, _, italic) in enumerate(rows[1:8], 1):
        if play is None and text.startswith("From "):
            name = re.split(r"\s+[-–]\s*|\s+https?://|:\s*$", text[5:].strip(), 1)[0].strip(" -–:")
            if name.casefold().startswith("scene"):
                name = piece  # Queens: "From Scene 14. Henry Condemns Anne Boleyn."
            play = _KD_PLAYS.get(name.casefold())
            if play is None and ":" in text:
                play = _KD_PLAYS.get(text[5:].split(":")[0].strip().casefold())
            continue
        if not italic and _is_cue(text):
            cue_at = i
            break
    if play is None:
        play = _KD_PLAYS.get(piece.casefold())
    if play is None:
        return None, "unknown_play"
    if cue_at is None:
        return None, "no_cue"
    character, inline = _is_cue(rows[cue_at][0])
    character = _KD_CUES.get(character, character)
    body = ([(inline, 0.0, False)] if inline else []) + [
        r for r in rows[cue_at + 1:] if not _FOOTER.search(r[0])]
    speech = _speech_from_styled(body)
    if not speech:
        return None, "no_speech"
    comic = piece.upper() in _KD_COMIC or (play == "The Dream" and character.upper() == "NICK")
    return Parsed(
        url=link.url,
        play_title=play,
        author="Kristen Doherty",
        character_name=character.title(),
        text="\n\n".join(fit_excerpt(speech)),
        genre="comedy" if comic else "drama",
        year=_pdf_year(blob),
    ), None


# ── Jane Cafarella ───────────────────────────────────────────────────────────
#
# janecafarella.com.au: standalone audition monologues for women, posted free
# "on the condition that the author is fully credited and notified". robots.txt
# allows all. Verified 2026-11-11. Each PDF:
#
#     TITLE
#     A two-minute monologue
#     By JANE CAFARELLA
#     Drama                                   (sometimes "Comedy – 90 seconds")
#     NAME, age, tells her sister about...    (italic setup)
#     ...speech, directions in italics...
#     155 words / contact / free-use line
#
# Each piece is its own work, so the play title is the piece's title and the
# year is the date of the post that first published it. The "more free
# monologues" page repeats the 2023 set and is not read.

_JC_PAGES = {
    "https://janecafarella.com.au/2023/08/28/turning-points-free-monologues-about-key-moments-in-the-lives-of-women/": 2023,
    "https://janecafarella.com.au/2024/03/27/new-monologues-for-women-over-40/": 2024,
    "https://janecafarella.com.au/2023/05/08/six-free-monologues-for-older-women/": 2023,
}
_JC_PDF = re.compile(r'https://janecafarella\.com\.au/wp-content/uploads/[^"\'\s]+\.pdf')
_JC_SEEN: set[str] = set()
_SMALL_WORDS = {"a", "an", "and", "at", "for", "in", "of", "on", "or", "the", "to"}


def _title_case(s: str) -> str:
    """'I DON’T' -> 'I Don’t', 'THE ADDICT 1' -> 'The Addict 1'."""
    words = s.lower().split()
    return " ".join(
        w if i and w in _SMALL_WORDS else w[:1].upper() + w[1:]
        for i, w in enumerate(words)
    )


def discover_cafarella(url: str, html: str) -> list[Link]:
    year = _JC_PAGES.get(url)
    out, seen = [], set()
    for href in _JC_PDF.findall(html):
        # Ten-minute and one-act plays are linked from the same posts.
        if href in seen or re.search(r"-PLAY|ONE-ACT", href, re.I):
            continue
        seen.add(href)
        out.append(Link(url=href, character_name=href, label=str(year or "")))
    return out


def extract_cafarella(link: Link, blob: bytes) -> tuple[Optional[Parsed], Optional[str]]:
    rows = _pdf_styled_lines(blob)
    end = next((i for i, r in enumerate(rows)
                if re.match(r"^\d+\s+(spoken\s+)?words\b", r[0], re.I) or _FOOTER.search(r[0])
                and not re.match(r"^\d{1,2}$", r[0])), len(rows))
    rows = [r for r in rows[:end] if not re.match(r"^\d{1,2}$", r[0])]
    by = next((i for i, r in enumerate(rows[:6]) if re.match(r"^by\s+jane\s+cafarella", r[0], re.I)), None)
    if by is None or by == 0:
        return None, "no_byline"
    title = re.sub(r"^\d+\s+", "", rows[0][0]).strip()
    rest = rows[by + 1:]
    genre = "drama"
    while rest and not rest[0][2] and re.match(
            r"^(drama|comedy|drama/comedy)\b", rest[0][0], re.I):
        if rest[0][0].lower().startswith("comedy"):
            genre = "comedy"
        rest = rest[1:]
    setup = []
    while rest and rest[0][2]:
        setup.append(rest[0][0])
        rest = rest[1:]
    if not setup and rest:  # a setup set in roman: the first sentence naming her
        setup, rest = [rest[0][0]], rest[1:]
    setup_text = " ".join(setup)
    m = re.match(r"^([A-Z][A-Z'’\-]+(?:\s[A-Z][A-Z'’\-]+)?)\b", setup_text) or \
        re.match(r"^([A-Z][a-z]+)[’']s\b", setup_text)
    if not m:
        return None, "no_character"
    speech = _speech_from_styled([(t, 0.0, it) for t, _, it in rest])
    if not speech:
        return None, "no_speech"
    key = title.casefold()
    if key in _JC_SEEN:
        return None, "listed_twice"
    _JC_SEEN.add(key)
    # One flowing paragraph: her lines are beats, not paragraphs.
    text = f"({setup_text.rstrip('.')}.) " + " ".join(speech)
    return Parsed(
        url=link.url,
        play_title=_title_case(title),
        author="Jane Cafarella",
        character_name=m.group(1).title(),
        text="\n\n".join(fit_excerpt([text])),
        genre=genre,
        year=int(link.label) if link.label.isdigit() else None,
    ), None


SOURCES: dict[str, Source] = {
    "doherty": Source(
        key="doherty",
        name="Kristen Doherty",
        index_urls=[_KD_INDEX],
        discover=discover_doherty,
        extract=extract_doherty,
        note=(
            "The playwright's own free monologue PDFs from her published plays, "
            "mostly teen. VERIFIED 2026-11-11. robots.txt allows the pages. Years "
            "are floors from each PDF's creation date."
        ),
        delay=1.0,
    ),
    "cafarella": Source(
        key="cafarella",
        name="Jane Cafarella",
        index_urls=list(_JC_PAGES),
        discover=discover_cafarella,
        extract=extract_cafarella,
        note=(
            "The writer's own free audition monologues for women, free with full "
            "credit. VERIFIED 2026-11-11. robots.txt allows all. Year is the post date."
        ),
        delay=1.0,
    ),
    "mcwethy": Source(
        key="mcwethy",
        name="Ian McWethy",
        index_urls=[_IM_INDEX],
        discover=discover_mcwethy,
        extract=extract_mcwethy,
        note=(
            "The playwright's own free monologue PDFs from his plays, mostly high "
            "school. VERIFIED 2026-11-09. robots.txt disallows only /wp-admin/. "
            "Needs --user-agent (406 otherwise). Credit: play, playwright."
        ),
        delay=1.0,
    ),
    "willis": Source(
        key="willis",
        name="Tristan B. Willis",
        index_urls=_TW_PAGES,
        discover=discover_willis,
        extract=extract_willis,
        note=(
            "The playwright's own free monologues from his plays. VERIFIED "
            "2026-11-06. robots.txt: Allow: /."
        ),
        delay=1.0,
    ),
    "reinahardy": Source(
        key="reinahardy",
        name="Reina Hardy",
        index_urls=_RH_PAGES,
        discover=discover_reinahardy,
        extract=extract_reinahardy,
        note=(
            "The playwright's own free monologues from her published plays. "
            "VERIFIED 2026-11-06. robots.txt allows the pages."
        ),
        delay=1.0,
    ),
    "dorf": Source(
        key="dorf",
        name="Jonathan Dorf",
        index_urls=[_JD_INDEX],
        discover=discover_dorf,
        extract=extract_dorf,
        note=(
            "The playwright's own free monologues from his plays, mostly teen. "
            "VERIFIED 2026-11-06. robots.txt allows the public site to ClaudeBot by name."
        ),
        delay=1.0,
    ),
    "szymkowicz": Source(
        key="szymkowicz",
        name="Adam Szymkowicz (his blog)",
        index_urls=_SZ_PAGES,
        discover=discover_szymkowicz,
        extract=extract_szymkowicz,
        note=(
            "The playwright's own monologue collection from his plays, posted for "
            "actors. VERIFIED 2026-11-05. robots.txt allows the blog."
        ),
        delay=1.0,
    ),
    "nycastings": Source(
        key="nycastings",
        name="NYCastings",
        index_urls=_NYC_INDEX,
        discover=discover_nycastings,
        extract=extract_nycastings,
        note=(
            "Play and musical monologue posts, whole speech in the HTML. VERIFIED "
            "2026-11-05. robots.txt allows these posts. Credit: play, playwright."
        ),
        delay=1.0,
    ),
    # "youthplays" is OFF. YouthPLAYS asked on 2026-11-09 for its text to stay on
    # its own site; its 90 pieces are `taken_down`. Listing with links is fine and
    # lives in monologue_references. Do not add this source back without their yes.
    "dailyactor": Source(
        key="dailyactor",
        name="Daily Actor",
        index_urls=[_DA_SITEMAP],
        discover=discover_dailyactor,
        extract=extract_dailyactor,
        note=(
            "Monologue pages from published plays and musicals, whole speech in "
            "the HTML. VERIFIED 2026-11-05. robots.txt allows /monologues/ pages. "
            "Film and TV pages are skipped by rule."
        ),
        delay=1.0,
    ),
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
    if year is None and parsed.year is not None:
        year, category = era_fields("_piece_", {"_piece_": parsed.year})

    reasons: list[str] = []

    # `ingest_monologue` refuses a row with no category, so a play missing from
    # the years file is reported here rather than discovered at write time.
    if year is None:
        reasons.append("no_verified_year")
    # Published before 1928 is public domain in the US. It belongs in the
    # classical library under its real rights, not here as a fair-use excerpt.
    elif year < PUBLIC_DOMAIN_BEFORE:
        reasons.append("public_domain_era")

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


# ── Write through Supabase REST (cloud sessions) ────────────────────────────

def write_via_rest(kept: list[Row], parsed_by_url: dict[str, Parsed]) -> None:
    """The `--write` loop, through PostgREST. See `data_ingestion/rest_writer.py`."""
    from app.services.ai.content_analyzer import ContentAnalyzer
    from app.services.ai.langchain.embeddings import generate_embeddings_batch
    from app.services.data_ingestion.rest_writer import (
        Rest,
        ingest_monologue_rest,
        rejected_fingerprints,
    )

    rest = Rest()
    analyzer = ContentAnalyzer()
    seen = rejected_fingerprints(rest, [parsed_by_url[r.source_url].text for r in kept])
    inserted: list[int] = []
    outcomes: dict[str, int] = {}
    for i, row in enumerate(kept, 1):
        parsed = parsed_by_url[row.source_url]
        try:
            report = ingest_monologue_rest(
                rest,
                play_title=parsed.play_title, author=parsed.author,
                character=parsed.character_name, text=parsed.text,
                copyright_status=COPYRIGHT_STATUS, license_type=LICENSE_TYPE,
                source_url=parsed.url, year_written=row.year_written,
                category=row.category, genre=parsed.genre,
                min_words=MIN_WORDS, max_words=MAX_WORDS,
                analyzer=analyzer, embed=generate_embeddings_batch, rejected=seen,
            )
        except Exception as e:  # one bad row must not stop the batch
            outcomes[f"error:{type(e).__name__}"] = outcomes.get(f"error:{type(e).__name__}", 0) + 1
            print(f"  [{i}/{len(kept)}] ERROR {type(e).__name__}: {e}  {parsed.url}")
            continue
        if report.inserted:
            inserted.extend(report.inserted_ids)
            print(f"  [{i}/{len(kept)}] + {report.inserted_ids[0]}  "
                  f"{parsed.character_name}, {parsed.play_title}")
        else:
            why = report.refused or (
                "duplicate" if report.duplicates else
                "seen_before" if report.already_rejected else
                next(iter(report.rejected), "unknown")
            )
            outcomes[why] = outcomes.get(why, 0) + 1

    print(f"\n  inserted: {len(inserted)}"
          + (f" (ids {min(inserted)}-{max(inserted)})" if inserted else ""))
    for why, n in sorted(outcomes.items(), key=lambda kv: -kv[1]):
        print(f"    {why:30s} {n}")


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
    check("floor is the corpus-wide 100", MIN_WORDS == 100)
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
    ap.add_argument("--write-rest", action="store_true",
                    help="Persist through Supabase REST, for a machine with no "
                         "Postgres connection (a cloud session)")
    ap.add_argument("--cache", default="",
                    help="Directory to keep fetched pages in; a page already "
                         "there is not fetched again")
    ap.add_argument("--missing-years", action="store_true",
                    help="List the plays with no verified year, for "
                         "data/contemporary_play_years.json")
    ap.add_argument("--dry-run", action="store_true", help="Report only (default)")
    ap.add_argument("--self-check", action="store_true", help="Offline invariant check")
    ap.add_argument("--debug", action="store_true")
    args = ap.parse_args()

    if args.self_check:
        sys.exit(self_check())

    if not args.source:
        ap.error("--source is required (or use --self-check)")

    source = SOURCES[args.source]
    write = (args.write or args.write_rest) and not args.dry_run
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

    cache = Path(args.cache) if args.cache else None
    if cache:
        cache.mkdir(parents=True, exist_ok=True)

    def fetch(url: str, fresh: bool = False) -> tuple[Optional[bytes], Optional[str]]:
        import hashlib
        # "<page>#<n>" names one speech on a page that holds many: one fetch.
        url = url.split("#", 1)[0]
        hit = cache / (hashlib.md5(url.encode()).hexdigest() + ".html") if cache else None
        # An index is re-read every run (it is how new pages are found); a page
        # it led to is not. On Szymkowicz's blog the two are the same page.
        if hit and hit.exists() and not fresh:
            return hit.read_bytes(), None
        time.sleep(source.delay)
        try:
            resp = session.get(url, headers=headers, timeout=TIMEOUT)
        except Exception as e:
            return None, f"{type(e).__name__}: {e}"
        if resp.status_code != 200:
            return None, f"HTTP {resp.status_code}"
        if hit:
            hit.write_bytes(resp.content)
        return resp.content, None

    urls = source.index_urls[: args.limit] if args.limit else source.index_urls

    links: list[Link] = []
    index_failed = 0
    for i, url in enumerate(urls, 1):
        blob, err = fetch(url, fresh=True)
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

    if args.missing_years:
        missing: dict[tuple[str, str], int] = {}
        for r in rows:
            if "no_verified_year" in r.reasons:
                k = (r.play_title, r.author)
                missing[k] = missing.get(k, 0) + 1
        print(f"\n  {len(missing)} plays with no verified year:")
        for (title, author), n in sorted(missing.items()):
            print(f"    {n:2d}  {title} | {author}")

    if not write:
        return

    if args.write_rest:
        write_via_rest(kept, parsed_by_url)
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
                genre=parsed.genre,
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
