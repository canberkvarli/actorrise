"""Give each play in a collected volume back its own speeches.

78 play rows sit on 7 Gutenberg books. A collected edition was ingested once per
play it contains, and each ingest read the WHOLE book, so whichever row went
first took most of the speeches and the rest got the leftovers.

Measured on book 8499, Strindberg's Plays, before this ran:

    row "The Father", 84 monologues, of which
        39  really are from The Father
        17  are from Countess Julie -- i.e. Miss Julie
         6  are from The Outlaw
         4  are from The Stronger

So an actor searching The Father is shown Miss Julie's lines, under the wrong
character list, with the wrong play on the card. The corpus count is right and
every row of it is a small lie.

This does not re-extract. It finds where each stored monologue actually sits in
the book and moves it to the row for that play. Nothing is created or deleted,
only re-pointed, and a row that cannot be located is left exactly as it is.

Titles are matched loosely on purpose: the book prints "COUNTESS JULIE" and the
row is called "Miss Julie", which is the same play under the translator's title.

    python -m scripts.resplit_shared_books            # dry run
    python -m scripts.resplit_shared_books --apply
"""

from __future__ import annotations

import argparse
import difflib
import json
import re
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.services.data_ingestion.gutenberg_scraper import GutenbergScraper  # noqa: E402

_engine = create_engine(settings.database_url, pool_pre_ping=True, pool_recycle=1800)
SessionLocal = sessionmaker(autocommit=False, autoflush=False,
                            expire_on_commit=False, bind=_engine)

VISIBLE = ("(review_status IS NULL OR review_status NOT IN "
           "('pending','too_short','not_monologue'))")

#: A play title inside a collection: a whole line in capitals. Section words are
#: excluded because "CONTENTS" and "ACT I" look identical to a title here.
_HEADING = re.compile(r"^[ \t]*([A-Z][A-Z ',\-\.]{3,50})[ \t]*\r?$", re.M)
_NOT_A_TITLE = re.compile(
    r"^(contents?|act\b|scene\b|characters?|dramatis|persons?|curtain|the end"
    r"|preface|introduction|note|notes|publisher|biographical|appendix|index"
    r"|prologue|epilogue|footnotes?)", re.I)
#: A cast list follows a play's title within this many characters. Without it,
#: every character name printed on its own line reads as a new play.
CAST_WINDOW = 400
_CAST_NEARBY = re.compile(r"characters|dramatis|persons", re.I)
#: A play may open straight into its first act with no cast list.
_ACT_NEARBY = re.compile(r"^[ \t]*(act|scene|prologue)\b", re.I | re.M)


def normalise(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def book_id(url: str | None) -> str | None:
    if not url:
        return None
    m = re.search(r"(?:ebooks/|etext/|files/|epub/)(\d{1,6})", url)
    if m:
        return m.group(1)
    digits = re.findall(r"\d{2,6}", url)
    return max(digits, key=len) if digits else None


def title_positions(body: str, members: list[tuple[int, str]]) -> dict[int, int]:
    """Where each row's own title appears as the START of its play.

    The strongest anchor available, and it needs no guessing: we already know
    what the plays are called. 48 of the 49 titles on book 36984 are found this
    way, where scanning for capitalised lines produced 128 spans for 49 plays
    and left almost every monologue in a span no row claimed.

    A title on its own line is NOT enough. "Antigone" appears as a standalone
    line eight times in Sophocles' Plays, because she is a character in two of
    them and the line is a speaker cue. Taking the last occurrence put the
    boundary deep inside the play and moved 38 speeches -- a Guard, Haemon --
    from Antigone into Oedipus at Colonus, both of whom belong to Antigone.

    So the occurrence must be followed by a cast list or an act heading, which
    is what actually distinguishes a play's opening from someone saying her
    name. A row whose title never appears that way is left unplaced.
    """
    out = {}
    for pid, title in members:
        if not title or len(title) < 4:
            continue
        pat = re.compile(rf"^[ \t]*{re.escape(title)}[ \t.,:]*\r?$",
                         re.MULTILINE | re.IGNORECASE)
        for m in pat.finditer(body):
            window = body[m.end(): m.end() + CAST_WINDOW]
            if _CAST_NEARBY.search(window) or _ACT_NEARBY.search(window):
                out[pid] = m.start()
                break          # the first real opening, not a later mention
    return out


def heading_positions(body: str) -> list[tuple[str, int]]:
    """Capitalised lines that look like a play title, cast list underneath.

    Needed alongside the titles because a volume can contain a play we hold no
    row for. Book 8499 prints THE STRONGER, whose row lives under a different
    book, and without a boundary there its speeches would be swept into
    whichever play precedes it.
    """
    marks = []
    for m in _HEADING.finditer(body):
        title = " ".join(m.group(1).split())
        if _NOT_A_TITLE.match(title) or len(title) < 4:
            continue
        if not _CAST_NEARBY.search(body[m.end(): m.end() + CAST_WINDOW]):
            continue
        marks.append((title, m.start()))
    return marks


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--book", default=None, help="one gutenberg id only")
    args = ap.parse_args()

    db = SessionLocal()
    scraper = GutenbergScraper(db)
    try:
        rows = db.execute(text(f"""
            SELECT p.id, p.title, p.source_url
            FROM plays p WHERE p.source_type='play'
              AND p.source_url ILIKE '%gutenberg%'
        """)).fetchall()
        per_book = defaultdict(list)
        for pid, title, url in rows:
            bid = book_id(url)
            if bid:
                per_book[bid].append((pid, title))
        shared = {b: v for b, v in per_book.items() if len(v) > 1}
        if args.book:
            shared = {b: v for b, v in shared.items() if b == args.book}

        print(f"shared books: {len(shared)}  rows: {sum(len(v) for v in shared.values())}")
        print("APPLYING.\n" if args.apply else "DRY RUN -- nothing written.\n")

        moves: list[dict] = []
        totals = Counter()
        for bid, members in sorted(shared.items(), key=lambda x: -len(x[1])):
            body = None
            for _ in range(3):
                raw = scraper.download_text(int(bid))
                if raw:
                    body = scraper.clean_gutenberg_text(raw)
                    break
                time.sleep(5)
            if not body:
                print(f"book {bid}: could not fetch, skipping")
                totals["no_text"] += 1
                continue

            located = title_positions(body, members)
            headings = heading_positions(body)

            # Boundaries: every place a new play demonstrably begins. A row's
            # own title is authoritative; a detected heading marks a play we
            # hold no row for, and exists so that its speeches are not swept
            # into the play before it.
            bounds = {}
            for name, pos in headings:
                bounds[pos] = (name, None)
            for pid, pos in located.items():
                bounds[pos] = (dict(members)[pid], pid)

            if len(bounds) < 2:
                print(f"book {bid}: {len(bounds)} boundaries, skipping "
                      f"({len(members)} rows)")
                totals["unsplittable"] += 1
                continue

            ordered = sorted(bounds.items())
            raw_spans = [
                (nm, pos, ordered[i + 1][0] if i + 1 < len(ordered) else len(body), pid)
                for i, (pos, (nm, pid)) in enumerate(ordered)]

            # A span with no row of its own may still BE one of our rows under
            # the translator's title: the book prints COUNTESS JULIE and the row
            # is called Miss Julie. Fuzzy-match those, one row per span, best
            # first, so an extra span stays unclaimed rather than handing its
            # speeches to whichever title happens to look nearest.
            span_owner = {(a, b): pid for _, a, b, pid in raw_spans if pid}
            claimed = set(span_owner.values())
            free_rows = [(pid, t) for pid, t in members if pid not in claimed]
            free_spans = [(nm, a, b) for nm, a, b, pid in raw_spans if not pid]
            pairs = sorted(
                ((difflib.SequenceMatcher(
                    None, normalise(nm), normalise(rt)).ratio(), (a, b), pid)
                 for nm, a, b in free_spans for pid, rt in free_rows),
                reverse=True, key=lambda x: x[0])
            taken_r, taken_s = set(), set()
            for score, key, pid in pairs:
                if score < 0.62 or pid in taken_r or key in taken_s:
                    continue
                span_owner[key] = pid
                taken_r.add(pid)
                taken_s.add(key)
            spans = [(nm, a, b) for nm, a, b, _ in raw_spans]

            flat = normalise(body)
            span_flat = [(a, b, len(normalise(body[:a])), len(normalise(body[:b])))
                         for _, a, b in spans]

            member_ids = [pid for pid, _ in members]
            monos = db.execute(text(
                f"SELECT id, play_id, text FROM monologues "
                f"WHERE play_id = ANY(:ids) AND {VISIBLE}"),
                {"ids": member_ids}).fetchall()

            moved = stayed = lost = 0
            for mid, cur_play, mtext in monos:
                key = normalise(mtext)[:120]
                pos = flat.find(key) if key else -1
                if pos < 0:
                    lost += 1
                    continue
                owner = None
                for a, b, fa, fb in span_flat:
                    if fa <= pos < fb:
                        owner = span_owner.get((a, b))
                        break
                if owner is None:
                    lost += 1
                elif owner == cur_play:
                    stayed += 1
                else:
                    moved += 1
                    moves.append({"monologue_id": mid, "from": cur_play,
                                  "to": owner, "book": bid})
            totals["moved"] += moved
            totals["stayed"] += stayed
            totals["unlocated"] += lost
            names = {t for t, _, _ in spans}
            print(f"book {bid}: {len(members)} rows, {len(spans)} spans "
                  f"({len(span_owner)} matched) -> move {moved}, keep {stayed}, "
                  f"unlocated {lost}")
            if len(members) <= 6:
                print(f"      spans: {sorted(names)[:6]}")

        print("\n" + "  ".join(f"{k}={v}" for k, v in totals.items()))
        if args.apply and moves:
            stamp = datetime.now().strftime("%Y%m%dT%H%M%S")
            out = backend_dir / "backups" / f"resplit_{stamp}.json"
            out.write_text(json.dumps(moves, indent=1))
            for mv in moves:
                db.execute(text("UPDATE monologues SET play_id=:to WHERE id=:i"),
                           {"to": mv["to"], "i": mv["monologue_id"]})
            db.commit()
            print(f"moved {len(moves)} monologues; undo file {out}")
        elif not args.apply:
            print("DRY RUN -- re-run with --apply.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
