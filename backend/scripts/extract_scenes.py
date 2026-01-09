"""
Extract two-person scenes from plays in the database.

This script:
1. Reads plays with full_text from database
2. Identifies two-character scenes
3. Extracts dialogue and stage directions
4. Analyzes scene metadata with AI
5. Stores scenes in database
"""

import asyncio
import re
import json
from typing import List, Dict, Optional, Tuple
import sys
import os

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import SessionLocal
from app.models.actor import Play, Scene, SceneLine
from app.services.ai.content_analyzer import ContentAnalyzer


class SceneExtractor:
    """Extract and process scenes from plays"""

    def __init__(self):
        self.db = SessionLocal()
        self.analyzer = ContentAnalyzer()

    def close(self):
        """Close database connection"""
        self.db.close()

    def parse_dialogue_sections(self, play_text: str) -> List[Dict]:
        """
        Parse play text into dialogue sections.

        Returns list of sections, each with:
        - characters: Set of characters speaking
        - lines: List of dialogue lines
        - start_pos: Position in text
        """
        sections = []
        current_section = {
            "characters": set(),
            "lines": [],
            "start_pos": 0
        }

        # Pattern for character name followed by dialogue
        # Handles formats like:
        # ROMEO: text
        # ROMEO.
        #   Text here
        character_pattern = r'^([A-Z][A-Z\s]{1,25})[:.]?\s*$'
        dialogue_pattern = r'^\s+(.+)'

        lines = play_text.split('\n')
        current_character = None
        section_start = 0

        for i, line in enumerate(lines):
            # Check for character name
            char_match = re.match(character_pattern, line.strip())

            if char_match:
                character = char_match.group(1).strip()

                # If new character and we have lines, potentially new section
                if character not in current_section["characters"] and current_section["lines"]:
                    # Check if this should be a new section
                    if len(current_section["characters"]) >= 2:
                        # Save current section
                        sections.append(current_section.copy())

                        # Start new section
                        current_section = {
                            "characters": {character},
                            "lines": [],
                            "start_pos": i
                        }
                    else:
                        current_section["characters"].add(character)

                current_character = character
                continue

            # Check for dialogue
            if current_character:
                dialogue_match = re.match(dialogue_pattern, line)
                if dialogue_match:
                    text = dialogue_match.group(1).strip()

                    # Extract stage directions
                    stage_dir = None
                    if '[' in text or '(' in text:
                        stage_dir_match = re.search(r'[\[\(]([^\]\)]+)[\]\)]', text)
                        if stage_dir_match:
                            stage_dir = stage_dir_match.group(1)
                            text = re.sub(r'[\[\(][^\]\)]+[\]\)]', '', text).strip()

                    if text:
                        current_section["lines"].append({
                            "character": current_character,
                            "text": text,
                            "stage_direction": stage_dir,
                            "line_num": i
                        })

        # Add final section
        if current_section["lines"]:
            sections.append(current_section)

        return sections

    def extract_two_person_scenes(
        self,
        sections: List[Dict],
        min_lines: int = 8,
        max_lines: int = 50
    ) -> List[Dict]:
        """
        Extract scenes with exactly two characters.

        Args:
            sections: Parsed dialogue sections
            min_lines: Minimum lines for a valid scene
            max_lines: Maximum lines (keep scenes manageable)

        Returns:
            List of two-person scenes
        """
        two_person_scenes = []

        for section in sections:
            # Must have exactly 2 characters
            if len(section["characters"]) != 2:
                continue

            # Check line count
            if not (min_lines <= len(section["lines"]) <= max_lines):
                continue

            # Must have back-and-forth dialogue (not one character dominating)
            char1, char2 = list(section["characters"])
            char1_lines = sum(1 for l in section["lines"] if l["character"] == char1)
            char2_lines = sum(1 for l in section["lines"] if l["character"] == char2)

            # Both characters should have at least 3 lines
            if char1_lines < 3 or char2_lines < 3:
                continue

            # Ratio shouldn't be too imbalanced (1:3 max)
            ratio = max(char1_lines, char2_lines) / min(char1_lines, char2_lines)
            if ratio > 3:
                continue

            two_person_scenes.append(section)

        return two_person_scenes

    def analyze_scene(self, scene_data: Dict, play: Play) -> Optional[Dict]:
        """
        Use AI to analyze scene and generate metadata.

        Args:
            scene_data: Parsed scene data
            play: Play model instance

        Returns:
            Scene metadata dict or None if analysis fails
        """
        characters = list(scene_data["characters"])
        char1, char2 = characters[0], characters[1]

        # Build scene text
        scene_text = "\n".join([
            f"{line['character']}: {line['text']}"
            for line in scene_data["lines"]
        ])

        # Create analysis prompt
        prompt = f"""Analyze this scene from "{play.title}" by {play.author}:

Characters: {char1} and {char2}

Scene:
{scene_text[:1500]}

Provide analysis in JSON format:
{{
    "scene_title": "Brief descriptive title (e.g. 'Romeo & Juliet Balcony Scene')",
    "description": "1-2 sentence summary of what happens",
    "setting": "Where and when the scene takes place",
    "relationship_dynamic": "romantic/adversarial/familial/professional/etc",
    "primary_emotions": ["emotion1", "emotion2"],
    "tone": "romantic/comedic/tragic/tense/etc",
    "difficulty_level": "beginner/intermediate/advanced",
    "context_before": "What happened before this scene",
    "context_after": "What happens after"
}}"""

        try:
            # Use content analyzer to get response
            from langchain_core.prompts import ChatPromptTemplate
            from langchain_core.output_parsers import StrOutputParser

            template = ChatPromptTemplate.from_messages([
                ("system", "You are a theater expert analyzing scenes. Respond only with valid JSON."),
                ("human", "{prompt}")
            ])

            chain = template | self.analyzer.llm | StrOutputParser()
            response = chain.invoke({"prompt": prompt})

            # Parse JSON
            analysis = json.loads(response)

            # Calculate estimated duration (150 words per minute)
            total_words = sum(len(line["text"].split()) for line in scene_data["lines"])
            duration_seconds = int((total_words / 150) * 60)

            return {
                **analysis,
                "estimated_duration_seconds": duration_seconds,
                "line_count": len(scene_data["lines"]),
                "character_1": char1,
                "character_2": char2
            }

        except Exception as e:
            print(f"  ✗ Error analyzing scene: {e}")
            return None

    def save_scene(self, scene_data: Dict, metadata: Dict, play: Play) -> Optional[Scene]:
        """Save scene and lines to database"""
        try:
            # Create scene record
            scene = Scene(
                play_id=play.id,
                title=metadata.get("scene_title", f"{metadata['character_1']} & {metadata['character_2']} Scene"),
                description=metadata.get("description"),
                character_1_name=metadata["character_1"],
                character_2_name=metadata["character_2"],
                line_count=metadata["line_count"],
                estimated_duration_seconds=metadata["estimated_duration_seconds"],
                difficulty_level=metadata.get("difficulty_level"),
                primary_emotions=metadata.get("primary_emotions", []),
                relationship_dynamic=metadata.get("relationship_dynamic"),
                tone=metadata.get("tone"),
                setting=metadata.get("setting"),
                context_before=metadata.get("context_before"),
                context_after=metadata.get("context_after"),
                rehearsal_count=0,
                favorite_count=0,
                is_verified=False
            )

            self.db.add(scene)
            self.db.commit()
            self.db.refresh(scene)

            # Create scene lines
            for idx, line in enumerate(scene_data["lines"]):
                scene_line = SceneLine(
                    scene_id=scene.id,
                    line_order=idx,
                    character_name=line["character"],
                    text=line["text"],
                    stage_direction=line.get("stage_direction"),
                    word_count=len(line["text"].split())
                )
                self.db.add(scene_line)

            self.db.commit()

            print(f"  ✓ Saved: {scene.title} ({scene.line_count} lines)")
            return scene

        except Exception as e:
            print(f"  ✗ Error saving scene: {e}")
            self.db.rollback()
            return None

    def process_play(self, play: Play, limit_per_play: int = 5) -> int:
        """
        Extract scenes from a single play.

        Args:
            play: Play model instance
            limit_per_play: Maximum scenes to extract per play

        Returns:
            Number of scenes extracted
        """
        print(f"\n{'='*60}")
        print(f"Processing: {play.title} by {play.author}")
        print(f"{'='*60}\n")

        if not play.full_text:
            print("  ⚠ No full text available, skipping...")
            return 0

        # Parse dialogue
        print("  📖 Parsing dialogue...")
        sections = self.parse_dialogue_sections(play.full_text)
        print(f"  Found {len(sections)} dialogue sections")

        # Extract two-person scenes
        print("  🎭 Extracting two-person scenes...")
        two_person_scenes = self.extract_two_person_scenes(sections)
        print(f"  Found {len(two_person_scenes)} potential scenes")

        # Limit scenes per play
        scenes_to_process = two_person_scenes[:limit_per_play]
        scenes_saved = 0

        # Process each scene
        for i, scene_data in enumerate(scenes_to_process, 1):
            print(f"\n  Scene {i}/{len(scenes_to_process)}:")

            # Analyze with AI
            print("    🤖 Analyzing with AI...")
            metadata = self.analyze_scene(scene_data, play)

            if not metadata:
                continue

            # Save to database
            result = self.save_scene(scene_data, metadata, play)
            if result:
                scenes_saved += 1

        print(f"\n  ✅ Extracted {scenes_saved} scenes from {play.title}")
        return scenes_saved

    def run(self, play_ids: Optional[List[int]] = None, limit_plays: int = 10):
        """
        Main extraction process.

        Args:
            play_ids: Specific play IDs to process (None = all)
            limit_plays: Maximum plays to process
        """
        print("\n🎭 Scene Extractor")
        print("=" * 60)

        try:
            # Get plays with full text
            query = self.db.query(Play).filter(Play.full_text.isnot(None))

            if play_ids:
                query = query.filter(Play.id.in_(play_ids))

            plays = query.limit(limit_plays).all()

            print(f"\nFound {len(plays)} plays with full text")

            total_scenes = 0

            for play in plays:
                scenes_count = self.process_play(play)
                total_scenes += scenes_count

            print(f"\n{'='*60}")
            print(f"✅ Extraction complete!")
            print(f"Total scenes extracted: {total_scenes}")
            print(f"{'='*60}\n")

        except Exception as e:
            print(f"\n❌ Error during extraction: {e}")
            raise
        finally:
            self.close()


def main():
    """Run the scene extractor"""
    extractor = SceneExtractor()

    # Extract scenes from all plays (limit 10 plays to start)
    extractor.run(limit_plays=10)


if __name__ == "__main__":
    main()
