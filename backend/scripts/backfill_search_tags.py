#!/usr/bin/env python
"""
Backfill search_tags for existing monologues.

Generates comprehensive tags from:
- Analysis metadata (emotion, themes, tone, difficulty)
- Character traits
- Famous lines
- Length indicators

Usage:
    uv run python scripts/backfill_search_tags.py

Options:
    --limit N: Process max N monologues (default: all)
    --force: Regenerate tags even if they already exist
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.database import SessionLocal
from app.models.actor import Monologue
from app.services.ai.content_analyzer import ContentAnalyzer


def extract_enhanced_tags(mono: Monologue, analyzer: ContentAnalyzer) -> list[str]:
    """
    Generate comprehensive search tags for a monologue.

    Args:
        mono: Monologue object
        analyzer: ContentAnalyzer instance

    Returns:
        List of unique search tags
    """
    tags = set()

    # 1. Basic analysis tags (emotion, themes, tone, etc.)
    if mono.primary_emotion:
        tags.add(mono.primary_emotion.lower())

    if mono.themes:
        tags.update(t.lower() for t in mono.themes if t)

    if mono.tone:
        tags.add(mono.tone.lower())

    if mono.difficulty_level:
        tags.add(mono.difficulty_level.lower())

    if mono.character_gender:
        tags.add(mono.character_gender.lower())

    if mono.character_age_range:
        tags.add(mono.character_age_range.lower())

    # 2. Character name
    if mono.character_name:
        tags.add(mono.character_name.lower())

    # 3. Play title
    if mono.play and mono.play.title:
        tags.add(mono.play.title.lower())

    # 4. Author
    if mono.play and mono.play.author:
        tags.add(mono.play.author.lower())

    # 5. Length tags
    if mono.word_count:
        if mono.word_count < 100:
            tags.add("short")
        elif mono.word_count > 300:
            tags.add("long")
        else:
            tags.add("medium")

        # Duration tags
        if mono.estimated_duration_seconds:
            if mono.estimated_duration_seconds < 60:
                tags.add("under_1_minute")
            elif mono.estimated_duration_seconds < 120:
                tags.add("1_2_minutes")
            elif mono.estimated_duration_seconds < 180:
                tags.add("2_3_minutes")
            else:
                tags.add("3_plus_minutes")

    # 6. Quality indicators
    if mono.quality_score and mono.quality_score > 0.8:
        tags.add("high_quality")

    if mono.is_verified:
        tags.add("verified")

    # 7. Famous line indicators (check if this is a well-known monologue)
    if mono.text:
        text_lower = mono.text.lower()
        famous_phrases = [
            "to be or not to be",
            "friends romans countrymen",
            "what light through yonder window",
            "once more unto the breach",
            "now is the winter of our discontent"
        ]
        for phrase in famous_phrases:
            if phrase in text_lower:
                tags.add("famous")
                break

    # 8. Character traits from description
    if mono.character_description:
        desc_lower = mono.character_description.lower()
        trait_keywords = [
            "ambitious", "conflicted", "angry", "sad", "happy", "wise",
            "young", "old", "noble", "servant", "king", "queen", "prince",
            "lawyer", "doctor", "soldier", "mother", "father", "lover"
        ]
        for trait in trait_keywords:
            if trait in desc_lower:
                tags.add(trait)

    # 9. Scene context
    if mono.scene_description:
        scene_lower = mono.scene_description.lower()
        scene_keywords = [
            "garden", "castle", "street", "bedroom", "forest", "battlefield",
            "night", "day", "evening", "morning"
        ]
        for keyword in scene_keywords:
            if keyword in scene_lower:
                tags.add(f"scene_{keyword}")

    # 10. Category tags
    if mono.play:
        if mono.play.category:
            tags.add(mono.play.category.lower())

        if mono.play.genre:
            tags.add(mono.play.genre.lower())

    return list(tags)


def main():
    """Backfill search tags for monologues."""
    parser = argparse.ArgumentParser(description="Backfill search tags")
    parser.add_argument(
        '--limit',
        type=int,
        default=None,
        help='Max monologues to process (default: all)'
    )
    parser.add_argument(
        '--force',
        action='store_true',
        help='Regenerate tags even if they exist'
    )

    args = parser.parse_args()

    print("=" * 60)
    print("🏷️  SEARCH TAGS BACKFILL")
    print("=" * 60)

    db = SessionLocal()
    analyzer = ContentAnalyzer()

    try:
        # Find monologues needing tags
        if args.force:
            query = db.query(Monologue)
            print("Mode: Regenerating ALL tags (--force)")
        else:
            query = db.query(Monologue).filter(
                (Monologue.search_tags == None) | (Monologue.search_tags == [])
            )
            print("Mode: Only monologues without tags")

        if args.limit:
            query = query.limit(args.limit)
            print(f"Limit: {args.limit} monologues")

        monologues = query.all()
        total = len(monologues)

        print(f"Found: {total} monologues to process")
        print("=" * 60)

        if total == 0:
            print("\n✅ All monologues already have search tags!")
            return

        # Process each monologue
        processed = 0
        errors = 0
        start_time = time.time()

        for i, mono in enumerate(monologues, 1):
            try:
                # Generate tags
                tags = extract_enhanced_tags(mono, analyzer)

                # Update monologue
                mono.search_tags = tags
                db.commit()

                processed += 1

                # Progress update every 10
                if i % 10 == 0 or i == total:
                    elapsed = time.time() - start_time
                    rate = processed / elapsed if elapsed > 0 else 0
                    remaining = (total - i) / rate if rate > 0 else 0

                    print(
                        f"[{i}/{total}] {mono.character_name} from {mono.play.title if mono.play else 'Unknown'}"
                    )
                    print(f"  Tags: {len(tags)} generated")
                    print(f"  Progress: {i/total*100:.1f}% | Rate: {rate:.1f}/s | ETA: {remaining:.0f}s")
                    print()

            except Exception as e:
                errors += 1
                print(f"❌ Error processing monologue {mono.id}: {e}")
                db.rollback()
                continue

        # Final summary
        elapsed = time.time() - start_time

        print("=" * 60)
        print("✅ BACKFILL COMPLETE")
        print("=" * 60)
        print(f"✓ Processed: {processed}")
        print(f"✗ Errors: {errors}")
        print(f"⏱  Time: {elapsed/60:.1f} minutes")
        print(f"📊 Rate: {processed/elapsed:.1f} monologues/second")
        print()
        print("Next steps:")
        print("  1. Test search: Try searching for character traits, scenes, etc.")
        print("  2. Verify tags: Check monologues have relevant tags")

    except KeyboardInterrupt:
        print("\n\n⚠️  Interrupted by user")
        db.close()
        sys.exit(1)

    except Exception as e:
        print(f"\n\n❌ Fatal error: {e}")
        import traceback
        traceback.print_exc()
        db.close()
        sys.exit(1)

    finally:
        db.close()


if __name__ == "__main__":
    main()
