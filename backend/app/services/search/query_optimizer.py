"""Query optimization and classification for monologue search."""

from typing import Dict, Tuple, Optional, List
from functools import lru_cache
import re


class QueryClassifier:
    """Classify search queries by complexity to optimize API usage"""

    # Tier 1: Single keyword patterns (no AI needed)
    TIER_1_PATTERNS = [
        r'^(sad|happy|angry|funny|scared|joyful|melancholy|hopeful|desperate)$',
        r'^(male|female|man|woman|boy|girl)$',
        r'^(teen|young|old|elderly|middle.aged)$',
        r'^(love|death|betrayal|power|revenge|family|identity)$',
        r'^(shakespeare|chekhov|ibsen|classical|contemporary|modern)$',
    ]

    # Tier 2: 2-5 word combinations (keywords + embedding)
    TIER_2_PATTERNS = [
        r'^(sad|happy|angry|funny) (male|female|man|woman)$',
        r'^(funny|dramatic|sad) (piece|monologue)( for)? (male|female|man|woman)$',
        r'^(young|old|middle.aged|teen) (male|female|man|woman)$',
        r'^(shakespeare|chekhov|ibsen) (monologue|piece|play)$',
        r'^(love|death|revenge|betrayal) monologue$',
    ]

    @classmethod
    def classify(cls, query: str) -> int:
        """
        Classify query into tier based on complexity.

        Args:
            query: Search query string

        Returns:
            1: Simple keyword (no AI needed) - ~70% of queries
            2: Medium complexity (keywords + embedding) - ~20% of queries
            3: Complex semantic (full AI) - ~10% of queries
        """
        query_lower = query.lower().strip()
        word_count = len(query_lower.split())

        # Tier 1: Single keyword or very simple
        if word_count == 1:
            for pattern in cls.TIER_1_PATTERNS:
                if re.match(pattern, query_lower):
                    return 1

        # Tier 2: 2-5 words with recognizable patterns
        if 2 <= word_count <= 5:
            for pattern in cls.TIER_2_PATTERNS:
                if re.match(pattern, query_lower, re.IGNORECASE):
                    return 2

        # Tier 3: Complex semantic queries
        # - More than 5 words
        # - Contains complex phrases
        # - Metaphorical language
        return 3

    @classmethod
    def get_cost_estimate(cls, tier: int) -> float:
        """
        Estimate cost for query tier.

        Returns:
            Cost in USD
        """
        costs = {
            1: 0.0,      # No API calls
            2: 0.00001,  # Embedding only (cached parsing)
            3: 0.00016,  # Full AI (parsing + embedding)
        }
        return costs.get(tier, 0.0)


class KeywordExtractor:
    """Extract filters from keywords without AI to save costs"""

    # Comprehensive keyword mappings
    KEYWORD_MAPPINGS = {
        'emotions': {
            # Sadness family
            'sad': 'sadness', 'depressed': 'sadness', 'melancholy': 'melancholy',
            'blue': 'sadness', 'unhappy': 'sadness', 'tearful': 'sadness',
            'sorrowful': 'sadness', 'mournful': 'sadness', 'gloomy': 'sadness',

            # Joy family
            'happy': 'joy', 'funny': 'joy', 'comedic': 'joy', 'hilarious': 'joy',
            'joyful': 'joy', 'cheerful': 'joy', 'humorous': 'joy', 'amusing': 'joy',
            'lighthearted': 'joy', 'comic': 'joy', 'witty': 'joy',

            # Anger family
            'angry': 'anger', 'furious': 'anger', 'rage': 'anger', 'mad': 'anger',
            'enraged': 'anger', 'wrathful': 'anger', 'irate': 'anger',

            # Fear family
            'scared': 'fear', 'fearful': 'fear', 'anxious': 'fear', 'afraid': 'fear',
            'terrified': 'fear', 'frightened': 'fear', 'nervous': 'fear',

            # Hope/Despair
            'hopeful': 'hope', 'optimistic': 'hope', 'confident': 'hope',
            'desperate': 'despair', 'despairing': 'despair', 'hopeless': 'despair',

            # Other emotions
            'longing': 'longing', 'yearning': 'longing', 'wistful': 'longing',
            'confused': 'confusion', 'bewildered': 'confusion', 'lost': 'confusion',
            'determined': 'determination', 'resolute': 'determination',
        },

        'gender': {
            'male': 'male', 'man': 'male', 'boy': 'male', 'masculine': 'male',
            'he': 'male', 'him': 'male', 'men': 'male', 'gentleman': 'male',
            'female': 'female', 'woman': 'female', 'girl': 'female', 'feminine': 'female',
            'she': 'female', 'her': 'female', 'women': 'female', 'lady': 'female',
        },

        'age_range': {
            # Teens
            'teen': 'teens', 'teenager': 'teens', 'youth': 'teens', 'young': 'teens',
            'adolescent': 'teens', 'teenage': 'teens',

            # 20s
            '20s': '20s', 'twenties': '20s', 'young adult': '20s',

            # 30s
            '30s': '30s', 'thirties': '30s',

            # 40s
            '40s': '40s', 'forties': '40s', 'middle aged': '40s', 'middle-aged': '40s',
            'midlife': '40s',

            # 50s
            '50s': '50s', 'fifties': '50s', 'older': '50s',

            # 60+
            'elderly': '60+', 'senior': '60+', 'old': '60+', '60+': '60+',
        },

        'themes': {
            # Core themes
            'love': 'love', 'romance': 'love', 'romantic': 'love', 'passion': 'love',
            'death': 'death', 'dying': 'death', 'mortality': 'death',
            'power': 'power', 'authority': 'power', 'control': 'power',
            'betrayal': 'betrayal', 'treachery': 'betrayal', 'backstab': 'betrayal',
            'revenge': 'revenge', 'vengeance': 'revenge', 'retribution': 'revenge',
            'family': 'family', 'mother': 'family', 'father': 'family', 'parent': 'family',
            'identity': 'identity', 'self': 'identity', 'discovery': 'identity',
            'loss': 'loss', 'grief': 'loss', 'mourning': 'loss',
            'honor': 'honor', 'duty': 'honor', 'loyalty': 'honor',
            'freedom': 'freedom', 'liberty': 'freedom', 'independence': 'freedom',
            'madness': 'madness', 'insanity': 'madness', 'crazy': 'madness',
            'fate': 'fate', 'destiny': 'fate', 'fortune': 'fate',
            'jealousy': 'jealousy', 'envy': 'jealousy',
            'ambition': 'ambition', 'aspiration': 'ambition',
            'isolation': 'isolation', 'loneliness': 'isolation', 'solitude': 'isolation',
            'redemption': 'redemption', 'forgiveness': 'redemption',
        },

        'category': {
            # Classical
            'shakespeare': 'classical', 'shakespearean': 'classical',
            'classical': 'classical', 'greek': 'classical', 'ancient': 'classical',
            'chekhov': 'classical', 'ibsen': 'classical', 'wilde': 'classical',
            'shaw': 'classical', 'sophocles': 'classical',

            # Contemporary
            'modern': 'contemporary', 'contemporary': 'contemporary',
            'new': 'contemporary', 'recent': 'contemporary',
        },

        'author': {
            # Shakespeare variations
            'shakespeare': 'William Shakespeare', 'shakespear': 'William Shakespeare',
            'shakspeare': 'William Shakespeare', 'shakespere': 'William Shakespeare',

            # Chekhov variations (common misspellings)
            'chekhov': 'Anton Chekhov', 'checkov': 'Anton Chekhov',
            'chekov': 'Anton Chekhov', 'chechov': 'Anton Chekhov',
            'checkhov': 'Anton Chekhov', 'tchekh': 'Anton Chekhov',
            'anton': 'Anton Chekhov',

            # Other classical authors
            'ibsen': 'Henrik Ibsen', 'henrik': 'Henrik Ibsen',
            'wilde': 'Oscar Wilde', 'oscar': 'Oscar Wilde',
            'shaw': 'George Bernard Shaw', 'bernard': 'George Bernard Shaw',
            'sophocles': 'Sophocles',
            'euripides': 'Euripides',
            'aeschylus': 'Aeschylus',
            'moliere': 'Molière', 'molière': 'Molière',
            'strindberg': 'August Strindberg',
            'marlowe': 'Christopher Marlowe',
            'jonson': 'Ben Jonson',
        },

        'tone': {
            # Comedic
            'funny': 'comedic', 'comedic': 'comedic', 'humorous': 'comedic',
            'comic': 'comedic', 'lighthearted': 'comedic',

            # Dramatic
            'serious': 'dramatic', 'dramatic': 'dramatic', 'tragic': 'dramatic',
            'heavy': 'dramatic', 'intense': 'dramatic',

            # Dark
            'dark': 'dark', 'grim': 'dark', 'noir': 'dark',

            # Romantic
            'romantic': 'romantic', 'loving': 'romantic',

            # Others
            'philosophical': 'philosophical', 'contemplative': 'contemplative',
            'defiant': 'defiant', 'rebellious': 'defiant',
        }
    }

    @classmethod
    @lru_cache(maxsize=1000)  # Cache 1000 most recent extractions
    def extract(cls, query: str) -> Dict:
        """
        Extract filters from query using keyword matching (no AI).

        This is MUCH faster and cheaper than AI parsing:
        - Latency: <1ms vs ~500ms
        - Cost: $0 vs ~$0.00015

        Args:
            query: Search query string

        Returns:
            Dict of extracted filters
        """
        query_lower = query.lower()
        words = re.findall(r'\b\w+[-\w]*\b', query_lower)  # Include hyphenated words

        filters = {}
        themes_found = []

        # Extract each filter type
        for word in words:
            # Check author first (highest priority)
            if 'author' not in filters and word in cls.KEYWORD_MAPPINGS['author']:
                filters['author'] = cls.KEYWORD_MAPPINGS['author'][word]

            # Check emotions (only set if not already set)
            if 'emotion' not in filters and word in cls.KEYWORD_MAPPINGS['emotions']:
                filters['emotion'] = cls.KEYWORD_MAPPINGS['emotions'][word]

            # Check gender
            if 'gender' not in filters and word in cls.KEYWORD_MAPPINGS['gender']:
                filters['gender'] = cls.KEYWORD_MAPPINGS['gender'][word]

            # Check age_range
            if 'age_range' not in filters and word in cls.KEYWORD_MAPPINGS['age_range']:
                filters['age_range'] = cls.KEYWORD_MAPPINGS['age_range'][word]

            # Check category
            if 'category' not in filters and word in cls.KEYWORD_MAPPINGS['category']:
                filters['category'] = cls.KEYWORD_MAPPINGS['category'][word]

            # Check tone (only set if not already set via emotion)
            if 'tone' not in filters and word in cls.KEYWORD_MAPPINGS['tone']:
                filters['tone'] = cls.KEYWORD_MAPPINGS['tone'][word]

            # Collect themes (can have multiple)
            if word in cls.KEYWORD_MAPPINGS['themes']:
                theme = cls.KEYWORD_MAPPINGS['themes'][word]
                if theme not in themes_found:
                    themes_found.append(theme)

        # Add themes if found
        if themes_found:
            filters['themes'] = themes_found

        # Extract act/scene numbers (pattern-based, not keyword)
        # Matches: "act 3", "act iii", "act III", "scene 1", etc.
        act_match = re.search(r'\bact\s+(\d+|[ivxIVX]+)\b', query_lower)
        if act_match:
            act_val = act_match.group(1)
            if act_val.isdigit():
                filters['act'] = int(act_val)
            else:
                # Convert Roman numeral to int
                filters['act'] = cls._roman_to_int(act_val.upper())

        scene_match = re.search(r'\bscene\s+(\d+|[ivxIVX]+)\b', query_lower)
        if scene_match:
            scene_val = scene_match.group(1)
            if scene_val.isdigit():
                filters['scene'] = int(scene_val)
            else:
                filters['scene'] = cls._roman_to_int(scene_val.upper())

        return filters

    @staticmethod
    def _roman_to_int(roman: str) -> int:
        """Convert Roman numeral to integer."""
        values = {'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100}
        result = 0
        prev = 0
        for char in reversed(roman.upper()):
            curr = values.get(char, 0)
            if curr < prev:
                result -= curr
            else:
                result += curr
            prev = curr
        return result if result > 0 else 1  # Default to 1 if parse fails

    @classmethod
    def get_extraction_confidence(cls, query: str, extracted: Dict) -> float:
        """
        Calculate confidence score for keyword extraction.

        Returns:
            0.0-1.0 confidence score
        """
        if not extracted:
            return 0.0

        query_words = len(query.split())
        filters_found = len(extracted)

        # High confidence if we found filters for most words
        if query_words <= 3 and filters_found >= query_words:
            return 1.0

        if query_words <= 5 and filters_found >= (query_words - 1):
            return 0.8

        # Medium confidence
        if filters_found >= 2:
            return 0.6

        # Low confidence for complex queries with few matches
        if query_words > 7 and filters_found < 2:
            return 0.2

        return 0.5


class QueryOptimizer:
    """Main optimizer that coordinates classification and extraction"""

    def __init__(self):
        self.classifier = QueryClassifier()
        self.extractor = KeywordExtractor()

    def optimize(self, query: str, explicit_filters: Optional[Dict] = None) -> Tuple[int, Dict]:
        """
        Optimize query processing.

        Args:
            query: Search query
            explicit_filters: Manually selected filters (take precedence)

        Returns:
            (tier, merged_filters)
        """
        # Step 1: Classify query
        tier = self.classifier.classify(query)

        # Step 2: Extract filters based on tier
        if tier == 1 or tier == 2:
            # Use keyword extraction (no AI)
            extracted_filters = self.extractor.extract(query)
            confidence = self.extractor.get_extraction_confidence(query, extracted_filters)

            # If confidence is low, upgrade to tier 3
            if confidence < 0.5 and tier == 2:
                tier = 3
                extracted_filters = {}  # Will use AI parsing

        else:
            # Tier 3: Will use AI parsing
            extracted_filters = {}

        # Step 3: Merge with explicit filters (explicit takes precedence)
        merged_filters = {**extracted_filters, **(explicit_filters or {})}

        return tier, merged_filters

    def get_metrics(self, tier: int, cache_hit: bool) -> Dict:
        """
        Get performance metrics for monitoring.

        Returns:
            Dict with cost, API calls, and other metrics
        """
        api_calls = {
            1: 0,  # No API calls
            2: 0 if cache_hit else 1,  # Embedding only (unless cached)
            3: 0 if cache_hit else 2,  # Parsing + Embedding (unless cached)
        }

        cost = {
            1: 0.0,
            2: 0.0 if cache_hit else 0.00001,
            3: 0.0 if cache_hit else 0.00016,
        }

        return {
            'tier': tier,
            'api_calls': api_calls.get(tier, 0),
            'cost_usd': cost.get(tier, 0.0),
            'cache_hit': cache_hit,
        }
