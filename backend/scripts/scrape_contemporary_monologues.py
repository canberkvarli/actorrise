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

                # Get all content between this heading and the next heading
                # Find the next heading at the same or higher level
                next_heading = None
                for j in range(i + 1, len(play_headings)):
                    if play_headings[j].name == heading.name or play_headings[j].name < heading.name:
                        next_heading = play_headings[j]
                        break

                # Collect all text between headings
                content_elements = []
                current = heading.next_sibling
                
                while current:
                    if next_heading and current == next_heading:
                        break
                    if hasattr(current, 'get_text'):
                        content_elements.append(current)
                    current = current.next_sibling

                # Extract text from all collected elements
                full_text = '\n'.join([elem.get_text(separator='\n', strip=True) for elem in content_elements if hasattr(elem, 'get_text')])

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
        to be monologues (typically 50+ words).
        """
        monologues = []
        full_text = play['full_text']
        
        if not full_text or len(full_text) < 100:
            return monologues

        # Multiple patterns to match character names followed by dialogue
        # Pattern 1: ALL CAPS character name followed by colon or period
        # Pattern 2: Character name (mixed case) followed by colon
        # Pattern 3: Character name on its own line followed by dialogue
        
        patterns = [
            # ALL CAPS: "CHARACTER NAME: dialogue" or "CHARACTER NAME. dialogue"
            r'([A-Z][A-Z\s]{2,40})[:.]\s*(.+?)(?=\n\s*[A-Z][A-Z\s]{2,40}[:.]|\n\s*[A-Z][a-z]+[:.]|\Z)',
            # Mixed case: "Character Name: dialogue"
            r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})[:.]\s*(.+?)(?=\n\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}[:.]|\n\s*[A-Z][A-Z\s]{2,40}[:.]|\Z)',
        ]

        for pattern in patterns:
            matches = re.finditer(pattern, full_text, re.DOTALL | re.MULTILINE)
            
            for match in matches:
                character_name = match.group(1).strip()
                speech_text = match.group(2).strip()

                # Skip if character name looks like a stage direction or header
                skip_names = ['STAGE DIRECTION', 'SCENE', 'ACT', 'CURTAIN', 'THE END', 
                             'CHARACTERS', 'PERSONS', 'PERSONS OF THE PLAY', 'DRAMATIS PERSONAE']
                if any(skip in character_name.upper() for skip in skip_names):
                    continue
                
                # Skip very short character names (likely not real names)
                if len(character_name) < 2 or len(character_name) > 50:
                    continue

                # Clean up the speech text
                speech_text = re.sub(r'\s+', ' ', speech_text)

                # Extract stage directions
                stage_directions_pattern = r'\[([^\]]+)\]|\(([^)]+)\)'
                stage_directions = re.findall(stage_directions_pattern, speech_text)
                stage_directions_text = ' '.join([d[0] or d[1] for d in stage_directions])

                # Remove stage directions from speech for word count
                clean_speech = re.sub(stage_directions_pattern, '', speech_text)
                clean_word_count = len(clean_speech.split())

                # Require at least 50 words for a monologue
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

        # Remove duplicates (same character name and similar text)
        seen = set()
        unique_monologues = []
        for mono in monologues:
            key = (mono['character_name'].lower(), mono['text'][:100])
            if key not in seen:
                seen.add(key)
                unique_monologues.append(mono)

        return unique_monologues

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
                # Check if it has monologues
                monologue_count = self.db.query(Monologue).filter_by(play_id=existing_play.id).count()
                if monologue_count > 0:
                    print(f"  ℹ Play already exists with {monologue_count} monologues, skipping...")
                    continue
                else:
                    print(f"  ℹ Play exists but has no monologues, re-processing...")
                    play = existing_play
                    # Update full_text if we have better content
                    if play_data.get('full_text') and len(play_data['full_text']) > len(play.full_text or ''):
                        play.full_text = play_data['full_text']
                        self.db.commit()
                    # Use the database full_text if available and better
                    if play.full_text and len(play.full_text) > len(play_data.get('full_text', '')):
                        play_data['full_text'] = play.full_text
            else:
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
