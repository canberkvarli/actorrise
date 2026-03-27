#!/usr/bin/env python
"""
Extract film & TV monologues from IMSDb scripts using scraping + AI identification.

Pipeline:
  1. For each film in film_tv_references that has an IMSDb URL, fetch the script HTML.
  2. Parse screenplay format: extract dialogue blocks by character.
  3. Identify continuous speeches by one character (monologue candidates).
  4. Use GPT-4o-mini to pick the best audition-worthy monologues from the candidates.
  5. Run ContentAnalyzer for emotion/theme/tone analysis + embeddings.
  6. Store as Play + Monologue records with full attribution.

Legal:
  - Only short excerpts (1-2 minutes of dialogue, 100-400 words), not full scripts.
  - Full script text is never stored — only the extracted monologue excerpt.
  - copyright_status = "copyrighted", license_type = "fair_use"
  - Always includes attribution to writer/director and IMSDb source link.

Cost estimate:
  - GPT-4o-mini for monologue selection: ~$0.001/script
  - GPT-4o-mini for analysis: ~$0.002/monologue
  - Embedding (text-embedding-3-large): ~$0.0001/monologue
  - 1000 scripts → ~3000 monologues ≈ $10-15 total

Usage:
    uv run python scripts/extract_film_tv_monologues.py                    # All with IMSDb URLs
    uv run python scripts/extract_film_tv_monologues.py --limit 5          # Test with 5 scripts
    uv run python scripts/extract_film_tv_monologues.py --dry-run          # Preview only
    uv run python scripts/extract_film_tv_monologues.py --min-rating 8.0   # Only high-rated films
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path
from typing import Optional

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

import requests
from bs4 import BeautifulSoup
from openai import OpenAI
from sqlalchemy.orm import Session as DBSession

from app.core.database import SessionLocal
from app.models.actor import FilmTvReference, Monologue, Play
from app.services.ai.content_analyzer import ContentAnalyzer


# ── IMSDb Scraping ───────────────────────────────────────────────────────────

IMSDB_HEADERS = {
    "User-Agent": "ActorRise/1.0 (audition-prep; monologue-extraction)",
    "Accept": "text/html",
}
IMSDB_DELAY = 2.0  # seconds between requests — be respectful


def fetch_script_html(urls: list[str] | str, debug: bool = False) -> tuple[str | None, str | None]:
    """Fetch raw HTML from an IMSDb script page. Tries multiple URLs.
    Returns (html, working_url) or (None, None) if not found."""
    if isinstance(urls, str):
        urls = [urls]
    for url in urls:
        try:
            resp = requests.get(url, headers=IMSDB_HEADERS, timeout=15)
            if debug:
                print(f"    DEBUG: {url} → status={resp.status_code}, len={len(resp.text)}, has_scrtext={'scrtext' in resp.text}")
            if resp.status_code == 404:
                continue
            resp.raise_for_status()
            # Verify this is actually a script page (has scrtext class)
            if "scrtext" not in resp.text:
                continue
            # IMSDb returns a ~7785 byte shell page for missing scripts — detect it
            if len(resp.text) < 10000:
                if debug:
                    print(f"    DEBUG: page too short ({len(resp.text)} bytes), likely not a real script")
                continue
            return resp.text, url
        except Exception as e:
            if debug:
                print(f"    DEBUG: fetch error for {url}: {e}")
            continue
    return None, None


def _title_to_slug(title: str) -> str:
    """Convert a title to an IMSDb URL slug."""
    slug = title.strip()
    slug = re.sub(r"[''']", "", slug)
    slug = re.sub(r"\s*&\s*", "-and-", slug)
    slug = re.sub(r"\s+", "-", slug)
    slug = re.sub(r"[^a-zA-Z0-9-]", "", slug)
    return slug


def build_imsdb_url(title: str) -> list[str]:
    """Build candidate IMSDb URLs for a title. Returns multiple variants to try."""
    slug = _title_to_slug(title)
    urls = [f"https://imsdb.com/scripts/{slug}.html"]

    # IMSDb often moves articles to the end: "The Godfather" → "Godfather,-The"
    article_match = re.match(r"^(The|A|An)\s+(.+)$", title.strip(), flags=re.IGNORECASE)
    if article_match:
        article = article_match.group(1)
        rest = article_match.group(2)
        # Try: "Godfather,-The.html"
        rest_slug = _title_to_slug(rest)
        urls.append(f"https://imsdb.com/scripts/{rest_slug},-{article}.html")
        # Try without article entirely: "Godfather.html"
        urls.append(f"https://imsdb.com/scripts/{rest_slug}.html")

    return urls


# ── Script Parsing ───────────────────────────────────────────────────────────

def parse_screenplay(html: str) -> list[dict]:
    """
    Parse IMSDb screenplay HTML into dialogue blocks.

    IMSDb structure: <td class="scrtext"> with <b> tags for character names
    and scene headings. Dialogue is plain text between <b> tags.

    Strategy: find all <b> tags, identify character names, collect text
    between consecutive <b> tags as dialogue for the preceding character.

    Returns list of: { character: str, text: str, word_count: int }
    """
    soup = BeautifulSoup(html, "lxml")

    # Find the script content container
    scrtext = soup.find("td", class_="scrtext")
    if not scrtext:
        return []

    # Get ALL <b> tags in the script area
    b_tags = scrtext.find_all("b")
    if len(b_tags) < 5:
        return []

    blocks: list[dict] = []
    current_character: str | None = None

    for b_tag in b_tags:
        bold_text = b_tag.get_text().strip()

        # Skip empty, scene headings, transitions
        if not bold_text or _is_scene_heading(bold_text):
            # Flush: collect text AFTER this <b> tag but it's not dialogue
            if current_character:
                # Grab text between previous character <b> and this <b>
                dialogue = _collect_text_after_b(b_tag.find_previous("b"), b_tag)
                if dialogue:
                    blocks.append({
                        "character": current_character,
                        "text": dialogue,
                        "word_count": len(dialogue.split()),
                    })
                current_character = None
            continue

        if _is_character_name(bold_text):
            # Flush previous character's dialogue
            if current_character:
                dialogue = _collect_text_after_b(b_tag.find_previous("b"), b_tag)
                if dialogue:
                    blocks.append({
                        "character": current_character,
                        "text": dialogue,
                        "word_count": len(dialogue.split()),
                    })
            current_character = _normalize_character_name(bold_text)
        else:
            # Not a character name or heading — skip
            if current_character:
                dialogue = _collect_text_after_b(b_tag.find_previous("b"), b_tag)
                if dialogue:
                    blocks.append({
                        "character": current_character,
                        "text": dialogue,
                        "word_count": len(dialogue.split()),
                    })
                current_character = None

    return blocks


def _collect_text_after_b(prev_b, next_b) -> str:
    """Collect plain text between two <b> tags (the dialogue after prev_b, before next_b)."""
    if not prev_b:
        return ""
    text_parts: list[str] = []
    node = prev_b.next_sibling
    while node and node != next_b:
        if hasattr(node, "name") and node.name == "b":
            break
        if hasattr(node, "name") and node.name is not None:
            # Skip other tags (but grab their text if it's inline like <i>)
            txt = node.get_text().strip()
            if txt:
                text_parts.append(txt)
        else:
            txt = str(node).strip()
            if txt:
                text_parts.append(txt)
        node = node.next_sibling
    return _clean_dialogue(" ".join(text_parts))


def _is_scene_heading(text: str) -> bool:
    """Check if bold text is a scene heading, not a character name."""
    t = text.strip().upper()
    return bool(
        re.match(r"^(INT\.|EXT\.|INT/EXT|I/E\b)", t)
        or t.endswith(":")  # CUT TO:, FADE IN:, etc.
        or t in {"CONTINUED", "FADE IN", "FADE OUT", "FADE TO BLACK", "THE END",
                  "DISSOLVE TO", "SMASH CUT TO", "TITLE CARD", "SUPER", "MONTAGE"}
        or t.startswith("TITLE")
        or t.startswith("SUPER:")
    )


def _is_character_name(text: str) -> bool:
    """Check if bold text looks like a character name."""
    t = text.strip()
    # Must be mostly uppercase
    alpha = re.sub(r"[^a-zA-Z]", "", t)
    if not alpha or len(alpha) < 2:
        return False
    upper_ratio = sum(1 for c in alpha if c.isupper()) / len(alpha)
    if upper_ratio < 0.7:
        return False
    # Character names are typically short (1-4 words)
    words = t.split()
    if len(words) > 5:
        return False
    # Remove parentheticals like (V.O.) (O.S.) (CONT'D)
    clean = re.sub(r"\(.*?\)", "", t).strip()
    return len(clean) >= 2


def _normalize_character_name(text: str) -> str:
    """Clean up character name: remove (V.O.), (CONT'D), etc."""
    name = re.sub(r"\(.*?\)", "", text).strip()
    # Title case for display
    return name.title() if name.isupper() else name


def _clean_dialogue(text: str) -> str:
    """Clean dialogue text: remove scene directions, camera cues, and excessive whitespace."""
    lines = [line.strip() for line in text.split("\n")]
    # Remove empty lines at start/end
    while lines and not lines[0]:
        lines.pop(0)
    while lines and not lines[-1]:
        lines.pop()
    # Filter out action/camera direction lines
    cleaned: list[str] = []
    for line in lines:
        if _is_action_line(line):
            continue
        # Remove inline parenthetical stage directions like (beat), (pause), (continuing)
        line = re.sub(r"\((?:beat|pause|continuing|cont(?:'d|inued)?|a beat|then|softly|quietly|whispers?|shouting|laughing|crying|sobbing|smiling|angrily|sadly)\)", "", line, flags=re.IGNORECASE).strip()
        if line:
            cleaned.append(line)
    text = "\n".join(cleaned)
    # Collapse multiple blank lines
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


# Camera/action cue patterns that indicate scene description, not dialogue
_ACTION_CUE_RE = re.compile(
    r"^(ANGLE ON|CUT TO|SERIES OF|INTERCUT|POV|CLOSE ON|SMASH CUT|"
    r"FADE|DISSOLVE|WIDE SHOT|MEDIUM SHOT|CLOSE UP|PAN TO|ZOOM|"
    r"TRACKING SHOT|CRANE SHOT|AERIAL SHOT|REVERSE ANGLE|"
    r"ANOTHER ANGLE|BACK TO|MATCH CUT|JUMP CUT|TITLE CARD|SUPER:)",
    re.IGNORECASE,
)


def _is_action_line(line: str) -> bool:
    """Check if a line is a camera direction or action description, not spoken dialogue."""
    stripped = line.strip()
    if not stripped:
        return False
    # Lines that are ALL CAPS and more than 3 words are likely scene directions
    alpha = re.sub(r"[^a-zA-Z ]", "", stripped)
    words = alpha.split()
    if len(words) >= 3 and alpha == alpha.upper() and len(alpha) > 10:
        return True
    # Known camera/editing cue patterns
    if _ACTION_CUE_RE.match(stripped):
        return True
    # Lines starting with a dash followed by ALL CAPS (shot descriptions like "- TWO MIMES with...")
    if stripped.startswith("-") and len(words) >= 3:
        first_few = " ".join(words[:3])
        if first_few == first_few.upper():
            return True
    return False


# ── Monologue Identification ─────────────────────────────────────────────────

def merge_consecutive_speeches(blocks: list[dict], min_words: int = 80) -> list[dict]:
    """
    Merge consecutive dialogue blocks by the same character into monologues.
    Also merges across short interruptions (brief stage directions or very short
    lines by other characters like "Yes." or "Go on.") — these are common in
    screenplays where the same character is essentially giving a monologue with
    minor interjections.
    Only keep speeches with min_words+ words (good audition length).
    """
    if not blocks:
        return []

    # Max words for an "interruption" we'll merge across (e.g. "Yes." = 1 word)
    INTERRUPTION_MAX_WORDS = 8

    merged: list[dict] = []
    current = blocks[0].copy()

    i = 1
    while i < len(blocks):
        block = blocks[i]
        if block["character"] == current["character"]:
            # Same character speaking — merge
            current["text"] += "\n\n" + block["text"]
            current["word_count"] += block["word_count"]
        elif (
            block["word_count"] <= INTERRUPTION_MAX_WORDS
            and i + 1 < len(blocks)
            and blocks[i + 1]["character"] == current["character"]
        ):
            # Short interruption by another character, and same character resumes.
            # Keep the interruption as an inline stage direction.
            direction = f"({block['character']}: {block['text'].strip()})"
            current["text"] += f"\n\n{direction}\n\n" + blocks[i + 1]["text"]
            current["word_count"] += blocks[i + 1]["word_count"]
            i += 2  # skip both the interruption and the resuming block
            continue
        else:
            # Different character — flush and start new
            if current["word_count"] >= min_words:
                merged.append(current)
            current = block.copy()
        i += 1

    # Flush last
    if current["word_count"] >= min_words:
        merged.append(current)

    return merged


MONOLOGUE_SELECTION_PROMPT = """You are an acting coach selecting the best audition monologues from a screenplay.

Below are monologue candidates from "{title}" ({year}), written by {writer}.
Each candidate is a continuous speech by one character. Pick the TOP {max_picks} most audition-worthy monologues.

WHAT A REAL MONOLOGUE LOOKS LIKE — this is from Hamlet:
"To be, or not to be, that is the question: Whether 'tis nobler in the mind to suffer the slings and arrows of outrageous fortune, or to take arms against a sea of troubles, and by opposing end them? To die, to sleep — no more — and by a sleep to say we end the heart-ache and the thousand natural shocks that flesh is heir to."

Notice: it is ONE PERSON SPEAKING. Every word is something an actor says out loud. There are no camera directions, no descriptions of what other characters are doing, no ALL-CAPS scene headings.

WHAT IS NOT A MONOLOGUE — REJECT these:
- Scene descriptions: "BRUCE runs down the alley. ANGLE ON his face as BULLETS FLY."
- Camera directions: "SERIES OF SHOTS", "INTERCUT WITH", "CUT TO", "CLOSE ON"
- Action/narrative text: "She picks up the glass. He turns away. The room falls silent."
- Mixed text where most of the content describes actions rather than spoken words
- Text with ALL-CAPS phrases (ANGLE ON, POV SHOTS, SMASH CUT, etc.) — these are editing cues, not dialogue

ONLY select candidates where the text is WORDS A CHARACTER ACTUALLY SPEAKS OUT LOUD. If you removed all the action lines and camera cues and less than 50% of the text remains, REJECT it.

Criteria for good audition monologues:
- Emotional depth or clear character arc within the speech
- Self-contained (makes sense without extensive context)
- 100-400 words (1-3 minutes when performed)
- Showcases acting range (not just exposition or plot delivery)
- Iconic or memorable if possible

If fewer than {max_picks} candidates are actual spoken dialogue, return fewer. Return an empty array [] if none qualify.

CANDIDATES:
{candidates}

Respond with a JSON array of objects. Each object:
{{"index": <candidate number 0-indexed>, "title": "<short descriptive title for this monologue>", "scene_description": "<1-2 sentence description of the scene for an actor>"}}

Return ONLY the JSON array, nothing else."""


def select_best_monologues(
    client: OpenAI,
    candidates: list[dict],
    title: str,
    year: int | None,
    writer: str,
    max_picks: int = 4,
) -> list[dict]:
    """Use GPT-4o-mini to select the best audition monologues from candidates."""
    if not candidates:
        return []

    # Build candidate descriptions (truncated to save tokens)
    candidate_text = ""
    for i, c in enumerate(candidates):
        preview = c["text"][:300] + ("..." if len(c["text"]) > 300 else "")
        candidate_text += f"\n[{i}] {c['character']} ({c['word_count']} words):\n{preview}\n"

    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "user",
                    "content": MONOLOGUE_SELECTION_PROMPT.format(
                        title=title,
                        year=year or "Unknown",
                        writer=writer,
                        max_picks=min(max_picks, len(candidates)),
                        candidates=candidate_text,
                    ),
                }
            ],
            temperature=0.2,
            max_tokens=1000,
        )
        raw = (response.choices[0].message.content or "").strip()
        # Parse JSON (handle markdown code blocks)
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        selections = json.loads(raw)
        return selections if isinstance(selections, list) else []
    except Exception as e:
        print(f"    AI SELECTION ERROR: {e}")
        # Fallback: pick the longest candidates
        sorted_candidates = sorted(enumerate(candidates), key=lambda x: x[1]["word_count"], reverse=True)
        return [
            {"index": i, "title": f"{c['character']}'s speech", "scene_description": ""}
            for i, c in sorted_candidates[:max_picks]
        ]


# ── Database Helpers ─────────────────────────────────────────────────────────

def get_or_create_play(
    db: DBSession,
    ref: FilmTvReference,
    writer: str,
    working_url: str | None = None,
) -> Play:
    """Get or create a Play record for a film/TV screenplay."""
    existing = (
        db.query(Play)
        .filter(Play.film_tv_reference_id == ref.id)
        .first()
    )
    if existing:
        return existing

    source_type = "tv" if ref.type == "tvSeries" else "film"
    genres = ref.genre or []
    genre_str = genres[0].lower() if genres else "drama"

    play = Play(
        title=str(ref.title),
        author=writer,
        year_written=ref.year,
        genre=genre_str,
        category="contemporary",
        source_type=source_type,
        film_tv_reference_id=int(ref.id),
        copyright_status="copyrighted",
        license_type="fair_use",
        source_url=working_url or ref.imsdb_url or build_imsdb_url(str(ref.title))[0],
        purchase_url=f"https://www.amazon.com/s?k={str(ref.title).replace(' ', '+')}+screenplay",
        language="en",
        themes=list(genres),
    )
    db.add(play)
    db.flush()
    return play


# ── Main Pipeline ────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Extract film/TV monologues from IMSDb")
    parser.add_argument("--limit", type=int, default=0, help="Limit number of scripts to process (0=all)")
    parser.add_argument("--min-rating", type=float, default=0.0, help="Minimum IMDb rating (e.g. 7.5)")
    parser.add_argument("--max-monologues", type=int, default=4, help="Max monologues per script")
    parser.add_argument("--dry-run", action="store_true", help="Preview without saving to DB")
    parser.add_argument("--skip-existing", action="store_true", default=True, help="Skip scripts already processed")
    parser.add_argument("--titles", nargs="+", help="Process specific titles (e.g. --titles 'Pulp Fiction' 'Fight Club')")
    parser.add_argument("--debug", action="store_true", help="Show debug info for fetch failures")
    args = parser.parse_args()

    client = OpenAI()
    analyzer = ContentAnalyzer()
    db = SessionLocal()

    # Find film_tv_references to process
    if args.titles:
        # Specific titles requested
        from sqlalchemy import or_
        title_filters = [FilmTvReference.title.ilike(f"%{t}%") for t in args.titles]
        query = db.query(FilmTvReference).filter(or_(*title_filters))
    else:
        # Filter to movies only (IMSDb mainly has movies, not TV), English-language, well-known
        query = db.query(FilmTvReference).filter(
            FilmTvReference.imdb_rating.isnot(None),
            FilmTvReference.type == "movie",  # IMSDb is mostly movies
        )
        if args.min_rating > 0:
            query = query.filter(FilmTvReference.imdb_rating >= args.min_rating)
    query = query.order_by(FilmTvReference.imdb_rating.desc().nullslast())
    if args.limit > 0:
        query = query.limit(args.limit)

    refs = query.all()
    print(f"Processing {len(refs)} film/TV references (min rating: {args.min_rating})...")
    if args.dry_run:
        print("DRY RUN — no data will be saved\n")

    total_scripts = 0
    total_monologues = 0
    total_skipped = 0
    total_fetch_errors = 0

    for i, ref in enumerate(refs):
        title = str(ref.title)
        year = ref.year
        writer = str(ref.director) if ref.director else "Unknown"

        # Skip if already processed
        if args.skip_existing:
            existing = db.query(Play).filter(Play.film_tv_reference_id == ref.id).first()
            if existing:
                existing_count = db.query(Monologue).filter(Monologue.play_id == existing.id).count()
                if existing_count > 0:
                    print(f"  [{i+1}/{len(refs)}] SKIP {title} — {existing_count} monologues already exist")
                    total_skipped += 1
                    continue

        # Build IMSDb URL(s) to try
        urls = [ref.imsdb_url] if ref.imsdb_url else build_imsdb_url(title)
        print(f"  [{i+1}/{len(refs)}] {title} ({year}) *{ref.imdb_rating}")
        print(f"    URLs to try: {urls}")

        # Fetch script
        html, working_url = fetch_script_html(urls, debug=args.debug)
        if not html:
            total_fetch_errors += 1
            time.sleep(IMSDB_DELAY)
            continue

        # Parse dialogue blocks
        blocks = parse_screenplay(html)
        if not blocks:
            print(f"    No dialogue blocks found (may not be a screenplay page)")
            total_fetch_errors += 1
            time.sleep(IMSDB_DELAY)
            continue

        print(f"    Parsed {len(blocks)} dialogue blocks")

        # Merge consecutive speeches and filter by length
        candidates = merge_consecutive_speeches(blocks, min_words=80)
        if not candidates:
            print(f"    No monologue-length speeches found (need 80+ words)")
            time.sleep(IMSDB_DELAY)
            continue

        print(f"    {len(candidates)} monologue candidates (80+ words)")

        # Use AI to select the best monologues
        selections = select_best_monologues(
            client, candidates, title, year, writer,
            max_picks=args.max_monologues,
        )
        print(f"    AI selected {len(selections)} monologues")

        if args.dry_run:
            for sel in selections:
                idx = sel.get("index", 0)
                if 0 <= idx < len(candidates):
                    c = candidates[idx]
                    print(f"      - {c['character']} ({c['word_count']} words): {sel.get('title', '')}")
            total_scripts += 1
            total_monologues += len(selections)
            time.sleep(IMSDB_DELAY)
            continue

        # Create Play record
        play = get_or_create_play(db, ref, writer, working_url=working_url)

        for sel in selections:
            idx = sel.get("index", 0)
            if idx < 0 or idx >= len(candidates):
                continue

            candidate = candidates[idx]
            mono_text = candidate["text"]
            character = candidate["character"]
            word_count = candidate["word_count"]

            # Cap at ~400 words for fair use
            if word_count > 450:
                words = mono_text.split()
                mono_text = " ".join(words[:400])
                word_count = 400

            duration_seconds = round(word_count / 2.5)  # ~150 wpm
            mono_title = sel.get("title", f"{character}'s speech")
            scene_desc = sel.get("scene_description", "")

            # Check for duplicate
            existing_mono = (
                db.query(Monologue)
                .filter(
                    Monologue.play_id == play.id,
                    Monologue.character_name == character,
                    Monologue.title == mono_title,
                )
                .first()
            )
            if existing_mono:
                print(f"      SKIP duplicate: {character} — {mono_title}")
                continue

            # AI analysis
            print(f"      Analyzing: {character} ({word_count} words)")
            analysis = analyzer.analyze_monologue(
                text=mono_text,
                character=character,
                play_title=title,
                author=writer,
            )

            # Embedding
            embedding = analyzer.generate_embedding(mono_text)

            # Search tags
            tags = analyzer.generate_search_tags(analysis, mono_text, character)
            if ref.type == "tvSeries":
                tags.extend(["tv series", "television"])
            else:
                tags.extend(["film", "movie"])

            monologue = Monologue(
                play_id=int(play.id),
                title=mono_title,
                character_name=character,
                text=mono_text,
                character_gender=analysis.get("character_gender"),
                character_age_range=analysis.get("character_age_range"),
                character_description=f"From {title} ({year}), directed by {writer}",
                word_count=word_count,
                estimated_duration_seconds=duration_seconds,
                difficulty_level=analysis.get("difficulty_level"),
                primary_emotion=analysis.get("primary_emotion"),
                emotion_scores=analysis.get("emotion_scores"),
                themes=analysis.get("themes"),
                tone=analysis.get("tone"),
                scene_description=scene_desc,
                search_tags=tags,
                is_verified=False,
                quality_score=None,
                overdone_score=0.3,
            )

            if embedding:
                monologue.embedding_vector = embedding

            db.add(monologue)
            db.commit()
            total_monologues += 1
            print(f"      OK Saved: {character} — {mono_title} (#{monologue.id})")

            time.sleep(0.3)  # Rate limit AI calls

        total_scripts += 1
        time.sleep(IMSDB_DELAY)  # Rate limit IMSDb requests

    print(f"\n{'='*60}")
    print(f"Done!")
    print(f"  Scripts processed: {total_scripts}")
    print(f"  Monologues created: {total_monologues}")
    print(f"  Scripts skipped (already done): {total_skipped}")
    print(f"  Fetch errors (no script found): {total_fetch_errors}")
    print(f"  Est. cost: ~${total_monologues * 0.005:.2f}")
    db.close()


if __name__ == "__main__":
    main()
