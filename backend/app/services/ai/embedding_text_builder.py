"""
Shared helper for building enriched embedding text.

This module provides a consistent interface for building enriched text
that includes all relevant metadata before generating embeddings.

This ensures all scrapers and embedding generation use the same format,
avoiding the 3 inconsistent approaches previously used.
"""

from typing import Dict, List, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.actor import Monologue
    from sqlalchemy.orm import Session


def build_monologue_enriched_text(monologue: "Monologue") -> str:
    """
    Build enriched text for a monologue embedding.

    Format:
    "{character_name} from {play_title} by {author}.
    Emotion: {primary_emotion}. Tone: {tone}.
    Gender: {character_gender}. Age: {character_age_range}.
    Themes: {themes joined by comma}.
    Difficulty: {difficulty_level}.
    {text[:800]}"

    Args:
        monologue: Monologue model instance

    Returns:
        Enriched text string ready for embedding generation

    Example:
        >>> mono = db.query(Monologue).first()
        >>> text = build_monologue_enriched_text(mono)
        >>> embedding = generate_embedding(text, model="text-embedding-3-large", dimensions=3072)
    """
    parts = []

    # Character and play info
    if monologue.character_name:
        play_title = monologue.play.title if monologue.play else "Unknown Play"
        author = monologue.play.author if monologue.play else "Unknown Author"
        parts.append(f"{monologue.character_name} from {play_title} by {author}.")

    # Metadata
    if monologue.primary_emotion:
        parts.append(f"Emotion: {monologue.primary_emotion}.")
    if monologue.tone:
        parts.append(f"Tone: {monologue.tone}.")
    if monologue.character_gender:
        parts.append(f"Gender: {monologue.character_gender}.")
    if monologue.character_age_range:
        parts.append(f"Age: {monologue.character_age_range}.")
    if monologue.themes:
        themes_str = ", ".join(monologue.themes)
        parts.append(f"Themes: {themes_str}.")
    if monologue.difficulty_level:
        parts.append(f"Difficulty: {monologue.difficulty_level}.")

    # Text snippet (first 800 chars to keep embedding focused)
    if monologue.text:
        text_snippet = monologue.text[:800]
        parts.append(text_snippet)

    return " ".join(parts)


def build_film_tv_enriched_text(
    db: "Session",
    film_tv_reference_id: int
) -> str:
    """
    Build enriched text for a film_tv_references embedding.

    Format:
    "{title} ({year}). Type: {type}. Genre: {genre}.
    Director: {director}. Actors: {actors}. {plot}"

    Args:
        db: SQLAlchemy database session
        film_tv_reference_id: ID of the film_tv_references row

    Returns:
        Enriched text string ready for embedding generation

    Example:
        >>> text = build_film_tv_enriched_text(db, film_tv_reference_id=123)
        >>> embedding = generate_embedding(text, model="text-embedding-3-large", dimensions=3072)
    """
    from app.models.actor import FilmTvReference

    ref = db.query(FilmTvReference).filter(FilmTvReference.id == film_tv_reference_id).first()
    if not ref:
        return ""

    parts = []

    # Title and year
    if ref.title:
        year_str = f" ({ref.year})" if ref.year else ""
        parts.append(f"{ref.title}{year_str}.")

    # Type (movie/tvSeries)
    if ref.type:
        parts.append(f"Type: {ref.type}.")

    # Genre
    if ref.genre:
        if isinstance(ref.genre, list):
            genre_str = ", ".join(ref.genre)
        else:
            genre_str = str(ref.genre)
        parts.append(f"Genre: {genre_str}.")

    # Director
    if ref.director:
        parts.append(f"Director: {ref.director}.")

    # Actors
    if ref.actors:
        if isinstance(ref.actors, list):
            # Limit to first 5 actors to keep text concise
            actors_str = ", ".join(ref.actors[:5])
        else:
            actors_str = str(ref.actors)
        parts.append(f"Actors: {actors_str}.")

    # Plot (truncate to 500 chars to keep embedding focused)
    if ref.plot:
        plot_snippet = ref.plot[:500]
        parts.append(plot_snippet)

    return " ".join(parts)


def build_enriched_text_for_query(query: str, filters: Optional[Dict] = None) -> str:
    """
    Build enriched query text for semantic search.

    This ensures query embeddings match the enriched format of monologue embeddings
    for better semantic similarity.

    Args:
        query: Natural language search query
        filters: Optional parsed filters from query

    Returns:
        Enriched query text

    Example:
        >>> query = "sad monologue for a woman in her 30s"
        >>> filters = {"gender": "female", "age_range": "30s", "emotion": "sadness"}
        >>> enriched = build_enriched_text_for_query(query, filters)
        >>> # enriched = "sad monologue for a woman in her 30s. Emotion: sadness. Gender: female. Age: 30s."
    """
    parts = [query]

    if filters:
        if filters.get("emotion"):
            parts.append(f"Emotion: {filters['emotion']}.")
        if filters.get("tone"):
            parts.append(f"Tone: {filters['tone']}.")
        if filters.get("gender"):
            parts.append(f"Gender: {filters['gender']}.")
        if filters.get("age_range"):
            parts.append(f"Age: {filters['age_range']}.")
        if filters.get("themes"):
            themes = filters["themes"]
            if isinstance(themes, list):
                themes_str = ", ".join(themes)
            else:
                themes_str = str(themes)
            parts.append(f"Themes: {themes_str}.")
        if filters.get("difficulty"):
            parts.append(f"Difficulty: {filters['difficulty']}.")

    return " ".join(parts)
