"""
Script parsing service for extracting text from PDF/DOCX/TXT files
and using AI to extract characters, scenes, and dialogue.
"""

import io
import json
import re
from typing import Dict, List, Optional
import pdfplumber
from openai import OpenAI
from app.core.config import settings


class ScriptParser:
    """Parse scripts from various file formats"""

    def __init__(self):
        self.client = OpenAI(api_key=settings.OPENAI_API_KEY)

    def extract_text_from_pdf(self, file_content: bytes) -> str:
        """Extract text from PDF file using pdfplumber"""
        try:
            pdf_file = io.BytesIO(file_content)
            text = ""

            with pdfplumber.open(pdf_file) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text += page_text + "\n\n"

            return text.strip()
        except Exception as e:
            raise ValueError(f"Failed to parse PDF: {str(e)}")

    def extract_text_from_txt(self, file_content: bytes) -> str:
        """Extract text from TXT file"""
        try:
            # Try UTF-8 first, fallback to other encodings
            try:
                return file_content.decode('utf-8')
            except UnicodeDecodeError:
                try:
                    return file_content.decode('latin-1')
                except UnicodeDecodeError:
                    return file_content.decode('cp1252')
        except Exception as e:
            raise ValueError(f"Failed to parse text file: {str(e)}")

    def extract_script_metadata(self, script_text: str) -> Dict:
        """
        Use AI to extract metadata from script text:
        - Title
        - Author
        - Characters (with descriptions)
        - Genre
        - Estimated length
        """
        prompt = f"""Analyze this script and extract the following information in JSON format:

Script text:
```
{script_text[:5000]}  # First 5000 chars for metadata extraction
```

Please extract:
1. title: The script title
2. author: The author's name (if available, otherwise "Unknown")
3. characters: Array of character objects with:
   - name: Character name
   - gender: "male", "female", "non-binary", or "unknown"
   - age_range: Approximate age (e.g., "20s", "30-40", "teen", "elderly")
   - description: Brief character description
4. genre: Drama, Comedy, Tragedy, etc.
5. estimated_length_minutes: Approximate runtime

Return ONLY valid JSON, no explanation."""

        try:
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
                max_tokens=2000
            )

            response_text = response.choices[0].message.content

            # Try to find JSON in the response
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                result = json.loads(json_match.group())
                return result
            else:
                # Fallback if no JSON found
                return {
                    "title": "Untitled Script",
                    "author": "Unknown",
                    "characters": [],
                    "genre": "Drama",
                    "estimated_length_minutes": 60
                }

        except Exception as e:
            print(f"Error extracting metadata: {e}")
            # Return basic defaults on error
            return {
                "title": "Untitled Script",
                "author": "Unknown",
                "characters": [],
                "genre": "Drama",
                "estimated_length_minutes": 60
            }

    def extract_scenes(self, script_text: str, characters: List[Dict]) -> List[Dict]:
        """
        Use AI to extract individual two-person scenes from the script.
        Returns a list of scenes with dialogue lines.
        """
        character_names = [c['name'] for c in characters]

        prompt = f"""Analyze this script and extract ALL two-person scenes (scenes with exactly 2 characters).

Script:
```
{script_text}
```

Known characters: {', '.join(character_names)}

For each two-person scene, extract:
1. title: Descriptive title for the scene
2. character_1: First character name (must match a known character)
3. character_2: Second character name (must match a known character)
4. description: What happens in the scene
5. setting: Where the scene takes place
6. lines: Array of dialogue lines with:
   - character: Who speaks
   - text: The dialogue
   - stage_direction: Any stage directions (optional)

Return a JSON array of scenes. Example:
[
  {{
    "title": "Kitchen Confrontation",
    "character_1": "Sarah",
    "character_2": "John",
    "description": "Sarah confronts John about his betrayal",
    "setting": "Kitchen at night",
    "lines": [
      {{"character": "Sarah", "text": "I know what you did.", "stage_direction": null}},
      {{"character": "John", "text": "What are you talking about?", "stage_direction": "nervously"}}
    ]
  }}
]

Return ONLY valid JSON array, no explanation."""

        try:
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
                max_tokens=8000
            )

            response_text = response.choices[0].message.content

            # Try to find JSON array in the response
            json_match = re.search(r'\[.*\]', response_text, re.DOTALL)
            if json_match:
                scenes = json.loads(json_match.group())
                return scenes if isinstance(scenes, list) else []
            else:
                return []

        except Exception as e:
            print(f"Error extracting scenes: {e}")
            return []

    def parse_script(self, file_content: bytes, file_type: str, filename: str) -> Dict:
        """
        Main entry point: parse a script file and extract all information.

        Returns:
        {
            "raw_text": str,
            "metadata": {...},
            "scenes": [...]
        }
        """
        # Step 1: Extract text
        print(f"Extracting text from {file_type} file: {filename}")
        if file_type == "pdf":
            raw_text = self.extract_text_from_pdf(file_content)
        elif file_type in ["txt", "text"]:
            raw_text = self.extract_text_from_txt(file_content)
        else:
            raise ValueError(f"Unsupported file type: {file_type}")

        if not raw_text or len(raw_text) < 100:
            raise ValueError("File appears to be empty or too short")

        print(f"Extracted {len(raw_text)} characters of text")

        # Step 2: Extract metadata (title, author, characters)
        print("Extracting metadata with AI...")
        metadata = self.extract_script_metadata(raw_text)

        # Step 3: Extract scenes
        print(f"Extracting scenes with AI (found {len(metadata.get('characters', []))} characters)...")
        scenes = self.extract_scenes(raw_text, metadata.get('characters', []))

        print(f"Extracted {len(scenes)} two-person scenes")

        return {
            "raw_text": raw_text,
            "metadata": metadata,
            "scenes": scenes
        }
