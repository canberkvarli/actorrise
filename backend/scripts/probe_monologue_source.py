#!/usr/bin/env python
"""Triage a candidate monologue source before anyone writes a parser for it.

Stage Partners cost a whole session to get from "selectors are guesses" to 30
usable rows, and most of that was spent learning things a probe could have
reported in ten seconds: the speech was not in the HTML at all, the CDN answers
403 to every non-browser User-Agent, and the page's long text blocks were
loglines rather than speeches.

This answers those questions for any URL, so a list of candidate sites can be
sorted into "worth a parser" and "not" without building one first.

What it reports, per URL:

  * whether it is reachable at all, and whether that depends on sending a
    browser User-Agent (recorded, never done silently — see scrape_contemporary_plays.UA_HELP)
  * what robots.txt says about the path
  * the longest text blocks on the page, in words, which is the teaser test:
    a page of 30-word blocks is selling monologues, a page of 200-word blocks
    is printing them
  * whether it links out to per-item PDFs, the Stage Partners shape
  * a verdict, which is a hint for a human, not a decision

Usage:
    uv run python -m scripts.probe_monologue_source URL [URL ...]
    uv run python -m scripts.probe_monologue_source --file urls.txt
    uv run python -m scripts.probe_monologue_source URL --browser-ua
"""
from __future__ import annotations

import argparse
import html as ht
import re
import sys
import time
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlparse

HONEST_UA = "ActorRise/1.0 (audition-prep; monologue-curation; canberk@actorrise.com)"
BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)
TIMEOUT = 25

#: A speech runs to a few hundred words. A logline runs to about thirty. The
#: midpoint is where StageAgent's 191 rows sat (median 35), so anything under it
#: is assumed to be a description until a real page proves otherwise.
SPEECH_WORDS = 120
TEASER_WORDS = 60

#: LEAF blocks only: a block containing no further block-level tag. Counting
#: containers reports the wrapper <div> that holds forty loglines as one
#: 825-word "block", which read as a speech and called Stage Partners "full text
#: in HTML" when the speech is not in the HTML at all.
_BLOCK = re.compile(
    r"(?is)<(p|div|li|blockquote|article|section|td)[^>]*>"
    r"((?:(?!<(?:p|div|li|blockquote|article|section|td)[\s>]).)*?)</\1>"
)
_TAGS = re.compile(r"(?s)<[^>]+>")
_SCRIPTS = re.compile(r"(?is)<(script|style|nav|header|footer|svg)[^>]*>.*?</\1>")
_PDF_HREF = re.compile(r'href="([^"]+\.pdf)"', re.I)
_ANY_HREF = re.compile(r'href="([^"]+)"', re.I)


def _text(fragment: str) -> str:
    fragment = re.sub(r"(?is)<br[^>]*>", "\n", fragment)
    return ht.unescape(_TAGS.sub("", fragment)).strip()


@dataclass
class Probe:
    url: str
    status: str = ""
    needs_browser_ua: bool = False
    robots: str = "unknown"
    blocks: list[int] = field(default_factory=list)
    pdf_links: int = 0
    internal_links: int = 0
    verdict: str = ""
    detail: str = ""


def _fetch(url: str, ua: str):
    import requests

    try:
        r = requests.get(url, headers={"User-Agent": ua}, timeout=TIMEOUT)
        return r.status_code, r.content
    except Exception as e:
        return None, f"{type(e).__name__}: {e}".encode()


def _robots_verdict(url: str, ua: str) -> str:
    parts = urlparse(url)
    code, body = _fetch(f"{parts.scheme}://{parts.netloc}/robots.txt", ua)
    if code != 200 or not isinstance(body, bytes):
        return "unreadable"
    path = parts.path or "/"
    rules: list[str] = []
    in_star = False
    for line in body.decode("utf-8", "replace").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, _, value = line.partition(":")
        key, value = key.strip().lower(), value.strip()
        if key == "user-agent":
            in_star = value == "*"
        elif key == "disallow" and in_star and value:
            rules.append(value)
    # A robots rule is a glob, not a prefix. Treating it as one made "/*?"
    # (meaning "any URL with a query string") match every path, because its
    # prefix is "/" — and it reported Stage Partners' allowed /resources/ page
    # as disallowed.
    target = path + (f"?{parts.query}" if parts.query else "")
    for rule in rules:
        pattern = "".join(
            ".*" if ch == "*" else re.escape(ch) for ch in rule.rstrip("$")
        )
        pattern = "^" + pattern + ("$" if rule.endswith("$") else "")
        if re.match(pattern, target):
            return f"DISALLOWED by {rule!r}"
    return "allowed"


def probe(url: str, allow_browser_ua: bool, delay: float = 1.0) -> Probe:
    out = Probe(url=url)
    time.sleep(delay)

    code, body = _fetch(url, HONEST_UA)
    if code != 200 and allow_browser_ua:
        code2, body2 = _fetch(url, BROWSER_UA)
        if code2 == 200:
            out.needs_browser_ua = True
            code, body = code2, body2

    if code != 200:
        out.status = f"HTTP {code}" if code else body.decode("utf-8", "replace")[:60]
        out.verdict = "BLOCKED"
        out.detail = (
            "403 to the honest UA. Re-run with --browser-ua to learn whether a "
            "browser UA gets in; that is a finding, not a licence to send one."
            if code == 403 and not allow_browser_ua
            else "not reachable"
        )
        return out

    out.status = "200"
    out.robots = _robots_verdict(url, BROWSER_UA if out.needs_browser_ua else HONEST_UA)

    # A PDF has no HTML blocks to measure, and probing one is the natural second
    # step after a source comes back PDF PER ITEM: it is how you confirm the
    # speech behind the link is whole before writing the parser.
    if body[:5] == b"%PDF-" or url.lower().endswith(".pdf"):
        try:
            import io

            import pdfplumber

            with pdfplumber.open(io.BytesIO(body)) as pdf:
                pages = len(pdf.pages)
                text = "\n".join((pg.extract_text() or "") for pg in pdf.pages)
        except Exception as e:
            out.verdict = "UNCLEAR"
            out.detail = f"PDF would not open: {type(e).__name__}"
            return out
        words = len(text.split())
        out.blocks = [words]
        if words >= SPEECH_WORDS:
            out.verdict = "FULL TEXT IN PDF"
            out.detail = (
                f"{words}w over {pages} page(s). Read the tail before trusting it: "
                "a whole speech ends on its own last line, a preview stops mid-thought."
            )
        elif words == 0:
            out.verdict = "UNCLEAR"
            out.detail = "no extractable text — scanned images, needs OCR, probably not worth it"
        else:
            out.verdict = "TEASER OR INDEX"
            out.detail = f"only {words}w in the whole PDF — a sample, not a speech"
        return out

    html = body.decode("utf-8", "replace")
    stripped = _SCRIPTS.sub(" ", html)
    counts = sorted(
        (len(_text(m.group(2)).split()) for m in _BLOCK.finditer(stripped)),
        reverse=True,
    )
    out.blocks = [c for c in counts if c > 0][:10]
    out.pdf_links = len(set(_PDF_HREF.findall(html)))

    host = urlparse(url).netloc
    out.internal_links = len({
        h for h in _ANY_HREF.findall(html)
        if urlparse(urljoin(url, h)).netloc == host
    })

    longest = out.blocks[0] if out.blocks else 0
    if longest >= SPEECH_WORDS:
        out.verdict = "FULL TEXT IN HTML"
        out.detail = f"longest block {longest}w — the speech looks to be on the page"
    elif out.pdf_links >= 5:
        out.verdict = "PDF PER ITEM"
        out.detail = (
            f"{out.pdf_links} PDF links, longest HTML block only {longest}w — the "
            "Stage Partners shape; the speech is behind the link"
        )
    elif longest <= TEASER_WORDS:
        out.verdict = "TEASER OR INDEX"
        out.detail = (
            f"longest block {longest}w. Either a listing page (follow a detail "
            "link and re-probe) or a site that previews and paywalls the speech."
        )
    else:
        out.verdict = "UNCLEAR"
        out.detail = f"longest block {longest}w — sits between a logline and a speech"
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("urls", nargs="*")
    ap.add_argument("--file", help="File of URLs, one per line")
    ap.add_argument("--browser-ua", action="store_true",
                    help="Also try a browser User-Agent and REPORT whether it is "
                         "what gets in. Reporting it is not deciding to use it.")
    ap.add_argument("--delay", type=float, default=1.0)
    args = ap.parse_args()

    urls = list(args.urls)
    if args.file:
        urls += [l.strip() for l in open(args.file) if l.strip()
                 and not l.startswith("#")]
    if not urls:
        ap.error("give at least one URL, or --file")

    results = [probe(u, args.browser_ua, args.delay) for u in urls]

    print(f"\n{'='*74}")
    for r in results:
        print(f"\n{r.url}")
        print(f"  {r.status}"
              + ("  (only with a BROWSER User-Agent)" if r.needs_browser_ua else "")
              + f"   robots: {r.robots}")
        if r.blocks:
            print(f"  longest text blocks (words): {r.blocks[:8]}")
            print(f"  pdf links: {r.pdf_links}   internal links: {r.internal_links}")
        print(f"  -> {r.verdict}: {r.detail}")

    print(f"\n{'='*74}")
    order = ["FULL TEXT IN HTML", "FULL TEXT IN PDF", "PDF PER ITEM", "UNCLEAR",
             "TEASER OR INDEX", "BLOCKED"]
    for verdict in order:
        hits = [r for r in results if r.verdict == verdict]
        if hits:
            print(f"  {verdict:20s} {len(hits)}")
    print("\nA verdict is a hint. Before any parser is written, open ONE item from a\n"
          "promising source and confirm the whole speech is really there — that is\n"
          "the check StageAgent failed after 191 rows had already been ingested.")


if __name__ == "__main__":
    main()
