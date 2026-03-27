#!/usr/bin/env python
"""
Fix Film/TV monologue text formatting issues:
  1. Replace encoding artifacts (�, Â, etc.)
  2. Reflow screenplay-formatted text into normal prose paragraphs
  3. Wrap inline stage directions in (parentheses) so the frontend renders them italic
  4. Strip trailing stage directions from the end of the monologue
  5. Fill missing metadata (gender, age, emotion) via ContentAnalyzer (requires OpenAI)

Usage:
    uv run python scripts/fix_film_tv_text.py                    # Dry run (text fixes only)
    uv run python scripts/fix_film_tv_text.py --apply             # Apply text fixes to DB
    uv run python scripts/fix_film_tv_text.py --apply --metadata  # Also fill missing metadata via AI
    uv run python scripts/fix_film_tv_text.py --limit 5 --debug   # Debug mode, limit records
"""
import argparse
import re
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import SessionLocal
from app.models.actor import Monologue, Play


# ─── Encoding fixes ──────────────────────────────────────────────────────────

ENCODING_REPLACEMENTS = [
    ("�", "—"),        # common mojibake for em dash
    ("Ã©", "é"),
    ("Ã¨", "è"),
    ("Ã¼", "ü"),
    ("Ã¶", "ö"),
    ("Ã¤", "ä"),
    ("Ã±", "ñ"),
    ("â€™", "'"),      # smart single quote
    ("â€˜", "'"),      # smart single quote open
    ("â€œ", '"'),      # smart double quote open
    ("â€\x9d", '"'),   # smart double quote close
    ("â€"", "—"),      # em dash
    ("â€"", "–"),      # en dash
    ("â€¦", "…"),      # ellipsis
    ("\x00", ""),       # null bytes
    ("\r\n", "\n"),     # normalize line endings
    ("\r", "\n"),
]

def fix_encoding(text: str) -> str:
    for bad, good in ENCODING_REPLACEMENTS:
        text = text.replace(bad, good)
    # Catch any remaining replacement characters
    text = text.replace("\ufffd", "—")
    return text


# ─── Reflow screenplay-formatted text ────────────────────────────────────────

# Lines that look like stage directions (action/description, not dialogue)
STAGE_DIR_PATTERNS = [
    # Lines starting with common screenplay action keywords
    re.compile(r'^(INT\.|EXT\.|FADE|CUT TO|DISSOLVE|ANGLE ON|CLOSE ON|SERIES OF|INTERCUT|SMASH CUT|CONTINUED|BACK TO)', re.IGNORECASE),
    # Camera directions in ALL CAPS
    re.compile(r'^[A-Z\s]{10,}$'),
    # Lines that describe action (3rd person, no quotes, contains verbs of physical action)
    re.compile(r'^(He |She |They |The |A |An |His |Her |Their |\w+ (walks|runs|sits|stands|looks|turns|opens|closes|picks|puts|moves|reaches|pulls|pushes|grabs|holds|drops|throws|takes|gives|enters|exits|crosses|approaches|steps|leans|pauses|stares|watches|nods|shakes|points|waves))', re.IGNORECASE),
]

def is_stage_direction(line: str) -> bool:
    """Check if a line looks like a stage direction / action line."""
    stripped = line.strip()
    if not stripped:
        return False
    # Short parentheticals are already handled
    if stripped.startswith('(') and stripped.endswith(')'):
        return False
    if stripped.startswith('[') and stripped.endswith(']'):
        return False
    for pattern in STAGE_DIR_PATTERNS:
        if pattern.search(stripped):
            return True
    return False


def reflow_text(text: str) -> str:
    """Reflow screenplay-formatted text into prose paragraphs.

    - Joins short lines that are part of the same speech into flowing prose
    - Preserves paragraph breaks (double newlines)
    - Wraps detected stage directions in (parentheses)
    - Strips trailing stage directions
    """
    lines = text.split('\n')
    paragraphs = []
    current_paragraph: list[str] = []

    def flush_paragraph():
        if current_paragraph:
            # Join the lines into flowing prose
            joined = ' '.join(current_paragraph)
            # Clean up multiple spaces
            joined = re.sub(r'  +', ' ', joined)
            paragraphs.append(joined.strip())
            current_paragraph.clear()

    for line in lines:
        stripped = line.strip()

        # Empty line = paragraph break
        if not stripped:
            flush_paragraph()
            continue

        # Check if this is a stage direction
        if is_stage_direction(stripped):
            flush_paragraph()
            # Wrap in parentheses if not already wrapped
            if not (stripped.startswith('(') and stripped.endswith(')')):
                stripped = f'({stripped})'
            paragraphs.append(stripped)
            continue

        # Regular dialogue line - add to current paragraph
        current_paragraph.append(stripped)

    flush_paragraph()

    # Strip trailing stage directions
    while paragraphs and paragraphs[-1].startswith('(') and paragraphs[-1].endswith(')'):
        paragraphs.pop()

    return '\n\n'.join(paragraphs)


def needs_reflow(text: str) -> bool:
    """Check if text has screenplay formatting (many short lines)."""
    lines = text.split('\n')
    if len(lines) < 5:
        return False
    # Count lines shorter than 50 chars (typical screenplay column width)
    short_lines = sum(1 for l in lines if 0 < len(l.strip()) < 50)
    return short_lines / max(len(lines), 1) > 0.5


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Fix Film/TV monologue text formatting")
    parser.add_argument("--apply", action="store_true", help="Apply changes to DB (default is dry run)")
    parser.add_argument("--metadata", action="store_true", help="Also fill missing metadata via AI")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of monologues to process")
    parser.add_argument("--debug", action="store_true", help="Show detailed output")
    args = parser.parse_args()

    db = SessionLocal()

    try:
        # Get Film/TV monologues
        query = (
            db.query(Monologue)
            .join(Play)
            .filter(Play.source_type.in_(["film", "tv"]))
        )
        if args.limit:
            query = query.limit(args.limit)

        monologues = query.all()
        print(f"{'[DRY RUN] ' if not args.apply else ''}Processing {len(monologues)} Film/TV monologues\n")

        encoding_fixes = 0
        reflows = 0
        metadata_fills = 0

        for i, mono in enumerate(monologues):
            original_text = mono.text
            changed = False

            # Step 1: Fix encoding
            fixed_text = fix_encoding(original_text)
            if fixed_text != original_text:
                encoding_fixes += 1
                changed = True
                if args.debug:
                    print(f"  [{mono.id}] Encoding fix: {mono.character_name} in {mono.play.title}")

            # Step 2: Reflow if screenplay-formatted
            if needs_reflow(fixed_text):
                reflowed = reflow_text(fixed_text)
                if reflowed != fixed_text:
                    reflows += 1
                    changed = True
                    fixed_text = reflowed
                    if args.debug:
                        print(f"  [{mono.id}] Reflowed: {mono.character_name} in {mono.play.title}")
                        # Show first 200 chars of before/after
                        print(f"    BEFORE: {original_text[:200]}...")
                        print(f"    AFTER:  {fixed_text[:200]}...")
                        print()

            if changed and args.apply:
                mono.text = fixed_text
                # Update word count
                mono.word_count = len(fixed_text.split())
                mono.estimated_duration_seconds = int(len(fixed_text.split()) / 2.5)

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
                    except Exception as e:
                        print(f"    [warn] Failed: {e}")
                        continue

        if args.apply:
            db.commit()
            print(f"\n✓ Applied changes:")
        else:
            print(f"\n[DRY RUN] Would apply:")

        print(f"  Encoding fixes: {encoding_fixes}")
        print(f"  Text reflows: {reflows}")
        if args.metadata:
            print(f"  Metadata fills: {metadata_fills}")

        if not args.apply:
            print("\nRun with --apply to save changes.")

    finally:
        db.close()


if __name__ == "__main__":
    main()
