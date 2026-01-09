"""LangChain configuration and model initialization.

This module handles:
- OpenAI model initialization (ChatOpenAI, OpenAIEmbeddings)
- LangSmith tracing configuration (optional)
- Model parameters and settings
"""

import os
from typing import Optional
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_core.language_models.chat_models import BaseChatModel


def configure_langsmith():
    """
    Configure LangSmith tracing for observability.

    This is optional and will gracefully degrade if not configured.
    Environment variables needed:
    - LANGCHAIN_API_KEY: Your LangSmith API key
    - LANGCHAIN_PROJECT: Project name (default: "actorrise")
    - LANGCHAIN_TRACING_V2: Set to "true" to enable
    """
    tracing_enabled = os.getenv("LANGCHAIN_TRACING_V2", "false").lower() == "true"

    if tracing_enabled:
        api_key = os.getenv("LANGCHAIN_API_KEY")
        if api_key:
            os.environ["LANGCHAIN_PROJECT"] = os.getenv("LANGCHAIN_PROJECT", "actorrise")
            print("✓ LangSmith tracing enabled")
            return True
        else:
            print("⚠️  LangSmith tracing requested but LANGCHAIN_API_KEY not found")
            return False

    return False


def get_llm(
    model: str = "gpt-4o-mini",
    temperature: float = 0.3,
    api_key: Optional[str] = None,
    use_json_format: bool = False
) -> BaseChatModel:
    """
    Get a configured ChatOpenAI instance.

    Args:
        model: Model name (default: gpt-4o-mini for cost efficiency)
        temperature: Sampling temperature (0.0-2.0)
        api_key: Optional OpenAI API key (defaults to OPENAI_API_KEY env var)
        use_json_format: If True, force JSON output format (requires "json" in prompts)

    Returns:
        Configured ChatOpenAI instance
    """
    kwargs = {
        "model": model,
        "temperature": temperature,
        "api_key": api_key or os.getenv("OPENAI_API_KEY"),
    }
    
    if use_json_format:
        kwargs["model_kwargs"] = {"response_format": {"type": "json_object"}}
    
    return ChatOpenAI(**kwargs)


def get_embeddings_model(
    model: str = "text-embedding-3-small",
    dimensions: int = 1536,
    api_key: Optional[str] = None
) -> OpenAIEmbeddings:
    """
    Get a configured OpenAIEmbeddings instance.

    Args:
        model: Embedding model name (default: text-embedding-3-small)
        dimensions: Embedding dimensions (default: 1536)
        api_key: Optional OpenAI API key

    Returns:
        Configured OpenAIEmbeddings instance
    """
    return OpenAIEmbeddings(
        model=model,
        dimensions=dimensions,
        api_key=api_key or os.getenv("OPENAI_API_KEY")
    )


# Initialize LangSmith on module import (if configured)
configure_langsmith()
