"""
AI-powered content moderation for user submissions.

Workflow:
1. Quality assessment (text length, formatting, completeness)
2. Copyright detection
3. Duplicate detection
4. AI quality scoring
5. Decision: auto_approve, manual_review, or auto_reject

Philosophy: Conservative automation.
- Only auto-approve high-quality, clearly public domain content
- Flag uncertain cases for human review
- Auto-reject only obvious violations (known copyrighted, spam, etc.)
"""

from __future__ import annotations

import os
from typing import Dict, List, Optional
from difflib import SequenceMatcher

from sqlalchemy.orm import Session

from app.models.actor import Monologue
from app.services.ai.copyright_detector import CopyrightDetector
from app.services.ai.content_analyzer import ContentAnalyzer


class ContentModerator:
    """
    Moderate user-submitted monologues with AI assistance.

    Returns recommendation:
    - 'auto_approve': High quality + public domain → auto-approve
    - 'manual_review': Uncertain quality or copyright → human review
    - 'auto_reject': Spam, known copyright, very low quality → reject
    """

    # Quality thresholds
    MIN_WORDS = 30  # Minimum viable monologue length
    MAX_WORDS = 1000  # Too long = likely full scene, not monologue
    AUTO_APPROVE_QUALITY = 0.7  # Quality score threshold for auto-approval
    AUTO_REJECT_QUALITY = 0.3  # Below this = auto-reject

    # Duplicate detection threshold
    DUPLICATE_SIMILARITY = 0.90  # 90% similar = duplicate

    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize content moderator.

        Args:
            api_key: Optional OpenAI API key (defaults to OPENAI_API_KEY env var)
        """
        self.copyright_detector = CopyrightDetector()
        self.content_analyzer = ContentAnalyzer(api_key=api_key)

    async def moderate_submission(
        self,
        text: str,
        title: str,
        character: str,
        play_title: str,
        author: str,
        user_notes: Optional[str],
        db: Session
    ) -> Dict:
        """
        Run full moderation pipeline on a submission.

        Args:
            text: Monologue text
            title: Submission title
            character: Character name
            play_title: Play title
            author: Author name
            user_notes: Optional user notes
            db: Database session for duplicate checking

        Returns:
            {
                'recommendation': 'auto_approve' | 'manual_review' | 'auto_reject',
                'quality_score': float (0-1),
                'copyright_risk': 'low' | 'medium' | 'high',
                'flags': {...},
                'notes': str,
                'copyright_details': {...},
                'duplicate_id': int | None
            }
        """
        flags = {}
        notes_parts = []

        # 1. Basic quality checks
        word_count = len(text.split())

        if word_count < self.MIN_WORDS:
            flags['too_short'] = True
            notes_parts.append(f'Text too short ({word_count} words < {self.MIN_WORDS} minimum).')

        if word_count > self.MAX_WORDS:
            flags['too_long'] = True
            notes_parts.append(f'Text very long ({word_count} words > {self.MAX_WORDS}). May be full scene.')

        # Check for common spam patterns
        if self._is_spam(text):
            flags['spam'] = True
            notes_parts.append('Text appears to be spam.')
            return self._create_rejection('spam', flags, notes_parts)

        # 2. Copyright detection
        copyright_result = self.copyright_detector.check(
            text=text,
            author=author,
            play_title=play_title,
            user_notes=user_notes
        )

        copyright_risk = copyright_result['risk']

        if copyright_risk == 'high' and copyright_result.get('auto_reject'):
            flags['copyright_violation'] = True
            notes_parts.append(f"Copyright: {copyright_result['reason']}")
            return self._create_rejection('copyright', flags, notes_parts, copyright_result)

        # 3. Duplicate detection
        duplicate_id = self._check_duplicates(text, character, play_title, author, db)
        if duplicate_id:
            flags['duplicate'] = True
            notes_parts.append(f'Duplicate of existing monologue ID {duplicate_id}.')
            return self._create_rejection('duplicate', flags, notes_parts, copyright_result, duplicate_id)

        # 4. AI quality assessment
        quality_score = await self._assess_quality(text, character, play_title, author)

        # Record quality score
        notes_parts.append(f'AI quality score: {quality_score:.2f}/1.00')

        # 5. Decision logic
        recommendation = self._make_decision(
            quality_score=quality_score,
            copyright_risk=copyright_risk,
            flags=flags,
            word_count=word_count
        )

        return {
            'recommendation': recommendation,
            'quality_score': quality_score,
            'copyright_risk': copyright_risk,
            'copyright_details': copyright_result,
            'flags': flags,
            'notes': ' '.join(notes_parts),
            'duplicate_id': duplicate_id
        }

    def _make_decision(
        self,
        quality_score: float,
        copyright_risk: str,
        flags: Dict,
        word_count: int
    ) -> str:
        """
        Make final moderation decision.

        Returns: 'auto_approve', 'manual_review', or 'auto_reject'
        """
        # Auto-reject conditions
        if flags.get('spam') or flags.get('duplicate'):
            return 'auto_reject'

        if quality_score < self.AUTO_REJECT_QUALITY:
            return 'auto_reject'

        # Auto-approve conditions (strict criteria)
        if (
            quality_score >= self.AUTO_APPROVE_QUALITY and
            copyright_risk == 'low' and
            not flags.get('too_short') and
            not flags.get('too_long') and
            word_count >= self.MIN_WORDS
        ):
            return 'auto_approve'

        # Everything else goes to manual review
        return 'manual_review'

    async def _assess_quality(
        self,
        text: str,
        character: str,
        play_title: str,
        author: str
    ) -> float:
        """
        Assess quality of submission using AI.

        Returns quality score 0-1 where:
        - 1.0 = Perfect submission (complete, well-formatted, clear)
        - 0.7+ = Good quality (auto-approve threshold)
        - 0.3-0.7 = Medium quality (manual review)
        - <0.3 = Poor quality (auto-reject)
        """
        try:
            # Use existing ContentAnalyzer
            analysis = self.content_analyzer.analyze_monologue(
                text=text,
                character=character,
                play_title=play_title,
                author=author
            )

            # Calculate quality score based on analysis completeness
            score = 0.5  # Base score

            # Bonus for complete analysis
            if analysis.get('primary_emotion') and analysis['primary_emotion'] != 'unknown':
                score += 0.1

            if analysis.get('themes') and len(analysis['themes']) > 0:
                score += 0.1

            if analysis.get('tone') and analysis['tone'] != 'unknown':
                score += 0.1

            if analysis.get('character_age_range') and analysis['character_age_range'] != 'any':
                score += 0.1

            if analysis.get('scene_description') and len(analysis['scene_description']) > 20:
                score += 0.1

            return min(1.0, score)

        except Exception as e:
            print(f"Error in quality assessment: {e}")
            # Conservative: return medium score (will trigger manual review)
            return 0.5

    def _check_duplicates(
        self,
        text: str,
        character: str,
        play_title: str,
        author: str,
        db: Session
    ) -> Optional[int]:
        """
        Check if this monologue already exists in database.

        Returns monologue ID if duplicate found, None otherwise.
        """
        text_clean = text.strip().lower()

        # 1. Exact text match
        exact_match = db.query(Monologue).filter(
            Monologue.text.ilike(text)
        ).first()

        if exact_match:
            return exact_match.id

        # 2. Same play/character + high text similarity
        from app.models.actor import Play

        # Find play
        play = db.query(Play).filter(
            Play.title.ilike(play_title),
            Play.author.ilike(author)
        ).first()

        if play:
            # Check monologues from same play
            candidates = db.query(Monologue).filter(
                Monologue.play_id == play.id,
                Monologue.character_name.ilike(character)
            ).all()

            for candidate in candidates:
                if candidate.text:
                    similarity = SequenceMatcher(
                        None,
                        text_clean,
                        candidate.text.strip().lower()
                    ).ratio()

                    if similarity >= self.DUPLICATE_SIMILARITY:
                        return candidate.id

        return None

    def _is_spam(self, text: str) -> bool:
        """
        Detect obvious spam patterns.

        Returns True if text appears to be spam.
        """
        text_lower = text.lower()

        spam_patterns = [
            'click here',
            'buy now',
            'limited time',
            'http://',
            'https://',
            'www.',
            '.com',
            'viagra',
            'cialis',
            'lottery',
            'congratulations you won',
        ]

        # Check for spam keywords
        spam_count = sum(1 for pattern in spam_patterns if pattern in text_lower)

        if spam_count >= 2:
            return True

        # Check for excessive capitalization
        if len(text) > 50:
            caps_ratio = sum(1 for c in text if c.isupper()) / len(text)
            if caps_ratio > 0.5:
                return True

        # Check for excessive punctuation
        punct_ratio = sum(1 for c in text if c in '!?') / len(text)
        if punct_ratio > 0.1:
            return True

        return False

    def _create_rejection(
        self,
        reason: str,
        flags: Dict,
        notes_parts: List[str],
        copyright_result: Optional[Dict] = None,
        duplicate_id: Optional[int] = None
    ) -> Dict:
        """Helper to create rejection response."""
        return {
            'recommendation': 'auto_reject',
            'quality_score': 0.0,
            'copyright_risk': copyright_result['risk'] if copyright_result else 'unknown',
            'copyright_details': copyright_result or {},
            'flags': flags,
            'notes': ' '.join(notes_parts),
            'duplicate_id': duplicate_id,
            'rejection_reason': reason
        }
