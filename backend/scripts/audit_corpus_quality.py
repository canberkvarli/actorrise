"""Tell us what got into the corpus that should not have.

Every quality problem found this week was found by a person sampling rows and
noticing something. Wilde's essays parsed as 28 monologues because the Subjects
field said "English drama". The Beggar's Opera produced 42 rows whose characters
were roman numerals. Punch magazine arrived seventeen volumes at a time. "A
Dialogue Between Dean Swift and Tho. Prior" contributed 102 rows of eighteenth
century argument about the Irish economy. Congreve's speakers were stored as
"Mira." and "Mrs Mar." and a character called "Lady".

Not one of those was reported by anything. The pipeline accepted them all and
said nothing, and each was caught only because somebody happened to look at the
right twenty rows. That does not scale and it does not survive a night's
unattended ingest.

So this looks, on a schedule, for the shapes those problems had. It reports and
never deletes: a heuristic confident enough to flag is not confident enough to
destroy an actor's saved piece.

    python -m scripts.audit_corpus_quality
    python -m scripts.audit_corpus_quality --since-hours 24 --out reports/x.md
"""

from __future__ import annotations

import argparse
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import create_engine, text  # noqa: E402

from app.core.config import settings  # noqa: E402

VISIBLE = ("(m.review_status IS NULL OR m.review_status NOT IN "
           "('pending','too_short','not_monologue'))")

# --- character-name shapes that are not people -----------------------------
_SONG = re.compile(r"^(air|song|duet|trio|chorus|recitative|aria|glee|ballad)"
                   r"\s+([IVXLCDM]+|\d{1,3})\.?$", re.I)
_ROMAN_ONLY = re.compile(r"^[IVXLCDM]+$", re.I)
_HAS_DIGIT = re.compile(r"\d")
_STRAY_GLYPH = re.compile(r"[•·|<>{}\[\]=\"~]")
_CONTINUED = re.compile(r"\bcontinued\b|\bcont'?d\b", re.I)
_STRUCTURAL = re.compile(r"^(act|scene|prologue|epilogue|curtain|the end|notes?)\b", re.I)

# --- text shapes that are not a spoken monologue ---------------------------
#: A flattened cue left in the spoken body: "PEGGY I understand, Dr Emerson."
_FLAT_CUE = re.compile(r"(?:^|[.!?]\s+)([A-Z]{3,}[A-Z ]{0,20})\s+[A-Z][a-z]")
#: Third-person narration, which is prose rather than speech.
_NARRATION = re.compile(r"\b(he|she|they) (said|replied|answered|asked|continued)\b", re.I)
#: Scholarly apparatus that reached the corpus through a collected edition.
_APPARATUS = re.compile(r"\b(p\. \d+|l\. \d+|4to|folio|quarto|_?ibid|op\. cit"
                        r"|textual note|see note)\b", re.I)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--since-hours", type=int, default=None,
                    help="only rows created in this window (default: all)")
    ap.add_argument("--samples", type=int, default=4)
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    engine = create_engine(settings.database_url, pool_pre_ping=True)
    window = ""
    params = {}
    if args.since_hours:
        window = "AND m.created_at > now() - make_interval(hours => :h)"
        params["h"] = args.since_hours

    # Paged by id, because `text` is the biggest column in the table and asking
    # for 17,000 of them in one statement closes the Supabase connection
    # mid-read. The re-extraction script learned this the same way; it is a
    # property of the column, not of either script.
    PAGE = 1000
    rows = []
    last = 0
    while True:
        with engine.connect() as c:
            page = c.execute(text(f"""
                SELECT m.id, m.character_name, m.word_count, m.text,
                       COALESCE(p.title,''), COALESCE(p.author,''),
                       COALESCE(p.source_type,'?')
                FROM monologues m LEFT JOIN plays p ON p.id = m.play_id
                WHERE {VISIBLE} {window} AND m.id > :last
                ORDER BY m.id LIMIT :page
            """), {**params, "last": last, "page": PAGE}).fetchall()
        if not page:
            break
        rows.extend(page)
        last = page[-1][0]

    findings: dict[str, list] = defaultdict(list)
    by_source = Counter()
    for mid, name, wc, body, ptitle, pauthor, stype in rows:
        by_source[stype] += 1
        n = (name or "").strip()
        t = body or ""

        if not n:
            findings["character name is empty"].append((mid, n, ptitle))
        elif _SONG.match(n):
            findings["character is a song number"].append((mid, n, ptitle))
        elif _ROMAN_ONLY.match(n.replace(".", "")):
            findings["character is a roman numeral"].append((mid, n, ptitle))
        elif _STRUCTURAL.match(n):
            findings["character is a section heading"].append((mid, n, ptitle))
        elif _CONTINUED.search(n):
            findings["character is a page artifact"].append((mid, n, ptitle))
        elif _STRAY_GLYPH.search(n):
            findings["character has a stray glyph"].append((mid, n, ptitle))
        elif _HAS_DIGIT.search(n):
            findings["character contains a digit"].append((mid, n, ptitle))
        elif len(n) > 40:
            findings["character name is a sentence"].append((mid, n[:44], ptitle))
        # Abbreviations are found by comparison, not by length. Flagging any
        # short name called Ross, Iago and Puck abbreviations and produced 3,777
        # findings, which is a way of reporting nothing. A cue is truncated when
        # a LONGER name in the SAME play starts with it -- "Mira" beside
        # "Mirabell" -- and that check is done after the loop, where the play's
        # whole cast is known.

        if _FLAT_CUE.search(t):
            findings["another speaker's cue in the text"].append((mid, n, ptitle))
        if _APPARATUS.search(t):
            findings["editorial apparatus in the text"].append((mid, n, ptitle))
        if len(_NARRATION.findall(t)) >= 2:
            findings["reads as prose, not speech"].append((mid, n, ptitle))

    # Truncated cues, judged against the play's own cast: "Mira" is only an
    # abbreviation because "Mirabell" is in the same play. Case-insensitive, and
    # the shorter name must be a real prefix, so Ross and Iago do not qualify.
    cast_of: dict[str, set[str]] = defaultdict(set)
    for mid, name, wc, body, ptitle, pauthor, stype in rows:
        if name:
            cast_of[ptitle].add(name.strip())
    for mid, name, wc, body, ptitle, pauthor, stype in rows:
        n = (name or "").strip()
        if not n or len(n) > 12:
            continue
        longer = [o for o in cast_of[ptitle]
                  if len(o) > len(n) and o.lower().startswith(n.lower())]
        if longer:
            # Not always a truncation: Romeo and Juliet carries both "Juliet"
            # and "Juliet Capulet", which is one character filed under two
            # names. Either way the card is inconsistent and a search for one
            # form misses the other, so the honest label is what is observed
            # rather than what caused it.
            findings["one character under two names"].append(
                (mid, f"{n} / {sorted(longer)[0]}", ptitle))

    # A play row holding an implausible number of distinct speakers is the
    # anthology-collapse shape: one row wearing several plays' casts.
    with engine.connect() as c:
        crowded = c.execute(text(f"""
            SELECT p.id, p.title, count(DISTINCT m.character_name) speakers,
                   count(*) n
            FROM monologues m JOIN plays p ON p.id = m.play_id
            WHERE {VISIBLE} {window}
            GROUP BY 1,2 HAVING count(DISTINCT m.character_name) > 25
            ORDER BY speakers DESC LIMIT 15
        """), params).fetchall()

    total = len(rows)
    out = []
    out.append(f"# Corpus quality audit — {datetime.now():%Y-%m-%d %H:%M}")
    out.append("")
    out.append(f"{total} searchable monologues examined"
               + (f" (created in the last {args.since_hours}h)" if args.since_hours else ""))
    out.append("  " + "  ".join(f"{k}={v}" for k, v in by_source.most_common()))
    out.append("")
    flagged = sum(len(v) for v in findings.values())
    out.append(f"## {flagged} flags across {len(findings)} categories")
    out.append("")
    for cat, items in sorted(findings.items(), key=lambda x: -len(x[1])):
        out.append(f"### {cat} — {len(items)}")
        for mid, n, ptitle in items[: args.samples]:
            out.append(f"  - #{mid} `{n}` in *{ptitle[:44]}*")
        out.append("")
    if crowded:
        out.append("### play rows with an implausible cast (anthology shape)")
        for pid, ptitle, speakers, n in crowded:
            out.append(f"  - play #{pid} *{ptitle[:44]}* — {speakers} distinct "
                       f"speakers across {n} monologues")
        out.append("")
    out.append("Nothing here is deleted. A heuristic confident enough to flag "
               "is not confident enough to destroy a saved piece.")

    report = "\n".join(out)
    print(report)
    if args.out:
        path = Path(args.out)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(report)
        print(f"\nwritten to {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
