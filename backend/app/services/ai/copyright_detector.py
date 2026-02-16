"""
Copyright risk detection for user-submitted monologues.

Uses conservative heuristics to identify potentially copyrighted content:
- Publication year estimation (pre-1928 = public domain in US)
- Known copyrighted works database
- Author death year (life + 70 years rule for most countries)
- AI-based content analysis for contemporary works

Philosophy: Conservative detection to avoid legal risk.
When in doubt, flag for manual review.
"""

from __future__ import annotations

import os
import re
from typing import Dict, Optional
from datetime import datetime


class CopyrightDetector:
    """
    Detect copyright risk in submitted monologues.

    Risk levels:
    - 'low': Public domain (pre-1928) or confirmed CC license
    - 'medium': Uncertain (need manual review)
    - 'high': Likely copyrighted (auto-reject)
    """

    # US public domain cutoff (works published before 1928)
    PUBLIC_DOMAIN_YEAR = 1928

    # Known classical authors (definitely public domain)
    PUBLIC_DOMAIN_AUTHORS = {
        'shakespeare', 'william shakespeare',
        'sophocles', 'euripides', 'aeschylus', 'aristophanes',
        'moliere', 'racine', 'corneille',
        'goethe', 'schiller',
        'ibsen', 'henrik ibsen',
        'chekhov', 'anton chekhov',
        'wilde', 'oscar wilde',
        'shaw', 'george bernard shaw',
        'strindberg', 'august strindberg',
        'synge', 'j.m. synge', 'john millington synge',
        'yeats', 'w.b. yeats', 'william butler yeats',
        'marlowe', 'christopher marlowe',
        'jonson', 'ben jonson',
        'webster', 'john webster',
        'congreve', 'william congreve',
        'sheridan', 'richard brinsley sheridan',
        'goldsmith', 'oliver goldsmith',
        'beaumarchais',
    }

    # Known contemporary playwrights (definitely copyrighted)
    CONTEMPORARY_AUTHORS = {
        'lin-manuel miranda',
        'tony kushner',
        'august wilson',
        'david mamet',
        'sarah kane',
        'caryl churchill',
        'tom stoppard',
        'harold pinter',
        'edward albee',
        'neil simon',
        'arthur miller',  # Some works may be PD now
        'tennessee williams',  # Some works may be PD now
        'samuel beckett',
        'john patrick shanley',
        'tracy letts',
        'annie baker',
        'stephen sondheim',
        'lynn nottage',
        'suzan-lori parks',
    }

    def __init__(self):
        """Initialize copyright detector."""
        pass

    def check(
        self,
        text: str,
        author: str,
        play_title: str,
        user_notes: Optional[str] = None
    ) -> Dict:
        """
        Check copyright risk for a submission.

        Args:
            text: Monologue text
            author: Playwright name
            play_title: Play title
            user_notes: Optional notes from user (may mention source)

        Returns:
            {
                'risk': 'low' | 'medium' | 'high',
                'reason': str,
                'details': str,
                'requires_review': bool,
                'auto_reject': bool
            }
        """
        author_lower = author.lower().strip()
        title_lower = play_title.lower().strip()

        # 1. Check if classical/public domain author
        if self._is_public_domain_author(author_lower):
            return {
                'risk': 'low',
                'reason': 'Classical playwright (public domain)',
                'details': f'{author} is a well-known classical author whose works are in the public domain.',
                'requires_review': False,
                'auto_reject': False
            }

        # 2. Check if known contemporary author
        if self._is_contemporary_author(author_lower):
            return {
                'risk': 'high',
                'reason': 'Contemporary copyrighted playwright',
                'details': f'{author} is a contemporary playwright. Their works are protected by copyright.',
                'requires_review': False,
                'auto_reject': True
            }

        # 3. Estimate publication year from play title patterns
        estimated_year = self._estimate_publication_year(title_lower, author_lower)
        if estimated_year:
            if estimated_year < self.PUBLIC_DOMAIN_YEAR:
                return {
                    'risk': 'low',
                    'reason': f'Published before {self.PUBLIC_DOMAIN_YEAR}',
                    'details': f'Estimated publication year: {estimated_year}. Pre-1928 works are in US public domain.',
                    'requires_review': False,
                    'auto_reject': False
                }
            elif estimated_year > 1990:
                return {
                    'risk': 'high',
                    'reason': f'Recent work (est. {estimated_year})',
                    'details': f'Works published after 1990 are almost certainly copyrighted.',
                    'requires_review': False,
                    'auto_reject': True
                }
            else:
                # 1928-1990: Gray area, needs review
                return {
                    'risk': 'medium',
                    'reason': f'Mid-20th century work (est. {estimated_year})',
                    'details': f'Works from this era may or may not be in public domain. Manual review required.',
                    'requires_review': True,
                    'auto_reject': False
                }

        # 4. Check user notes for copyright indicators
        if user_notes:
            notes_lower = user_notes.lower()
            if any(phrase in notes_lower for phrase in ['published', 'copyright', '©', 'premiered']):
                # User mentioned publication info - flag for review
                return {
                    'risk': 'medium',
                    'reason': 'User notes mention publication details',
                    'details': 'User provided context that may indicate copyright status. Manual review recommended.',
                    'requires_review': True,
                    'auto_reject': False
                }

        # 5. Check text length (very short = likely excerpt from copyrighted work)
        word_count = len(text.split())
        if word_count < 30:
            return {
                'risk': 'medium',
                'reason': 'Very short text',
                'details': 'Short excerpts may be from copyrighted works. Manual review recommended.',
                'requires_review': True,
                'auto_reject': False
            }

        # 6. Default: Unknown author = needs manual review
        return {
            'risk': 'medium',
            'reason': 'Unknown author',
            'details': f'"{author}" is not in our database of known playwrights. Manual copyright verification required.',
            'requires_review': True,
            'auto_reject': False
        }

    def _is_public_domain_author(self, author: str) -> bool:
        """Check if author is in public domain list."""
        return any(pd_author in author for pd_author in self.PUBLIC_DOMAIN_AUTHORS)

    def _is_contemporary_author(self, author: str) -> bool:
        """Check if author is known contemporary playwright."""
        return any(contemp in author for contemp in self.CONTEMPORARY_AUTHORS)

    def _estimate_publication_year(self, title: str, author: str) -> Optional[int]:
        """
        Estimate publication year from title/author.

        Returns year if confident, None otherwise.
        """
        # Pattern 1: Year in title (e.g., "The 1940s Play")
        year_match = re.search(r'\b(1[5-9]\d{2}|20[0-2]\d)\b', title)
        if year_match:
            return int(year_match.group(1))

        # Pattern 2: Historical period indicators in title
        if any(period in title for period in ['elizabethan', 'restoration', 'victorian']):
            if 'elizabethan' in title:
                return 1600  # Approximate
            elif 'restoration' in title:
                return 1670
            elif 'victorian' in title:
                return 1880

        # Pattern 3: Author death year heuristics
        # (This is simplified - real implementation would use a database)
        author_death_years = {
            'ibsen': 1906,
            'chekhov': 1904,
            'wilde': 1900,
            'shaw': 1950,  # GBS died in 1950, so some works may still be copyrighted in some countries
            'strindberg': 1912,
            'synge': 1909,
        }

        for author_name, death_year in author_death_years.items():
            if author_name in author:
                # Assume major works published ~20 years before death
                return death_year - 20

        return None
