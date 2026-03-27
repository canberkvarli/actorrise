#!/usr/bin/env python
"""
Fix Film/TV monologue text formatting using AI:
  1. Replace encoding artifacts
  2. AI-powered: reflow screenplay format into prose, mark stage directions,
     strip non-dialogue text, clean up formatting
  3. Optionally fill missing metadata (gender, age, emotion) via ContentAnalyzer

Usage:
    uv run python scripts/fix_film_tv_text.py                        # Dry run
    uv run python scripts/fix_film_tv_text.py --apply                # Apply text fixes
    uv run python scripts/fix_film_tv_text.py --apply --metadata     # Also fill missing metadata
    uv run python scripts/fix_film_tv_text.py --limit 5 --debug      # Debug mode
"""
import argparse
import json
import sys
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from openai import OpenAI
import re as _re
from sqlalchemy import text, create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
from app.models.actor import Monologue, Play

client = OpenAI()
MODEL = "gpt-4o-mini"  # 200k TPM vs 30k for gpt-4o at Tier 1

# --- Encoding fixes (no AI needed) ----------------------------------------

ENCODING_REPLACEMENTS = [
    ("\ufffd", "\u2014"),           # replacement char -> em dash
    ("\u00c3\u00a9", "\u00e9"),     # mojibake e-acute
    ("\u00c3\u00a8", "\u00e8"),     # mojibake e-grave
    ("\u00c3\u00bc", "\u00fc"),     # mojibake u-umlaut
    ("\u00c3\u00b6", "\u00f6"),     # mojibake o-umlaut
    ("\u00c3\u00a4", "\u00e4"),     # mojibake a-umlaut
    ("\u00c3\u00b1", "\u00f1"),     # mojibake n-tilde
    ("\x00", ""),                    # null bytes
    ("\r\n", "\n"),                  # normalize line endings
    ("\r", "\n"),
]


def fix_encoding(text: str) -> str:
    for bad, good in ENCODING_REPLACEMENTS:
        text = text.replace(bad, good)
    return text


def needs_cleanup(text: str) -> bool:
    """Check if text likely has screenplay formatting or embedded stage directions."""
    lines = text.split("\n")
    if len(lines) < 3:
        return False
    # Many short lines = screenplay column format
    short_lines = sum(1 for l in lines if 0 < len(l.strip()) < 50)
    has_short_lines = short_lines / max(len(lines), 1) > 0.4
    # Contains ALL CAPS lines (camera directions)
    has_caps = any(l.strip().isupper() and len(l.strip()) > 8 for l in lines)
    # Contains lines starting with action verbs (3rd person narration)
    action_starts = ("He ", "She ", "They ", "The ", "A ", "An ", "His ", "Her ")
    has_action = any(l.strip().startswith(action_starts) for l in lines)
    return has_short_lines or has_caps or has_action


# --- AI-powered text cleanup -----------------------------------------------

AI_CLEANUP_PROMPT = """You are cleaning up a monologue extracted from a screenplay for use as an audition piece.

The text may have:
- Narrow screenplay column formatting (short lines that should flow as prose)
- Stage directions / action lines mixed in with dialogue (e.g. "A hand lays an envelope on the table")
- Camera directions (ANGLE ON, CUT TO, SERIES OF SHOTS, etc.)
- Character names in ALL CAPS mid-text
- Encoding artifacts

Rules:
1. KEEP all spoken dialogue exactly as written (don't change any words the character says)
2. REFLOW short lines into flowing prose paragraphs (remove artificial line breaks from screenplay columns)
3. WRAP brief inline stage directions in parentheses: (he sits down)
4. REMOVE camera directions entirely (ANGLE ON, CUT TO, CLOSE ON, INTERCUT, etc.)
5. REMOVE character name cues (like "MARSELLUS" appearing alone on a line)
6. STRIP any trailing stage directions that come after the last spoken line
7. Use double newlines between paragraphs (natural speech breaks)
8. Keep the character's voice and word choices exactly intact

Return ONLY the cleaned monologue text. No explanations, no markdown."""


def ai_cleanup_batch(monologues: list[tuple[int, str, str, str]]) -> dict[int, str]:
    """Clean up a batch of monologues using AI.

    Args: list of (id, text, character_name, play_title)
    Returns: dict of {id: cleaned_text}
    """
    results = {}

    for mono_id, text, char_name, play_title in monologues:
        try:
            response = client.chat.completions.create(
                model=MODEL,
                temperature=0.1,
                max_tokens=2000,
                messages=[
                    {"role": "system", "content": AI_CLEANUP_PROMPT},
                    {"role": "user", "content": f"Character: {char_name}\nPlay/Film: {play_title}\n\nOriginal text:\n{text}"},
                ],
            )
            cleaned = response.choices[0].message.content.strip()
            # Sanity check: cleaned text should be at least 50 chars
            if len(cleaned) >= 50:
                results[mono_id] = cleaned
            else:
                print(f"    [warn] id={mono_id} AI output too short ({len(cleaned)} vs {len(text)}), skipping")
        except Exception as e:
            print(f"    [warn] id={mono_id} AI cleanup failed: {e}")
            if "429" in str(e) or "rate_limit" in str(e):
                time.sleep(2)

    return results


# --- Main -------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Fix Film/TV monologue text formatting")
    parser.add_argument("--apply", action="store_true", help="Apply changes to DB (default is dry run)")
    parser.add_argument("--metadata", action="store_true", help="Also fill missing metadata via AI")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of monologues to process")
    parser.add_argument("--debug", action="store_true", help="Show detailed output")
    parser.add_argument("--concurrency", type=int, default=2, help="Concurrent AI requests")
    parser.add_argument("--skip-encoding", action="store_true", help="Skip encoding fixes (if DB timeouts)")
    parser.add_argument("--skip-reflow", action="store_true", help="Skip AI text reflow (just do metadata)")
    args = parser.parse_args()

    # Use direct connection (port 5432) instead of pooler (6543) to avoid statement timeout
    direct_url = _re.sub(r':6543/', ':5432/', settings.database_url)
    print(f"  Using direct DB connection (port 5432)\n")
    engine = create_engine(direct_url)
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = Session()

    try:
        query = (
            db.query(Monologue)
            .join(Play)
            .filter(Play.source_type.in_(["film", "tv"]))
        )
        if args.limit:
            query = query.limit(args.limit)

        monologues = query.all()
        print(f"{'[DRY RUN] ' if not args.apply else ''}Processing {len(monologues)} Film/TV monologues")
        print(f"  model={MODEL}, concurrency={args.concurrency}\n")

        encoding_fixes = 0
        ai_cleanups = 0
        metadata_fills = 0

        def safe_update(mono_id: int, **kwargs):
            """Update a single monologue using raw SQL with timeout override."""
            sets = ", ".join(f"{k} = :{k}" for k in kwargs)
            kwargs["mid"] = mono_id
            db.execute(text(f"SET LOCAL statement_timeout = '120s'"))
            db.execute(text(f"UPDATE monologues SET {sets}, updated_at = now() WHERE id = :mid").bindparams(**kwargs))
            db.commit()

        def safe_commit():
            """Commit with timeout override."""
            db.execute(text("SET LOCAL statement_timeout = '120s'"))
            db.commit()

        # Step 1: Encoding fixes (fast, no AI) - commit each individually
        if args.skip_encoding:
            print("Skipping encoding fixes (--skip-encoding)")
        for mono in ([] if args.skip_encoding else monologues):
            fixed = fix_encoding(mono.text)
            if fixed != mono.text:
                if args.apply:
                    try:
                        safe_update(mono.id, text=fixed)
                        mono.text = fixed  # sync ORM object
                        encoding_fixes += 1
                    except Exception as e:
                        db.rollback()
                        print(f"    [warn] encoding fix failed for id={mono.id}: {e}")
                else:
                    encoding_fixes += 1

        print(f"Encoding fixes: {encoding_fixes}")

        # Step 2: AI cleanup for screenplay-formatted text
        if args.skip_reflow:
            print("Skipping AI reflow (--skip-reflow)")
            candidates = []
        else:
            candidates = [
                (mono.id, mono.text, mono.character_name, mono.play.title)
                for mono in monologues
                if needs_cleanup(mono.text)
            ]
            print(f"Monologues needing AI cleanup: {len(candidates)}")

        if candidates:
            mono_map = {m.id: m for m in monologues}
            processed = 0

            with ThreadPoolExecutor(max_workers=args.concurrency) as executor:
                futures = {}
                for item in candidates:
                    future = executor.submit(ai_cleanup_batch, [item])
                    futures[future] = item[0]

                for future in as_completed(futures):
                    mono_id = futures[future]
                    try:
                        results = future.result()
                        for mid, cleaned_text in results.items():
                            mono = mono_map[mid]
                            processed += 1

                            if args.debug:
                                print(f"\n  [{processed}/{len(candidates)}] {mono.character_name} in {mono.play.title}")
                                print(f"    BEFORE: {mono.text[:150].replace(chr(10), ' ')}...")
                                print(f"    AFTER:  {cleaned_text[:150].replace(chr(10), ' ')}...")

                            if args.apply:
                                wc = len(cleaned_text.split())
                                dur = int(wc / 2.5)
                                try:
                                    safe_update(mono.id, text=cleaned_text, word_count=wc, estimated_duration_seconds=dur)
                                    mono.text = cleaned_text
                                    ai_cleanups += 1
                                except Exception as ce:
                                    print(f"    [warn] commit failed for id={mono.id}: {ce}")
                                    db.rollback()
                            else:
                                ai_cleanups += 1

                            if processed % 20 == 0:
                                print(f"  ... {processed}/{len(candidates)} processed")

                    except Exception as e:
                        print(f"    [warn] batch error: {e}")
                        try:
                            db.rollback()
                        except Exception:
                            pass

        print(f"\n  Text changes: {encoding_fixes} encoding fixes, {ai_cleanups} reflows")

        # Step 3: Fill missing metadata via AI
        if args.metadata:
            missing_meta = [
                m for m in monologues
                if not m.primary_emotion or m.primary_emotion == "unknown"
                or not m.character_gender or m.character_gender == "any"
            ]
            print(f"\nMonologues missing metadata: {len(missing_meta)}")

            if missing_meta and args.apply:
                from app.services.ai.content_analyzer import ContentAnalyzer
                analyzer = ContentAnalyzer()

                for j, mono in enumerate(missing_meta):
                    try:
                        print(f"  Analyzing [{j+1}/{len(missing_meta)}]: {mono.character_name} in {mono.play.title}")
                        result = analyzer.analyze_monologue(
                            text=mono.text,
                            character=mono.character_name,
                            play_title=mono.play.title,
                            author=mono.play.author or "",
                        )
                        if result.get("primary_emotion"):
                            mono.primary_emotion = result["primary_emotion"]
                        if result.get("emotion_scores"):
                            mono.emotion_scores = result["emotion_scores"]
                        if result.get("themes"):
                            mono.themes = result["themes"]
                        if result.get("tone"):
                            mono.tone = result["tone"]
                        if result.get("difficulty_level"):
                            mono.difficulty_level = result["difficulty_level"]
                        if result.get("character_gender") and result["character_gender"] != "any":
                            mono.character_gender = result["character_gender"]
                        if result.get("character_age_range") and result["character_age_range"] != "any":
                            mono.character_age_range = result["character_age_range"]
                        if result.get("scene_description"):
                            mono.context_description = result["scene_description"]
                        metadata_fills += 1
                        # Commit every 20 to avoid losing progress
                        if metadata_fills % 20 == 0:
                            safe_commit()
                            print(f"    (committed {metadata_fills} metadata fills)")
                    except Exception as e:
                        print(f"    [warn] Failed: {e}")
                        db.rollback()
                        if "429" in str(e) or "rate_limit" in str(e) or "quota" in str(e):
                            print("    Hit rate/quota limit, stopping metadata fill.")
                            break
                        continue

                # Final commit for remaining metadata
                try:
                    safe_commit()
                except Exception:
                    db.rollback()

        if args.apply:
            print(f"\n  Applied changes:")
        else:
            print(f"\n[DRY RUN] Would apply:")

        print(f"  Encoding fixes: {encoding_fixes}")
        print(f"  AI text cleanups: {ai_cleanups}")
        if args.metadata:
            print(f"  Metadata fills: {metadata_fills}")

        if not args.apply:
            print("\nRun with --apply to save changes.")

    finally:
        db.close()


if __name__ == "__main__":
    main()
