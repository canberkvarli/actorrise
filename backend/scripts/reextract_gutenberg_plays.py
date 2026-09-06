"""Re-read every Gutenberg play with the fixed pattern selection.

The five speaker patterns used to be a chain: try the next only if the one
before found fewer than five speeches. Behn's The Rover is typeset "Will. Why,
how the Devil...", which the Title Case pattern reads perfectly and returns 936
speeches from. The ALL-CAPS pattern finds seven incidental matches in the same
text, seven is not fewer than five, and so the better patterns never ran. A
29,000-word play came out with one monologue.

That threshold was in force for every book ingested this week. A random sample
of twelve already-stored plays re-read with the fix:

    The Gamester (1753)            1 -> 33
    Goat Alley                     7 -> 27
    Marionettes, Masks and Shadows 16 -> 29
    Tristan and Isolda             13 -> 23
    Exiles                         21 -> 30
    The Lawyers                    33 -> 41

Eleven of the twelve gained. This re-reads the corpus on that basis.

SHARED BOOKS ARE SKIPPED, and that is the whole reason this is a separate
script rather than a flag on the sweep. 78 play rows sit on 7 Gutenberg books --
49 rows on one anthology alone -- because a collected edition was ingested once
per play it contains. Re-extracting one of those rows mines the WHOLE book and
files every speech in it under one play's name: `THE STRONGER` re-read that way
jumps from 6 monologues to 122, and the speakers include Smirnov from Chekhov's
The Bear. Strindberg's The Stronger is a one-act with a single speaking part.

Better extraction makes that collapse worse, not better, so those rows wait for
a volume-splitter. Everything else is safe: it owns its book outright.

    python -m scripts.reextract_gutenberg_plays                  # dry run
    python -m scripts.reextract_gutenberg_plays --limit 20
    python -m scripts.reextract_gutenberg_plays --apply
"""

from __future__ import annotations

import argparse
import re
import sys
import time
from collections import defaultdict
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.exc import DBAPIError, IntegrityError, OperationalError  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.services.data_ingestion.gutenberg_scraper import GutenbergScraper  # noqa: E402
from app.services.data_ingestion.pipeline import ingest_play  # noqa: E402
from app.services.extraction.plain_text_parser import PlainTextParser  # noqa: E402
from app.services.licensing import LICENSE_PUBLIC_DOMAIN, PUBLIC_DOMAIN  # noqa: E402

DONE = Path("/tmp/reextract_done.txt")

_engine = create_engine(settings.database_url, pool_pre_ping=True, pool_recycle=1800)
SessionLocal = sessionmaker(autocommit=False, autoflush=False,
                            expire_on_commit=False, bind=_engine)


def book_id(url: str | None) -> str | None:
    if not url:
        return None
    m = re.search(r"(?:ebooks/|etext/|files/|epub/)(\d{1,6})", url)
    if m:
        return m.group(1)
    digits = re.findall(r"\d{2,6}", url)
    return max(digits, key=len) if digits else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--sleep", type=float, default=0.4)
    ap.add_argument("--min-gain", type=int, default=8,
                    help="only re-extract a row whose yield beats what is "
                         "already stored by at least this many speeches")
    args = ap.parse_args()

    db = SessionLocal()
    scraper = GutenbergScraper(db)
    parser = PlainTextParser()
    try:
        # Deliberately NOT selecting full_text here. Some of these rows hold a
        # whole collected edition -- Behn Volume I is 890 KB -- and pulling the
        # column for 689 rows at once closed the SSL connection outright. The
        # text is fetched one row at a time, below, and only when it is needed.
        rows = db.execute(text("""
            SELECT p.id, p.title, COALESCE(p.author,''), p.source_url
            FROM plays p
            WHERE p.source_type='play' AND p.source_url ILIKE '%gutenberg%'
            ORDER BY p.id
        """)).fetchall()

        # One book, many rows -> a collected edition ingested once per play.
        # Re-extracting any of them mines the whole book under one title.
        per_book = defaultdict(list)
        for r in rows:
            bid = book_id(r[3])
            if bid:
                per_book[bid].append(r[0])
        shared = {b for b, ids in per_book.items() if len(ids) > 1}
        shared_rows = sum(len(per_book[b]) for b in shared)

        done = set(DONE.read_text().split()) if DONE.exists() else set()
        todo = [r for r in rows
                if book_id(r[3]) and book_id(r[3]) not in shared
                and str(r[0]) not in done]

        print(f"gutenberg play rows      {len(rows)}")
        print(f"on a shared book (SKIP)  {shared_rows} across {len(shared)} books")
        print(f"already done this run    {len(done)}")
        print(f"to re-extract            {len(todo)}")
        print("APPLYING.\n" if args.apply else "DRY RUN -- nothing written.\n")

        if args.limit:
            todo = todo[: args.limit]

        analyzer = embed = None
        if args.apply:
            from app.services.ai.content_analyzer import ContentAnalyzer
            from app.services.ai.langchain.embeddings import generate_embeddings_batch
            analyzer, embed = ContentAnalyzer(), generate_embeddings_batch

        totals = {"books": 0, "added": 0, "replaced": 0, "anthology": 0,
                  "no_text": 0, "db_errors": 0, "no_gain": 0}
        def handle_book(i, pid, title, author, url):
            """Everything for one book. Raises on a lost connection.

            Deliberately ONE unit. The retry used to wrap only the final
            ingest_play, leaving the full-text read, the stored-count query and
            the dry probe bare -- so a drop during any of those three killed the
            run outright, which is how this stopped at book 13 of 611. Same
            asymmetry as the segmenter, where the DB calls had backoff and the
            API call had none. Wrapping the whole unit is the only version of
            this that does not need re-checking every time a query is added.
            """
            stored = db.execute(
                text("SELECT full_text FROM plays WHERE id = :i"), {"i": pid}
            ).scalar()
            body = stored if stored and len(stored) > 1000 else None
            if body is None:
                try:
                    raw = scraper.download_text(int(book_id(url)))
                except Exception:
                    raw = None
                body = scraper.clean_gutenberg_text(raw) if raw else None
            if not body:
                print(f"[{i}/{len(todo)}] {pid} no text: {title[:40]}")
                return "no_text", None

            # A row that owns its book can still POINT at an anthology if the
            # other rows were never created. One play has one cast list.
            if len(PlainTextParser._CAST_HEADING.findall(body)) > 1:
                print(f"[{i}/{len(todo)}] {pid} ANTHOLOGY, skipping: {title[:40]}")
                return "anthology", None

            # Only re-extract what was actually UNDER-read.
            #
            # Without an embedding the duplicate check falls back to an exact
            # fingerprint, and a re-cut speech is never byte-identical to the
            # one already stored, so every row would come back looking new.
            # Hamlet holds 65 monologues and re-reads to 54: that is overlap,
            # and applying it adds near-duplicates rather than monologues.
            # The Tempest holds 1 and re-reads to 30, which is the real case
            # this script exists for.
            #
            # Comparing the parser's yield against what is stored separates the
            # two without needing to embed anything first.
            stored_count = db.execute(text(
                "SELECT count(*) FROM monologues WHERE play_id = :i AND "
                "(review_status IS NULL OR review_status NOT IN "
                "('pending','too_short','not_monologue'))"), {"i": pid}).scalar()

            # Estimate with a DRY ingest, not with the raw parser. The parser's
            # yield is pre-gate: Hamlet reads to 78 speeches but only 54 survive
            # the quality gate, which is FEWER than the 65 already stored, so
            # comparing raw yield waved it through as a gain when it is a loss.
            # A dry ingest costs nothing -- the analyser and the embedder only
            # run when apply is set -- and it counts what would really land.
            probe = ingest_play(
                db, title=title, author=author or "Unknown", full_text=body,
                copyright_status=PUBLIC_DOMAIN,
                license_type=LICENSE_PUBLIC_DOMAIN,
                source_url=url, apply=False, supersede=True,
            )
            would_keep = max(0, probe.candidates - sum(probe.rejected.values())
                             - probe.duplicates - probe.already_rejected)
            if would_keep - stored_count < args.min_gain:
                print(f"[{i}/{len(todo)}] {pid} no gain "
                      f"({stored_count} stored, {would_keep} would land): "
                      f"{title[:30]}")
                return "no_gain", None

            report = ingest_play(
                db, title=title, author=author or "Unknown", full_text=body,
                copyright_status=PUBLIC_DOMAIN,
                license_type=LICENSE_PUBLIC_DOMAIN,
                source_url=url, apply=args.apply, supersede=True,
                analyzer=analyzer, embed=embed,
            )
            added = len(report.inserted_ids) if args.apply else max(
                0, report.candidates - sum(report.rejected.values())
                - report.duplicates - report.already_rejected)
            print(f"[{i}/{len(todo)}] {pid} {title[:38]:<38} "
                  f"new={added:<4} replaced={report.superseded}")
            return "done", (added, report.superseded)

        for i, (pid, title, author, url) in enumerate(todo, 1):
            totals["books"] += 1
            outcome = None
            for attempt in (1, 2, 3):
                try:
                    outcome = handle_book(i, pid, title, author, url)
                    break
                except (OperationalError, DBAPIError, IntegrityError) as exc:
                    try:
                        db.rollback()
                    except Exception:
                        pass
                    db.close()
                    _engine.dispose()
                    db = SessionLocal()
                    scraper = GutenbergScraper(db)
                    if attempt == 3:
                        totals["db_errors"] += 1
                        print(f"[{i}/{len(todo)}] {pid} DB {type(exc).__name__} "
                              f"x3, skipping: {title[:32]}")
                    else:
                        time.sleep(4 * attempt)
            if outcome is None:
                continue
            kind, payload = outcome
            if kind == "done":
                added, replaced = payload
                totals["added"] += added
                totals["replaced"] += replaced
            else:
                totals[kind] += 1
            if args.apply and kind != "no_text":
                DONE.open("a").write(f"{pid}\n")
            time.sleep(args.sleep)

        print("\n" + "  ".join(f"{k}={v}" for k, v in totals.items()))
        if not args.apply:
            print("DRY RUN -- re-run with --apply.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
