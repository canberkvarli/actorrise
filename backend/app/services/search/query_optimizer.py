"""Query optimization and classification for monologue search."""

import re
from difflib import get_close_matches
from functools import lru_cache
from typing import Dict, List, Optional, Tuple


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
            # Teens (include numeric ranges that imply teens/young)
            'teen': 'teens', 'teenager': 'teens', 'youth': 'teens', 'young': 'teens',
            'adolescent': 'teens', 'teenage': 'teens',
            '18-21': 'teens', '16-21': 'teens', '13-19': 'teens',

            # 20s
            '20s': '20s', 'twenties': '20s', 'young adult': '20s',

            # 30s
            '30s': '30s', 'thirties': '30s',

            # 40s
            '40s': '40s', 'forties': '40s', 'middle aged': '40s', 'middle-aged': '40s',
            'midlife': '40s',

            # 50s
            '50s': '50s', 'fifties': '50s', 'older': '50s',

            # 60+ ('old' applied only when not in "years old" - see extract() logic)
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

        'character_type': {
            # Villain/Antagonist keywords - map to power/revenge/ambition themes
            'villain': ['power', 'revenge', 'ambition'],
            'antagonist': ['power', 'revenge', 'ambition'],
            'bad guy': ['power', 'revenge'],
            'evil': ['power', 'madness'],
            'dark': ['power', 'madness'],
            'villainous': ['power', 'revenge'],
            'malevolent': ['power', 'revenge'],
            'wicked': ['power', 'madness'],
            'sinister': ['power'],
            'menacing': ['power'],

            # Hero/Protagonist keywords - map to honor/redemption/identity themes
            'hero': ['honor', 'redemption', 'identity'],
            'protagonist': ['honor', 'identity'],
            'good guy': ['honor', 'redemption'],
            'heroic': ['honor'],
        },

        'famous_characters': {
            # Film/TV Villains
            'joker': 'Joker',
            'darth vader': 'Darth Vader',
            'vader': 'Darth Vader',
            'hannibal': 'Hannibal Lecter',
            'voldemort': 'Voldemort',
            'thanos': 'Thanos',
            'loki': 'Loki',

            # Shakespeare Villains/Characters
            'iago': 'Iago',
            'lady macbeth': 'Lady Macbeth',
            'macbeth': 'Macbeth',
            'richard': 'Richard III',
            'shylock': 'Shylock',
            'edmund': 'Edmund',
            'claudius': 'Claudius',

            # Classic Theater Characters
            'hedda': 'Hedda Gabler',
            'blanche': 'Blanche DuBois',
            'willy loman': 'Willy Loman',
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

            # Sassy / Bold
            'sassy': 'comedic', 'sarcastic': 'comedic', 'witty': 'comedic',
            'bold': 'dramatic', 'fierce': 'dramatic', 'powerful': 'dramatic',

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

        # Age range from "X-Y years old" / "18-21 years old" – avoid treating "old" as elderly
        age_range_match = re.search(r'\b(\d+)\s*-\s*(\d+)\s*(?:years?\s*old)?|\b(?:years?\s*old)\s*(\d+)\s*-\s*(\d+)', query_lower)
        if age_range_match and 'age_range' not in filters:
            low, high = None, None
            for g in age_range_match.groups():
                if g is not None:
                    n = int(g)
                    if low is None:
                        low = n
                    else:
                        high = n
                        break
            if low is not None and high is not None:
                if high <= 21:
                    filters['age_range'] = 'teens'
                elif low >= 20 and high <= 29:
                    filters['age_range'] = '20s'
                elif low >= 30 and high <= 39:
                    filters['age_range'] = '30s'
                elif low >= 40 and high <= 59:
                    filters['age_range'] = '40s' if high < 50 else '50s'
                elif low >= 60:
                    filters['age_range'] = '60+'

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

            # Check age_range (skip "old" when part of "years old" so it doesn't become 60+)
            if 'age_range' not in filters and word in cls.KEYWORD_MAPPINGS['age_range']:
                if word == 'old' and 'years' in query_lower:
                    continue  # "18-21 years old" = young, not elderly
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

            # Handle character types (expand to related themes)
            if word in cls.KEYWORD_MAPPINGS['character_type']:
                char_themes = cls.KEYWORD_MAPPINGS['character_type'][word]
                for theme in char_themes:
                    if theme not in themes_found:
                        themes_found.append(theme)

        # Check for famous character names (multi-word phrases)
        for char_key, char_name in cls.KEYWORD_MAPPINGS['famous_characters'].items():
            if char_key in query_lower:
                # Store the character name for text matching
                filters['character_name'] = char_name
                break

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

        # Extract duration from natural language patterns like:
        # "1 minute", "2 min", "under 3 minutes", "1-2 min", "90 seconds", "short"
        if 'max_duration' not in filters:
            # Match "X minute(s)" / "X min"
            dur_match = re.search(
                r'(?:under\s+|less\s+than\s+|max\s+)?(\d+)\s*(?:minute|min)\b',
                query_lower
            )
            if dur_match:
                minutes = int(dur_match.group(1))
                filters['max_duration'] = minutes * 60

            # Match "X-Y minute(s)" range → use upper bound
            dur_range_match = re.search(
                r'(\d+)\s*-\s*(\d+)\s*(?:minute|min)\b',
                query_lower
            )
            if dur_range_match:
                upper_minutes = int(dur_range_match.group(2))
                filters['max_duration'] = upper_minutes * 60

            # Match "X seconds" / "X sec"
            sec_match = re.search(
                r'(?:under\s+|less\s+than\s+)?(\d+)\s*(?:second|sec)\b',
                query_lower
            )
            if sec_match:
                filters['max_duration'] = int(sec_match.group(1))

            # Match "short" → ~90 seconds (typical short monologue)
            if 'max_duration' not in filters and re.search(r'\bshort\b', query_lower):
                filters['max_duration'] = 90

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


# ── Typo Correction ─────────────────────────────────────────────────────────
# Two-layer approach:
#   1. Hardcoded dictionary for common misspellings (instant, reliable)
#   2. Fuzzy matching against a curated theater/acting vocabulary (catches novel typos)

# Layer 1: known misspellings → canonical form
QUERY_TYPO_CORRECTIONS: Dict[str, str] = {
    # Creation / world
    "crattion": "creation", "creaton": "creation", "creatin": "creation", "creaction": "creation",
    "worl": "world", "worls": "world",
    # Monologue
    "monolog": "monologue", "monologe": "monologue", "monolouge": "monologue",
    "monalouge": "monologue", "monalog": "monologue", "monlogues": "monologues",
    "monologes": "monologues", "monolouges": "monologues",
    # Playwrights
    "shakespere": "shakespeare", "shakespear": "shakespeare", "shakspeare": "shakespeare",
    "shakspere": "shakespeare", "shakesphere": "shakespeare", "shakespare": "shakespeare",
    "chekov": "chekhov", "checkov": "chekhov", "chechov": "chekhov", "chekov's": "chekhov",
    "aurthur": "arthur", "aurther": "arthur",
    "tenessee": "tennessee", "tennesee": "tennessee",
    "euripedes": "euripides", "euripidies": "euripides",
    "sophocles's": "sophocles", "sophacles": "sophocles",
    "molliere": "moliere", "molier": "moliere",
    "osccar": "oscar", "osacr": "oscar",
    "agust": "august", "augst": "august",
    # Genres / tones
    "tragidy": "tragedy", "tragedey": "tragedy", "tradegy": "tragedy", "tradgedy": "tragedy",
    "comedey": "comedy", "comady": "comedy", "commedy": "comedy",
    "dramma": "drama", "drma": "drama",
    "romantik": "romantic", "romanitc": "romantic",
    "dramtic": "dramatic", "drammatic": "dramatic", "dramatik": "dramatic",
    "commedic": "comedic", "comidic": "comedic", "comedik": "comedic",
    "sarcastik": "sarcastic", "sarcasitc": "sarcastic",
    "emotinal": "emotional", "emotioanl": "emotional",
    "passionat": "passionate", "pasionate": "passionate",
    "powerfull": "powerful", "poweful": "powerful",
    "haertfelt": "heartfelt", "heartfel": "heartfelt",
    "meloncholy": "melancholy", "melancholy": "melancholy", "melancholy": "melancholy",
    "philisophical": "philosophical", "philosophicle": "philosophical",
    "contempletive": "contemplative",
    # Acting terms
    "audtion": "audition", "auditon": "audition", "audiiton": "audition",
    "charcter": "character", "charachter": "character", "charactor": "character",
    "dialoge": "dialogue", "dialouge": "dialogue", "dialague": "dialogue",
    "soliliquy": "soliloquy", "soliliqy": "soliloquy", "soliloqy": "soliloquy",
    "rehersal": "rehearsal", "rehearsl": "rehearsal", "rehursal": "rehearsal",
    "perfomance": "performance", "performence": "performance",
    "contemparary": "contemporary", "contempory": "contemporary", "contmporary": "contemporary",
    "clasical": "classical", "classicle": "classical",
    # Common words in search
    "femail": "female", "femle": "female",
    "middel": "middle", "midde": "middle",
    "womn": "woman", "womam": "woman", "woamn": "woman",
    "peice": "piece", "peece": "piece",
    "minuts": "minutes", "minuets": "minutes", "minut": "minute", "minite": "minute",
    "yong": "young", "yung": "young",
    "eldery": "elderly",
    "reveng": "revenge", "revnge": "revenge",
    "betral": "betrayal", "betrayl": "betrayal",
    "identiy": "identity", "idenity": "identity",
    "famliy": "family", "famly": "family",
}

# Layer 2: curated vocabulary for fuzzy matching (difflib.get_close_matches)
# Only words ≥4 chars are fuzzy-matched to avoid false positives on short words.
_THEATER_VOCABULARY: set = {
    # Playwrights
    "shakespeare", "chekhov", "ibsen", "moliere", "euripides", "sophocles",
    "aristophanes", "wilde", "williams", "miller", "albee", "stoppard",
    "beckett", "ionesco", "pinter", "brecht", "coward", "mamet", "shepard",
    "sondheim", "tennessee", "arthur", "august", "wilson", "lorraine",
    "hansberry", "suzan", "lori", "parks", "caryl", "churchill",
    "lynn", "nottage", "branden", "jacobs", "jenkins",
    # Plays / works
    "hamlet", "macbeth", "othello", "tempest", "midsummer", "twelfth",
    "romeo", "juliet", "merchant", "venice", "lear", "prospero",
    "streetcar", "desire", "salesman", "crucible", "glass", "menagerie",
    "seagull", "cherry", "orchard", "sisters", "pygmalion", "importance",
    "earnest", "godot", "endgame", "rhinoceros", "oleanna", "glengarry",
    "fences", "piano", "lesson", "raisin",
    # Genres / tones / emotions
    "tragedy", "comedy", "drama", "farce", "satire", "melodrama", "tragicomedy",
    "dramatic", "comedic", "tragic", "romantic", "sarcastic", "emotional",
    "passionate", "powerful", "heartfelt", "melancholy", "philosophical",
    "contemplative", "defiant", "rebellious", "vulnerable", "intense",
    "dark", "light", "whimsical", "absurd", "poignant", "bittersweet",
    "angry", "desperate", "hopeful", "joyful", "sorrowful", "nostalgic",
    "sassy", "witty", "fierce", "tender", "haunting",
    # Acting terms
    "monologue", "monologues", "soliloquy", "dialogue", "audition",
    "character", "rehearsal", "performance", "scene", "stage",
    "classical", "contemporary", "modern", "period", "plays", "play",
    # Demographics
    "female", "male", "woman", "man", "young", "elderly", "middle",
    "teenager", "child", "adult",
    # Themes
    "love", "death", "betrayal", "revenge", "family", "identity", "power",
    "freedom", "justice", "forgiveness", "ambition", "jealousy", "grief",
    "isolation", "redemption", "sacrifice", "war", "peace", "madness",
    "creation", "world", "nature", "faith", "corruption",
    # Search modifiers
    "piece", "minute", "minutes", "second", "seconds", "short", "long",
}

# Build sorted list once (get_close_matches needs a sequence)
_VOCAB_LIST: List[str] = sorted(_THEATER_VOCABULARY)

# Words to never fuzzy-correct (too common / ambiguous).
# Includes short words + common English words that appear in natural-language search queries.
_FUZZY_SKIP: set = {
    # 1-3 letter words
    "a", "an", "am", "as", "at", "be", "by", "do", "go", "he", "if", "in",
    "is", "it", "me", "my", "no", "of", "on", "or", "so", "to", "up", "we",
    "ad", "ah", "ok",
    "all", "and", "any", "are", "ask", "bad", "big", "bit", "boy", "but",
    "can", "cry", "cut", "day", "did", "end", "far", "few", "fix", "fun",
    "get", "god", "got", "had", "has", "her", "him", "his", "hot", "how",
    "its", "job", "let", "lot", "mad", "man", "may", "men", "met", "mix",
    "new", "nor", "not", "now", "odd", "off", "old", "one", "our", "out",
    "own", "put", "ran", "raw", "red", "run", "sad", "saw", "say", "set",
    "she", "sit", "six", "ten", "the", "too", "top", "try", "two", "use",
    "via", "war", "was", "way", "who", "why", "win", "won", "yet", "you",
    "age", "ago", "act", "add", "aim", "air", "art", "ate", "bed", "bet",
    # 4+ letter common English words that aren't theater-specific
    "about", "above", "after", "aged", "also", "back", "been", "best",
    "both", "came", "come", "could", "does", "done", "down", "each",
    "even", "ever", "feel", "find", "first", "from", "funny", "gave",
    "give", "goes", "gone", "good", "great", "half", "hand", "have",
    "here", "high", "home", "idea", "into", "just", "keep", "kind",
    "knew", "know", "last", "left", "life", "like", "little", "live",
    "long", "look", "looking", "lost", "made", "make", "many", "mind",
    "more", "most", "much", "must", "name", "need", "never", "next",
    "nice", "only", "open", "other", "over", "part", "past", "play",
    "real", "really", "right", "said", "same", "seem", "self", "show",
    "side", "some", "soon", "still", "stop", "such", "sure", "take",
    "tell", "than", "that", "them", "then", "they", "thing", "think",
    "this", "time", "told", "took", "true", "turn", "upon", "very",
    "want", "well", "went", "were", "what", "when", "where", "which",
    "while", "will", "with", "word", "work", "would", "year", "your",
    # Search-specific words users type
    "about", "looking", "something", "someone", "anyone", "everybody",
    "nothing", "everything", "somewhere", "between", "another", "because",
    "before", "being", "best", "black", "white", "whole", "under",
    "every", "those", "these", "their", "there", "three", "through",
    "today", "night", "story", "movie", "film", "book", "actor",
    "actress", "role", "cast", "line", "lines", "type", "style",
    "like", "hate", "want", "need", "find", "give", "girl", "wife",
    "husband", "mother", "father", "sister", "brother", "daughter", "son",
    "friend", "king", "queen", "prince", "princess", "lord", "lady",
    "english", "american", "british", "irish", "french", "italian",
    "african", "asian", "latin", "spanish", "german", "russian",
}


def correct_query_typos(raw: str) -> Tuple[str, bool, bool]:
    """
    Two-layer typo correction for search queries.

    1. Exact dictionary lookup (fast, reliable for known misspellings)
    2. Fuzzy matching against theater vocabulary for unknown typos (words ≥4 chars)

    Returns (corrected_query, was_corrected, show_banner).
    - was_corrected: True if any word was changed (always use corrected query for search)
    - show_banner: True only if the correction is clean enough to display to the user
      (i.e. every meaningful word was either already correct or successfully corrected)
    """
    if not raw or not raw.strip():
        return (raw, False, False)

    words = raw.strip().split()
    corrected_words: List[str] = []
    changed = False
    # Track words where fuzzy matching was attempted but failed — these are
    # likely gibberish that we can't fix, so we shouldn't show a half-baked banner.
    unfixable_count = 0

    for w in words:
        # Strip trailing punctuation/possessives for matching, re-attach after
        suffix = ""
        stripped = w
        for s in ("'s", "'s", "'t", "'t"):
            if stripped.lower().endswith(s):
                suffix = stripped[len(stripped) - len(s):]
                stripped = stripped[:len(stripped) - len(s)]
                break

        key = stripped.lower()

        # Layer 1: exact dictionary hit
        if key in QUERY_TYPO_CORRECTIONS:
            repl = QUERY_TYPO_CORRECTIONS[key]
            corrected_words.append(repl + suffix)
            if repl.lower() != key:
                changed = True
            continue

        # Layer 2: fuzzy match (only for words ≥4 chars, not in vocabulary already, not a skip word)
        if len(key) >= 4 and key not in _THEATER_VOCABULARY and key not in _FUZZY_SKIP:
            matches = get_close_matches(key, _VOCAB_LIST, n=1, cutoff=0.8)
            if matches and matches[0] != key:
                corrected_words.append(matches[0] + suffix)
                changed = True
                continue
            # No fuzzy match found — this word is unrecognized and unfixable
            unfixable_count += 1

        corrected_words.append(w)

    # Only show the banner if we made corrections AND there are no unfixable words.
    # e.g. "shakespear monologe" → both corrected, 0 unfixable → show banner
    # e.g. "shakespear mnonologeawewewe" → "mnonologeawewewe" unfixable → hide banner
    # The corrected query is still used for search either way (silent improvement).
    show_banner = changed and unfixable_count == 0

    return (" ".join(corrected_words), changed, show_banner)
