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

        # Pattern for character name - handles multiple formats:
        # ROMEO: text (dialogue on same line)
        # ROMEO. (just name, dialogue on next line)
        # ROMEO (just name)
        character_with_dialogue_pattern = r'^([A-Z][A-Z\s]{1,30})[:.]\s*(.+)$'
        character_only_pattern = r'^([A-Z][A-Z\s]{1,30})[:.]?\s*$'
        dialogue_pattern = r'^\s+(.+)'  # Indented dialogue
        dialogue_no_indent_pattern = r'^([A-Z][a-z].+)$'  # Non-indented dialogue (sentence case)
        
        # Patterns to exclude (act/scene headers, stage directions, etc.)
        exclude_patterns = [
            r'^ACT\s+[IVX]+',  # ACT I, ACT II, etc.
            r'^SCENE\s+[IVX]+',  # SCENE I, SCENE II, etc.
            r'^ACT\s+\d+',  # ACT 1, ACT 2, etc.
            r'^SCENE\s+\d+',  # SCENE 1, SCENE 2, etc.
            r'^PROLOGUE',
            r'^EPILOGUE',
            r'^CHORUS',
            r'^THE\s+CHORUS',
            r'^ENTER',
            r'^EXIT',
            r'^EXEUNT',
        ]

        lines = play_text.split('\n')
        current_character = None
        section_start = 0

        for i, line in enumerate(lines):
            line_stripped = line.strip()
            if not line_stripped:
                continue

            # Check for character name with dialogue on same line: "ROMEO: Hello there"
            char_with_dialogue = re.match(character_with_dialogue_pattern, line_stripped)
            if char_with_dialogue:
                character = char_with_dialogue.group(1).strip()
                dialogue_text = char_with_dialogue.group(2).strip()
                
                # Skip if it matches exclusion patterns
                if any(re.match(pattern, character, re.IGNORECASE) for pattern in exclude_patterns):
                    continue

                # Handle section transitions
                if character not in current_section["characters"] and current_section["lines"]:
                    if len(current_section["characters"]) >= 2:
                        sections.append(current_section.copy())
                        current_section = {
                            "characters": {character},
                            "lines": [],
                            "start_pos": i
                        }
                    else:
                        current_section["characters"].add(character)

                current_character = character
                
                # Extract stage directions from dialogue
                stage_dir = None
                if '[' in dialogue_text or '(' in dialogue_text:
                    stage_dir_match = re.search(r'[\[\(]([^\]\)]+)[\]\)]', dialogue_text)
                    if stage_dir_match:
                        stage_dir = stage_dir_match.group(1)
                        dialogue_text = re.sub(r'[\[\(][^\]\)]+[\]\)]', '', dialogue_text).strip()

                if dialogue_text:
                    current_section["lines"].append({
                        "character": current_character,
                        "text": dialogue_text,
                        "stage_direction": stage_dir,
                        "line_num": i
                    })
                continue

            # Check for character name only (dialogue on next line)
            char_match = re.match(character_only_pattern, line_stripped)
            if char_match:
                character = char_match.group(1).strip()
                
                # Skip if it matches exclusion patterns
                if any(re.match(pattern, character, re.IGNORECASE) for pattern in exclude_patterns):
                    continue

                # Handle section transitions
                if character not in current_section["characters"] and current_section["lines"]:
                    if len(current_section["characters"]) >= 2:
                        sections.append(current_section.copy())
                        current_section = {
                            "characters": {character},
                            "lines": [],
                            "start_pos": i
                        }
                    else:
                        current_section["characters"].add(character)

                current_character = character
                continue

            # Check for dialogue (indented or not)
            if current_character:
                # Try indented dialogue first
                dialogue_match = re.match(dialogue_pattern, line)
                if dialogue_match:
                    text = dialogue_match.group(1).strip()
                else:
                    # Try non-indented dialogue (sentence case, not all caps)
                    dialogue_match = re.match(dialogue_no_indent_pattern, line_stripped)
                    if dialogue_match:
                        text = dialogue_match.group(1).strip()
                    else:
                        # If line has content and doesn't look like a character name, treat as dialogue
                        if line_stripped and not re.match(character_only_pattern, line_stripped):
                            text = line_stripped
                        else:
                            text = None

                if text:
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
        min_lines: int = 4,
        max_lines: int = 100
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

            # Both characters should have at least 1 line (relaxed from 2)
            if char1_lines < 1 or char2_lines < 1:
                continue

            # Ratio shouldn't be too imbalanced (1:6 max, relaxed from 4)
            ratio = max(char1_lines, char2_lines) / min(char1_lines, char2_lines)
            if ratio > 6:
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
        # Local import to avoid any issues with closure/free-variable resolution
        # when using `re` inside comprehensions/generator expressions
        import re as _re

        characters = list(scene_data["characters"])
        
        # Filter out invalid character names (act/scene headers, etc.)
        invalid_patterns = [
            r'^ACT\s+[IVX]+', r'^ACT\s+\d+',
            r'^SCENE\s+[IVX]+', r'^SCENE\s+\d+',
            r'^PROLOGUE', r'^EPILOGUE', r'^CHORUS', r'^THE\s+CHORUS',
            r'^ENTER', r'^EXIT', r'^EXEUNT'
        ]
        
        valid_characters = [
            char
            for char in characters
            if not any(_re.match(pattern, char, _re.IGNORECASE) for pattern in invalid_patterns)
        ]
        
        if len(valid_characters) != 2:
            print(f"  ✗ Invalid characters detected: {characters}, skipping scene")
            return None
        
        char1, char2 = valid_characters[0], valid_characters[1]

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

Provide analysis as a JSON object with these exact fields:
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
            from app.services.ai.langchain.config import get_llm

            template = ChatPromptTemplate.from_messages([
                ("system", "You are a theater expert analyzing scenes. Respond only with valid JSON."),
                ("human", "{prompt}")
            ])

            llm = get_llm(temperature=0.3)
            chain = template | llm | StrOutputParser()
            response = chain.invoke({"prompt": prompt})

            # Parse JSON - handle both JSON object format and string responses
            try:
                # Try parsing as-is (should work with JSON mode)
                analysis = json.loads(response)
            except json.JSONDecodeError:
                # If that fails, try extracting JSON from markdown code blocks
                import re
                json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', response, re.DOTALL)
                if json_match:
                    analysis = json.loads(json_match.group(1))
                else:
                    # Last resort: try to find JSON object in response
                    json_match = re.search(r'\{.*\}', response, re.DOTALL)
                    if json_match:
                        analysis = json.loads(json_match.group(0))
                    else:
                        raise ValueError(f"Could not parse JSON from response: {response[:200]}")

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
        
        # Debug: Show why sections might be rejected
        if len(two_person_scenes) == 0 and len(sections) > 0:
            two_char_sections = [s for s in sections if len(s["characters"]) == 2]
            print(f"  Debug: {len(two_char_sections)} sections have exactly 2 characters")
            if two_char_sections:
                sample = two_char_sections[0]
                char1, char2 = list(sample["characters"])
                char1_lines = sum(1 for l in sample["lines"] if l["character"] == char1)
                char2_lines = sum(1 for l in sample["lines"] if l["character"] == char2)
                print(f"  Debug: Sample section has {len(sample['lines'])} lines ({char1}: {char1_lines}, {char2}: {char2_lines})")

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
