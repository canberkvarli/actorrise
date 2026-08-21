#!/usr/bin/env python
"""
Build `corpus_terms`: every word the monologue library actually contains.

Backs the H-13 unservable-query check. The question "do we have anything about
X?" needs a dictionary of what the corpus knows, and the corpus is the only
honest source for it — a hand-written stopword list was tried first and flagged
"female monologue ambition overlooked" and "angry young man confronting his
father" as failures, because no list of ordinary English is ever complete.

A term qualifies at >= 3 distinct monologues. Once is a typo or a proper noun
inside one speech; three means the library genuinely talks about it.

Computed offline because the scan takes ~13s over 12k texts. That is fine as a
periodic job and completely unacceptable inside a search request, which is why
this is a table rather than a process cache.

Re-run after any bulk ingest. Stale terms cost precision, not correctness: a
newly-ingested word missing here can only cause a query to be called
unservable when it is now servable.

Usage:
    uv run python scripts/build_corpus_terms.py            # dry run (counts)
    uv run python scripts/build_corpus_terms.py --apply
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import text

from app.core.database import engine

MIN_MONOLOGUES = 3
MIN_LEN = 4

DDL = [
    "CREATE TABLE IF NOT EXISTS corpus_terms ("
    " term VARCHAR(64) PRIMARY KEY,"
    " n INTEGER NOT NULL)",
]

# Every word the library can answer for, from three different directions:
#
#   1. what characters SAY      — monologues.text
#   2. what things are CALLED   — play title, author, character name
#   3. what pieces ARE          — tone, emotion, themes, tags, descriptions
#
# (3) matters more than it looks. Actors search with words characters never
# utter: "manipulative", "sarcastic", "heartfelt", "confronting". None appear in
# any monologue text, so a text-only vocabulary called all four unservable — and
# every one of them is answerable, sitting in tone/search_tags/scene_description
# ("sarcastic" is the tone of 540 pieces). A vocabulary that ignores metadata
# describes what the corpus says, not what it can do.
# Two frequency rules, because the two kinds of word fail differently.
#
# TEXT needs >= 3 monologues. A word said once inside one speech is usually a
# character's name, a place, or a scanning error, and treating it as something
# the library can answer for would make almost any query look servable.
#
# IDENTITY and METADATA qualify at 1. A play with a single monologue is still a
# play we carry: "Rising Seniors" has 2 pieces, so at a >= 3 bar its title words
# were absent and the check called it unservable — a title the pre-pass finds
# and serves. Frequency is the wrong question for a name.
BUILD = f"""
WITH body_src AS (
    SELECT m.id AS mid, m.text AS body FROM monologues m
),
ident_src AS (
    SELECT m.id AS mid, m.character_name AS body FROM monologues m
    UNION ALL
    SELECT m.id, m.character_description FROM monologues m
    UNION ALL
    SELECT m.id, m.scene_description FROM monologues m
    UNION ALL
    SELECT m.id, m.tone FROM monologues m
    UNION ALL
    SELECT m.id, m.primary_emotion FROM monologues m
    UNION ALL
    SELECT m.id, array_to_string(m.themes, ' ') FROM monologues m
    UNION ALL
    SELECT m.id, array_to_string(m.search_tags, ' ') FROM monologues m
    UNION ALL
    SELECT m.id, p.title FROM monologues m JOIN plays p ON p.id = m.play_id
    UNION ALL
    SELECT m.id, p.author FROM monologues m JOIN plays p ON p.id = m.play_id
    UNION ALL
    SELECT m.id, p.genre FROM monologues m JOIN plays p ON p.id = m.play_id
),
body_tok AS (
    SELECT mid, unnest(string_to_array(
        regexp_replace(lower(COALESCE(body,'')), '[^a-z0-9]+', ' ', 'g'), ' ')) AS w
    FROM body_src
),
ident_tok AS (
    SELECT mid, unnest(string_to_array(
        regexp_replace(lower(COALESCE(body,'')), '[^a-z0-9]+', ' ', 'g'), ' ')) AS w
    FROM ident_src
),
counted AS (
    SELECT w, count(DISTINCT mid) n FROM body_tok
    WHERE length(w) >= {MIN_LEN}
    GROUP BY w HAVING count(DISTINCT mid) >= {MIN_MONOLOGUES}
    UNION
    SELECT w, count(DISTINCT mid) n FROM ident_tok
    WHERE length(w) >= {MIN_LEN}
    GROUP BY w
)
SELECT w, max(n) n FROM counted GROUP BY w
"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    t0 = time.time()
    with engine.begin() as conn:
        if not args.apply:
            rows = conn.execute(text(BUILD)).fetchall()
            print(f"built {len(rows)} terms in {time.time() - t0:.1f}s "
                  f"(>= {MIN_MONOLOGUES} monologues, >= {MIN_LEN} chars)")
            print(f"  sample: {[r[0] for r in rows[:12]]}")
            print("\n(dry run - pass --apply)")
            return

        for stmt in DDL:
            conn.execute(text(stmt))
        conn.execute(text("TRUNCATE corpus_terms"))
        # Insert server-side from the same query. Round-tripping 15k rows
        # through the pooler one INSERT at a time took over 30 minutes and
        # timed out; as a single statement Postgres never sends them to us.
        # left(w,64) can collide after truncation, hence ON CONFLICT.
        conn.execute(
            text(
                f"INSERT INTO corpus_terms (term, n) "
                f"SELECT left(w, 64), n FROM ({BUILD}) x "
                f"ON CONFLICT (term) DO NOTHING"
            )
        )
        total = conn.execute(text("SELECT count(*) FROM corpus_terms")).scalar_one()
        print(f"corpus_terms now holds {total} terms")


if __name__ == "__main__":
    main()
