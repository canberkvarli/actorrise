"""
Scrape contemporary public domain monologues from legal sources.

Sources:
1. Project Gutenberg - Contemporary plays from 1920s-1960s that are public domain
2. Instant Monologues - CC-licensed original contemporary monologues
3. Stage Partners - Free contemporary monologues (check licensing)

Legal basis:
- Works published before 1928: Public domain
- Works 1928-1964 without copyright renewal: Public domain
- Works with explicit CC licenses: Per license terms
"""

import asyncio
import re
import json
from typing import List, Dict, Optional
import httpx
from bs4 import BeautifulSoup
import sys
import os

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import SessionLocal
from app.models.actor import Monologue, Play
from app.services.ai.content_analyzer import ContentAnalyzer


# Project Gutenberg contemporary play collections
GUTENBERG_CONTEMPORARY_PLAYS = [
    {
        "id": 37970,
        "title": "Contemporary One-Act Plays",
        "editors": "B. Roland Lewis et al.",
        "year": 1922,
        "url": "https://www.gutenberg.org/files/37970/37970-h/37970-h.htm"
    },
    {
        "id": 36984,
        "title": "Fifty Contemporary One-Act Plays",
        "editors": "Frank Shay and Pierre Loving",
        "year": 1920,
        "url": "https://www.gutenberg.org/files/36984/36984-h/36984-h.htm"
    },
    {
        "id": 33907,
        "title": "One-Act Plays by Modern Authors",
        "editors": "Helen Louise Cohen",
        "year": 1921,
        "url": "https://www.gutenberg.org/files/33907/33907-h/33907-h.htm"
    },
    # More collections can be found at:
    # https://www.gutenberg.org/ebooks/bookshelf/55 (One Act Plays bookshelf)
    # https://www.gutenberg.org/ebooks/subject/1214 (One-act plays subject)
]


class ContemporaryMonologueScraper:
    """Scrape and process contemporary public domain monologues."""

    def __init__(self):
        self.db = SessionLocal()
        self.analyzer = ContentAnalyzer()
        self.client = httpx.AsyncClient(timeout=30.0)

    async def close(self):
        """Close database and HTTP client."""
        await self.client.aclose()
        self.db.close()

    async def fetch_gutenberg_book(self, book_id: int, url: str) -> str:
        """Fetch full text of a Gutenberg book."""
        print(f"Fetching Gutenberg book {book_id} from {url}")
        response = await self.client.get(url)
        response.raise_for_status()
        return response.text

    def parse_contemporary_plays_html(self, html: str) -> List[Dict]:
        """
        Parse HTML from 'Contemporary One-Act Plays' collection.

        Returns list of plays with metadata.
        """
        soup = BeautifulSoup(html, 'html.parser')
        plays = []

        # The book structure has plays separated by headings
        # We need to identify play titles, authors, and content

        # Look for h2 or h3 tags that indicate play titles
        play_headings = soup.find_all(['h2', 'h3'])

        for i, heading in enumerate(play_headings):
            # Skip table of contents and front matter
            heading_text = heading.get_text(strip=True)

            if not heading_text or heading_text in ['Contents', 'Preface', 'Introduction']:
                continue

            # Try to extract play title and author
            # Format is usually: "PLAY TITLE by Author Name"
            match = re.match(r'(.+?)\s+by\s+(.+)', heading_text, re.IGNORECASE)

            if match:
                play_title = match.group(1).strip()
                author = match.group(2).strip()

                # Get content between this heading and next
                content_parts = []
                current = heading.next_sibling

                while current and current != play_headings[i+1] if i+1 < len(play_headings) else current:
                    if hasattr(current, 'get_text'):
                        text = current.get_text(strip=True)
                        if text:
                            content_parts.append(text)
                    current = current.next_sibling if hasattr(current, 'next_sibling') else None

                    # Safety break
                    if len(content_parts) > 500:
                        break

                full_text = '\n\n'.join(content_parts)

                if full_text and len(full_text) > 100:
                    plays.append({
                        'title': play_title,
                        'author': author,
                        'full_text': full_text,
                        'source': 'Project Gutenberg - Contemporary One-Act Plays',
                        'category': 'Contemporary',
                        'year': 1922
                    })

        return plays

    def extract_monologues_from_play(self, play: Dict) -> List[Dict]:
        """
        Extract individual monologues from a play's full text.

        Uses heuristics to identify character speeches that are long enough
        to be monologues (typically 5+ lines or 100+ words).
        """
        monologues = []
        full_text = play['full_text']

        # Pattern to match character names followed by dialogue
        # Common formats: "CHARACTER NAME: dialogue" or "CHARACTER NAME\ndialogue"
        character_speech_pattern = r'([A-Z][A-Z\s]{2,30})[:.]?\s*\n\s*(.+?)(?=\n\s*[A-Z][A-Z\s]{2,30}[:.]|\Z)'

        matches = re.finditer(character_speech_pattern, full_text, re.DOTALL)

        for match in matches:
            character_name = match.group(1).strip()
            speech_text = match.group(2).strip()

            # Clean up the speech text
            speech_text = re.sub(r'\s+', ' ', speech_text)

            # Skip if too short or if it's a stage direction
            word_count = len(speech_text.split())
            if word_count < 50 or character_name in ['STAGE DIRECTION', 'SCENE', 'ACT', 'CURTAIN']:
                continue

            # Extract stage directions
            stage_directions_pattern = r'\[([^\]]+)\]|\(([^)]+)\)'
            stage_directions = re.findall(stage_directions_pattern, speech_text)
            stage_directions_text = ' '.join([d[0] or d[1] for d in stage_directions])

            # Remove stage directions from speech for word count
            clean_speech = re.sub(stage_directions_pattern, '', speech_text)
            clean_word_count = len(clean_speech.split())

            if clean_word_count < 50:
                continue

            monologues.append({
                'character_name': character_name,
                'text': speech_text,
                'stage_directions': stage_directions_text if stage_directions_text else None,
                'play_title': play['title'],
                'author': play['author'],
                'category': play['category'],
                'word_count': clean_word_count,
                'source': play['source']
            })

        return monologues

    async def analyze_and_save_monologue(self, monologue_data: Dict, play: Play) -> Optional[Monologue]:
        """Analyze monologue with AI and save to database."""
        try:
            # Use LangChain-powered analyzer
            analysis = self.analyzer.analyze_monologue(
                text=monologue_data['text'],
                character=monologue_data['character_name'],
                play_title=monologue_data['play_title'],
                author=monologue_data['author']
            )

            # Generate embedding for semantic search
            embedding = self.analyzer.generate_embedding(
                f"{monologue_data['character_name']} from {monologue_data['play_title']}: {monologue_data['text'][:500]}"
            )

            # Calculate duration (average speaking rate is 150 words/minute)
            duration_seconds = int((monologue_data['word_count'] / 150) * 60)

            # Create monologue record
            monologue = Monologue(
                play_id=play.id,
                title=f"{monologue_data['character_name']}'s Monologue",
                character_name=monologue_data['character_name'],
                text=monologue_data['text'],
                stage_directions=monologue_data.get('stage_directions'),
                character_gender=analysis.get('character_gender'),
                character_age_range=analysis.get('character_age_range'),
                primary_emotion=analysis.get('primary_emotion'),
                emotion_scores=analysis.get('emotion_scores', {}),
                themes=analysis.get('themes', []),
                tone=analysis.get('tone'),
                difficulty_level=analysis.get('difficulty_level'),
                word_count=monologue_data['word_count'],
                estimated_duration_seconds=duration_seconds,
                embedding=json.dumps(embedding) if embedding else None,  # Store as JSON string
                overdone_score=0.0  # Contemporary monologues start at 0
            )

            self.db.add(monologue)
            self.db.commit()
            self.db.refresh(monologue)

            print(f"  ✓ Saved: {monologue.character_name} ({monologue.word_count} words)")
            return monologue

        except Exception as e:
            print(f"  ✗ Error analyzing monologue: {e}")
            self.db.rollback()
            return None

    async def scrape_gutenberg_collection(self, collection: Dict):
        """Scrape a specific Gutenberg collection."""
        print(f"\n{'='*60}")
        print(f"Scraping: {collection['title']} ({collection['year']})")
        print(f"{'='*60}\n")

        # Fetch the book
        html = await self.fetch_gutenberg_book(collection['id'], collection['url'])

        # Parse plays from the collection
        plays = self.parse_contemporary_plays_html(html)
        print(f"Found {len(plays)} plays in collection")

        # Process each play
        total_monologues = 0
        for play_data in plays:
            print(f"\nProcessing: {play_data['title']} by {play_data['author']}")

            # Check if play already exists
            existing_play = self.db.query(Play).filter_by(
                title=play_data['title'],
                author=play_data['author']
            ).first()

            if existing_play:
                print(f"  ℹ Play already exists, skipping...")
                continue

            # Create play record
            play = Play(
                title=play_data['title'],
                author=play_data['author'],
                year_written=play_data['year'],
                genre='Drama',
                category='Contemporary',
                copyright_status='public_domain',
                license_type='public_domain',
                source_url=collection['url'],
                full_text=play_data.get('full_text'),
                text_format='html'
            )
            self.db.add(play)
            self.db.commit()
            self.db.refresh(play)

            # Extract monologues
            monologues = self.extract_monologues_from_play(play_data)
            print(f"  Found {len(monologues)} potential monologues")

            # Analyze and save each monologue
            for mono_data in monologues:
                result = await self.analyze_and_save_monologue(mono_data, play)
                if result:
                    total_monologues += 1

        print(f"\n{'='*60}")
        print(f"Total monologues added: {total_monologues}")
        print(f"{'='*60}\n")

    async def run(self):
        """Main scraping process."""
        print("\n🎭 Contemporary Monologue Scraper")
        print("=" * 60)
        print("\nLegal Sources:")
        print("  ✓ Project Gutenberg (Public Domain)")
        print("  ✓ Works published 1920s-1960s")
        print("  ✓ No copyright violations\n")

        try:
            # Scrape each Gutenberg collection
            for collection in GUTENBERG_CONTEMPORARY_PLAYS:
                await self.scrape_gutenberg_collection(collection)

            print("\n✅ Scraping completed successfully!")

        except Exception as e:
            print(f"\n❌ Error during scraping: {e}")
            raise
        finally:
            await self.close()


async def main():
    """Run the scraper."""
    scraper = ContemporaryMonologueScraper()
    await scraper.run()


if __name__ == "__main__":
    asyncio.run(main())
