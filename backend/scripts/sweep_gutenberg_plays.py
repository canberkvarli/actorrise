"""Widen the play corpus by sweeping Project Gutenberg's drama catalogue.

We had mined 135 Gutenberg books. The catalogue holds 79,288 texts, of which
~1,500 English drama titles were never touched. The corpus that came out of
those 135 is lopsided in a way that shows up in search: 40% of every play
monologue is Shakespeare, and exactly two women playwrights are represented
(Susan Glaspell and Hannah Cowley). Aphra Behn, Susanna Centlivre, Elizabeth
Inchbald, Rachel Crothers and Sophie Treadwell are all public domain and all
absent, and they wrote comedies with large female roles -- which is precisely
the hole the search logs keep falling into.

So this is not "scrape more". It is "scrape the part we skipped".

Rights: every text here is Project Gutenberg's US public domain corpus, and is
recorded as public_domain/public_domain. ``ingest_play`` checks that itself and
refuses anything else, so this script cannot smuggle in a copyrighted work by
mislabelling it.

Two traps this script is built around, both of which have bitten before:

1. ANTHOLOGIES. "The Works of Aphra Behn, Volume II" is one URL containing many
   plays. Ingesting it as a single play gives one row the speeches of five
   different works, and re-fetching later re-mines the whole book per row.
   Volumes are DETECTED AND SKIPPED unless --volumes is passed, and even then
   they are only reported, never blind-ingested.

2. SHAKESPEARE. 134 of the unmined candidates are duplicate editions of plays
   we already hold 2,028 monologues from. Skipped by default; --shakespeare
   re-enables.

    python -m scripts.sweep_gutenberg_plays --limit 20            # dry run
    python -m scripts.sweep_gutenberg_plays --limit 20 --apply
    python -m scripts.sweep_gutenberg_plays --apply               # the sweep
"""

from __future__ import annotations

import argparse
import csv
import gzip
import io
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.services.data_ingestion.gutenberg_scraper import GutenbergScraper  # noqa: E402
from app.services.data_ingestion.pipeline import ingest_play  # noqa: E402
from app.services.licensing import LICENSE_PUBLIC_DOMAIN, PUBLIC_DOMAIN  # noqa: E402

CATALOG_URL = "https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv.gz"
CACHE = backend_dir / "backups" / "gutenberg_catalog.csv"
DONE = Path("/tmp/pgsweep_done.txt")

_engine = create_engine(settings.database_url, pool_pre_ping=True, pool_recycle=1800)
SessionLocal = sessionmaker(autocommit=False, autoflush=False,
                            expire_on_commit=False, bind=_engine)

# Gutenberg's own shelf is a far better signal than the Subjects field. Subjects
# carries "English drama" on Wilde's ESSAYS (Intentions) and on Jack London's
# The Human Drift, and a subject-regex sweep duly pulled 28 "monologues" out of
# Wilde's criticism. The shelf gets all of those right, and it correctly keeps
# Tartuffe, Cyrano and Misalliance.
_PLAY_SHELF = re.compile(r"Category:\s*Plays/Films/Dramas", re.I)
_ESSAY_SHELF = re.compile(r"Category:\s*Essays, Letters & Speeches", re.I)
# Collected editions. Ingesting one of these as a single play is the anthology
# collapse that already put 80 rows behind 7 shared URLs.
_VOLUME = re.compile(
    r"\b(works|complete works|plays|dramas|dramatic works|volume|vol\.|collected"
    r"|anthology|selections|book of|representative)\b", re.I)
_SHAKESPEARE = re.compile(r"shakespeare", re.I)

# A playtext has speakers. Cheap structural check before we spend on the
# analyser. Three cue shapes, because requiring a period or colon after the name
# rejected Tartuffe, whose speakers sit bare on their own line:
#     NAME.  text        NAME: text        NAME (stage direction)
#                                          NAME
# The shelf filter above is now the real gate, so this only has to catch a book
# with no dialogue at all -- hence the low floor.
_SPEAKER = re.compile(
    r"^[ \t]*([A-Z][A-Z .'\-]{1,28})(?:[.:]|\s*\(|[ \t]*$)", re.M)
MIN_SPEAKER_LINES = 8


def load_catalog(refresh: bool = False) -> list[dict]:
    if refresh or not CACHE.exists():
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        req = urllib.request.Request(
            CATALOG_URL,
            headers={"User-Agent": "ActorRise/1.0 (canberk@actorrise.com) corpus research"},
        )
        blob = gzip.decompress(urllib.request.urlopen(req, timeout=180).read())
        CACHE.write_bytes(blob)
    return list(csv.DictReader(io.StringIO(CACHE.read_text(encoding="utf-8", errors="replace"))))


def mined_ids(db) -> set[str]:
    """Gutenberg ids we already hold, so a re-run does not re-ingest them."""
    out = set()
    for (url,) in db.execute(text(
            "SELECT DISTINCT source_url FROM plays WHERE source_url ILIKE '%gutenberg%'")):
        if not url:
            continue
        m = re.search(r"(?:ebooks/|etext/|files/|epub/)(\d{1,6})", url)
        if m:
            out.add(m.group(1))
        else:
            digits = re.findall(r"\d{2,6}", url)
            if digits:
                out.add(max(digits, key=len))
    return out


def candidates(rows: list[dict], skip: set[str], *,
               shakespeare: bool, volumes: bool) -> list[dict]:
    out = []
    for r in rows:
        if r["Type"] != "Text" or r["Language"] != "en":
            continue
        if r["Text#"] in skip:
            continue
        shelves = r["Bookshelves"]
        if not _PLAY_SHELF.search(shelves) or _ESSAY_SHELF.search(shelves):
            continue
        title = r["Title"].replace("\n", " ")
        if not shakespeare and (_SHAKESPEARE.search(title) or _SHAKESPEARE.search(r["Authors"])):
            continue
        is_vol = bool(_VOLUME.search(title))
        if is_vol and not volumes:
            continue
        r = dict(r, _volume=is_vol, _title=title)
        out.append(r)
    return out


def clean_author(raw: str) -> str:
    """'Behn, Aphra, 1640-1689; Summers, Montague' -> 'Aphra Behn'."""
    first = (raw or "").split(";")[0]
    first = re.sub(r",?\s*\d{3,4}\??\s*(BCE)?\s*-\s*\d{0,4}\??\s*(BCE)?", "", first).strip(" ,")
    if "," in first:
        last, _, given = first.partition(",")
        return f"{given.strip()} {last.strip()}".strip()
    return first.strip()


def looks_like_a_playtext(body: str) -> tuple[bool, str]:
    """Reject only an empty download. The parser is the real judge.

    This used to require N speaker cues of a shape this regex could see, and it
    was wrong in the expensive direction: Ibsen's *Ghosts* was thrown out as
    "only 5 speaker lines" when the parser reads it fine and returns 51
    monologues. Same for *Pillars of Society* and *Chitra*. The regex only knows
    three cue shapes; the parser knows four and picks between them adaptively,
    so anything this gate adds on top is pure false-rejection.

    Non-plays are already excluded by the Plays/Films/Dramas shelf filter, which
    is what this check was really standing in for.
    """
    if len(body.split()) < 500:
        return False, f"only {len(body.split())} words"
    return True, f"{len(_SPEAKER.findall(body))} visible cues"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--volumes", action="store_true", help="include collected editions (reported, not split)")
    ap.add_argument("--shakespeare", action="store_true")
    ap.add_argument("--refresh-catalog", action="store_true")
    ap.add_argument("--ids", type=str, default=None, help="comma-separated gutenberg ids, bypasses the filter")
    ap.add_argument("--sleep", type=float, default=1.0, help="seconds between downloads")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        rows = load_catalog(args.refresh_catalog)
        skip = mined_ids(db)
        done = set(DONE.read_text().split()) if DONE.exists() else set()

        if args.ids:
            want = {i.strip() for i in args.ids.split(",") if i.strip()}
            cands = [dict(r, _volume=False, _title=r["Title"].replace("\n", " "))
                     for r in rows if r["Text#"] in want]
        else:
            cands = candidates(rows, skip | done,
                               shakespeare=args.shakespeare, volumes=args.volumes)

        print(f"catalogue={len(rows)} already_mined={len(skip)} done_this_sweep={len(done)}")
        print(f"candidates={len(cands)}" + (f" (limit {args.limit})" if args.limit else ""))
        if not args.apply:
            print("DRY RUN -- nothing will be written.\n")
        else:
            print("APPLYING.\n")

        if args.limit:
            cands = cands[: args.limit]

        scraper = GutenbergScraper(db)
        analyzer = embed = None
        if args.apply:
            # Same pair the working ingest paths use. `embed` is a BATCH
            # callable -- ingest_play hands it a list and keyword model/
            # dimensions, so a single-text embedder is not a drop-in.
            from app.services.ai.content_analyzer import ContentAnalyzer
            from app.services.ai.langchain.embeddings import generate_embeddings_batch
            analyzer, embed = ContentAnalyzer(), generate_embeddings_batch

        totals = {"books": 0, "playtext": 0, "not_playtext": 0, "no_text": 0,
                  "inserted": 0, "rejected": 0, "refused": 0, "volumes": 0}
        reasons: dict[str, int] = {}
        import collections
        reasons = collections.Counter()
        for i, r in enumerate(cands, 1):
            bid, title = r["Text#"], r["_title"]
            author = clean_author(r["Authors"])
            totals["books"] += 1
            if r.get("_volume"):
                totals["volumes"] += 1
                print(f"[{i}/{len(cands)}] {bid} VOLUME (not split, skipping): {title[:54]}")
                continue
            try:
                raw = scraper.download_text(int(bid))
            except Exception as exc:
                raw = None
                print(f"[{i}/{len(cands)}] {bid} download failed: {str(exc)[:60]}")
            if not raw:
                totals["no_text"] += 1
                continue
            body = scraper.clean_gutenberg_text(raw)
            ok, why = looks_like_a_playtext(body)
            if not ok:
                totals["not_playtext"] += 1
                print(f"[{i}/{len(cands)}] {bid} not a playtext ({why}): {title[:44]}")
                DONE.open("a").write(bid + "\n")
                time.sleep(args.sleep)
                continue
            totals["playtext"] += 1

            report = ingest_play(
                db, title=title, author=author, full_text=body,
                copyright_status=PUBLIC_DOMAIN, license_type=LICENSE_PUBLIC_DOMAIN,
                source_url=f"https://www.gutenberg.org/ebooks/{bid}",
                apply=args.apply, analyzer=analyzer, embed=embed,
            )
            if report.refused:
                totals["refused"] += 1
                print(f"[{i}/{len(cands)}] {bid} REFUSED: {report.refused}")
            else:
                cut = sum(report.rejected.values())
                # inserted_ids is only populated when apply=True, so a dry run
                # would otherwise report kept=0 for every book and look like a
                # total failure when it is actually finding 40 speeches a book.
                # `candidates` counts what the parser proposed; `rejected` can
                # exceed it, because a speech split into parts is rejected per
                # part. Clamp rather than print a negative "kept".
                kept = (len(report.inserted_ids) if args.apply
                        else max(0, report.candidates - cut - report.duplicates
                                 - report.already_rejected))
                totals["inserted"] += kept
                totals["rejected"] += cut
                for reason, n in report.rejected.items():
                    reasons[reason] += n
                print(f"[{i}/{len(cands)}] {bid} {author[:20]:<20} {title[:32]:<32} "
                      f"cand={report.candidates:<4} kept={kept:<4} cut={cut}")
            if args.apply:
                DONE.open("a").write(bid + "\n")
            time.sleep(args.sleep)

        print("\n" + "  ".join(f"{k}={v}" for k, v in totals.items()))
        if reasons:
            print("why pieces were cut: "
                  + "  ".join(f"{k}={v}" for k, v in reasons.most_common()))
        if not args.apply:
            print("DRY RUN -- re-run with --apply to write.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
