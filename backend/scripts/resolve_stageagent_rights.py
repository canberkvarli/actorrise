"""Give the StageAgent rows a rights basis, or stop storing their text.

229 plays came in from stageagent.com marked `copyrighted` with no
`license_type` at all, which is the one combination :func:`may_store_text`
refuses outright. Nothing was checking it at ingest, so 296 monologue texts sat
in the table with no recorded basis for holding them.

Two groups, handled differently:

* A small tail is public domain and was only ever mislabelled — Shakespeare,
  Shaw, Barrie, Coward, O'Neill. Those get the correct status and become fully
  usable, which is the outcome worth having.
* The rest are firmly in copyright (Dear Evan Hansen, Wolf Hall, The Glass
  Menagerie). We keep the row as a pointer — title, character, and the link back
  to StageAgent, which is what /sources says we do — and replace the stored body
  with the teaser the API would serve anyway.

Only English-language originals are reclassified. A translation carries its own
copyright, so Chekhov, Goethe, Pirandello, Wedekind and Aeschylus stay in the
second group however old the underlying play is: we do not know whose
translation this is, and "the author died in 1904" is not an answer to that.

    python -m scripts.resolve_stageagent_rights [--apply]
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text as sql  # noqa: E402

from app.api.monologues import _teaser  # noqa: E402
from app.core.database import SessionLocal  # noqa: E402
from app.services.licensing import (  # noqa: E402
    LICENSE_PUBLIC_DOMAIN,
    PUBLIC_DOMAIN,
    may_store_text,
)
from app.utils.duration import estimate_duration_seconds  # noqa: E402

#: English-language originals old enough to be public domain in the US, matched
#: on title because every one of these rows has author "Unknown". Deliberately
#: conservative: a title only earns a place here if there is no well-known
#: modern work that shares it, which is why "Peter Pan" is present (Barrie) and
#: "Spring Awakening" is not (Wedekind's play is PD, the 2006 musical is not,
#: and the title alone cannot tell them apart).
PUBLIC_DOMAIN_TITLES = {
    "pericles, prince of tyre",
    "the comedy of errors",
    "two gentlemen of verona",
    "candida",
    "caesar and cleopatra",
    "heartbreak house",
    "how he lied to her husband",
    "the devil's disciple",
    "the duchess of malfi",
    "charley's aunt",
    "london assurance",
    "the amazons",
    "the admirable crichton",
    "quality street",
    "peter pan",
    "the belle's stratagem",
    "the careless husband",
    "ruddigore, or the witch's curse",
    "the gondoliers",
    "easy virtue",
    "hay fever",
    "anna christie",
    "the bear",
}

BACKUP_DIR = Path(__file__).resolve().parents[1] / "backups"


def _norm(title: str) -> str:
    return (title or "").strip().lower().replace("’", "'")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        rows = db.execute(
            sql(
                """
                SELECT m.id, m.text, m.word_count, p.id AS play_id, p.title
                FROM plays p JOIN monologues m ON m.play_id = p.id
                WHERE p.copyright_status = 'copyrighted'
                  AND p.license_type IS NULL
                ORDER BY p.title, m.id
                """
            )
        ).all()
        print(f"no-basis monologues: {len(rows)}")

        reclassify, strip = [], []
        for r in rows:
            if _norm(r.title) in PUBLIC_DOMAIN_TITLES:
                reclassify.append(r)
                continue
            teaser = _teaser(r.text or "")
            if teaser.strip() and teaser.strip() != (r.text or "").strip():
                strip.append((r, teaser))

        play_ids = sorted({r.play_id for r in reclassify})
        print(f"reclassify as public domain: {len(reclassify)} monologues "
              f"across {len(play_ids)} plays")
        print(f"strip stored text to the teaser: {len(strip)} monologues")
        untouched = len(rows) - len(reclassify) - len(strip)
        if untouched:
            print(f"left alone (teaser would not shorten them): {untouched}")

        for r, teaser in strip[:5]:
            print(f"   #{r.id} {r.title[:34]:<34} {r.word_count}w -> "
                  f"{len(teaser.split())}w")

        if not args.apply:
            print("\ndry run, nothing written. re-run with --apply")
            return 0

        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup = BACKUP_DIR / f"stageagent_rights_{stamp}.json"
        backup.write_text(
            json.dumps(
                {
                    "reclassified_play_ids": play_ids,
                    "stripped": [
                        {
                            "id": r.id,
                            "title": r.title,
                            "word_count": r.word_count,
                            "text": r.text,
                        }
                        for r, _ in strip
                    ],
                },
                indent=2,
            )
        )
        print(f"\nbackup: {backup}")

        for pid in play_ids:
            db.execute(
                sql(
                    "UPDATE plays SET copyright_status = :cs, license_type = :lt "
                    "WHERE id = :pid"
                ),
                {"cs": PUBLIC_DOMAIN, "lt": LICENSE_PUBLIC_DOMAIN, "pid": pid},
            )
        db.commit()
        print(f"reclassified {len(play_ids)} plays")

        # word_count is a stored column and the film/TV gate, the duration
        # filters and the short-piece purge all read it. Leaving it describing
        # text that is no longer there is how those quietly stop matching
        # reality, so it moves with the body.
        # Duration moves too. It is what the length filters read, and an actor
        # searching for a two-minute piece should not be handed a row that can
        # only ever show them forty words.
        for r, teaser in strip:
            db.execute(
                sql(
                    "UPDATE monologues SET text = :t, word_count = :wc, "
                    "estimated_duration_seconds = :d WHERE id = :mid"
                ),
                {
                    "t": teaser,
                    "wc": len(teaser.split()),
                    "d": estimate_duration_seconds(teaser),
                    "mid": r.id,
                },
            )
        db.commit()
        print(f"stripped {len(strip)} monologues")

        # Counted in Python, not SQL. `license_type IN (...)` is NULL rather
        # than false when license_type is NULL, so the obvious NOT(...) query
        # silently reports zero for exactly the rows we are looking for.
        profiles = db.execute(
            sql(
                """
                SELECT p.copyright_status cs, p.license_type lt, count(m.id) n
                FROM plays p JOIN monologues m ON m.play_id = p.id
                GROUP BY 1, 2
                """
            )
        ).all()
        left = sum(r.n for r in profiles if not may_store_text(r.cs, r.lt))
        print(f"monologues still held without a recorded basis: {left}")
        print("  (their body is now a short excerpt plus a link out, which is "
              "what /sources promises; the status stays honest because the "
              "author is 'Unknown' and attribution is a fair-use condition)")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
