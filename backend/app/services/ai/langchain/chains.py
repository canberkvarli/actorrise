"""LangChain chains for monologue analysis and query parsing.

This module contains the core LangChain chains used in MonologueMatch
and provides patterns for future features like ScenePartner and CraftCoach.
"""

import json
from typing import Dict, Optional
from langchain_core.runnables import Runnable
from langchain_core.output_parsers import StrOutputParser

from .config import get_llm
from .prompts import (
    MONOLOGUE_ANALYSIS_TEMPLATE,
    QUERY_PARSING_TEMPLATE
)


def create_monologue_analysis_chain(
    temperature: float = 0.3,
    api_key: Optional[str] = None
) -> Runnable:
    """
    Create a chain for analyzing monologue content.

    This chain takes monologue details and returns structured analysis including:
    - Primary emotion and emotion scores
    - Themes
    - Tone and difficulty level
    - Character age range and gender
    - Scene description

    Args:
        temperature: Model temperature (default: 0.3 for consistent analysis)
        api_key: Optional OpenAI API key

    Returns:
        LangChain Runnable that takes dict with keys:
        {text, character, play_title, author} and returns Dict

    Example:
        >>> chain = create_monologue_analysis_chain()
        >>> result = chain.invoke({
        ...     "text": "To be or not to be...",
        ...     "character": "Hamlet",
        ...     "play_title": "Hamlet",
        ...     "author": "William Shakespeare"
        ... })
        >>> result['primary_emotion']
        'melancholy'
    """
    llm = get_llm(temperature=temperature, api_key=api_key)

    # Create the chain: prompt | llm | parse JSON
    chain = MONOLOGUE_ANALYSIS_TEMPLATE | llm | StrOutputParser()

    # Wrap to parse JSON and provide fallback
    def _invoke_with_fallback(inputs: Dict) -> Dict:
        try:
            result = chain.invoke(inputs)
            return json.loads(result)
        except Exception as e:
            print(f"Error in monologue analysis chain: {e}")
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

    # Return a callable that wraps the chain
    class AnalysisChain:
        """Wrapper to provide .invoke() method"""
        def invoke(self, inputs: Dict) -> Dict:
            return _invoke_with_fallback(inputs)

    return AnalysisChain()


def create_query_parsing_chain(
    temperature: float = 0.1,
    api_key: Optional[str] = None
) -> Runnable:
    """
    Create a chain for parsing search queries to extract filters.

    This chain takes a natural language query and returns extracted filters
    like gender, age_range, emotion, themes, category, tone.

    Args:
        temperature: Model temperature (default: 0.1 for consistent extraction)
        api_key: Optional OpenAI API key

    Returns:
        LangChain Runnable that takes dict with key 'query' and returns Dict

    Example:
        >>> chain = create_query_parsing_chain()
        >>> result = chain.invoke({"query": "funny monologue for young woman"})
        >>> result
        {'gender': 'female', 'age_range': '20s', 'tone': 'comedic'}
    """
    llm = get_llm(temperature=temperature, api_key=api_key)

    # Create the chain
    chain = QUERY_PARSING_TEMPLATE | llm | StrOutputParser()

    # Wrap to parse JSON and provide fallback
    def _invoke_with_fallback(inputs: Dict) -> Dict:
        try:
            result = chain.invoke(inputs)
            parsed = json.loads(result)

            # Clean up the result - remove None/null values
            cleaned = {k: v for k, v in parsed.items() if v is not None}

            return cleaned
        except Exception as e:
            print(f"Error in query parsing chain: {e}")
            return {}

    # Return a callable wrapper
    class QueryParsingChain:
        """Wrapper to provide .invoke() method"""
        def invoke(self, inputs: Dict) -> Dict:
            return _invoke_with_fallback(inputs)

    return QueryParsingChain()


# ==============================================================================
# FUTURE CHAINS FOR SCENEPARTNER AND CRAFTCOACH
# ==============================================================================

def create_scene_partner_chain(api_key: Optional[str] = None) -> Runnable:
    """
    Create a conversational chain for ScenePartner feature.

    This will be implemented with LangGraph for stateful conversations.
    For now, this is a placeholder.

    Args:
        api_key: Optional OpenAI API key

    Returns:
        Conversational chain (to be implemented)

    Note:
        This feature requires LangGraph for:
        - Multi-turn conversation state
        - Context management across turns
        - Conditional branching based on user input
        - Scene progression tracking
    """
    # TODO: Implement with LangGraph
    # See graph.py for the implementation
    raise NotImplementedError(
        "ScenePartner chain will be implemented with LangGraph. "
        "See graph.py for the conversational flow."
    )


def create_craft_coach_chain(api_key: Optional[str] = None) -> Runnable:
    """
    Create a multi-step analysis chain for CraftCoach feature.

    This will analyze performances with multiple steps:
    1. Technical analysis (vocal, articulation, breath)
    2. Emotional analysis (authenticity, range)
    3. Delivery analysis (pacing, pauses, emphasis)
    4. Character analysis (understanding, choices)
    5. Summary and recommendations

    Args:
        api_key: Optional OpenAI API key

    Returns:
        Multi-step analysis chain (to be implemented)

    Note:
        This feature will use SequentialChain or custom chain composition
        to break down the analysis into focused steps.
    """
    # TODO: Implement multi-step analysis chain
    # Can use LangChain's SequentialChain or custom composition
    raise NotImplementedError(
        "CraftCoach chain will be implemented with multi-step analysis. "
        "Will use SequentialChain or custom chain composition."
    )
