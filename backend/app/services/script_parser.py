"""
Script parsing service for extracting text from PDF/TXT files
and extracting characters, scenes, and dialogue.

Extraction strategy:
  1. Structural splitting via regex (acts/scenes)
  2. AI extracts dialogue scenes (2+ characters) per chunk
  3. AI analyzes metadata (title, tone, emotions, etc.)
  4. character_1/character_2 = the two most prominent speakers
"""

import io
import json
import re
from typing import Dict, List, Optional
import pdfplumber
from openai import OpenAI
from app.core.config import settings


# ---------------------------------------------------------------------------
# Regex patterns for dialogue parsing
# ---------------------------------------------------------------------------

# CHARACTER: dialogue or CHARACTER. dialogue (on same line)
# Name allows spaces, apostrophes, hyphens (MRS PAGE, O'BRIEN, LADY ANNE)
# but NOT periods in the name itself — the period is the separator
_CHAR_WITH_DIALOGUE = re.compile(r"^([A-Z][A-Z\s'\-]{0,30})[:.]\s+(.+)$")

# CHARACTER. or CHARACTER: (name only, dialogue on next lines)
_CHAR_ONLY = re.compile(r"^([A-Z][A-Z\s'\-]{0,30})[:.]?\s*$")

# Indented dialogue (screenplay format)
_DIALOGUE_INDENTED = re.compile(r'^\s{2,}(.+)')

# Non-indented dialogue (sentence case — not all caps)
_DIALOGUE_SENTENCE = re.compile(r'^([A-Z][a-z].+)$')

# Stage direction extraction
_STAGE_DIR = re.compile(r'[\[\(]([^\]\)]+)[\]\)]')

# Headers to exclude from being treated as character names
_EXCLUDE_PATTERNS = [
    re.compile(p, re.IGNORECASE) for p in [
        r'^ACT\s+[IVX\d]+', r'^SCENE\s+[IVX\d]+',
        r'^ACT\s+(ONE|TWO|THREE|FOUR|FIVE)',
        r'^SCENE\s+(ONE|TWO|THREE|FOUR|FIVE)',
        r'^PROLOGUE', r'^EPILOGUE', r'^CHORUS', r'^THE\s+CHORUS',
        r'^ENTER\b', r'^EXIT\b', r'^EXEUNT\b',
        r'^INT\.', r'^EXT\.', r'^COLD\s+OPEN', r'^TEASER', r'^TAG\b',
        r'^FADE\s+(IN|OUT|TO)', r'^CUT\s+TO', r'^DISSOLVE',
        r'^CONTINUED', r'^END\s+OF',
    ]
]


def _is_excluded(name: str) -> bool:
    return any(p.match(name) for p in _EXCLUDE_PATTERNS)


# Lines that look like stage directions even when not in brackets
_STAGE_DIR_LINE = re.compile(
    r'^(Enter|Exit|Exeunt|Re-enter|They exit|He exits|She exits|All exit|'
    r'Aside|Music|Sound|Flourish|Trumpets|Alarum|Sennet)\b',
    re.IGNORECASE
)

# Inline stage directions: "Character does something." or "All but X exit."
# These appear as plain sentences within dialogue in Folger texts.
_INLINE_STAGE_DIR = re.compile(
    r'^.{0,60}\b(exit|exits|exeunt|leads|enters|kneels|falls|rises|draws|'
    r'weeps|kisses|stabs|dies|sleeps|wakes|reads|sings|dances|fights|'
    r'aside|apart|within|takes|gives|turns|picks up|puts on|throws)\b',
    re.IGNORECASE
)

# Lines that are just act/scene references embedded in dialogue (e.g. "171 A Midsummer Night's Dream ACT 5. SC. 1")
_PAGE_HEADER = re.compile(r'^\d+\s+.*(ACT|Act|SCENE|Scene)\s+\d', re.IGNORECASE)


def _is_stage_direction_line(text: str) -> bool:
    """Check if a line looks like a stage direction rather than dialogue."""
    s = text.strip()
    if _STAGE_DIR_LINE.match(s):
        return True
    if _PAGE_HEADER.match(s):
        return True
    # Short lines with stage-direction verbs that end with a period
    # (dialogue lines in verse rarely end with periods in Shakespeare)
    if len(s) < 80 and s.endswith('.') and _INLINE_STAGE_DIR.match(s):
        # Extra check: must not start with a speech-like pattern (I, You, We, etc.)
        if not re.match(r'^(I |You |We |My |Our |His |Her |The |A |But |And |So |If |What |How |Why |Where |When )', s):
            return True
    return False


def _extract_stage_direction(text: str):
    """Extract stage direction from text, return (clean_text, stage_direction)."""
    match = _STAGE_DIR.search(text)
    if match:
        stage_dir = match.group(1).strip()
        clean = _STAGE_DIR.sub('', text).strip()
        return clean, stage_dir
    return text, None


# Folger-style line number prefix: "FTLN 2231 " or "TLN 45 "
_LINE_NUMBER_PREFIX = re.compile(r'^(?:FTLN|TLN)\s+\d+\s*', re.MULTILINE)

# Generic line number patterns: "123 " at start of line (common in published editions)
_LEADING_LINE_NUM = re.compile(r'^\d{1,5}\s+', re.MULTILINE)


def _preprocess_text(text: str) -> str:
    """Strip publisher line-number prefixes (Folger FTLN, etc.) so regex can parse dialogue."""
    # Only strip if we detect the pattern appears frequently (not just stray numbers)
    ftln_count = len(_LINE_NUMBER_PREFIX.findall(text[:5000]))
    if ftln_count >= 5:
        text = _LINE_NUMBER_PREFIX.sub('', text)
        print(f"Stripped {ftln_count}+ FTLN/TLN line-number prefixes")

        # After stripping FTLN prefixes, also remove bare line reference numbers
        # that remain at the end of verse lines (e.g. "390", "395", "2145")
        # Only do this when FTLN was detected (confirms it's a Folger text)
        text = re.sub(r'\s+\d{2,4}\s*$', '', text, flags=re.MULTILINE)
    return text


# ---------------------------------------------------------------------------
# Dialogue parser (deterministic, lossless)
# ---------------------------------------------------------------------------

def parse_dialogue(text: str) -> List[Dict]:
    text = _preprocess_text(text)
    """
    Parse script text into dialogue sections using regex.

    Returns list of sections, each with:
      - characters: set of character names
      - lines: list of {character, text, stage_direction}
    """
    sections = []
    current_section = {"characters": set(), "lines": []}
    current_character = None

    for line in text.split('\n'):
        stripped = line.strip()
        if not stripped:
            continue

        # Try: CHARACTER: dialogue (on same line)
        m = _CHAR_WITH_DIALOGUE.match(stripped)
        if m:
            character = m.group(1).strip()
            dialogue_text = m.group(2).strip()

            if _is_excluded(character):
                continue

            # New character entering — start new section if we already have 2
            if character not in current_section["characters"] and current_section["lines"]:
                if len(current_section["characters"]) >= 2:
                    sections.append(current_section)
                    current_section = {"characters": set(), "lines": []}

            current_section["characters"].add(character)
            current_character = character

            clean_text, stage_dir = _extract_stage_direction(dialogue_text)
            if clean_text:
                current_section["lines"].append({
                    "character": character,
                    "text": clean_text,
                    "stage_direction": stage_dir,
                })
            continue

        # Try: CHARACTER (name only, dialogue on following lines)
        m = _CHAR_ONLY.match(stripped)
        if m:
            character = m.group(1).strip()

            if _is_excluded(character):
                continue

            if character not in current_section["characters"] and current_section["lines"]:
                if len(current_section["characters"]) >= 2:
                    sections.append(current_section)
                    current_section = {"characters": set(), "lines": []}

            current_section["characters"].add(character)
            current_character = character
            continue

        # Try: dialogue continuation (indented or sentence-case)
        if current_character:
            # Skip stage direction lines embedded in dialogue
            if _is_stage_direction_line(stripped):
                continue
            # Skip page headers (e.g. "171 A Midsummer Night's Dream ACT 5. SC. 1")
            if _PAGE_HEADER.match(stripped):
                continue

            m = _DIALOGUE_INDENTED.match(line)
            if not m:
                m = _DIALOGUE_SENTENCE.match(stripped)
            if not m:
                # If it has content and doesn't look like a character name, treat as dialogue
                if stripped and not _CHAR_ONLY.match(stripped):
                    text_content = stripped
                else:
                    text_content = None
            else:
                text_content = m.group(1).strip()

            if text_content:
                clean_text, stage_dir = _extract_stage_direction(text_content)
                if clean_text:
                    current_section["lines"].append({
                        "character": current_character,
                        "text": clean_text,
                        "stage_direction": stage_dir,
                    })

    # Don't forget the last section
    if current_section["lines"]:
        sections.append(current_section)

    # Merge consecutive lines by the same character into one line.
    # In verse-format scripts (Folger), the character name repeats on every line,
    # creating dozens of single-line entries for one speech.
    for section in sections:
        merged = []
        for line in section["lines"]:
            if merged and merged[-1]["character"] == line["character"]:
                merged[-1]["text"] += " " + line["text"]
                # Keep the first stage direction if any
                if line.get("stage_direction") and not merged[-1].get("stage_direction"):
                    merged[-1]["stage_direction"] = line["stage_direction"]
            else:
                merged.append(dict(line))  # copy so we don't mutate
        section["lines"] = merged

    return sections


def filter_two_person_scenes(
    sections: List[Dict],
    min_lines: int = 2,
    max_lines: int = 150,
) -> List[Dict]:
    """
    Filter dialogue sections to those with exactly 2 characters.

    Applies quality checks:
      - Both characters must speak at least once
      - Line imbalance ratio capped at 8:1
    """
    scenes = []
    for section in sections:
        if len(section["characters"]) != 2:
            continue
        if not (min_lines <= len(section["lines"]) <= max_lines):
            continue

        char1, char2 = list(section["characters"])
        c1_count = sum(1 for l in section["lines"] if l["character"] == char1)
        c2_count = sum(1 for l in section["lines"] if l["character"] == char2)

        if c1_count < 1 or c2_count < 1:
            continue

        ratio = max(c1_count, c2_count) / max(min(c1_count, c2_count), 1)
        if ratio > 8:
            continue

        scenes.append(section)

    return scenes


# ---------------------------------------------------------------------------
# ScriptParser class
# ---------------------------------------------------------------------------

class ScriptParser:
    """Parse scripts from various file formats"""

    def __init__(self):
        api_key = settings.openai_api_key
        if not api_key:
            raise ValueError(
                "OPENAI_API_KEY is not set. Add it to your backend .env file (e.g. OPENAI_API_KEY=sk-...)."
            )
        self.client = OpenAI(api_key=api_key)

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

    def _detect_title_hint(self, text: str) -> Optional[str]:
        """
        Regex pre-scan for likely title in the first ~3000 chars.
        Looks for short, prominent lines (title case or all caps) near the top,
        skipping publisher boilerplate like 'Folger', 'Project Gutenberg', etc.
        """
        skip_words = {
            'folger', 'gutenberg', 'copyright', 'license', 'published',
            'edition', 'library', 'press', 'printing', 'isbn',
            'http', 'www', 'table of contents', 'dramatis personae',
            'act ', 'scene ', 'prologue', 'characters',
            'introduction', 'textual', 'contents', 'front matter',
            'foreword', 'preface', 'appendix', 'notes', 'glossary',
            'acknowledgment', 'director', 'editor',
        }
        candidates = []
        for line in text[:3000].split('\n'):
            stripped = line.strip()
            if not stripped or len(stripped) < 3 or len(stripped) > 80:
                continue
            lower = stripped.lower()
            if any(w in lower for w in skip_words):
                continue
            # Skip lines that are clearly not titles (page numbers, dates, etc.)
            if re.match(r'^[\d\s\-/.:]+$', stripped):
                continue
            # Title-like: all caps, or title case, and short
            if (stripped.isupper() or stripped.istitle()) and len(stripped) < 60:
                words = stripped.split()
                # Skip single short words
                if len(words) >= 2 or len(stripped) > 10:
                    candidates.append(stripped)

        if not candidates:
            return None
        # Prefer the candidate with the most words (titles > author names)
        return max(candidates, key=lambda c: len(c.split()))

    def extract_script_metadata(self, script_text: str) -> Dict:
        """
        Use AI to extract metadata from script text:
        - Title
        - Author
        - Characters (with descriptions)
        - Genre
        - Estimated length
        """
        # Pre-scan for title hint (helps when first 5K chars is publisher boilerplate)
        title_hint = self._detect_title_hint(script_text)
        hint_line = ""
        if title_hint:
            hint_line = f'\nHINT: The title is likely "{title_hint}" based on the document header. Use this if it looks correct.\n'
            print(f"Title hint detected: {title_hint}")

        # Send first 8K chars (Folger PDFs have long preambles)
        prompt = f"""Analyze this script and extract the following information in JSON format:

Script text:
```
{script_text[:8000]}
```
{hint_line}
Please extract:
1. title: The actual title of the play, screenplay, or script (e.g. "A Midsummer Night's Dream", "The Godfather"). Do NOT use publisher names, library names, or edition names (e.g. NOT "Folger Shakespeare Library", NOT "Project Gutenberg"). Look for the real creative work title.
2. author: The playwright or screenwriter's name (e.g. "William Shakespeare", "Mario Puzo"). Not the publisher or editor.
3. characters: Array of character objects with:
   - name: Character name
   - gender: "male", "female", "non-binary", or "unknown"
   - age_range: Approximate age (e.g., "20s", "30-40", "teen", "elderly")
   - description: Brief character description (10-15 words max)
4. genre: Drama, Comedy, Tragedy, etc.
5. estimated_length_minutes: Approximate runtime
6. synopsis: A 2-3 sentence synopsis of the entire work. What is the story about? Keep it concise and compelling.

Return ONLY valid JSON, no explanation."""

        import time as _time
        default = {
            "title": "Untitled Script",
            "author": "Unknown",
            "characters": [],
            "genre": "Drama",
            "estimated_length_minutes": 60,
        }

        for attempt in range(3):
            try:
                response = self.client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.3,
                    max_tokens=2000
                )

                response_text = response.choices[0].message.content

                json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
                if json_match:
                    return json.loads(json_match.group())
                return default

            except Exception as e:
                is_rate_limit = "429" in str(e) or "rate_limit" in str(e).lower()
                if is_rate_limit and attempt < 2:
                    wait = (attempt + 1) * 2
                    print(f"Rate limited on metadata, retrying in {wait}s...")
                    _time.sleep(wait)
                    continue
                print(f"Error extracting metadata: {e}")
                return default

        return default

    # ------------------------------------------------------------------
    # Scene metadata analysis (AI only touches metadata, not dialogue)
    # ------------------------------------------------------------------

    def analyze_scenes_batch(self, scenes: List[Dict], script_title: str = "", script_author: str = "") -> List[Dict]:
        """
        Batch-analyze metadata for multiple regex-extracted scenes in a SINGLE AI call.

        Returns a list of metadata dicts (same order as input scenes).
        Dramatically faster than one AI call per scene.
        """
        if not scenes:
            return []

        # Build summaries of each scene for the prompt (first ~500 chars each)
        scene_summaries = []
        for i, scene_data in enumerate(scenes):
            characters = list(scene_data["characters"])
            if len(characters) != 2:
                scene_summaries.append(None)
                continue
            char1, char2 = characters[0], characters[1]
            preview = "\n".join(
                f"{l['character']}: {l['text']}" for l in scene_data["lines"]
            )[:500]
            scene_summaries.append(f"SCENE {i+1} ({char1} & {char2}, {len(scene_data['lines'])} lines):\n{preview}")

        # Filter out None entries and build prompt
        valid_entries = [(i, s) for i, s in enumerate(scene_summaries) if s]
        if not valid_entries:
            return [self._default_metadata(sd) for sd in scenes]

        scenes_block = "\n\n---\n\n".join(s for _, s in valid_entries)
        context = f' from "{script_title}"' if script_title else ""
        author_hint = f" by {script_author}" if script_author else ""

        prompt = f"""Analyze these {len(valid_entries)} two-person scenes{context}{author_hint}.

{scenes_block}

For EACH scene, respond with a JSON object containing:
- title: Brief descriptive title
- description: 1-2 sentence summary
- setting: Where it takes place (null if unclear)
- tone: romantic/comedic/tragic/tense/dramatic/lighthearted/mysterious/melancholic
- primary_emotions: Array of 1-3 emotions
- relationship_dynamic: romantic/adversarial/familial/friendship/professional/mentor-student/strangers

Return a JSON ARRAY of objects, one per scene, in the same order. Return ONLY valid JSON."""

        max_tokens = min(16000, max(2000, len(valid_entries) * 300))

        import time as _time

        for attempt in range(3):
            try:
                response = self.client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.3,
                    max_tokens=max_tokens
                )
                response_text = response.choices[0].message.content or ""
                json_match = re.search(r'\[.*\]', response_text, re.DOTALL)
                if json_match:
                    metadata_list = json.loads(json_match.group())
                    if isinstance(metadata_list, list):
                        # Map results back to original indices
                        result = [self._default_metadata(sd) for sd in scenes]
                        for idx, (orig_i, _) in enumerate(valid_entries):
                            if idx < len(metadata_list):
                                result[orig_i] = metadata_list[idx]
                        print(f"Batch analyzed {len(valid_entries)} scenes in 1 AI call")
                        return result
                break  # No valid JSON but no error — don't retry
            except Exception as e:
                is_rate_limit = "429" in str(e) or "rate_limit" in str(e).lower()
                if is_rate_limit and attempt < 2:
                    wait = (attempt + 1) * 2  # 2s, 4s
                    print(f"Rate limited, retrying in {wait}s...")
                    _time.sleep(wait)
                    continue
                print(f"Error in batch scene analysis: {e}")
                break

        return [self._default_metadata(sd) for sd in scenes]

    def clean_scenes_batch(self, scenes: List[Dict], script_title: str = "") -> List[Dict]:
        """
        AI cleanup pass: review regex-extracted scenes and fix issues.
        Removes stage directions embedded in dialogue, fixes misattributed lines,
        and cleans up formatting artifacts.

        Takes the raw scene dicts (with 'lines') and returns cleaned versions.
        Single AI call for all scenes.
        """
        if not scenes:
            return scenes

        # Build a compact representation of each scene's lines
        scene_blocks = []
        for i, scene in enumerate(scenes):
            lines_text = "\n".join(
                f"  {l['character']}: {l['text']}"
                for l in scene.get("lines", [])
            )
            # Truncate very long scenes to keep prompt manageable
            if len(lines_text) > 1500:
                lines_text = lines_text[:1500] + "\n  ... (truncated)"
            c1 = scene.get("character_1", "?")
            c2 = scene.get("character_2", "?")
            scene_blocks.append(f"SCENE {i+1} ({c1} & {c2}):\n{lines_text}")

        all_text = "\n\n---\n\n".join(scene_blocks)
        context = f' from "{script_title}"' if script_title else ""

        prompt = f"""Review these {len(scenes)} extracted two-person scenes{context}.

{all_text}

For each scene, identify problems in the dialogue lines:
1. Stage directions mistakenly included as dialogue (e.g. "Enter Oberon", "All exit", "He leads the fairies in dance")
2. Page headers or line numbers mixed into text (e.g. "171 A Midsummer Night's Dream ACT 5. SC. 1")
3. Lines that are clearly not spoken dialogue

Return a JSON array with one object per scene:
{{
  "scene": 1,
  "remove_phrases": ["exact phrase to remove from any line", ...],
  "remove_lines_containing": ["substring that identifies a non-dialogue line", ...]
}}

If a scene is clean, return {{"scene": N, "remove_phrases": [], "remove_lines_containing": []}}.
Return ONLY valid JSON array."""

        import time as _time
        for attempt in range(3):
            try:
                response = self.client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.2,
                    max_tokens=min(8000, max(1000, len(scenes) * 200))
                )
                response_text = response.choices[0].message.content or ""
                json_match = re.search(r'\[.*\]', response_text, re.DOTALL)
                if json_match:
                    cleanup_list = json.loads(json_match.group())
                    if isinstance(cleanup_list, list):
                        return self._apply_cleanup(scenes, cleanup_list)
                break
            except Exception as e:
                is_rate_limit = "429" in str(e) or "rate_limit" in str(e).lower()
                if is_rate_limit and attempt < 2:
                    _time.sleep((attempt + 1) * 2)
                    continue
                print(f"Error in scene cleanup: {e}")
                break

        return scenes  # Return unmodified on failure

    def _apply_cleanup(self, scenes: List[Dict], cleanup_list: List[Dict]) -> List[Dict]:
        """Apply AI cleanup instructions to scenes."""
        cleanup_map = {}
        for item in cleanup_list:
            idx = item.get("scene", 0) - 1  # 1-indexed to 0-indexed
            if 0 <= idx < len(scenes):
                cleanup_map[idx] = item

        cleaned = []
        total_removed = 0
        for i, scene in enumerate(scenes):
            if i not in cleanup_map:
                cleaned.append(scene)
                continue

            instructions = cleanup_map[i]
            remove_phrases = instructions.get("remove_phrases", [])
            remove_containing = instructions.get("remove_lines_containing", [])

            new_lines = []
            for line in scene.get("lines", []):
                text = line["text"]

                # Check if entire line should be removed
                should_remove = False
                for substr in remove_containing:
                    if substr.lower() in text.lower():
                        should_remove = True
                        total_removed += 1
                        break

                if should_remove:
                    continue

                # Remove specific phrases from line text
                for phrase in remove_phrases:
                    text = text.replace(phrase, "").strip()

                if text:  # Only keep non-empty lines
                    new_lines.append({**line, "text": text})

            scene_copy = dict(scene)
            scene_copy["lines"] = new_lines
            cleaned.append(scene_copy)

        if total_removed:
            print(f"AI cleanup: removed {total_removed} non-dialogue lines across {len(scenes)} scenes")

        return cleaned

    def _default_metadata(self, scene_data: Dict) -> Dict:
        """Generate fallback metadata from character names."""
        characters = list(scene_data.get("characters", []))
        if len(characters) >= 2:
            title = f"{characters[0]} & {characters[1]}"
        else:
            title = "Untitled Scene"
        return {
            "title": title,
            "description": None,
            "setting": None,
            "tone": None,
            "primary_emotions": [],
            "relationship_dynamic": None,
        }

    def _build_scene_result(self, scene_data: Dict, metadata: Dict) -> Dict:
        """Combine regex-extracted dialogue with AI-generated metadata."""
        characters = list(scene_data["characters"])
        char1, char2 = characters[0], characters[1]

        return {
            "title": metadata.get("title", f"{char1} & {char2}"),
            "character_1": char1,
            "character_2": char2,
            "description": metadata.get("description"),
            "setting": metadata.get("setting"),
            "tone": metadata.get("tone"),
            "primary_emotions": metadata.get("primary_emotions", []),
            "relationship_dynamic": metadata.get("relationship_dynamic"),
            "lines": [
                {
                    "character": l["character"],
                    "text": l["text"],
                    "stage_direction": l.get("stage_direction"),
                }
                for l in scene_data["lines"]
            ],
        }

    # ------------------------------------------------------------------
    # AI-only fallback (for scripts with no recognizable formatting)
    # ------------------------------------------------------------------

    def extract_scenes_ai_fallback(self, script_text: str, characters: List[Dict]) -> List[Dict]:
        """
        Fallback: use AI to extract scenes when regex finds no dialogue.

        This handles scripts with unusual formatting that regex can't parse.
        Less reliable than regex — used only as a last resort.
        """
        character_names = [c['name'] for c in characters if c.get('name')]
        char_hint = ', '.join(character_names) if character_names else "(auto-detect from the dialogue)"

        max_chars = 80000
        truncated_text = script_text[:max_chars]

        prompt = f"""Analyze this script and extract ALL dialogue scenes (2 or more characters speaking).

IMPORTANT RULES:
- If the entire script is a conversation between characters, treat it as ONE scene.
- Only extract scenes with at least 4 lines of dialogue.
- Every line of dialogue must be captured — do NOT skip or summarize lines.
- If a character speaks multiple consecutive paragraphs, keep them as separate lines.
- Stage directions in parentheses or brackets should go in "stage_direction", not in "text".
- For character_1 and character_2, pick the two characters who speak the most lines.

Script:
```
{truncated_text}
```

Known characters: {char_hint}

For each scene, extract:
1. title: Descriptive title for the scene
2. character_1: Character with the most lines
3. character_2: Character with the second most lines
4. description: Brief description (1-2 sentences)
5. setting: Where the scene takes place (null if unclear)
6. tone: One of: romantic, comedic, tragic, tense, dramatic, lighthearted, mysterious, melancholic
7. primary_emotions: Array of 1-3 emotions
8. relationship_dynamic: One of: romantic, adversarial, familial, friendship, professional, mentor-student, strangers
9. lines: Array of ALL dialogue lines with:
   - character: Who speaks
   - text: The full dialogue text
   - stage_direction: Any stage directions (optional, null if none)

Return ONLY valid JSON array, no explanation."""

        max_tokens = min(16000, max(8000, int(len(truncated_text) / 4 * 2)))

        try:
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
                max_tokens=max_tokens
            )

            response_text = response.choices[0].message.content or ""
            finish_reason = response.choices[0].finish_reason
            print(f"AI fallback extraction: {len(response_text)} chars, finish_reason: {finish_reason}")

            if finish_reason == "length":
                print("WARNING: AI fallback output was truncated — some scenes may be incomplete")

            json_match = re.search(r'\[.*\]', response_text, re.DOTALL)
            if not json_match:
                print(f"No JSON array found. First 500 chars: {response_text[:500]}")
                return []

            try:
                scenes = json.loads(json_match.group())
            except json.JSONDecodeError:
                # Try to salvage truncated JSON
                raw = json_match.group()
                last_brace = raw.rfind('}')
                if last_brace > 0:
                    try:
                        scenes = json.loads(raw[:last_brace + 1].rstrip().rstrip(',') + ']')
                    except json.JSONDecodeError:
                        return []
                else:
                    return []

            if not isinstance(scenes, list):
                return []

            # Validate
            valid = []
            for scene in scenes:
                if scene.get("lines") and scene.get("character_1") and scene.get("character_2"):
                    valid.append(scene)

            print(f"AI fallback extracted {len(valid)} valid scenes")
            return valid

        except Exception as e:
            print(f"Error in AI fallback extraction: {e}")
            return []

    # ------------------------------------------------------------------
    # Combined extraction (small scripts — single AI call)
    # ------------------------------------------------------------------

    def extract_combined(self, script_text: str) -> Dict:
        """
        Single AI call that extracts metadata + scenes for short scripts (< 5 pages).
        Returns {"metadata": {...}, "scenes": [...]}.
        """
        import time as _time

        title_hint = self._detect_title_hint(script_text)
        hint_line = f'\nHINT: The title is likely "{title_hint}".\n' if title_hint else ""

        prompt = f"""Analyze this script and extract BOTH metadata and dialogue scenes in ONE response.
{hint_line}
Script text:
```
{script_text[:15000]}
```

Return a JSON object with two keys:

1. "metadata": {{
  "title": "The actual play/screenplay title",
  "author": "Playwright or screenwriter name",
  "characters": [
    {{"name": "NAME", "gender": "male/female/non-binary/unknown", "age_range": "20s/30-40/teen/elderly", "description": "Brief 10-15 word description"}}
  ],
  "genre": "Drama/Comedy/Tragedy/etc",
  "estimated_length_minutes": 60,
  "synopsis": "2-3 sentence synopsis of the work"
}}

2. "scenes": An array of dialogue scenes. For each scene:
{{
  "title": "Brief descriptive title",
  "character_1": "Character with most lines",
  "character_2": "Character with second most lines",
  "description": "1-2 sentence summary",
  "setting": "Where it takes place (null if unclear)",
  "tone": "romantic/comedic/tragic/tense/dramatic/lighthearted/mysterious/melancholic",
  "primary_emotions": ["emotion1", "emotion2"],
  "relationship_dynamic": "romantic/adversarial/familial/friendship/professional/mentor-student/strangers",
  "lines": [
    {{"character": "NAME", "text": "Full dialogue text", "stage_direction": null}},
    ...
  ]
}}

RULES for scenes:
- Extract every stretch of dialogue between 2+ characters.
- Include ALL spoken dialogue lines — do NOT skip, summarize, or paraphrase.
- Do NOT include stage directions as dialogue text.
- Merge consecutive lines by the same character into one entry.
- Only extract scenes with at least 4 lines of dialogue.

Return ONLY valid JSON."""

        default = {
            "metadata": {"title": "Untitled Script", "author": "Unknown", "characters": [], "genre": "Drama", "estimated_length_minutes": 60},
            "scenes": []
        }

        for attempt in range(3):
            try:
                response = self.client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.2,
                    max_tokens=min(16000, max(6000, len(script_text) // 2))
                )

                response_text = response.choices[0].message.content or ""
                json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
                if not json_match:
                    return default

                result = json.loads(json_match.group())
                # Validate structure
                if "metadata" not in result or "scenes" not in result:
                    return default

                # Validate scenes
                result["scenes"] = [
                    s for s in result["scenes"]
                    if isinstance(s, dict) and s.get("lines") and s.get("character_1") and s.get("character_2")
                ]
                return result

            except Exception as e:
                is_rate_limit = "429" in str(e) or "rate_limit" in str(e).lower()
                if is_rate_limit and attempt < 2:
                    _time.sleep((attempt + 1) * 2)
                    continue
                print(f"Error in combined extraction: {e}")
                return default

        return default

    # ------------------------------------------------------------------
    # Main extraction pipeline
    # ------------------------------------------------------------------

    def extract_scenes_from_text(self, text: str, characters: List[Dict],
                                  script_title: str = "", script_author: str = "",
                                  on_progress=None) -> List[Dict]:
        """
        Extract two-person scenes from script text (single chunk / unstructured).
        Uses AI to understand dialogue, stage directions, and character attribution.
        """
        def progress(msg):
            print(msg)
            if on_progress:
                on_progress(msg)

        progress("Extracting dialogue with AI (this takes a few seconds)")
        scenes = self.extract_chunk_ai(text, characters, script_title, script_author)
        progress(f"Found {len(scenes)} scenes")
        return scenes

    def extract_chunk_ai(self, chunk_text: str, characters: List[Dict],
                         script_title: str = "", script_author: str = "") -> List[Dict]:
        """
        Use AI to extract dialogue scenes (2+ characters) from a single structural chunk.
        AI understands stage directions, verse format, character attribution natively.

        Returns list of scene dicts ready for DB insertion.
        """
        import time as _time

        character_names = [c['name'] for c in characters if c.get('name')]
        char_hint = ', '.join(character_names) if character_names else "(auto-detect)"

        # Truncate very large chunks (shouldn't happen after structural splitting)
        text = chunk_text[:40000]

        prompt = f"""Extract ALL dialogue scenes from this script excerpt{' from "' + script_title + '"' if script_title else ''}{' by ' + script_author if script_author else ''}.

Known characters: {char_hint}

RULES:
- Extract every stretch of dialogue between 2 or more characters.
- Include ALL spoken dialogue lines — do NOT skip, summarize, or paraphrase any line.
- Do NOT include stage directions as dialogue (e.g. "Enter Oberon", "They exit", "He kneels").
- Stage directions in brackets/parentheses go in the "stage_direction" field.
- If one character gives a long speech (multiple sentences/verses), keep it as ONE line entry.
- Merge consecutive lines by the same character into one entry.
- If the entire chunk is one character's monologue with no second speaker, skip it.
- Only extract scenes with at least 4 lines of dialogue. Skip very short exchanges (2-3 lines).
- For "character_1" and "character_2", pick the two characters who speak the most lines in the scene.

Script text:
```
{text}
```

For each scene found, return a JSON object:
{{
  "title": "Brief descriptive title",
  "character_1": "Character with the most lines",
  "character_2": "Character with the second most lines",
  "description": "1-2 sentence summary",
  "setting": "Where it takes place (null if unclear)",
  "tone": "romantic/comedic/tragic/tense/dramatic/lighthearted/mysterious/melancholic",
  "primary_emotions": ["emotion1", "emotion2"],
  "relationship_dynamic": "romantic/adversarial/familial/friendship/professional/mentor-student/strangers",
  "lines": [
    {{"character": "NAME", "text": "Full dialogue text", "stage_direction": null}},
    ...
  ]
}}

Return a JSON ARRAY. If no scenes exist, return []. Return ONLY valid JSON."""

        # Output needs to be large enough to hold all dialogue as JSON.
        # Rule of thumb: output can be ~1.5x the input text length (dialogue + JSON overhead).
        max_tokens = min(16000, max(6000, len(text) // 2))

        for attempt in range(3):
            try:
                response = self.client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.2,
                    max_tokens=max_tokens
                )
                response_text = response.choices[0].message.content or ""
                finish_reason = response.choices[0].finish_reason

                json_match = re.search(r'\[.*\]', response_text, re.DOTALL)
                if not json_match:
                    return []

                raw = json_match.group()
                try:
                    scenes = json.loads(raw)
                except json.JSONDecodeError:
                    # Try to salvage truncated JSON
                    last_brace = raw.rfind('}')
                    if last_brace > 0:
                        try:
                            scenes = json.loads(raw[:last_brace + 1].rstrip().rstrip(',') + ']')
                        except json.JSONDecodeError:
                            return []
                    else:
                        return []

                # Validate: must have lines and two characters
                valid = [
                    s for s in scenes
                    if isinstance(s, dict) and s.get("lines") and s.get("character_1") and s.get("character_2")
                ]
                return valid

            except Exception as e:
                is_rate_limit = "429" in str(e) or "rate_limit" in str(e).lower()
                if is_rate_limit and attempt < 2:
                    _time.sleep((attempt + 1) * 2)
                    continue
                print(f"Error in AI chunk extraction: {e}")
                return []

        return []

    def extract_scenes_chunked(self, chunks, characters: List[Dict],
                                script_title: str = "", script_author: str = "",
                                on_progress=None, cancel_event=None) -> List[Dict]:
        """
        Extract two-person scenes from each structural chunk using AI.
        Each chunk (act/scene) is sent to AI which understands dialogue,
        stage directions, verse format, etc.
        """
        def progress(msg):
            print(msg)
            if on_progress:
                on_progress(msg)

        all_scenes = []

        # Filter to meaningful chunks
        meaningful_chunks = [c for c in chunks if c.char_count >= 200]

        # Pre-filter with regex: only send chunks to AI that have at least
        # 2 different character names speaking (cheap check, saves ~50% of AI calls)
        chunks_with_dialogue = []
        for chunk in meaningful_chunks:
            sections = parse_dialogue(chunk.text)
            # Check if any section has 2+ characters
            has_multi_char = any(len(s["characters"]) >= 2 for s in sections)
            if has_multi_char:
                chunks_with_dialogue.append(chunk)

        skipped = len(meaningful_chunks) - len(chunks_with_dialogue)
        if skipped:
            progress(f"Skipped {skipped} sections with no dialogue")
        progress(f"Extracting scenes from {len(chunks_with_dialogue)} sections")

        for i, chunk in enumerate(chunks_with_dialogue):
            if cancel_event and cancel_event.is_set():
                progress("Extraction cancelled")
                break

            chunk_label = chunk.act_label or chunk.scene_label or f"section {i+1}"
            progress(f"Extracting dialogue from {chunk_label}")

            scenes = self.extract_chunk_ai(
                chunk.text, characters, script_title, script_author
            )

            # Tag each scene with its structural position
            for scene in scenes:
                scene["act"] = chunk.act_label
                scene["scene_number"] = chunk.scene_label

            if scenes:
                progress(f"Found {len(scenes)} scene(s) in {chunk_label}")

            all_scenes.extend(scenes)

        return all_scenes

    def extract_scenes_quick(self, chunks, characters: List[Dict],
                             script_title: str = "", script_author: str = "",
                             on_progress=None, cancel_event=None) -> List[Dict]:
        """
        Quick extraction: regex parsing + batch AI metadata (2-person scenes only).
        Much faster than full AI extraction — 2-3 AI calls total vs ~20.
        """
        def progress(msg):
            print(msg)
            if on_progress:
                on_progress(msg)

        # Step 1: Regex-extract 2-person scenes from each chunk
        all_sections = []
        for chunk in chunks:
            if chunk.char_count < 200:
                continue
            sections = parse_dialogue(chunk.text)
            two_person = filter_two_person_scenes(sections, min_lines=4)
            for section in two_person:
                section["_act"] = chunk.act_label
                section["_scene"] = chunk.scene_label
            all_sections.extend(two_person)

        progress(f"Regex parsed {len(all_sections)} two-person scenes")

        if not all_sections:
            return []

        if cancel_event and cancel_event.is_set():
            return []

        # Step 2: Batch AI metadata analysis (1 AI call)
        progress("Figuring out the tone, emotions, dynamics")
        metadata_list = self.analyze_scenes_batch(
            all_sections, script_title, script_author
        )

        if cancel_event and cancel_event.is_set():
            return []

        # Step 3: Build scene results
        scenes = []
        for section, meta in zip(all_sections, metadata_list):
            result = self._build_scene_result(section, meta)
            result["act"] = section.get("_act")
            result["scene_number"] = section.get("_scene")
            scenes.append(result)

        # Step 4: AI cleanup (1 AI call)
        progress("Cleaning up dialogue")
        scenes = self.clean_scenes_batch(scenes, script_title)

        return scenes

    def parse_script(self, file_content: bytes, file_type: str, filename: str,
                     on_progress=None, cancel_event=None, mode: str = "full") -> Dict:
        """
        Main entry point: parse a script file and extract all information.

        Args:
            on_progress: Optional callback(step_message: str) for real-time progress.
            mode: "quick" (regex + batch AI, 2-person only) or "full" (AI per chunk).

        Returns:
        {
            "raw_text": str,
            "metadata": {...},
            "scenes": [...]
        }
        """
        from app.services.script_structure import detect_structure

        def progress(msg):
            print(msg)
            if on_progress:
                on_progress(msg)

        def check_cancelled():
            if cancel_event and cancel_event.is_set():
                raise InterruptedError("Extraction cancelled by client")

        # Step 1: Extract text
        progress(f"Opening {filename}")
        if file_type == "pdf":
            raw_text = self.extract_text_from_pdf(file_content)
        elif file_type in ["txt", "text"]:
            raw_text = self.extract_text_from_txt(file_content)
        else:
            raise ValueError(f"Unsupported file type: {file_type}")

        if not raw_text or len(raw_text) < 100:
            raise ValueError("File appears to be empty or too short")

        pages_est = max(1, len(raw_text) // 3000)
        progress(f"Read ~{pages_est} pages of text")

        # Short scripts (< 5 pages): single AI call for metadata + scenes
        if pages_est <= 5:
            check_cancelled()
            progress("Analyzing script and extracting scenes")
            combined = self.extract_combined(raw_text)
            metadata = combined.get("metadata", {})
            scenes = combined.get("scenes", [])
            script_title = metadata.get("title", "")
            characters = metadata.get("characters", [])
            progress(f"Found {len(characters)} characters, {len(scenes)} scenes in \"{script_title}\"")
        else:
            # Step 2: Extract metadata (title, author, characters)
            check_cancelled()
            progress("Learning who the characters are")
            metadata = self.extract_script_metadata(raw_text)
            script_title = metadata.get("title", "")
            script_author = metadata.get("author", "")
            characters = metadata.get('characters', [])
            progress(f"Found {len(characters)} characters in \"{script_title}\"")

            # Step 3: Detect act/scene structure (pure regex, zero AI cost)
            check_cancelled()
            progress("Mapping out the acts and scenes")
            chunks = detect_structure(raw_text)
            has_structure = len(chunks) > 1 or (len(chunks) == 1 and chunks[0].act_label is not None)
            if has_structure:
                act_chunks = [c for c in chunks if c.act_label]
                progress(f"Detected {len(act_chunks)} acts, {len(chunks)} sections")
            else:
                progress("No act/scene structure found, treating as single script")

            # Step 4: Extract scenes
            check_cancelled()
            progress("Pulling every line of dialogue")

            if mode == "quick":
                scenes = self.extract_scenes_quick(
                    chunks, characters, script_title, script_author,
                    on_progress=on_progress, cancel_event=cancel_event
                )
                if not scenes:
                    progress("No scenes found with regex, falling back to AI extraction")
                    mode = "full"

            if mode == "full":
                if has_structure:
                    scenes = self.extract_scenes_chunked(
                        chunks, characters, script_title, script_author,
                        on_progress=on_progress, cancel_event=cancel_event
                    )
                else:
                    scenes = self.extract_scenes_from_text(
                        raw_text, characters, script_title, script_author,
                        on_progress=on_progress
                    )

        # Filter out scenes with fewer than 4 lines — too short for rehearsal
        before = len(scenes)
        scenes = [s for s in scenes if len(s.get("lines", [])) >= 4]
        if before > len(scenes):
            progress(f"Filtered out {before - len(scenes)} scenes with fewer than 4 lines")

        progress(f"Extracted {len(scenes)} rehearsal-ready scenes")

        return {
            "raw_text": raw_text,
            "metadata": metadata,
            "scenes": scenes
        }
