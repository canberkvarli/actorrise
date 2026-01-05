"""Analyze monologue content using AI.

This module has been migrated to use LangChain/LangGraph infrastructure
while maintaining 100% backward compatibility with existing code.
"""

import os
from typing import Dict, List, Optional

# LangChain imports
from .langchain.chains import (
    create_monologue_analysis_chain,
    create_query_parsing_chain
)
from .langchain.embeddings import generate_embedding as langchain_generate_embedding


class ContentAnalyzer:
    """
    Analyze monologue content using AI.

    Now powered by LangChain for better observability, error handling,
    and future extensibility. The API remains identical to the original
    OpenAI-based implementation.
    """

    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize ContentAnalyzer with optional API key.

        Args:
            api_key: Optional OpenAI API key (defaults to OPENAI_API_KEY env var)
        """
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")

        # Initialize LangChain chains (lazy loading for performance)
        self._analysis_chain = None
        self._query_chain = None

    @property
    def analysis_chain(self):
        """Lazy-load the analysis chain"""
        if self._analysis_chain is None:
            self._analysis_chain = create_monologue_analysis_chain(
                temperature=0.3,
                api_key=self.api_key
            )
        return self._analysis_chain

    @property
    def query_chain(self):
        """Lazy-load the query parsing chain"""
        if self._query_chain is None:
            self._query_chain = create_query_parsing_chain(
                temperature=0.1,
                api_key=self.api_key
            )
        return self._query_chain

    def analyze_monologue(
        self,
        text: str,
        character: str,
        play_title: str,
        author: str = "Unknown"
    ) -> Dict:
        """
        Comprehensive analysis of a monologue using LangChain.

        This method now uses LangChain chains for better observability
        and error handling, while maintaining the exact same return format.

        Args:
            text: The monologue text
            character: Character name
            play_title: Title of the play
            author: Author name (default: "Unknown")

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
        try:
            # Use LangChain chain instead of direct OpenAI call
            result = self.analysis_chain.invoke({
                "text": text,
                "character": character,
                "play_title": play_title,
                "author": author
            })
            return result

        except Exception as e:
            print(f"Error analyzing monologue: {e}")
            # Return minimal default analysis (same as original)
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
        """
        Generate semantic embedding for search using LangChain.

        This method now uses LangChain's OpenAIEmbeddings for better
        error handling, automatic retries, and LangSmith tracing.

        Args:
            text: Text to embed

        Returns:
            List of floats representing the embedding vector (1536 dimensions)
        """
        try:
            # Use LangChain embedding generation
            return langchain_generate_embedding(
                text=text,
                model="text-embedding-3-small",
                dimensions=1536,
                api_key=self.api_key
            )

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
        Parse natural language search query to extract filters using LangChain.

        This method now uses LangChain chains for better observability
        and error handling, while maintaining the exact same return format.

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
        try:
            # Use LangChain chain instead of direct OpenAI call
            result = self.query_chain.invoke({"query": query})
            return result

        except Exception as e:
            print(f"Error parsing search query: {e}")
            return {}
