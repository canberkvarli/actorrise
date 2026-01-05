"""LangChain infrastructure for ActorRise AI features.

This module provides the foundation for:
- MonologueMatch: AI-powered monologue search and analysis
- ScenePartner: Conversational AI scene reading partner (future)
- CraftCoach: Performance feedback system (future)
- Advanced Analytics: Search pattern insights (future)
"""

from .config import get_llm, get_embeddings_model
from .chains import (
    create_monologue_analysis_chain,
    create_query_parsing_chain,
)
from .embeddings import generate_embedding

__all__ = [
    'get_llm',
    'get_embeddings_model',
    'create_monologue_analysis_chain',
    'create_query_parsing_chain',
    'generate_embedding',
]
