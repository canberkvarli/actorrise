"""
Deduplication logic for monologues and plays.

Prevents adding duplicate content from different sources.
"""

import logging
from difflib import SequenceMatcher
from typing import Optional

from sqlalchemy.orm import Session

from app.models.actor import Monologue, Play

logger = logging.getLogger(__name__)


class MonologueDeduplicator:
    """Detect and prevent duplicate monologues."""

    def __init__(self, db: Session):
        self.db = db

    def is_duplicate_monologue(
        self,
        text: str,
        character_name: str,
        play_title: str,
        author: str,
        threshold: float = 0.90
    ) -> Optional[int]:
        """
        Check if monologue already exists in database.

        Args:
            text: Monologue text
            character_name: Character name
            play_title: Play title
            author: Author name
            threshold: Similarity threshold (0.90 = 90% similar)

        Returns:
            Monologue ID if duplicate found, None otherwise
        """
        # 1. Exact text match (fast)
        exact_match = self.db.query(Monologue).filter(
            Monologue.text == text
        ).first()

        if exact_match:
            logger.info(f"Exact duplicate found: {exact_match.id}")
            return exact_match.id

        # 2. Same play/character (fast check)
        same_character = self.db.query(Monologue).join(Play).filter(
            Monologue.character_name.ilike(f"%{character_name}%"),
            Play.title.ilike(f"%{play_title}%"),
            Play.author.ilike(f"%{author}%")
        ).all()

        if same_character:
            # Check text similarity
            for candidate in same_character:
                similarity = self._text_similarity(text, candidate.text)
                if similarity >= threshold:
                    logger.info(
                        f"Similar duplicate found: {candidate.id} "
                        f"(similarity: {similarity:.2f})"
                    )
                    return candidate.id

        # 3. No duplicate found
        return None

    def is_duplicate_play(
        self,
        title: str,
        author: str,
        threshold: float = 0.85
    ) -> Optional[int]:
        """
        Check if play already exists in database.

        Args:
            title: Play title
            author: Author name
            threshold: Similarity threshold

        Returns:
            Play ID if duplicate found, None otherwise
        """
        # Exact match
        exact = self.db.query(Play).filter(
            Play.title == title,
            Play.author == author
        ).first()

        if exact:
            logger.info(f"Exact play duplicate: {exact.id}")
            return exact.id

        # Fuzzy match on author (handles spelling variations)
        similar_author = self.db.query(Play).filter(
            Play.author.ilike(f"%{author[:5]}%")  # First 5 chars
        ).all()

        for candidate in similar_author:
            author_sim = self._text_similarity(author, candidate.author)
            title_sim = self._text_similarity(title, candidate.title)

            # Both need to be similar
            if author_sim >= threshold and title_sim >= threshold:
                logger.info(
                    f"Similar play duplicate: {candidate.id} "
                    f"(author: {author_sim:.2f}, title: {title_sim:.2f})"
                )
                return candidate.id

        return None

    def _text_similarity(self, text1: str, text2: str) -> float:
        """
        Calculate text similarity using Levenshtein-based algorithm.

        Args:
            text1: First text
            text2: Second text

        Returns:
            Similarity score (0.0-1.0)
        """
        # Normalize: lowercase, strip whitespace
        t1 = text1.lower().strip()
        t2 = text2.lower().strip()

        # Use SequenceMatcher (similar to Levenshtein)
        return SequenceMatcher(None, t1, t2).ratio()

    def find_potential_duplicates(
        self,
        min_similarity: float = 0.90,
        limit: int = 100
    ) -> list:
        """
        Find potential duplicate monologues in database (for cleanup).

        Args:
            min_similarity: Minimum similarity to flag as duplicate
            limit: Max pairs to check

        Returns:
            List of (id1, id2, similarity) tuples
        """
        # Get all monologues (limit for performance)
        monologues = self.db.query(Monologue).limit(limit).all()

        duplicates = []

        # Compare each pair (brute force for now - optimize later if needed)
        for i, mono1 in enumerate(monologues):
            for mono2 in monologues[i + 1:]:
                similarity = self._text_similarity(mono1.text, mono2.text)

                if similarity >= min_similarity:
                    duplicates.append((mono1.id, mono2.id, similarity))
                    logger.info(
                        f"Potential duplicate: {mono1.id} <-> {mono2.id} "
                        f"(similarity: {similarity:.2f})"
                    )

        return duplicates

    def merge_duplicates(
        self,
        keep_id: int,
        remove_id: int
    ) -> bool:
        """
        Merge two duplicate monologues (keep one, remove other).

        Args:
            keep_id: ID of monologue to keep
            remove_id: ID of monologue to remove

        Returns:
            True if successful
        """
        try:
            keep = self.db.query(Monologue).get(keep_id)
            remove = self.db.query(Monologue).get(remove_id)

            if not keep or not remove:
                logger.error(f"Monologue not found: {keep_id} or {remove_id}")
                return False

            # Transfer any useful metadata from remove to keep
            if not keep.embedding and remove.embedding:
                keep.embedding = remove.embedding
                keep.embedding_vector = remove.embedding_vector

            if not keep.primary_emotion and remove.primary_emotion:
                keep.primary_emotion = remove.primary_emotion
                keep.emotion_scores = remove.emotion_scores

            # Soft delete remove
            self.db.delete(remove)
            self.db.commit()

            logger.info(f"Merged duplicates: kept {keep_id}, removed {remove_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to merge duplicates: {e}")
            self.db.rollback()
            return False
