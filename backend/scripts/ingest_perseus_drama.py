"""Ingest Greek and Roman drama from the Perseus TEI corpus.

The Perseus scraper has existed in this codebase for months and has never
written a row. Its `fetch_play_text` is a stub that logs a warning and returns
None, so the API path was never finished -- but the data was already here:
1.4 GB of TEI XML under backend/data/perseus, cloned and untouched.

This is the corpus's best answer to the length gap. Long-form is the one hole
that the whole Gutenberg sweep did not touch: 254 pieces run 3-4 minutes and
exactly 12 run past 4, unchanged from the start of the week. Greek tragedy is
where long speeches live, and the messenger speeches here run 300-500 words --
three minutes and up at performance pace.

    Sophocles  Ajax      25 monologues, longest 492, 490, 442, 440 words
    Euripides  Medea     27 monologues, longest 472, 472, 426, 391
    Sophocles  Antigone  18 monologues, longest 456, 394, 393

RIGHTS. Perseus hosts modern translations alongside old ones, so the date in
each TEI header is checked and the file is skipped unless it is demonstrably
pre-1929. Of 65 drama files, 63 are 1850-1926; one Aristophanes translation is
1938 and one Sophocles file carries no date at all. Both are skipped. Failing
closed on a missing date is the point: a translation whose rights we cannot read
is not a translation we can store.

    python -m scripts.ingest_perseus_drama            # dry run
    python -m scripts.ingest_perseus_drama --apply
"""

from __future__ import annotations

import argparse
import glob
import re
import sys
import time
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.exc import DBAPIError, IntegrityError, OperationalError  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.services.data_ingestion.pipeline import ingest_play  # noqa: E402
from app.services.extraction.tei_xml_parser import TEIXMLParser  # noqa: E402
from app.services.licensing import LICENSE_PUBLIC_DOMAIN, PUBLIC_DOMAIN  # noqa: E402

PERSEUS = backend_dir / "data" / "perseus"
DONE = Path("/tmp/perseus_done.txt")

#: Perseus author ids for drama. Everything else in the corpus is history,
#: oratory, philosophy or scripture, and none of it is a play.
DRAMA_AUTHORS = {
    "tlg0085": "Aeschylus",
    "tlg0011": "Sophocles",
    "tlg0006": "Euripides",
    "tlg0019": "Aristophanes",
    "phi0134": "Terence",
    "phi0119": "Plautus",
    "phi1017": "Seneca",
}

#: US public domain. A translation published in or after this year is still in
#: copyright and cannot be stored, however old the play behind it is.
PD_BEFORE = 1929

_engine = create_engine(settings.database_url, pool_pre_ping=True, pool_recycle=1800)
SessionLocal = sessionmaker(autocommit=False, autoflush=False,
                            expire_on_commit=False, bind=_engine)

_DATE = re.compile(r"<date[^>]*>\s*(1[6-9]\d\d|20[0-2]\d)\s*</date>")
_TITLE = re.compile(r"<title[^>]*>(.*?)</title>", re.S)


def header_of(xml: str) -> str:
    end = xml.find("</teiHeader>")
    return xml[: end + 12] if end != -1 else xml[:8000]


def translation_year(xml: str) -> int | None:
    years = [int(y) for y in _DATE.findall(header_of(xml))]
    return min(years) if years else None


def drama_files() -> list[tuple[str, str]]:
    out = []
    for aid, author in DRAMA_AUTHORS.items():
        for root in ("canonical-greekLit", "canonical-latinLit"):
            for f in sorted(glob.glob(str(PERSEUS / root / "data" / aid / "*" / "*eng*.xml"))):
                out.append((author, f))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()

    if not PERSEUS.exists():
        print(f"{PERSEUS} not found")
        return 1

    files = drama_files()
    done = set(DONE.read_text().split()) if DONE.exists() else set()
    files = [(a, f) for a, f in files if f not in done]
    if args.limit:
        files = files[: args.limit]

    print(f"perseus drama english files: {len(files)}")
    print("APPLYING.\n" if args.apply else "DRY RUN -- nothing written.\n")

    db = SessionLocal()
    parser = TEIXMLParser()
    analyzer = embed = None
    if args.apply:
        from app.services.ai.content_analyzer import ContentAnalyzer
        from app.services.ai.langchain.embeddings import generate_embeddings_batch
        analyzer, embed = ContentAnalyzer(), generate_embeddings_batch

    totals = {"files": 0, "added": 0, "in_copyright": 0, "no_date": 0,
              "no_monologues": 0, "db_errors": 0}
    try:
        for i, (author, path) in enumerate(files, 1):
            totals["files"] += 1
            xml = Path(path).read_text(encoding="utf-8", errors="replace")

            year = translation_year(xml)
            if year is None:
                totals["no_date"] += 1
                print(f"[{i}/{len(files)}] NO DATE, skipping: {Path(path).name}")
                continue
            if year >= PD_BEFORE:
                totals["in_copyright"] += 1
                print(f"[{i}/{len(files)}] {year} translation, still in "
                      f"copyright, skipping: {Path(path).name}")
                continue

            try:
                meta = parser.extract_play_metadata(xml)
            except Exception:
                meta = {}
            title = (meta.get("title") or "").strip()
            if not title:
                m = _TITLE.search(header_of(xml))
                title = " ".join(m.group(1).split()) if m else Path(path).stem
            urn = Path(path).stem

            report = None
            for attempt in (1, 2):
                try:
                    report = ingest_play(
                        db, title=title, author=author, full_text=xml,
                        copyright_status=PUBLIC_DOMAIN,
                        license_type=LICENSE_PUBLIC_DOMAIN,
                        source_url=f"https://scaife.perseus.org/reader/urn:cts:{urn}",
                        category="classical", apply=args.apply,
                        analyzer=analyzer, embed=embed, parser=parser,
                    )
                    break
                except (OperationalError, DBAPIError, IntegrityError) as exc:
                    try:
                        db.rollback()
                    except Exception:
                        pass
                    db.close()
                    _engine.dispose()
                    db = SessionLocal()
                    if attempt == 2:
                        totals["db_errors"] += 1
                        print(f"[{i}/{len(files)}] DB {type(exc).__name__}: {title[:32]}")
                    else:
                        time.sleep(3)
            if report is None:
                continue
            if report.refused:
                print(f"[{i}/{len(files)}] REFUSED: {report.refused}")
                continue

            kept = (len(report.inserted_ids) if args.apply else max(
                0, report.candidates - sum(report.rejected.values())
                - report.duplicates - report.already_rejected))
            if not kept:
                totals["no_monologues"] += 1
            totals["added"] += kept
            print(f"[{i}/{len(files)}] {author[:12]:<12} {title[:34]:<34} "
                  f"{year}  kept={kept}")
            if args.apply:
                DONE.open("a").write(path + "\n")

        print("\n" + "  ".join(f"{k}={v}" for k, v in totals.items()))
        if not args.apply:
            print("DRY RUN -- re-run with --apply.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
