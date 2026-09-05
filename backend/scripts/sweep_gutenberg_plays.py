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
from sqlalchemy.exc import (  # noqa: E402
    DBAPIError, IntegrityError, OperationalError,
)
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
    r"\b(works|complete works|plays|dramas|dramatic works|volume|vol\.?\s*\d"
    r"|collected|anthology|selections|book of|representative"
    # Genre plurals name a collection just as reliably as "Works" does, and
    # leaving them out let real anthologies through: "The Comedies of Terence"
    # became ONE play row holding 211 monologues from six different comedies,
    # and nobody searching Phormio would ever find them. Same for "Three
    # Comedies" (110) and "The German Classics, v. 20" (120).
    r"|comedies|tragedies|farces|classics|masterpieces|cycle|pentateuch"
    r"|one[- ]act plays|specimens"
    # "X: Containing A, B and C" and "X: A Tragedy, and Other Poems" both name
    # a book holding more than the title work. Found by sampling what landed:
    # "Polite Satires: Containing The Unknown Hand..." and "Virginia: A
    # Tragedy, and Other Poems" had already been ingested as single plays.
    r"|containing|and other|satires|stories|sketches)\b", re.I)
#: "Queen Mary; and, Harold" is two plays sharing a title line. Only the
#: semicolon form is safe to judge from a title: a bare "X and the Y" reads the
#: same in a collection and in a single play, and matching it threw out Millay's
#: "The Lamp and the Bell" and "Fanny and the Servant Problem", both single
#: works. Anything subtler than this is caught structurally, by _cast_blocks.
_TWO_TITLES = re.compile(r";\s*and[,\s]", re.I)
#: Periodicals. Punch ran for over a century and Gutenberg shelves its volumes
#: under Plays/Films/Dramas; 17 of them reached the sweep and produced comic
#: sketches attributed to an author called "Various".
#: Punch and Charivari name one publication and are safe alone. The generic
#: words are not: "An Entomological Review" is the subtitle of Capek's Insect
#: Play, and matching "review" on its own threw that out. So those require an
#: issue marker beside them -- a volume, a number, or a date.
_PERIODICAL = re.compile(
    r"punch|charivari"
    r"|(?:magazine|review|journal|almanac|annual|gazette|miscellany|weekly)"
    r"[^,;]{0,30}[,;]?\s*(?:vol\.?|no\.?|issue|\d{1,3}(?:st|nd|rd|th)?[, ]|\d{4})",
    re.I)
_SHAKESPEARE = re.compile(r"shakespeare", re.I)

#: Prose tracts written as a conversation. Gutenberg shelves them under
#: Plays/Films/Dramas and they parse perfectly, because a pamphlet with two
#: named speakers is structurally identical to a two-hander. But "A Dialogue
#: Between Dean Swift and Tho. Prior" is an argument about the Irish economy,
#: and it produced 102 rows of period political prose no actor would ever want
#: to audition with. Same family as Wilde's Intentions, which the essay shelf
#: caught; these carry no such marker, so the title is the only signal.
#: Only "dialogue between" is safe. "Discourse", "conference" and "colloquy"
#: all appear in real play titles -- "The Conference of the Birds: A Drama"
#: would have been thrown out -- and a tract that avoids the phrase (Citt and
#: Bumpkin, 1680) has to be caught by looking at it, not by its title.
_PROSE_TRACT = re.compile(
    r"\bdialogue[s]?\s+between\b|\bcatechism\b|\bdisputation\b", re.I)

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
        # A periodical is never a playtext, whatever shelf it sits on.
        if _PERIODICAL.search(title):
            continue
        # Nor is a prose tract written as a conversation.
        if _PROSE_TRACT.search(title):
            continue
        # "Various" is Gutenberg's author for anthologies and periodicals. It is
        # not a person, and nothing it fronts is a single play.
        if re.match(r"\s*various\b", r["Authors"], re.I):
            continue
        is_vol = bool(_VOLUME.search(title)) or bool(_TWO_TITLES.search(title))
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


def cast_blocks(body: str) -> int:
    """How many DRAMATIS PERSONAE blocks the text contains.

    One play has one cast list. A collected edition has one PER PLAY, and that
    is the only reliable way to tell "The Comedies of Terence" (six plays, 211
    monologues collapsed onto a single row) from "Wilhelm Tell" (one very long
    play, 133 monologues, entirely legitimate). Title words cannot separate
    those: both say nothing useful, and guessing from "and" in a title threw out
    real single plays.

    Reuses the parser's own heading pattern so the two cannot drift.
    """
    from app.services.extraction.plain_text_parser import PlainTextParser
    return len(PlainTextParser._CAST_HEADING.findall(body))


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
                  "inserted": 0, "rejected": 0, "refused": 0, "volumes": 0,
                  "db_errors": 0}
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

            # Structural anthology check, after the download and before we spend
            # anything on the analyser. Two cast lists means two plays, and
            # ingesting them as one row is the collapse that already put 211
            # Terence monologues behind a single title nobody searches for.
            blocks = cast_blocks(body)
            if blocks > 1 and not args.volumes:
                totals["volumes"] += 1
                print(f"[{i}/{len(cands)}] {bid} VOLUME ({blocks} cast lists, "
                      f"skipping): {title[:44]}")
                DONE.open("a").write(bid + "\n")
                time.sleep(args.sleep)
                continue

            ok, why = looks_like_a_playtext(body)
            if not ok:
                totals["not_playtext"] += 1
                print(f"[{i}/{len(cands)}] {bid} not a playtext ({why}): {title[:44]}")
                DONE.open("a").write(bid + "\n")
                time.sleep(args.sleep)
                continue
            totals["playtext"] += 1

            # One dropped connection must not end the run.
            #
            # ingest_play holds a transaction open across the analyser calls, so
            # a book of 80 speeches keeps a Supabase connection idle-in-
            # transaction for minutes at a time and the pooler eventually closes
            # it. With four workers that is routine, not exceptional: all four
            # died together on "server closed the connection unexpectedly", 22
            # to 27 books into a 103-book list, and the sweep looked finished
            # when it had barely started.
            #
            # pool_pre_ping cannot help -- it validates before checkout, and this
            # dies mid-statement. So reconnect and move to the next book. The
            # book is lost, not the run, and it stays off the done-file so a
            # later pass picks it up.
            report = None
            for attempt in (1, 2):
                try:
                    report = ingest_play(
                        db, title=title, author=author, full_text=body,
                        copyright_status=PUBLIC_DOMAIN,
                        license_type=LICENSE_PUBLIC_DOMAIN,
                        source_url=f"https://www.gutenberg.org/ebooks/{bid}",
                        apply=args.apply, analyzer=analyzer, embed=embed,
                    )
                    break
                except (OperationalError, DBAPIError, IntegrityError) as exc:
                    kind = type(exc).__name__
                    try:
                        db.rollback()
                    except Exception:
                        pass
                    db.close()
                    _engine.dispose()
                    db = SessionLocal()
                    scraper = GutenbergScraper(db)
                    if attempt == 2:
                        totals["db_errors"] += 1
                        print(f"[{i}/{len(cands)}] {bid} DB {kind}, giving up on "
                              f"this book: {title[:38]}")
                    else:
                        print(f"[{i}/{len(cands)}] {bid} DB {kind}, reconnected "
                              f"and retrying: {title[:34]}")
                        time.sleep(3)
            if report is None:
                continue

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
