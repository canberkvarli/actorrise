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


_YP_EDITION = re.compile(r"\s*\((full-length|one-act)( version)?\)\s*$", re.I)


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


SOURCES: dict[str, Source] = {
    "youthplays": Source(
        key="youthplays",
        name="YouthPLAYS",
        index_urls=[_YP_INDEX],
        discover=discover_youthplays,
        extract=extract_youthplays,
        note=(
            "Publisher's own free monologue pages, whole speech in the HTML. "
            "VERIFIED 2026-11-05. robots.txt allows /monologue/. Teen and youth "
            "characters. Credit: play, playwright, YouthPLAYS."
        ),
        delay=1.0,
    ),
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

    def fetch(url: str) -> tuple[Optional[bytes], Optional[str]]:
        import hashlib
        hit = cache / (hashlib.md5(url.encode()).hexdigest() + ".html") if cache else None
        # The sitemap is re-read every run; it is how new pages are found.
        if hit and hit.exists() and url not in source.index_urls:
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
