#!/usr/bin/env python
"""Ingest contemporary plays from sources that publish their own scripts.

Dry by default, like every other ingest here. A dry run downloads and extracts
but writes nothing, and still prints what would have happened.

    # see what is there, spend nothing
    .venv/bin/python scripts/ingest_contemporary_plays.py --source samgraber

    # extract and report per play, still no writes
    .venv/bin/python scripts/ingest_contemporary_plays.py --source samgraber --extract

    # write
    .venv/bin/python scripts/ingest_contemporary_plays.py --source samgraber --apply

Rights: everything here goes in as copyrighted / fair_use, which caps each
stored piece at 400 words and requires the source_url that ingest_play stores
alongside it. Full scripts are never persisted. See services/licensing.py.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.database import SessionLocal  # noqa: E402
from app.services.data_ingestion.pipeline import ingest_play  # noqa: E402
from app.services.data_ingestion.web_play_scraper import (  # noqa: E402
    MIN_SCRIPT_CHARS,
    PlaySource,
    discover_proplay,
    discover_samgraber,
    fetch_script_text,
)
from app.services.licensing import COPYRIGHTED, LICENSE_FAIR_USE  # noqa: E402

DISCOVERERS = {
    "samgraber": discover_samgraber,
    "proplay": discover_proplay,
}


def _analyzer_and_embed():
    """Only imported when actually writing, so a dry run needs no API key."""
    from app.services.ai.content_analyzer import ContentAnalyzer
    from app.services.ai.langchain.embeddings import generate_embeddings_batch

    return ContentAnalyzer(), generate_embeddings_batch


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--source", choices=sorted(DISCOVERERS), required=True)
    ap.add_argument("--apply", action="store_true", help="write to the database")
    ap.add_argument("--extract", action="store_true",
                    help="download and run extraction, but do not write")
    ap.add_argument("--limit", type=int, default=0, help="stop after N plays")
    ap.add_argument("--sleep", type=float, default=1.5,
                    help="seconds between downloads (be a polite guest)")
    args = ap.parse_args()

    sources: list[PlaySource] = DISCOVERERS[args.source]()
    if args.limit:
        sources = sources[: args.limit]

    print(f"discovered {len(sources)} plays from {args.source}\n")
    for s in sources:
        print(f"  {s}")
    if not (args.extract or args.apply):
        print("\n(discovery only; pass --extract to download, --apply to write)")
        return 0

    db = SessionLocal()
    analyzer = embed = None
    if args.apply:
        analyzer, embed = _analyzer_and_embed()

    totals = {"plays": 0, "kept": 0, "candidates": 0, "skipped": 0, "refused": 0}
    rejects: dict[str, int] = {}
    thin: list[str] = []
    no_year: list[str] = []

    print()
    for i, src in enumerate(sources, 1):
        text, year, basis = fetch_script_text(src)
        time.sleep(args.sleep)

        if len(text) < MIN_SCRIPT_CHARS:
            totals["skipped"] += 1
            thin.append(f"{src.title} ({len(text)} chars)")
            print(f"[{i}/{len(sources)}] THIN   {src.title}: {len(text)} chars")
            continue

        # Era is the entire point of this ingest, so it may not be a guess.
        # No year at all means we cannot honestly call the work contemporary.
        if year is None:
            totals["skipped"] += 1
            no_year.append(src.title)
            print(f"[{i}/{len(sources)}] NO YEAR {src.title}: skipped")
            continue
        if basis != "copyright_line":
            src.notes.append(f"year {year} from {basis}, not the copyright line")

        report = ingest_play(
            db,
            title=src.title,
            author=src.author,
            full_text=text,
            copyright_status=COPYRIGHTED,
            license_type=LICENSE_FAIR_USE,
            source_url=src.page_url,
            category="contemporary",
            genre=src.genre,
            apply=args.apply,
            analyzer=analyzer,
            embed=embed,
        )

        if report.refused:
            totals["refused"] += 1
            print(f"[{i}/{len(sources)}] REFUSED {src.title}: {report.refused}")
            continue

        totals["plays"] += 1
        totals["candidates"] += report.candidates
        totals["kept"] += report.inserted
        for reason, n in report.rejected.items():
            rejects[reason] = rejects.get(reason, 0) + n
        flag = "  <- " + "; ".join(src.notes) if src.notes else ""
        print(f"[{i}/{len(sources)}] {src.title} ({year}): {report.summary()}{flag}")

    db.close()

    print("\n" + "=" * 60)
    print(f"plays processed : {totals['plays']}")
    print(f"candidates      : {totals['candidates']}")
    print(f"kept            : {totals['kept']}")
    print(f"skipped         : {totals['skipped']}  refused: {totals['refused']}")
    if rejects:
        print("\nwhy candidates were dropped:")
        for reason, n in sorted(rejects.items(), key=lambda kv: -kv[1]):
            print(f"  {reason:28s} {n}")
    if thin:
        print(f"\nno usable text ({len(thin)}):")
        for t in thin:
            print(f"  {t}")
    if no_year:
        print(f"\nno verifiable year ({len(no_year)}):")
        for t in no_year:
            print(f"  {t}")
    if not args.apply:
        print("\nDRY RUN - nothing was written. Re-run with --apply.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
