"""Download a play from Vikikaynak (Turkish Wikisource) for the Turkish library.

Wikimedia blocks the cloud sessions' IP under its robot policy, so this runs
on the laptop. It saves the page's wikitext (and its subpages: a play is often
split per act or "meclis") with the edition notes at the top, which is what the
copyright check reads: who wrote it, when they died, and whether the text is a
plain transliteration of the original or a modern "sadeleştirme" (simplified
version), which would carry its editor's own copyright.

    uv run python scripts/fetch_wikisource.py "Şair Evlenmesi"

Writes data/turkish_sources/<title>.txt. Nothing touches the database.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import httpx

API = "https://tr.wikisource.org/w/api.php"
# Wikimedia's policy: say who you are and how to reach you.
UA = {"User-Agent": "ActorRiseLibraryBot/1.0 (https://actorrise.com; library import, run by hand)"}
OUT = Path(__file__).resolve().parent.parent / "data" / "turkish_sources"


def api(**params) -> dict:
    params |= {"format": "json", "formatversion": 2}
    r = httpx.get(API, params=params, headers=UA, timeout=60)
    r.raise_for_status()
    time.sleep(1)  # one request a second, well inside the policy
    return r.json()


def wikitext(title: str) -> str | None:
    pages = api(action="query", prop="revisions", rvprop="content", rvslots="main", titles=title)["query"]["pages"]
    page = pages[0]
    if page.get("missing"):
        return None
    return page["revisions"][0]["slots"]["main"]["content"]


def subpages(title: str) -> list[str]:
    found = api(action="query", list="allpages", apprefix=f"{title}/", aplimit=200)["query"]["allpages"]
    return [p["title"] for p in found]


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    title = sys.argv[1]
    main_text = wikitext(title)
    if main_text is None:
        hits = api(action="query", list="search", srsearch=title, srlimit=10)["query"]["search"]
        raise SystemExit(f"No page called {title!r}. Closest: " + ", ".join(h["title"] for h in hits))

    parts = [f"=== {title} ===\n{main_text}"]
    for sub in subpages(title):
        text = wikitext(sub)
        if text:
            parts.append(f"=== {sub} ===\n{text}")

    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{title}.txt"
    path.write_text("\n\n".join(parts), encoding="utf-8")
    words = sum(len(p.split()) for p in parts)
    print(f"Saved {path} ({len(parts)} page(s), about {words} words).")
    print("Edition notes from the top of the page:\n" + main_text[:800])


if __name__ == "__main__":
    main()
