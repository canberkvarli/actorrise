#!/usr/bin/env python
"""Ingest TV monologues from ScriptSlug teleplay PDFs into the searchable library.

Pipeline (reuses the film pipeline's back half):
  1. enumerate TV episode slugs from ScriptSlug's sitemap
  2. download the teleplay PDF
  3. screenplay-aware parse (x-position) -> single-speaker candidates
  4. deterministic quality gate -> keep only clean monologues
  5. ContentAnalyzer (emotion/theme/tone/gender/age) + 1536-dim embedding + tags
  6. insert Play(source_type='tv') + Monologue rows, fair-use excerpt only

Idempotent: re-running skips episodes/monologues already inserted, so the full
run resumes after any interruption.

Usage (from backend/):
    uv run python scripts/ingest_tv_monologues.py --limit 2          # smoke test
    uv run python scripts/ingest_tv_monologues.py --dry-run          # parse only, no DB/LLM
    uv run python scripts/ingest_tv_monologues.py                    # full run (all episodes)
"""
from __future__ import annotations

import argparse
import re
import signal
import sys
import tempfile
import time
from contextlib import contextmanager
from pathlib import Path


@contextmanager
def time_limit(seconds: int):
    """Abort a block that runs longer than `seconds` (guards hung network calls)."""
    def _handler(signum, frame):
        raise TimeoutError(f"timed out after {seconds}s")
    old = signal.signal(signal.SIGALRM, _handler)
    signal.alarm(seconds)
    try:
        yield
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, old)

import requests
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

# pylint: disable=wrong-import-position
from app.core.config import settings
from app.models.actor import FilmTvReference, Monologue, Play
from app.services.ai.content_analyzer import ContentAnalyzer
from app.services.extraction.screenplay_pdf_parser import extract_screenplay_monologues
# pylint: enable=wrong-import-position

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"}
SITEMAP = "https://www.scriptslug.com/sitemap-scripts.xml"
PDF_TPL = "https://assets.scriptslug.com/live/pdf/scripts/{slug}.pdf"
SCRIPT_URL = "https://www.scriptslug.com/script/{slug}"
MAX_PER_EPISODE = 8  # cap so one episode can't flood the library

_engine = create_engine(settings.database_url, pool_size=5, max_overflow=10,
                        pool_pre_ping=True, pool_recycle=1800)
SessionLocal = sessionmaker(autocommit=False, autoflush=False,
                            expire_on_commit=False, bind=_engine)

# A TV episode slug carries a season-episode code (3-4 digits) FOLLOWED by an
# episode title: "succession-403-connors-wedding-2023". A 4-digit code that is a
# year (e.g. "superman-2025") is a movie, not an episode — exclude those.
_EP_CODE = re.compile(r"-(\d{3,4})-")


def _is_year(code: str) -> bool:
    return len(code) == 4 and 1900 <= int(code) <= 2099


def tv_episode_slugs() -> list[str]:
    xml = requests.get(SITEMAP, headers=UA, timeout=30).text
    locs = re.findall(r"<loc>https://www\.scriptslug\.com/script/([^<]+)</loc>", xml)
    out = []
    for s in locs:
        m = _EP_CODE.search(s)
        if m and not _is_year(m.group(1)):
            out.append(s)
    return out


def parse_slug(slug: str):
    m = _EP_CODE.search(slug)
    if not m or _is_year(m.group(1)):
        return None
    code = m.group(1)
    season, ep = int(code[:-2] or 0), int(code[-2:])
    show = slug[:m.start()].replace("-", " ").strip().title()
    rest = re.sub(r"-?\d{4}$", "", slug[m.end():])  # drop trailing year
    episode = rest.replace("-", " ").strip().title() or None
    return {"show": show, "season": season, "ep": ep, "episode": episode}


def load_refs(db) -> dict:
    refs = db.query(FilmTvReference).filter(FilmTvReference.type == "tvSeries").all()
    return {(r.title or "").strip().lower(): r for r in refs}


def get_or_create_play(db, meta, slug, ref) -> Play:
    source_url = SCRIPT_URL.format(slug=slug)
    existing = db.query(Play).filter(Play.source_url == source_url).first()
    if existing:
        return existing
    genres = (ref.genre if ref and ref.genre else []) or []
    play = Play(
        title=meta["show"],
        author=(ref.director if ref and ref.director else "Unknown"),
        year_written=(ref.year if ref else None),
        genre=(genres[0].lower() if genres else "drama"),
        category="contemporary",
        source_type="tv",
        film_tv_reference_id=(int(ref.id) if ref else None),
        copyright_status="copyrighted",
        license_type="fair_use",
        source_url=source_url,
        language="en",
        themes=list(genres),
    )
    db.add(play)
    db.flush()
    return play


def ingest_episode(db, analyzer, slug, refs, dry_run) -> int:
    meta = parse_slug(slug)
    if not meta:
        return 0
    # fast resume: skip episodes already ingested (Play exists with monologues)
    if not dry_run:
        done = (db.query(Play.id)
                .join(Monologue, Monologue.play_id == Play.id)
                .filter(Play.source_url == SCRIPT_URL.format(slug=slug)).first())
        if done:
            return 0
    url = PDF_TPL.format(slug=slug)
    r = None
    for attempt in range(4):  # retry 403/429 (intermittent rate-limiting)
        try:
            r = requests.get(url, headers=UA, timeout=60)
        except Exception as e:  # noqa: BLE001
            print(f"    fetch error {e}")
            time.sleep(2 * (attempt + 1))
            continue
        if r.status_code == 200 or r.status_code == 404:
            break
        time.sleep(2 * (attempt + 1))  # backoff before retry
    if r is None or r.status_code != 200 or r.content[:5] != b"%PDF-":
        print(f"    {slug[:46]:46s} PDF {getattr(r, 'status_code', 'ERR')}")
        return 0

    with tempfile.NamedTemporaryFile(suffix=".pdf") as fh:
        fh.write(r.content); fh.flush()
        cands = extract_screenplay_monologues(fh.name)

    # parser already validated the spoken dialogue (single-speaker, clean, in range)
    clean = sorted(cands, key=lambda c: c["word_count"], reverse=True)[:MAX_PER_EPISODE]
    print(f"    {meta['show'][:28]:28s} S{meta['season']}E{meta['ep']:<2} "
          f"cands={len(cands):2d} clean={len(clean):2d}"
          + ("  [dry]" if dry_run else ""))
    if dry_run or not clean:
        return len(clean)

    ref = refs.get(meta["show"].lower())
    play = get_or_create_play(db, meta, slug, ref)
    writer = play.author
    epname = f" (S{meta['season']}E{meta['ep']}{', ' + meta['episode'] if meta['episode'] else ''})"
    inserted = 0
    for c in clean:
        char, text, dialogue, wc = c["character"], c["text"], c["dialogue"], c["word_count"]
        title = f"{char}, {meta['show']}"
        # content-based dedup (idempotent resume) so a character can have more than
        # one monologue per episode without the second being dropped
        existing = [t for (t,) in db.query(Monologue.text)
                    .filter(Monologue.play_id == play.id,
                            Monologue.character_name == char).all()]
        if any(et[:80] == text[:80] for et in existing):
            continue
        try:
            # analyse / embed the SPOKEN dialogue (cleaner signal); store the
            # display text with stage directions preserved as (italic) parentheticals.
            with time_limit(90):  # guard against a hung OpenAI call
                analysis = analyzer.analyze_monologue(text=dialogue, character=char,
                                                      play_title=meta["show"], author=writer)
                embedding = analyzer.generate_embedding(dialogue)
            if not embedding:  # unsearchable without it — skip
                print(f"      skip (no embedding): {char}")
                continue
            tags = analyzer.generate_search_tags(analysis, dialogue, char)
            tags.extend(["tv series", "television"])
            directions = " ".join(re.findall(r"\([^)]*\)", text))
            mono = Monologue(
                play_id=int(play.id),
                title=title,
                character_name=char,
                text=text,
                stage_directions=directions or None,
                character_gender=analysis.get("character_gender"),
                character_age_range=analysis.get("character_age_range"),
                character_description=f"From {meta['show']}{epname}",
                word_count=wc,
                estimated_duration_seconds=round(wc / 2.5),
                difficulty_level=analysis.get("difficulty_level"),
                primary_emotion=analysis.get("primary_emotion"),
                emotion_scores=analysis.get("emotion_scores"),
                themes=analysis.get("themes"),
                tone=analysis.get("tone"),
                scene_description=analysis.get("scene_description"),
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
            print(f"      error on {char}: {e}")
    return inserted


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None, help="max episodes")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    slugs = tv_episode_slugs()
    if args.limit:
        slugs = slugs[:args.limit]
    print(f"TV episodes to process: {len(slugs)}{' (dry run)' if args.dry_run else ''}\n")

    db = SessionLocal()
    refs = {} if args.dry_run else load_refs(db)
    analyzer = None if args.dry_run else ContentAnalyzer()
    total_mono = 0
    for i, slug in enumerate(slugs, 1):
        try:
            total_mono += ingest_episode(db, analyzer, slug, refs, args.dry_run)
        except Exception as e:  # noqa: BLE001
            db.rollback()
            print(f"  [{i}] episode error: {e}")
        if i % 25 == 0:
            print(f"  ... {i}/{len(slugs)} episodes, {total_mono} monologues so far")
        time.sleep(0.4)  # be polite to the asset host
    db.close()
    print(f"\nDONE. {'Would insert' if args.dry_run else 'Inserted'} "
          f"{total_mono} TV monologues across {len(slugs)} episodes.")


if __name__ == "__main__":
    main()
