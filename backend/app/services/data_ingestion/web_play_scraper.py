"""Contemporary play sources that publish their own scripts on the open web.

Everything else in this package scrapes the public domain: Gutenberg, Perseus,
Archive.org, Wikisource. That is why the library is 85% pre-1950 and why six of
the last eight pieces of negative feedback say the word "contemporary".

These sources are different in kind. The works are in copyright and stay that
way; what the site grants is that the script may be READ there. So the basis we
ingest under is the one `licensing.py` already defines for exactly this case:

    copyright_status = "copyrighted"
    license_type     = "fair_use"      -> 400-word excerpt ceiling

which means we take monologues and never the script. `ingest_play` does not
persist `full_text` at all, so the /sources promise ("we never host full scripts
of copyrighted works") holds structurally rather than by anyone remembering to.
`source_url` is the link back to the page the work came from and is not
optional here: attribution is half of what the basis rests on.

Two sources, deliberately different shapes:

* **samgraber.com** - one living playwright hosting his own PDFs. He owns every
  word, so this is the cleanest case on the open web: ~25 plays, one name to
  ask. Year comes off the copyright line inside the PDF.

* **proplay.ws** - an anthology of professionally-produced contemporary plays,
  posted with the playwright's agreement, browsable by category. Far more
  volume and much closer to the demand profile (comedies, children/youth), but
  each play has its own author and the site's own terms reserve performance
  rights. Discovery is separated from ingest so the list can be reviewed before
  anything is written.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Iterable, Optional
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

USER_AGENT = (
    "ActorRiseBot/1.0 (+https://actorrise.com/sources; "
    "monologue excerpts with attribution; canberk@actorrise.com)"
)
TIMEOUT = 30

#: A play page that yields less than this is a stub, a "sample pages" teaser or
#: a paywall notice, not a script. `ingest_play` enforces 2000 too; catching it
#: here saves the download and keeps the discovery report honest.
MIN_SCRIPT_CHARS = 2000


@dataclass
class PlaySource:
    """One play we could ingest, before we have spent anything on it."""

    title: str
    author: str
    page_url: str          # the human page, used as source_url for attribution
    text_url: str          # where the script itself lives (pdf or html)
    kind: str              # "pdf" | "html"
    year: Optional[int] = None
    genre: str = "drama"
    notes: list[str] = field(default_factory=list)

    def __str__(self) -> str:
        y = self.year or "????"
        return f"{self.title} ({y}) by {self.author} [{self.kind}]"


# --- normalising a playwright's own PDF ------------------------------------

#: `script_parser.extract_pdf_text` marks italic runs with these, read off the
#: PDF's font rather than guessed from the words.
_IT_OPEN, _IT_CLOSE = "\x02", "\x03"
_ITALIC_RUN = re.compile(r"\x02([^\x02\x03]*)\x03")
_ITALIC_MARKS = re.compile(r"[\x02\x03]")

#: A running header repeated on every page: “Shooter” – ACT ONE
_RUNNING_HEADER = re.compile(r'^\s*[“"”].{1,60}[“"”]\s*[-–—]\s*ACT\b.*$', re.I)
#: Page furniture, each piece on a line of its own. A page break in these PDFs
#: emits the whole block between a speech and the direction that follows it:
#:
#:     v_4_2016 © 2015, All Rights Reserved.
#:     Page 6
#:
#:     “Everything's Free!”
#:     <the stage direction, in italic>
#:
#: Missing any one line of that block strands it against the direction, and the
#: direction then reads as a line of roman text with italic in it -- emphasis --
#: so its words get spliced into the actor's speech. That is where
#: "CLUTCH takes out several more credit" ended up inside Clutch's monologue.
_PAGE_FURNITURE = re.compile(
    r"^\s*(?:"
    r"\d{1,4}"                       # a bare page number
    r"|Page\s+\d{1,4}"               # "Page 6"
    r"|v[_\d\s]*\d\s*©.*"            # "v_4_2016 © 2015, All Rights Reserved."
    r"|©.*All Rights Reserved.*"
    r"|[“\"][^“”\"]{1,60}[”\"]"      # the title alone, in quotes
    r"|[“\"][^“”\"]{1,60}[”\"]\s*by\s+[A-Z][a-z][A-Za-z.\-]*(?:\s+[A-Z][a-z][A-Za-z.\-]*){0,3}"  # + byline
    r")\s*$",
    re.I,
)

#: The same furniture, but landing MID-SENTENCE.
#:
#: When a speech runs over a page break the extractor splices the next page's
#: header straight into the paragraph, so it arrives inside the monologue text
#: rather than on a line of its own:
#:
#:     ...Which! Brings us tonight's entertainment! Page 6 "Everything's Free!"
#:     Fantastic liver...
#:
#: A line-based rule cannot see that, which is why these are stripped from the
#: whole document by substitution before anything is split into lines.
_INLINE_FURNITURE = (
    # Page 6 “Everything's Free!”   /   “Everything's Free!” Page 6
    re.compile(r'[ \t]*Page[ \t]+\d{1,4}[ \t]*[“"”][^“"”\n]{1,60}[“"”][ \t]*', re.I),
    re.compile(r'[ \t]*[“"”][^“"”\n]{1,60}[“"”][ \t]*[-–—]?[ \t]*Page[ \t]+\d{1,4}[ \t]*', re.I),
    # “5 Scripts for 50 Ways” by Sam Graber   -- the anthology byline header.
    # Unlike the page-number header this one IS followed by the speaker's cue,
    # reprinted because the speech continues past the break, so the cue is taken
    # with it. Restricted to this exact shape (quoted title + "by" + a name):
    # after the earlier mistake of eating a bare capital after any footer, a
    # capitalised word is only ever removed when a byline header sits in front
    # of it.
    re.compile(
        r'[ \t]*[“"”][^“"”\n]{1,60}[“"”][ \t]*by[ \t]+'
        # Author names are Title-Case; requiring a lowercase letter in each word
        # is what stops the name from swallowing the ALL-CAPS cue behind it (and
        # then the "I" after that, which is how this first went wrong).
        r'[A-Z][a-z][A-Za-z.\-]*(?:[ \t]+[A-Z][a-z][A-Za-z.\-]*){0,3}'
        r'(?:[ \t]+([A-Z][A-Z\'’\-]{1,20}))?[ \t]*'
    ),
    # “Shooter” – ACT ONE   (mid-line variant of _RUNNING_HEADER)
    re.compile(r'[ \t]*[“"”][^“"”\n]{1,60}[“"”][ \t]*[-–—][ \t]*ACT[ \t]+[A-Z]+\.?[ \t]*', re.I),
)

#: The version/copyright footer, spliced mid-speech by the same page break, and
#: spaced differently from page to page: "v_3_2018 © 2016", "v 4 2016 © 2015".
#:
#: Only ever the footer itself. An earlier version of this also ate a following
#: ALL-CAPS word, on the theory that it was the speaker's cue reprinted on the
#: continuation page. It is not -- in the one case that prompted it, "CLUTCH"
#: was the first word of the stage direction "CLUTCH takes out several more
#: credit cards", and eating it cost four otherwise-good monologues. The cue is
#: never reprinted mid-speech in these PDFs; the page furniture above is.
_INLINE_COPYRIGHT = re.compile(
    r"[ \t]*v[ \t_]*[\d][\d \t_]*[ \t]*©[ \t]*\d{4},?[ \t]*All[ \t]+Rights[ \t]+Reserved\.?[ \t]*"
)


def _strip_inline_furniture(text: str) -> str:
    r"""Remove furniture that landed mid-line, WITHOUT touching line structure.

    Every pattern here brackets with ``[ \t]*`` rather than ``\s*`` on purpose.
    ``\s`` matches newlines, so a footer sitting on its own line had the line
    breaks either side of it eaten too -- welding the speech above to the stage
    direction below, and pushing "Page 6" into the middle of a line where the
    whole-line rules could no longer see it. That is the difference between a
    clean monologue and one with a stage direction spliced into its last
    sentence.
    """
    text = _INLINE_COPYRIGHT.sub(" ", text)
    for pat in _INLINE_FURNITURE:
        text = pat.sub(" ", text)
    return text


def _strip_italic_marks(s: str) -> str:
    return _ITALIC_MARKS.sub("", s)


def normalize_play_pdf_text(text: str) -> str:
    """Turn font-marked PDF text into something `PlainTextParser` can read.

    Two different conventions share one typeface here, and telling them apart
    is the whole job:

    * a line that is **entirely** italic is a stage direction
      (``TROY goes to one of the desks.``)
    * italic **inside** a line of roman text is vocal emphasis
      (``*Al-right!* Well! Guess it's just gonna be us.``)

    `script_parser._apply_italic_directions` encodes the opposite rule, because
    Folger's Shakespeare italicises a direction that sits beside spoken text.
    Applied here it reads "Al-right!" as an action and deletes it from the line.

    Directions come out as ``[_..._]``, which `PlainTextParser` treats as
    unambiguous; emphasis keeps its words and loses its markup. Consecutive
    all-italic lines are joined, because a long direction is wrapped by the
    typesetter, not written, in three-word pieces.
    """
    if not text:
        return ""

    text = _strip_inline_furniture(text)
    lines = text.split("\n")
    out: list[str] = []
    pending: list[str] = []      # an in-progress, line-wrapped direction

    def flush() -> None:
        if pending:
            body = " ".join(pending).strip()
            if body:
                out.append(f"[_{body.rstrip('.')}._]")
            pending.clear()

    for line in lines:
        if _IT_OPEN not in line:
            bare = line.strip()
            if _RUNNING_HEADER.match(bare) or _PAGE_FURNITURE.match(bare):
                continue          # page furniture never reaches the parser
            flush()
            out.append(line)
            continue

        # Everything outside the italic runs. If that is empty, the whole line
        # was italic and this is a direction.
        roman = _ITALIC_RUN.sub("", line).strip()
        if not roman:
            pending.extend(
                m.group(1).strip() for m in _ITALIC_RUN.finditer(line) if m.group(1).strip()
            )
            continue

        # Mixed line: emphasis. Keep the words, drop the markers.
        flush()
        out.append(_strip_italic_marks(line))

    flush()
    return "\n".join(out)


def _session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": USER_AGENT})
    return s


def _soup(session: requests.Session, url: str) -> Optional[BeautifulSoup]:
    try:
        r = session.get(url, timeout=TIMEOUT)
        r.raise_for_status()
    except requests.RequestException as exc:
        logger.warning("fetch failed %s: %s", url, exc)
        return None
    return BeautifulSoup(r.text, "html.parser")


# --- year ------------------------------------------------------------------

#: A play's own copyright line is the only year we will call verified. Matches
#: "(c) 2015", "Copyright 2015", "© 2015 Sam Graber".
_COPYRIGHT_YEAR = re.compile(
    r"(?:©|\(c\)|copyright)\s*(?:by\s*)?(\d{4})", re.IGNORECASE
)
#: WordPress files land under /wp-content/uploads/YYYY/MM/. That is the year the
#: file was POSTED, which is an upper bound on nothing and a lower bound on
#: publication. Used only as a fallback, and flagged when it is.
_UPLOAD_YEAR = re.compile(r"/uploads/(\d{4})/\d{2}/")


def year_from_text(text: str, *, url: str = "") -> tuple[Optional[int], str]:
    """Best available year, plus how we got it.

    Returns ``(year, basis)`` where basis is "copyright_line", "upload_path" or
    "none". The caller decides what to do with a weak basis; this function does
    not guess silently.
    """
    head = text[:6000]
    m = _COPYRIGHT_YEAR.search(head)
    if m:
        y = int(m.group(1))
        if 1900 <= y <= 2100:
            return y, "copyright_line"
    m = _UPLOAD_YEAR.search(url or "")
    if m:
        return int(m.group(1)), "upload_path"
    return None, "none"


# --- samgraber.com ---------------------------------------------------------

SAMGRABER_INDEXES = (
    "https://samgraber.com/plays/full-length-plays/",
    "https://samgraber.com/plays/one-act-plays/",
    "https://samgraber.com/plays/10-minute-plays/",
)
SAMGRABER_AUTHOR = "Sam Graber"

#: The blurb under each title carries the form, e.g. "Seriocomic, 95 minutes."
_FORM = re.compile(r"\b(comedy|comedic|seriocomic|drama|dramatic|farce)\b", re.I)
_FORM_TO_GENRE = {
    "comedy": "comedy", "comedic": "comedy", "farce": "comedy",
    "seriocomic": "seriocomic", "drama": "drama", "dramatic": "drama",
}


def discover_samgraber(session: Optional[requests.Session] = None) -> list[PlaySource]:
    """Every script PDF linked from Sam Graber's three play indexes."""
    session = session or _session()
    found: dict[str, PlaySource] = {}

    for index in SAMGRABER_INDEXES:
        soup = _soup(session, index)
        if soup is None:
            continue
        for a in soup.find_all("a", href=True):
            href = urljoin(index, a["href"])
            if not href.lower().endswith(".pdf"):
                continue
            if href in found:
                continue

            # The link text is "Read Full Script"; the real title is the
            # link's `title` attribute or the nearest heading above it.
            title = (a.get("title") or "").strip()
            title = re.sub(r"\s*(script|full script)\s*$", "", title, flags=re.I).strip()
            if not title:
                heading = a.find_previous(["h1", "h2", "h3", "h4"])
                title = heading.get_text(strip=True) if heading else ""
            if not title:
                continue

            blurb = a.find_parent(["td", "div", "article"])
            blurb_text = blurb.get_text(" ", strip=True) if blurb else ""
            fm = _FORM.search(blurb_text)
            genre = _FORM_TO_GENRE.get(fm.group(1).lower(), "drama") if fm else "drama"

            found[href] = PlaySource(
                title=title,
                author=SAMGRABER_AUTHOR,
                page_url=index,
                text_url=href,
                kind="pdf",
                genre=genre,
            )

    return sorted(found.values(), key=lambda s: s.title)


# --- proplay.ws ------------------------------------------------------------

PROPLAY_CATEGORIES = {
    "https://proplay.ws/dramas/": "drama",
    "https://proplay.ws/comedies/": "comedy",
    "https://proplay.ws/children-youth/": "youth",
}
#: Site furniture that shows up as links on every category page.
_PROPLAY_SKIP = re.compile(
    r"/(about|submit-your-play|by-playwright|dramas|comedies|musicals|"
    r"children-youth|most-recently-posted|privacy|contact|wp-|feed|category|tag)/?$",
    re.I,
)
#: Play pages are /the-title-by-author-name/ - the "-by-" is what makes the
#: author parseable without opening the page.
_PROPLAY_SLUG = re.compile(r"^https://proplay\.ws/([a-z0-9\-]+)-by-([a-z0-9\-]+)/?$", re.I)


def _titlecase(slug: str) -> str:
    small = {"a", "an", "and", "the", "of", "or", "to", "in", "on", "for"}
    words = slug.replace("-", " ").split()
    out = []
    for i, w in enumerate(words):
        out.append(w if (w in small and i) else w.capitalize())
    return " ".join(out)


def discover_proplay(
    categories: Optional[Iterable[str]] = None,
    session: Optional[requests.Session] = None,
) -> list[PlaySource]:
    """Play pages listed under ProPlay's browse categories.

    Returns the pages, not the scripts. ProPlay posts some plays whole and some
    in part ("in all cases, substantial portions... may be read now"), so how
    much text a given page actually holds is only knowable by fetching it, which
    :func:`fetch_script_text` does one at a time.
    """
    session = session or _session()
    cats = dict(PROPLAY_CATEGORIES)
    if categories is not None:
        cats = {k: v for k, v in cats.items() if k in set(categories)}

    found: dict[str, PlaySource] = {}
    for index, genre in cats.items():
        soup = _soup(session, index)
        if soup is None:
            continue
        for a in soup.find_all("a", href=True):
            href = urljoin(index, a["href"]).split("#")[0].split("?")[0]
            if not href.startswith("https://proplay.ws/"):
                continue
            if _PROPLAY_SKIP.search(href) or href in found:
                continue
            m = _PROPLAY_SLUG.match(href)
            if not m:
                continue
            title_slug, author_slug = m.group(1), m.group(2)
            link_title = a.get_text(" ", strip=True)
            found[href] = PlaySource(
                title=link_title if len(link_title) > 2 else _titlecase(title_slug),
                author=_titlecase(author_slug),
                page_url=href,
                text_url=href,          # provisional; resolved below
                kind="html",
                genre=genre,
            )

    # A ProPlay play page is a LANDING page -- synopsis, cast breakdown, rights
    # contact, playwright bio, about 2-3k characters and not one line of
    # dialogue. The script itself is a PDF linked from it, at
    # /scripts/<Name>.pdf. Without this second hop every play arrives as a
    # 2,400-character blurb and is skipped as having no usable text.
    for src in found.values():
        _resolve_proplay_script(src, session)

    return sorted(found.values(), key=lambda s: (s.author, s.title))


#: The script PDF linked from a play's landing page.
_PROPLAY_SCRIPT = re.compile(r"^https://proplay\.ws/scripts/.+\.pdf$", re.I)
#: "Amateur and professional rights: Alan Rossett  rossdoal@aol.com"
_RIGHTS_EMAIL = re.compile(r"[\w.\-+]+@[\w.\-]+\.\w{2,}")


def _resolve_proplay_script(
    src: PlaySource, session: Optional[requests.Session] = None
) -> None:
    """Point ``src`` at the script PDF, and note who to ask about rights.

    ProPlay prints a per-play rights contact ("Amateur and professional
    rights: <name>, <email>"). That is the single most useful thing on the
    page: it is the address that can turn this row from `fair_use` into
    `licensed`. Kept on the source rather than acted on.
    """
    session = session or _session()
    soup = _soup(session, src.page_url)
    if soup is None:
        return
    for a in soup.find_all("a", href=True):
        href = urljoin(src.page_url, a["href"])
        if _PROPLAY_SCRIPT.match(href):
            src.text_url = href
            src.kind = "pdf"
            break
    else:
        src.notes.append("no script pdf linked from the play page")

    emails = _RIGHTS_EMAIL.findall(soup.get_text(" ", strip=True))
    if emails:
        src.notes.append(f"rights contact: {emails[0]}")


# --- fetching the script itself --------------------------------------------

def fetch_script_text(
    src: PlaySource, session: Optional[requests.Session] = None
) -> tuple[str, Optional[int], str]:
    """Download one play and return ``(text, year, year_basis)``.

    Raises nothing: a failure comes back as an empty string so a long run does
    not die on one bad link.
    """
    session = session or _session()
    try:
        r = session.get(src.text_url, timeout=TIMEOUT)
        r.raise_for_status()
    except requests.RequestException as exc:
        logger.warning("fetch failed %s: %s", src.text_url, exc)
        return "", None, "none"

    if src.kind == "pdf":
        # Imported here so discovery costs nothing when PyMuPDF is not needed.
        from app.services.script_parser import extract_pdf_text
        try:
            raw = extract_pdf_text(r.content)
        except Exception as exc:
            logger.warning("pdf parse failed %s: %s", src.text_url, exc)
            return "", None, "none"
        # Year first: the copyright line is page furniture, and normalising
        # throws it away.
        year, basis = year_from_text(raw, url=src.text_url)
        return normalize_play_pdf_text(raw), year, basis
    else:
        soup = BeautifulSoup(r.text, "html.parser")
        for tag in soup(["script", "style", "nav", "header", "footer", "form"]):
            tag.decompose()
        body = soup.find("article") or soup.find("main") or soup.body or soup
        text = body.get_text("\n", strip=True)

    year, basis = year_from_text(text, url=src.text_url)
    return text, year, basis
