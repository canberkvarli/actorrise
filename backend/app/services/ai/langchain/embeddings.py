"""Embedding generation using LangChain OpenAIEmbeddings.

This module provides a simple interface for generating embeddings
that's compatible with the existing ContentAnalyzer API.
"""

from typing import List, Optional
from .config import get_embeddings_model


def generate_embedding(
    text: str,
    model: str = "text-embedding-3-small",
    dimensions: int = 1536,
    api_key: Optional[str] = None
) -> List[float]:
    """
    Generate semantic embedding for text using OpenAI embeddings.

    This replaces the direct OpenAI API call with LangChain's
    OpenAIEmbeddings wrapper, providing:
    - Better error handling
    - Automatic retries
    - LangSmith tracing (if enabled)
    - Consistent interface

    Args:
        text: Text to embed
        model: Embedding model name (default: text-embedding-3-small)
        dimensions: Embedding dimensions (default: 1536)
        api_key: Optional OpenAI API key

    Returns:
        List of floats representing the embedding vector

    Example:
        >>> embedding = generate_embedding("A sad monologue about loss")
        >>> len(embedding)
        1536
    """
    try:
        embeddings_model = get_embeddings_model(
            model=model,
            dimensions=dimensions,
            api_key=api_key
        )

        # embed_query returns a List[float]
        embedding = embeddings_model.embed_query(text)

        return embedding

    except Exception as e:
        print(f"Error generating embedding: {e}")
        return []


def generate_embeddings_batch(
    texts: List[str],
    model: str = "text-embedding-3-small",
    dimensions: int = 1536,
    api_key: Optional[str] = None
) -> List[List[float]]:
    """
    Generate embeddings for multiple texts in a single batch.

    This is more efficient than calling generate_embedding() multiple times
    as it makes a single API call.

    Args:
        texts: List of texts to embed
        model: Embedding model name
        dimensions: Embedding dimensions
        api_key: Optional OpenAI API key

    Returns:
        List of embedding vectors, one per input text

    Example:
        >>> texts = ["sad monologue", "funny monologue"]
        >>> embeddings = generate_embeddings_batch(texts)
        >>> len(embeddings)
        2
    """
    try:
        embeddings_model = get_embeddings_model(
            model=model,
            dimensions=dimensions,
            api_key=api_key
        )

        # embed_documents returns List[List[float]]
        embeddings = embeddings_model.embed_documents(texts)

        return embeddings

    except Exception as e:
        print(f"Error generating batch embeddings: {e}")
        return [[] for _ in texts]  # Return empty embeddings for all texts
