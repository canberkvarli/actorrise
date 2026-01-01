"""Analyze monologue content using AI."""

from openai import OpenAI
import os
from typing import Dict, List, Optional
import json


class ContentAnalyzer:
    """Analyze monologue content using AI"""

    def __init__(self, api_key: Optional[str] = None):
        self.client = OpenAI(api_key=api_key or os.getenv("OPENAI_API_KEY"))

    def analyze_monologue(
        self,
        text: str,
        character: str,
        play_title: str,
        author: str = "Unknown"
    ) -> Dict:
        """
        Comprehensive analysis of a monologue.

        Returns:
            {
                'primary_emotion': str,
                'emotion_scores': dict,
                'themes': list,
                'tone': str,
                'difficulty_level': str,
                'character_age_range': str,
                'character_gender': str,
                'scene_description': str
            }
        """

        prompt = f"""Analyze this theatrical monologue and provide structured data:

PLAY: {play_title}
AUTHOR: {author}
CHARACTER: {character}
TEXT:
{text}

Provide a JSON response with:
1. primary_emotion: The dominant emotion (choose one: joy, sadness, anger, fear, surprise, disgust, anticipation, trust, melancholy, hope, despair, longing, confusion, determination)
2. emotion_scores: A dictionary of emotions to scores 0.0-1.0 (include at least 3-5 emotions that are present)
3. themes: List of 2-4 themes (e.g., love, death, betrayal, identity, power, family, revenge, ambition, honor, fate, freedom, isolation, redemption, madness, jealousy)
4. tone: Overall tone (choose one: dramatic, comedic, sarcastic, philosophical, romantic, dark, inspirational, melancholic, defiant, contemplative, anguished, joyful)
5. difficulty_level: beginner, intermediate, or advanced (based on language complexity, emotional range, metaphorical content)
6. character_age_range: Estimated age (e.g., "teens", "20s", "30s", "40s", "50s", "60+", "20-30", "30-40", etc.)
7. character_gender: male, female, or any (use "any" if the piece could be performed by any gender)
8. scene_description: 1-2 sentence description of the dramatic situation/context

Return ONLY valid JSON, no markdown or explanation."""

        try:
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a theatrical content analyzer specializing in dramatic literature. Return only valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                response_format={"type": "json_object"}
            )

            result = json.loads(response.choices[0].message.content)
            return result

        except Exception as e:
            print(f"Error analyzing monologue: {e}")
            # Return minimal default analysis
            return {
                'primary_emotion': 'unknown',
                'emotion_scores': {},
                'themes': [],
                'tone': 'dramatic',
                'difficulty_level': 'intermediate',
                'character_age_range': 'any',
                'character_gender': 'any',
                'scene_description': 'No description available.'
            }

    def generate_embedding(self, text: str) -> List[float]:
        """Generate semantic embedding for search"""

        try:
            response = self.client.embeddings.create(
                model="text-embedding-3-small",
                input=text,
                dimensions=1536
            )

            return response.data[0].embedding

        except Exception as e:
            print(f"Error generating embedding: {e}")
            return []

    def generate_search_tags(self, analysis: Dict, text: str, character: str) -> List[str]:
        """Generate searchable tags from analysis"""

        tags = []

        # Add emotion tags
        if analysis.get('primary_emotion'):
            tags.append(analysis['primary_emotion'])

        for emotion, score in analysis.get('emotion_scores', {}).items():
            if score > 0.3:
                tags.append(emotion)

        # Add theme tags
        tags.extend(analysis.get('themes', []))

        # Add tone
        if analysis.get('tone'):
            tags.append(analysis['tone'])

        # Add difficulty
        if analysis.get('difficulty_level'):
            tags.append(analysis['difficulty_level'])

        # Add character tags
        if analysis.get('character_gender'):
            tags.append(analysis['character_gender'])

        if analysis.get('character_age_range'):
            tags.append(analysis['character_age_range'])

        # Add character name
        tags.append(character.lower())

        return list(set(tags))  # Remove duplicates

    def batch_analyze(
        self,
        monologues: List[Dict],
        play_title: str,
        author: str = "Unknown"
    ) -> List[Dict]:
        """
        Analyze multiple monologues in batch.

        Args:
            monologues: List of dicts with 'character' and 'text' keys
            play_title: Title of the play
            author: Author of the play

        Returns:
            List of analysis results matching input order
        """
        results = []

        for mono in monologues:
            try:
                analysis = self.analyze_monologue(
                    text=mono['text'],
                    character=mono['character'],
                    play_title=play_title,
                    author=author
                )
                results.append(analysis)

                # Small delay to respect rate limits (500 RPM for Tier 1)
                import time
                time.sleep(0.12)  # ~500 requests per minute

            except Exception as e:
                print(f"Error in batch analysis: {e}")
                results.append({
                    'primary_emotion': 'unknown',
                    'emotion_scores': {},
                    'themes': [],
                    'tone': 'dramatic',
                    'difficulty_level': 'intermediate',
                    'character_age_range': 'any',
                    'character_gender': 'any',
                    'scene_description': 'Error during analysis.'
                })

        return results

    def parse_search_query(self, query: str) -> Dict:
        """
        Parse natural language search query to extract filters.

        Args:
            query: Natural language query like "funny piece for middle aged woman"

        Returns:
            Dict with extracted filters: {
                'gender': 'female' | 'male' | None,
                'age_range': '20s' | '30s' | '40s' | etc. | None,
                'emotion': 'joy' | 'sadness' | etc. | None,
                'themes': ['love', 'power'] | None,
                'category': 'classical' | 'contemporary' | None,
                'tone': 'comedic' | 'dramatic' | etc. | None
            }
        """

        prompt = f"""Parse this monologue search query and extract any filters the user is specifying:

QUERY: "{query}"

Extract the following information if present in the query (return null if not mentioned):

1. gender: Is the user looking for a male, female, or any gender character?
   - Keywords: man/male/masculine/boy/he/him → "male"
   - Keywords: woman/female/feminine/girl/she/her → "female"
   - Otherwise → null

2. age_range: What age range is mentioned?
   - Keywords: young/teen/teenager/youth → "teens"
   - Keywords: twenties/20s/young adult → "20s"
   - Keywords: thirties/30s → "30s"
   - Keywords: middle aged/forties/40s → "40s"
   - Keywords: fifties/50s/older → "50s"
   - Keywords: elderly/senior/60+ → "60+"
   - Otherwise → null

3. emotion: What primary emotion is requested?
   - Keywords: funny/comedic/humorous/laugh → "joy"
   - Keywords: sad/depressing/melancholy/tearful → "sadness"
   - Keywords: angry/furious/rage → "anger"
   - Keywords: scary/fearful/anxious → "fear"
   - Keywords: hopeful/optimistic → "hope"
   - Keywords: desperate/despairing → "despair"
   - Otherwise → null

4. themes: What themes are mentioned? (array of strings)
   - Examples: love, death, betrayal, identity, power, family, revenge, loss, etc.
   - Return array or null

5. category: Classical or contemporary?
   - Keywords: shakespeare/classical/greek/chekhov/ibsen → "classical"
   - Keywords: modern/contemporary/recent/new → "contemporary"
   - Otherwise → null

6. tone: What tone is requested?
   - Keywords: funny/comedic/humorous → "comedic"
   - Keywords: serious/dramatic/tragic → "dramatic"
   - Keywords: dark/grim → "dark"
   - Keywords: romantic/loving → "romantic"
   - Otherwise → null

Return ONLY valid JSON with these keys. Use null for any filter not mentioned in the query."""

        try:
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a search query parser for theatrical monologues. Extract filters from natural language queries. Return only valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,  # Low temperature for consistent extraction
                response_format={"type": "json_object"}
            )

            result = json.loads(response.choices[0].message.content)

            # Clean up the result - remove None/null values
            cleaned = {k: v for k, v in result.items() if v is not None}

            return cleaned

        except Exception as e:
            print(f"Error parsing search query: {e}")
            return {}
