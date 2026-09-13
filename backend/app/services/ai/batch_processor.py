"""Process multiple monologues with AI analysis efficiently."""

import asyncio
from typing import List, Optional
from sqlalchemy import or_
from sqlalchemy.orm import Session
from app.models.actor import Monologue, Play
from app.services.search.semantic_search import HIDDEN_REVIEW_STATUSES
from .content_analyzer import ContentAnalyzer
import json


class BatchProcessor:
    """Process monologues in batches to avoid rate limits"""

    def __init__(self, db: Session, api_key: Optional[str] = None):
        self.db = db
        self.analyzer = ContentAnalyzer(api_key=api_key)

    async def process_monologues(
        self,
        monologue_ids: Optional[List[int]] = None,
        batch_size: int = 10,
        skip_analyzed: bool = True
    ):
        """
        Process monologues in batches to avoid rate limits.

        OpenAI rate limits (Tier 1):
        - GPT-4o-mini: 500 RPM, 200,000 TPM
        - Embeddings: 500 RPM, 1,000,000 TPM

        Args:
            monologue_ids: Specific IDs to process. If None, processes all unanalyzed.
            batch_size: Number of monologues to process in parallel
            skip_analyzed: Skip monologues that already have embeddings
        """

        # Build query
        query = self.db.query(Monologue).join(Play)

        if monologue_ids:
            query = query.filter(Monologue.id.in_(monologue_ids))

        if skip_analyzed:
            query = query.filter(Monologue.embedding_vector.is_(None))

        # A row that search can never return must not be embedded. 4,550 rows
        # retired as too_short/duplicate/not_monologue each carried 6 KB of
        # float32 and an entry in the HNSW index -- 65 MB of a 500 MB quota
        # spent on speeches nobody can reach. Their vectors were dropped, and
        # without this filter the next `skip_analyzed` run would buy them all
        # back from OpenAI and put the storage straight back.
        query = query.filter(
            or_(
                Monologue.review_status.is_(None),
                Monologue.review_status.notin_(tuple(HIDDEN_REVIEW_STATUSES)),
            )
        )

        monologues = query.all()

        total = len(monologues)
        print(f"\n{'='*70}")
        print(f"🤖 AI Analysis - Processing {total} monologues")
        print(f"{'='*70}\n")

        processed = 0
        errors = 0

        for i in range(0, total, batch_size):
            batch = monologues[i:i + batch_size]

            print(f"📊 Processing batch {i // batch_size + 1} ({i + 1}-{min(i + batch_size, total)} of {total})")

            # Process batch
            for monologue in batch:
                try:
                    print(f"  🔍 Analyzing: {monologue.title} ({monologue.id})")

                    # Analyze content
                    analysis = self.analyzer.analyze_monologue(
                        text=monologue.text,
                        character=monologue.character_name,
                        play_title=monologue.play.title,
                        author=monologue.play.author
                    )

                    # Update monologue with analysis
                    monologue.primary_emotion = analysis.get('primary_emotion')
                    monologue.emotion_scores = analysis.get('emotion_scores')
                    monologue.themes = analysis.get('themes')
                    monologue.tone = analysis.get('tone')
                    monologue.difficulty_level = analysis.get('difficulty_level')
                    monologue.character_age_range = analysis.get('character_age_range')
                    monologue.character_gender = analysis.get('character_gender')
                    monologue.scene_description = analysis.get('scene_description')

                    print(f"    ✅ Emotion: {monologue.primary_emotion}, Themes: {', '.join(monologue.themes or [])}")

                    # Generate embedding
                    print(f"    🔢 Generating embedding...")
                    embedding = self.analyzer.generate_embedding(monologue.text)

                    if embedding:
                        monologue.embedding_vector = embedding
                        print(f"    ✅ Embedding generated ({len(embedding)} dimensions)")
                    else:
                        print(f"    ⚠️  Failed to generate embedding")

                    # Generate tags
                    tags = self.analyzer.generate_search_tags(
                        analysis,
                        monologue.text,
                        monologue.character_name
                    )
                    monologue.search_tags = tags

                    self.db.commit()
                    processed += 1

                    print(f"    ✨ Complete!\n")

                except Exception as e:
                    print(f"    ❌ Error: {e}\n")
                    self.db.rollback()
                    errors += 1
                    continue

            # Rate limiting: wait between batches
            if i + batch_size < total:
                print(f"  ⏸️  Waiting 2 seconds before next batch...\n")
                await asyncio.sleep(2)

        print(f"\n{'='*70}")
        print(f"✅ AI Analysis Complete")
        print(f"   Processed: {processed}")
        print(f"   Errors: {errors}")
        print(f"   Success rate: {processed / (processed + errors) * 100:.1f}%")
        print(f"{'='*70}\n")

    def process_single_monologue(self, monologue_id: int) -> bool:
        """Process a single monologue with AI analysis"""

        monologue = self.db.query(Monologue).filter(Monologue.id == monologue_id).first()

        if not monologue:
            print(f"Monologue {monologue_id} not found")
            return False

        try:
            print(f"Analyzing monologue: {monologue.title}")

            # Analyze content
            analysis = self.analyzer.analyze_monologue(
                text=monologue.text,
                character=monologue.character_name,
                play_title=monologue.play.title,
                author=monologue.play.author
            )

            # Update monologue
            monologue.primary_emotion = analysis.get('primary_emotion')
            monologue.emotion_scores = analysis.get('emotion_scores')
            monologue.themes = analysis.get('themes')
            monologue.tone = analysis.get('tone')
            monologue.difficulty_level = analysis.get('difficulty_level')
            monologue.character_age_range = analysis.get('character_age_range')
            monologue.character_gender = analysis.get('character_gender')
            monologue.scene_description = analysis.get('scene_description')

            # Generate embedding
            embedding = self.analyzer.generate_embedding(monologue.text)
            if embedding:
                monologue.embedding_vector = embedding

            # Generate tags
            tags = self.analyzer.generate_search_tags(
                analysis,
                monologue.text,
                monologue.character_name
            )
            monologue.search_tags = tags

            self.db.commit()

            print(f"✓ Analysis complete")
            return True

        except Exception as e:
            print(f"✗ Error: {e}")
            self.db.rollback()
            return False


# CLI script
if __name__ == "__main__":
    import sys
    import os

    # Add parent directory to path
    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..')))

    from app.core.database import SessionLocal

    async def main():
        db = SessionLocal()

        try:
            processor = BatchProcessor(db)

            import argparse
            parser = argparse.ArgumentParser(description="Process monologues with AI analysis")
            parser.add_argument('--batch-size', type=int, default=10, help='Batch size')
            parser.add_argument('--all', action='store_true', help='Process all unanalyzed monologues')
            parser.add_argument('--id', type=int, help='Process specific monologue ID')

            args = parser.parse_args()

            if args.id:
                processor.process_single_monologue(args.id)
            elif args.all:
                await processor.process_monologues(batch_size=args.batch_size)
            else:
                print("Usage:")
                print("  python -m app.services.ai.batch_processor --all")
                print("  python -m app.services.ai.batch_processor --id 123")

        finally:
            db.close()

    asyncio.run(main())
