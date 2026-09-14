"""Put a year on the plays that already sit in the library without one.

WHY. 13,665 play monologues across 672 works have no `year_written`. They are
all Gutenberg, so all public domain, so all pre-1930 -- but the database cannot
tell Sophocles from Ibsen, and neither can search.

That cost something specific. 2,751 of those monologues are modern-realism
drama: Shaw 847, Ibsen 322, Strindberg 296, Wilde 208, Chekhov 113, O'Neill,
Synge, Glaspell. 97% of that group is undated. It is the closest thing to
"modern" the library legally owns, four actors wrote in asking for exactly that,
and there is currently no way to offer it to them -- A Doll's House and Antigone
are indistinguishable to every filter.

Dating costs no storage and no rights risk. It surfaces work already paid for.

WHAT IT WILL NOT DO. This does not produce contemporary work. Nothing here was
written after 1929, by definition. It produces an honest MODERN band, which is
a real answer to "these aren't contemporary" instead of silence.

HOW IT REFUSES TO GUESS. A wrong date is worse than no date: it is invisible,
and it puts Ibsen in the wrong century for every future filter. So:

  * gpt-4o-mini returns a year AND a confidence, and anything under the
    threshold is left NULL;
  * a year after 1929 on a public-domain row is a contradiction -- the work
    could not be public domain -- so it is rejected, not stored;
  * implausible years are rejected;
  * every write is backed up first, and `--restore` puts it back.

    python -m scripts.date_undated_plays                  # dry run, shows proposals
    python -m scripts.date_undated_plays --apply
    python -m scripts.date_undated_plays --restore backups/dated_plays_<ts>.json
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

os.environ.setdefault("LANGCHAIN_TRACING_V2", "false")

from sqlalchemy import create_engine, text  # noqa: E402

from app.core.config import settings  # noqa: E402

BACKUP_DIR = backend_dir / "backups"
BATCH = 20
MODEL = "gpt-4o-mini"

#: Anything in the public domain in 2026 was published before 1930. A model
#: answer past this on a public-domain row is not a late estimate, it is a
#: contradiction, and the safe reading is that the model guessed.
PUBLIC_DOMAIN_CEILING = 1929

#: Aeschylus is ~-470. Nothing in this corpus predates that.
EARLIEST_PLAUSIBLE = -600

#: Below this the model is guessing from the title alone.
MIN_CONFIDENCE = 0.7

PROMPT = """You date plays. For each item give the year the play was FIRST \
written or performed, not the year of the edition or translation.

Rules:
- Use the original composition date. Antigone is -441, not 1900.
- If you are not confident which play this is, or the title is a collected \
volume rather than a single play, set year to null.
- confidence is 0.0-1.0: how sure you are of the year within a decade.
- Return ONLY a JSON array, one object per input id:
  [{"id": 123, "year": 1879, "confidence": 0.95}, ...]

Items:
"""


def _client():
    from openai import OpenAI

    return OpenAI(api_key=settings.openai_api_key)


def ask(client, rows) -> tuple[list | None, str | None]:
    """One batch. Returns (parsed, error). Reuses the credit/backoff split from
    scripts/segment_monologues.py: a 429 means either 'slow down' or 'you have
    no money', and retrying the second one parks the run in a sleep loop."""
    items = "\n".join(
        f'{{"id": {r.id}, "title": {json.dumps(r.title or "")}, '
        f'"author": {json.dumps(r.author or "")}}}'
        for r in rows
    )
    last_error = None
    for attempt in range(5):
        try:
            resp = client.chat.completions.create(
                model=MODEL,
                messages=[{"role": "user", "content": PROMPT + items}],
                temperature=0,
                response_format={"type": "json_object"},
            )
            break
        except Exception as e:                                  # noqa: BLE001
            last_error, low = e, str(e).lower()
            if ("insufficient_quota" in low or "no credits remaining" in low
                    or "exceeded your current quota" in low or "billing" in low):
                return None, f"OUT OF API CREDIT: {e}"
            transient = ("429" in str(e) or "rate limit" in low
                         or "overloaded" in low or "timeout" in low
                         or "503" in str(e) or "502" in str(e))
            if not transient or attempt == 4:
                return None, f"api error: {e}"
            time.sleep(min(60, 4 * (2 ** attempt)))
    else:
        return None, f"api error: {last_error}"

    raw = resp.choices[0].message.content or ""
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None, "unparseable json"
    if isinstance(parsed, dict):
        # `response_format=json_object` forces a top-level object, so the array
        # always arrives wrapped -- under "data", "plays", "results", whatever
        # the model picks that call. Guessing the key list failed on the first
        # real batch, so take the first list-of-objects present instead of
        # maintaining a vocabulary of wrapper names.
        lists = [v for v in parsed.values()
                 if isinstance(v, list) and (not v or isinstance(v[0], dict))]
        if len(lists) != 1:
            return None, f"expected one list in the object, found {len(lists)}"
        parsed = lists[0]
    return parsed, None


def vet(proposal: dict, row) -> tuple[int | None, str]:
    """Accept a year only when nothing about it contradicts what we already know."""
    year, conf = proposal.get("year"), proposal.get("confidence")
    if year is None:
        return None, "model declined"
    try:
        year, conf = int(year), float(conf if conf is not None else 0)
    except (TypeError, ValueError):
        return None, "unreadable year/confidence"
    if conf < MIN_CONFIDENCE:
        return None, f"low confidence {conf:.2f}"
    if year < EARLIEST_PLAUSIBLE or year > datetime.now().year:
        return None, f"implausible year {year}"
    # The strongest check available, and it is free: this row's text is stored
    # BECAUSE it is public domain. A public-domain work published after 1929
    # does not exist, so a later year means the model named the wrong play (or
    # dated a translation). Refuse rather than store a contradiction.
    if (row.copyright_status == "public_domain") and year > PUBLIC_DOMAIN_CEILING:
        return None, f"{year} contradicts public_domain"
    return year, "ok"


def restore(path: Path) -> int:
    rows = json.loads(path.read_text())["rows"]
    eng = create_engine(settings.database_url, pool_pre_ping=True)
    with eng.begin() as c:
        for r in rows:
            c.execute(text("UPDATE plays SET year_written = :y WHERE id = :i"),
                      {"y": r["was"], "i": r["id"]})
    print(f"restored {len(rows)} plays from {path.name}")
    return len(rows)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--restore", type=Path, default=None)
    args = ap.parse_args()

    if args.restore:
        restore(args.restore)
        return 0

    eng = create_engine(settings.database_url, pool_pre_ping=True, pool_recycle=1800)
    with eng.connect() as c:
        rows = c.execute(text("""
            SELECT p.id, p.title, p.author, p.copyright_status, count(m.id) n
            FROM plays p JOIN monologues m ON m.play_id = p.id
            WHERE p.year_written IS NULL
              AND coalesce(p.source_type, 'play') NOT IN ('film', 'tv')
              AND p.author IS NOT NULL
              AND (m.review_status IS NULL OR m.review_status NOT IN
                   ('pending','too_short','not_monologue','duplicate'))
            GROUP BY p.id, p.title, p.author, p.copyright_status
            ORDER BY count(m.id) DESC
        """)).fetchall()

    if args.limit:
        rows = rows[: args.limit]
    total_monos = sum(r.n for r in rows)
    print(f"{len(rows)} undated works, {total_monos} monologues behind them\n")

    client = _client()
    accepted: list[dict] = []
    refused: list[tuple] = []

    for start in range(0, len(rows), BATCH):
        batch = rows[start:start + BATCH]
        by_id = {r.id: r for r in batch}
        parsed, err = ask(client, batch)
        if err:
            print(f"  !! {err}", file=sys.stderr)
            if err.startswith("OUT OF API CREDIT"):
                return 2
            continue
        for prop in parsed or []:
            row = by_id.get(prop.get("id"))
            if row is None:
                continue
            year, why = vet(prop, row)
            if year is None:
                refused.append((row, why))
            else:
                accepted.append({"id": row.id, "year": year, "was": None,
                                 "title": row.title, "author": row.author,
                                 "n": row.n})
        print(f"  {min(start + BATCH, len(rows))}/{len(rows)} works, "
              f"{len(accepted)} dated, {len(refused)} left NULL", flush=True)

    dated_monos = sum(a["n"] for a in accepted)
    print(f"\n{'='*70}")
    print(f"dated   {len(accepted)} works  ({dated_monos} monologues)")
    print(f"left    {len(refused)} works NULL (better than a wrong century)")

    if accepted:
        bands: dict[str, int] = {}
        for a in accepted:
            y = a["year"]
            key = ("pre-1600" if y < 1600 else "1600-1799" if y < 1800
                   else "1800-1879" if y < 1880 else "1880-1929  MODERN")
            bands[key] = bands.get(key, 0) + a["n"]
        print("\nmonologues by band once applied:")
        for k in sorted(bands):
            print(f"   {k:<20} {bands[k]}")
        print("\nsample:")
        for a in sorted(accepted, key=lambda x: -x["n"])[:12]:
            print(f"   {a['year']:>5}  {str(a['title'])[:40]:<40} "
                  f"{str(a['author'])[:22]:<22} {a['n']}")
    if refused:
        print("\nleft NULL (sample):")
        for row, why in refused[:8]:
            print(f"   {str(row.title)[:44]:<44} {why}")

    if not args.apply:
        print("\nDRY RUN — nothing written. Re-run with --apply.")
        return 0
    if not accepted:
        print("\nnothing to write")
        return 0

    BACKUP_DIR.mkdir(exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    bk = BACKUP_DIR / f"dated_plays_{stamp}.json"
    bk.write_text(json.dumps({"rows": accepted}, indent=1))

    with eng.begin() as c:
        for a in accepted:
            c.execute(text("UPDATE plays SET year_written = :y WHERE id = :i "
                           "AND year_written IS NULL"),
                      {"y": a["year"], "i": a["id"]})
    print(f"\nwrote {len(accepted)} years")
    print(f"undo: python -m scripts.date_undated_plays --restore {bk}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
