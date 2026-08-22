#!/usr/bin/env python
"""Ingest FILM monologues from ScriptSlug screenplay PDFs into the library.

Sibling of ingest_tv_monologues.py. Films, not episodes, because measurement
says that is where audition-length material lives:

    per script, monologues >= 120 words (~1 min)
        TV    0.1
        FILM  1.2

and the library agrees — existing TV monologues have a median of 56 words
against 125 for film. TV yields 20-second beats; film yields audition pieces.
Default min_words is 90 (~45s) rather than the parser's 40 for that reason.

Pipeline:
  1. enumerate FILM slugs from ScriptSlug's sitemap (episodes excluded)
  2. download the screenplay PDF
  3. screenplay-aware parse (x-position) -> single-speaker candidates
  4. deterministic quality gate -> keep only clean monologues
  5. ContentAnalyzer (emotion/theme/tone/gender/age) + embedding + tags
  6. insert Play(source_type='film') + Monologue rows, fair-use excerpt only

Two things this does that the TV ingest does not:

* **Never creates an empty Play.** The TV ingest calls get_or_create_play()
  before its per-monologue loop, and every candidate in that loop can still be
  skipped (dedupe / missing embedding / exception). When they all skip, the row
  persists with zero monologues. 252 of 1,608 play rows are such shells, and
  they are not harmless: find_catalogue_source_types() counted them as "we
  carry this", so searching Beetlejuice suppressed its own content-gap banner
  while the library held nothing of it. Here the Play is created lazily, on the
  first monologue that is actually ready to insert.

* **Records why a script produced nothing.** extract_with_status() separates
  "no long speeches" from "scanned PDF", "no cue column", and "broken fonts".
  About a quarter of a sample of well-known films hit one of the latter, and
  all of them used to look identical to an empty script.

Idempotent: re-running skips scripts and monologues already inserted.

Usage (from backend/):
    uv run python scripts/ingest_film_monologues.py --limit 5           # dry run, 5 films
    uv run python scripts/ingest_film_monologues.py --limit 50 --apply  # write 50
    uv run python scripts/ingest_film_monologues.py --apply             # full run
"""
from __future__ import annotations

import argparse
import collections
import re
import signal
import sys
import tempfile
import time
from contextlib import contextmanager
from pathlib import Path

import requests
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

# pylint: disable=wrong-import-position
from app.core.config import settings
from app.models.actor import FilmTvReference, Monologue, Play
from app.services.ai.content_analyzer import ContentAnalyzer
from app.services.extraction.screenplay_pdf_parser import extract_with_status
from scripts.extract_film_tv_monologues import select_best_monologues
# pylint: enable=wrong-import-position

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"}
SITEMAP = "https://www.scriptslug.com/sitemap-scripts.xml"
PDF_TPL = "https://assets.scriptslug.com/live/pdf/scripts/{slug}.pdf"
SCRIPT_URL = "https://www.scriptslug.com/script/{slug}"
MAX_PER_FILM = 4          # cap so one script cannot flood the library
SELECTION_POOL = 20       # candidates offered to the selector, longest first
DEFAULT_MIN_WORDS = 90    # ~45s; see the yield table above
REQUEST_DELAY_SECONDS = 1.0

_EP_CODE = re.compile(r"-(\d{3,4})-")
_TRAILING_YEAR = re.compile(r"-(\d{4})$")

_engine = create_engine(settings.database_url, pool_size=5, max_overflow=10,
                        pool_pre_ping=True, pool_recycle=1800)
SessionLocal = sessionmaker(autocommit=False, autoflush=False,
                            expire_on_commit=False, bind=_engine)


@contextmanager
def time_limit(seconds: int):
    def _handler(signum, frame):  # noqa: ARG001
        raise TimeoutError(f"timed out after {seconds}s")
    old = signal.signal(signal.SIGALRM, _handler)
    signal.alarm(seconds)
    try:
        yield
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, old)


def _is_year(code: str) -> bool:
    return len(code) == 4 and 1900 <= int(code) <= 2099


def film_slugs() -> list[str]:
    """Film slugs from the sitemap: a trailing year, and no episode code.

    Mirrors ingest_tv_monologues' rule from the other side — "succession-403-
    connors-wedding-2023" is an episode, "good-will-hunting-1997" is a film.
    """
    xml = requests.get(SITEMAP, headers=UA, timeout=30).text
    locs = re.findall(r"<loc>https://www\.scriptslug\.com/script/([^<]+)</loc>", xml)
    out = []
    for s in locs:
        m = _EP_CODE.search(s)
        if m and not _is_year(m.group(1)):
            continue  # episode
        if _TRAILING_YEAR.search(s):
            out.append(s)
    return out


def parse_film_slug(slug: str):
    m = _TRAILING_YEAR.search(slug)
    if not m:
        return None
    year = int(m.group(1))
    title = slug[: m.start()].replace("-", " ").strip().title()
    return {"title": title, "year": year} if title else None


def _norm_title(v: str) -> str:
    """Fold a title to a comparable key.

    Slug-derived titles lose punctuation ("A.I. Artificial Intelligence" ->
    "A I Artificial Intelligence") and spell out ampersands, so exact matching
    against the reference table hit only 77%. The other 23% would have been
    written with author "Unknown" and no poster — which is how the TV corpus
    ended up 99.6% authorless.
    """
    v = (v or "").lower().replace("&", " and ")
    v = re.sub(r"[^\w\s]", " ", v)
    v = re.sub(r"\s+", " ", v).strip()
    return re.sub(r"^(the|a|an)\s+", "", v)


def load_refs(db) -> dict:
    """Normalised title -> list of reference rows, for the 12k films.

    Selects columns explicitly. Loading full ORM objects drags the pgvector
    `embedding` column along for every row, which is enough to hit the server's
    statement timeout before the first film is even fetched.
    """
    rows = (db.query(FilmTvReference.id, FilmTvReference.title,
                     FilmTvReference.year, FilmTvReference.genre,
                     FilmTvReference.director)
              .filter(FilmTvReference.type == "movie").all())
    index: dict = {}
    for r in rows:
        index.setdefault(_norm_title(r.title), []).append(r)
    return index


def match_ref(refs: dict, title: str, year: int | None):
    """Best reference for a slug-derived title, or None.

    Several films share a title across remakes, so when the key is ambiguous
    the release year decides.
    """
    hits = refs.get(_norm_title(title))
    if not hits:
        return None
    if len(hits) == 1 or year is None:
        return hits[0]
    return min(hits, key=lambda r: abs((r.year or 0) - year))


def get_or_create_play(db, meta, slug, ref) -> Play:
    """The existing row for this film, or a new one.

    Keyed on normalised title AND year, not on source_url. The same film
    reached from two catalogues — an IMSDb row from the original ingest and a
    ScriptSlug slug now — has two different source_urls and used to become two
    rows: "Dawn of the Dead" is three, "The Apartment" three, "Punch-Drunk
    Love" and "Punch Drunk Love" two. It also meant filling an empty shell
    never actually filled it; the monologues landed on a fresh row beside it
    while the shell stayed at zero.

    Year is part of the key because films genuinely reuse titles: Dawn of the
    Dead 1978 and 2004 are different works, as are The Apartment 1960 and 1996,
    Godzilla 1954 and 2014, The Little Mermaid 1989 and 2023. Matching on title
    alone would merge a remake into its original. A row with no year recorded
    is matched only by title, since there is nothing better to compare.
    """
    from sqlalchemy import func as _func

    title = (meta.get("title") or "").strip()
    year = (ref.year if ref and ref.year else meta.get("year"))
    if title:
        q = db.query(Play).filter(
            Play.source_type == "film",
            _func.lower(Play.title) == title.lower(),
        )
        for candidate in q.order_by(Play.id).all():
            if year and candidate.year_written and abs(int(candidate.year_written) - int(year)) > 1:
                continue  # a different film that happens to share the title
            return candidate

    play = build_play(meta, slug, ref)
    db.add(play)
    db.flush()
    return play


def build_play(meta, slug, ref) -> Play:
    genres = (ref.genre if ref and ref.genre else []) or []
    return Play(
        title=meta["title"],
        author=(ref.director if ref and ref.director else "Unknown"),
        year_written=(ref.year if ref else meta.get("year")),
        genre=(genres[0].lower() if genres else "drama"),
        category="contemporary",
        source_type="film",
        film_tv_reference_id=(int(ref.id) if ref else None),
        copyright_status="copyrighted",
        license_type="fair_use",
        source_url=SCRIPT_URL.format(slug=slug),
        language="en",
        themes=list(genres),
    )


_PDF_HREF_RE = re.compile(r'https?://[^"\'<> ]+\.pdf')


def pdf_url_from_page(slug: str) -> str | None:
    """The PDF link as the script page actually gives it.

    PDF_TPL assumes the asset filename equals the sitemap slug. It usually
    does, and when it does not the CDN answers 403 — the same status, the same
    short body, on every retry — which reads exactly like a deliberate block.
    It is not. We are asking for a file that does not exist. On the TV side
    this accounted for 66 of 473 episodes and every one came back once the link
    was read off the page instead of constructed.
    """
    try:
        r = requests.get(SCRIPT_URL.format(slug=slug), headers=UA, timeout=30)
        if r.status_code != 200:
            return None
        for href in _PDF_HREF_RE.findall(r.text):
            if "/pdf/scripts/" in href:
                return href
    except Exception:  # noqa: BLE001
        return None
    return None


def fetch_pdf(slug: str):
    """PDF bytes for a slug, or (None, reason).

    Constructed URL first — it is right most of the time and costs one
    request — then the page link as a fallback.
    """
    tried_constructed = PDF_TPL.format(slug=slug)
    last_status = "ERR"
    for url in (tried_constructed, None):
        if url is None:
            url = pdf_url_from_page(slug)
            if not url or url == tried_constructed:
                break
            print(f"    {slug[:40]:40s} PDF via page link")
        r = None
        for attempt in range(3):
            try:
                r = requests.get(url, headers=UA, timeout=90)
            except Exception as e:  # noqa: BLE001
                print(f"    fetch error {e}")
                time.sleep(2 * (attempt + 1))
                continue
            if r.status_code in (200, 404):
                break
            time.sleep(2 * (attempt + 1))
        if r is not None:
            last_status = r.status_code
            if r.status_code == 200 and r.content[:5] == b"%PDF-":
                return r.content, None
    return None, f"http_{last_status}"


def ingest_film(db, analyzer, selector, slug, refs, apply, min_words,
                delay: float = REQUEST_DELAY_SECONDS) -> tuple[int, str]:
    meta = parse_film_slug(slug)
    if not meta:
        return 0, "unparsable_slug"

    source_url = SCRIPT_URL.format(slug=slug)
    if apply:
        done = (db.query(Play.id)
                  .join(Monologue, Monologue.play_id == Play.id)
                  .filter(Play.source_url == source_url).first())
        if done:
            return 0, "already_ingested"

    time.sleep(delay)  # be a polite guest; also reduces 403s
    content, err = fetch_pdf(slug)
    if err:
        print(f"    {meta['title'][:34]:34s} {err}")
        return 0, err

    with tempfile.NamedTemporaryFile(suffix=".pdf") as fh:
        fh.write(content)
        fh.flush()
        cands, status = extract_with_status(fh.name, min_words=min_words, max_words=400)

    pool = sorted(cands, key=lambda c: c["word_count"], reverse=True)[:SELECTION_POOL]
    ref = match_ref(refs, meta["title"], meta.get("year"))
    # No reference means no director, no year, no genre and no poster. Writing
    # the row anyway is what left the TV corpus 99.6% authorless, so skip and
    # report it instead — the film can be ingested once its metadata exists.
    if ref is None or not ref.director:
        print(f"    {meta['title'][:34]:34s} no_metadata")
        return 0, "no_metadata"
    writer = ref.director

    # Mechanically clean is not the same as worth auditioning with. Longest-N
    # was only ever a placeholder; the selector is an acting-coach prompt that
    # judges whether a speech actually stands alone.
    if apply and selector is not None and pool:
        try:
            # Returns SELECTION RECORDS -- {"index", "title",
            # "scene_description"} -- not candidates. Map each index back to
            # the pool, and keep the coach's title and scene description: they
            # are better than a generated "Character, Film" label.
            picks = select_best_monologues(selector, pool, meta["title"],
                                           meta.get("year"), writer,
                                           max_picks=MAX_PER_FILM)
            clean, seen_idx = [], set()
            for s in picks:
                i = s.get("index")
                if not isinstance(i, int) or not 0 <= i < len(pool) or i in seen_idx:
                    continue
                seen_idx.add(i)
                c = dict(pool[i])
                c["sel_title"] = (s.get("title") or "").strip() or None
                c["sel_scene"] = (s.get("scene_description") or "").strip() or None
                clean.append(c)
        except Exception as e:  # noqa: BLE001 — never lose a film to a bad call
            print(f"      selection failed ({e}); falling back to longest")
            clean = pool[:MAX_PER_FILM]
    else:
        clean = pool[:MAX_PER_FILM]

    print(f"    {meta['title'][:34]:34s} {status:22s} cands={len(cands):3d} "
          f"keep={len(clean):2d}" + ("" if apply else "  [dry]"))
    if not apply or not clean:
        return len(clean), status

    # The Play is deliberately NOT created yet. Every candidate below can still
    # be skipped, and a Play with no monologues is worse than no Play at all —
    # see the module docstring.
    play = db.query(Play).filter(Play.source_url == source_url).first()
    inserted = 0
    for c in clean:
        char, text, dialogue, wc = c["character"], c["text"], c["dialogue"], c["word_count"]
        sel_title, sel_scene = c.get("sel_title"), c.get("sel_scene")
        if play is not None:
            existing = [t for (t,) in db.query(Monologue.text)
                        .filter(Monologue.play_id == play.id,
                                Monologue.character_name == char).all()]
            if any(et[:80] == text[:80] for et in existing):
                continue
        try:
            with time_limit(90):  # guard against a hung OpenAI call
                analysis = analyzer.analyze_monologue(
                    text=dialogue, character=char,
                    play_title=meta["title"], author=writer)
                embedding = analyzer.generate_embedding(dialogue)
            if not embedding:  # unsearchable without it
                print(f"      skip (no embedding): {char}")
                continue
            tags = analyzer.generate_search_tags(analysis, dialogue, char)
            tags.extend(["film", "screenplay"])
            directions = " ".join(re.findall(r"\([^)]*\)", text))

            if play is None:  # first keeper — only now is a Play warranted
                play = get_or_create_play(db, meta, slug, ref)

            mono = Monologue(
                play_id=int(play.id),
                title=(sel_title or f"{char}, {meta['title']}"),
                character_name=char,
                text=text,
                stage_directions=directions or None,
                character_gender=analysis.get("character_gender"),
                character_age_range=analysis.get("character_age_range"),
                character_description=f"From {meta['title']} ({meta['year']})",
                word_count=wc,
                estimated_duration_seconds=round(wc / 2.5),
                difficulty_level=analysis.get("difficulty_level"),
                primary_emotion=analysis.get("primary_emotion"),
                emotion_scores=analysis.get("emotion_scores"),
                themes=analysis.get("themes"),
                tone=analysis.get("tone"),
                scene_description=(sel_scene or analysis.get("scene_description")),
                search_tags=list(set(tags)),
                is_verified=False,
                overdone_score=0.3,
            )
            mono.embedding_vector = embedding
            db.add(mono)
            db.commit()
            inserted += 1
        except Exception as e:  # noqa: BLE001
            db.rollback()
            play = db.query(Play).filter(Play.source_url == source_url).first()
            print(f"      error on {char}: {e}")
    return inserted, status


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--limit", type=int, default=None, help="max films")
    ap.add_argument("--min-words", type=int, default=DEFAULT_MIN_WORDS)
    ap.add_argument("--apply", action="store_true",
                    help="write to the DB (default is a dry run)")
    ap.add_argument("--no-select", action="store_true",
                    help="skip audition-worthiness selection, keep the longest")
    ap.add_argument("--delay", type=float, default=REQUEST_DELAY_SECONDS,
                    help="seconds between fetches; raise it if 403s climb")
    ap.add_argument("--slugs", default=None,
                    help="comma-separated slugs to ingest instead of the full "
                         "sitemap (targeted re-runs, retrying 403s)")
    args = ap.parse_args()

    if args.slugs:
        slugs = [s.strip() for s in args.slugs.split(",") if s.strip()]
    else:
        slugs = film_slugs()
    if args.limit:
        slugs = slugs[: args.limit]
    print(f"{len(slugs)} film slugs; min_words={args.min_words}; "
          f"{'APPLY' if args.apply else 'DRY RUN'}\n")

    db = SessionLocal()
    analyzer = ContentAnalyzer() if args.apply else None
    selector = None
    if args.apply and not args.no_select:
        from openai import OpenAI
        selector = OpenAI(api_key=settings.openai_api_key)
    statuses: collections.Counter = collections.Counter()
    total = 0
    try:
        refs = load_refs(db)  # 12k rows, loaded once
        for slug in slugs:
            try:
                n, status = ingest_film(db, analyzer, selector, slug, refs,
                                        args.apply, args.min_words, args.delay)
            except Exception as e:  # noqa: BLE001
                db.rollback()
                print(f"    {slug[:34]:34s} ERROR {e}")
                statuses["error"] += 1
                continue
            statuses[status] += 1
            total += n
    finally:
        db.close()

    print(f"\n{'inserted' if args.apply else 'would keep'}: {total}")
    print("per-script status:")
    for status, n in statuses.most_common():
        print(f"   {status:22s} {n}")


if __name__ == "__main__":
    main()
