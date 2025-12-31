# AI-Powered Monologue Finder - Technical Implementation Plan

## Executive Summary

This document provides a comprehensive technical implementation plan for building an AI-powered monologue finder into the ActorRise platform. The system will extract monologues from plays/scripts, analyze them with AI for emotional content and themes, and enable semantic search matching user queries to perfect performance pieces.

**Current State:** ActorRise has authentication, actor profiles, and a basic Monologue model.
**Target State:** Full-featured AI-powered monologue discovery with 10,000+ classical pieces and growing contemporary library.

---

## Table of Contents

1. [Database Schema Design](#1-database-schema-design)
2. [Monologue Extraction Pipeline](#2-monologue-extraction-pipeline)
3. [NLP Models & AI Analysis](#3-nlp-models--ai-analysis)
4. [Legal Strategies for Contemporary Content](#4-legal-strategies-for-contemporary-content)
5. [Search & Matching System](#5-search--matching-system)
6. [API Endpoints](#6-api-endpoints)
7. [Frontend Components](#7-frontend-components)
8. [MVP Implementation Plan (4 Phases)](#8-mvp-implementation-plan-4-phases)
9. [Data Sources & APIs](#9-data-sources--apis)
10. [Technical Stack Additions](#10-technical-stack-additions)

---

## 1. Database Schema Design

### Enhanced Monologue Model

```python
# backend/app/models/monologue.py (enhanced)

from sqlalchemy import Column, Integer, String, Text, JSON, Float, Boolean, DateTime, ForeignKey, ARRAY
from sqlalchemy.dialects.postgresql import JSONB
from pgvector.sqlalchemy import Vector  # For embeddings
from app.core.database import Base

class Play(Base):
    """Source play/script metadata"""
    __tablename__ = "plays"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False, index=True)
    author = Column(String, nullable=False, index=True)
    year_written = Column(Integer, nullable=True)
    genre = Column(String, nullable=False)  # tragedy, comedy, drama, etc.
    category = Column(String, nullable=False)  # classical, contemporary

    # Legal & Source Info
    copyright_status = Column(String, nullable=False)  # public_domain, copyrighted, unknown
    license_type = Column(String, nullable=True)  # cc_by, fair_use, licensed, etc.
    source_url = Column(String, nullable=True)
    purchase_url = Column(String, nullable=True)  # Link to buy full script
    publisher = Column(String, nullable=True)

    # Full text storage (public domain only)
    full_text = Column(Text, nullable=True)  # Only for public domain
    full_text_url = Column(String, nullable=True)  # External link
    text_format = Column(String, nullable=True)  # plain, tei_xml, html

    # Metadata
    language = Column(String, default="en")
    setting = Column(String, nullable=True)
    time_period = Column(String, nullable=True)
    themes = Column(ARRAY(String), default=list)

    created_at = Column(DateTime(timezone=True), server_default=text('now()'))
    updated_at = Column(DateTime(timezone=True), onupdate=text('now()'))


class Monologue(Base):
    """Individual monologue with AI-analyzed metadata"""
    __tablename__ = "monologues"

    id = Column(Integer, primary_key=True, index=True)
    play_id = Column(Integer, ForeignKey("plays.id"), nullable=False, index=True)

    # Basic Info
    title = Column(String, nullable=False)  # "Hamlet's 'To be or not to be'"
    character_name = Column(String, nullable=False, index=True)
    text = Column(Text, nullable=False)  # The actual monologue text
    stage_directions = Column(Text, nullable=True)  # Extracted stage directions

    # Character Requirements (AI-extracted + manual curation)
    character_gender = Column(String, nullable=True)  # male, female, non-binary, any
    character_age_range = Column(String, nullable=True)  # 20s, 30-40, 50+, etc.
    character_description = Column(Text, nullable=True)

    # Performance Metadata
    word_count = Column(Integer, nullable=False)
    estimated_duration_seconds = Column(Integer, nullable=False)  # At ~150 wpm
    difficulty_level = Column(String, nullable=True)  # beginner, intermediate, advanced

    # AI-Analyzed Content
    primary_emotion = Column(String, nullable=True, index=True)  # joy, sadness, anger, fear, etc.
    emotion_scores = Column(JSONB, nullable=True)  # {"joy": 0.2, "sadness": 0.7, "anger": 0.1}
    themes = Column(ARRAY(String), default=list, index=True)  # love, death, betrayal, identity
    tone = Column(String, nullable=True)  # dramatic, comedic, sarcastic, philosophical

    # Contextual Info
    context_before = Column(Text, nullable=True)  # What happens before this speech
    context_after = Column(Text, nullable=True)
    scene_description = Column(Text, nullable=True)  # Setting and situation

    # Search & Discovery
    embedding = Column(Vector(1536), nullable=True)  # OpenAI text-embedding-3-small
    search_tags = Column(ARRAY(String), default=list)  # Searchable keywords

    # Usage Analytics
    view_count = Column(Integer, default=0)
    favorite_count = Column(Integer, default=0)
    overdone_score = Column(Float, default=0.0)  # 0.0 = fresh, 1.0 = extremely overdone

    # Quality Control
    is_verified = Column(Boolean, default=False)  # Manual verification
    quality_score = Column(Float, nullable=True)  # AI quality assessment

    created_at = Column(DateTime(timezone=True), server_default=text('now()'))
    updated_at = Column(DateTime(timezone=True), onupdate=text('now()'))


class MonologueFavorite(Base):
    """User favorites tracking"""
    __tablename__ = "monologue_favorites"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    monologue_id = Column(Integer, ForeignKey("monologues.id"), nullable=False)
    notes = Column(Text, nullable=True)  # User's performance notes
    created_at = Column(DateTime(timezone=True), server_default=text('now()'))


class SearchHistory(Base):
    """Track searches for analytics and recommendations"""
    __tablename__ = "search_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    query = Column(String, nullable=False)
    filters = Column(JSONB, nullable=True)  # Applied filters
    result_count = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=text('now()'))
```

### Database Migrations

```bash
# Install pgvector extension for PostgreSQL
psql -d actorrise -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

---

## 2. Monologue Extraction Pipeline

### A. Structured Text Parsing (TEI-XML, HTML)

**Best for:** Folger Shakespeare Library, Oxford Text Archive, Perseus Digital Library

```python
# backend/app/services/extraction/tei_parser.py

from lxml import etree
import re

class TEIParser:
    """Parse TEI-encoded plays (XML format used by scholarly editions)"""

    def extract_monologues(self, tei_xml: str, min_words: int = 50, max_words: int = 500):
        """
        Extract monologues from TEI-encoded play text.

        TEI structure:
        <sp who="#hamlet">
            <speaker>Hamlet</speaker>
            <l>To be, or not to be, that is the question:</l>
            <l>Whether 'tis nobler in the mind to suffer</l>
            ...
        </sp>
        """
        tree = etree.fromstring(tei_xml.encode('utf-8'))
        monologues = []

        # Find all speeches (<sp> tags)
        speeches = tree.xpath('//sp', namespaces=tree.nsmap)

        for speech in speeches:
            # Extract speaker
            speaker_elem = speech.xpath('./speaker', namespaces=tree.nsmap)
            speaker = speaker_elem[0].text if speaker_elem else "Unknown"

            # Extract lines (could be <l>, <p>, or <ab> tags)
            lines = speech.xpath('.//l | .//p | .//ab', namespaces=tree.nsmap)
            text_lines = [self._clean_text(line) for line in lines]
            full_text = '\n'.join(text_lines)

            # Extract stage directions
            stage_dirs = speech.xpath('.//stage', namespaces=tree.nsmap)
            directions = [self._clean_text(sd) for sd in stage_dirs]

            word_count = len(full_text.split())

            # Filter by length
            if min_words <= word_count <= max_words:
                monologues.append({
                    'character': speaker,
                    'text': full_text,
                    'stage_directions': ' '.join(directions),
                    'word_count': word_count
                })

        return monologues

    def _clean_text(self, element) -> str:
        """Remove XML tags and clean text"""
        text = etree.tostring(element, encoding='unicode', method='text')
        return re.sub(r'\s+', ' ', text).strip()
```

### B. Unstructured Text Parsing (Plain Text, PDF)

**Best for:** Project Gutenberg, Internet Archive

```python
# backend/app/services/extraction/plain_text_parser.py

import re
import spacy
from typing import List, Dict

class PlainTextParser:
    """Extract monologues from plain text plays using NLP"""

    def __init__(self):
        self.nlp = spacy.load("en_core_web_sm")

    def extract_monologues(self, text: str, min_words: int = 50, max_words: int = 500):
        """
        Extract monologues from plain text using pattern matching.

        Common play formats:
        CHARACTER:
            Line of dialogue...
            Another line...

        Or:

        CHARACTER. Line of dialogue...
        """
        monologues = []

        # Pattern 1: Character name followed by colon
        pattern1 = r'([A-Z][A-Z\s]+):\s*\n((?:(?!\n[A-Z][A-Z\s]+:).+\n?)+)'

        # Pattern 2: Character name in all caps at start of line
        pattern2 = r'^([A-Z][A-Z\s]+)\.\s*(.+?)(?=\n\n[A-Z][A-Z\s]+\.|$)'

        speeches = []

        # Try both patterns
        for match in re.finditer(pattern1, text, re.MULTILINE):
            character = match.group(1).strip()
            speech_text = match.group(2).strip()
            speeches.append((character, speech_text))

        if not speeches:
            for match in re.finditer(pattern2, text, re.MULTILINE | re.DOTALL):
                character = match.group(1).strip()
                speech_text = match.group(2).strip()
                speeches.append((character, speech_text))

        # Filter and clean speeches
        for character, speech_text in speeches:
            # Remove stage directions (usually in parentheses or brackets)
            clean_text = re.sub(r'\([^)]+\)|\[[^\]]+\]', '', speech_text)
            clean_text = re.sub(r'\s+', ' ', clean_text).strip()

            word_count = len(clean_text.split())

            if min_words <= word_count <= max_words:
                monologues.append({
                    'character': self._normalize_character_name(character),
                    'text': clean_text,
                    'word_count': word_count
                })

        return monologues

    def _normalize_character_name(self, name: str) -> str:
        """Convert 'HAMLET' to 'Hamlet'"""
        return name.title()
```

### C. PDF Extraction

```python
# backend/app/services/extraction/pdf_parser.py

import pdfplumber
from .plain_text_parser import PlainTextParser

class PDFParser:
    """Extract text from PDF scripts and parse monologues"""

    def __init__(self):
        self.text_parser = PlainTextParser()

    def extract_monologues(self, pdf_path: str, min_words: int = 50, max_words: int = 500):
        """Extract monologues from PDF scripts"""

        # Extract text from PDF
        full_text = ""
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    full_text += text + "\n"

        # Use plain text parser to extract monologues
        return self.text_parser.extract_monologues(full_text, min_words, max_words)
```

### D. Complete Extraction Service

```python
# backend/app/services/extraction/monologue_extractor.py

from typing import List, Dict
from .tei_parser import TEIParser
from .plain_text_parser import PlainTextParser
from .pdf_parser import PDFParser

class MonologueExtractor:
    """Main service for extracting monologues from various formats"""

    def __init__(self):
        self.tei_parser = TEIParser()
        self.plain_text_parser = PlainTextParser()
        self.pdf_parser = PDFParser()

    def extract_from_source(
        self,
        content: str,
        format_type: str,
        min_words: int = 50,
        max_words: int = 500
    ) -> List[Dict]:
        """
        Extract monologues from various source formats.

        Args:
            content: The source text or file path
            format_type: 'tei_xml', 'plain_text', 'pdf', 'html'
            min_words: Minimum word count for a monologue
            max_words: Maximum word count for a monologue

        Returns:
            List of monologue dictionaries
        """
        if format_type == 'tei_xml':
            return self.tei_parser.extract_monologues(content, min_words, max_words)

        elif format_type == 'plain_text':
            return self.plain_text_parser.extract_monologues(content, min_words, max_words)

        elif format_type == 'pdf':
            return self.pdf_parser.extract_monologues(content, min_words, max_words)

        elif format_type == 'html':
            # Convert HTML to plain text first
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(content, 'html.parser')
            plain_text = soup.get_text()
            return self.plain_text_parser.extract_monologues(plain_text, min_words, max_words)

        else:
            raise ValueError(f"Unsupported format: {format_type}")
```

---

## 3. NLP Models & AI Analysis

### A. Model Selection

| Task | Recommended Model | Alternative | Cost/Performance |
|------|------------------|-------------|------------------|
| **Emotion Classification** | OpenAI GPT-4o-mini | HuggingFace `j-hartmann/emotion-english-distilroberta-base` | $0.15/1M tokens vs Free (self-hosted) |
| **Theme Extraction** | OpenAI GPT-4o-mini | LLaMA 3.1 8B | $0.15/1M tokens vs Free (self-hosted) |
| **Embeddings** | OpenAI `text-embedding-3-small` | `sentence-transformers/all-MiniLM-L6-v2` | $0.02/1M tokens vs Free |
| **Character Analysis** | Claude 3.5 Haiku | GPT-4o-mini | $0.25/1M tokens vs $0.15/1M |
| **Named Entity Recognition** | spaCy `en_core_web_sm` | - | Free (fast) |

### B. Emotion & Theme Analysis Service

```python
# backend/app/services/ai/content_analyzer.py

from openai import OpenAI
import os
from typing import Dict, List
import json

class ContentAnalyzer:
    """Analyze monologue content using AI"""

    def __init__(self):
        self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    def analyze_monologue(self, text: str, character: str, play_title: str) -> Dict:
        """
        Comprehensive analysis of a monologue.

        Returns:
            {
                'primary_emotion': str,
                'emotion_scores': dict,
                'themes': list,
                'tone': str,
                'difficulty_level': str,
                'character_age_range': str,
                'character_gender': str,
                'scene_description': str
            }
        """

        prompt = f"""Analyze this theatrical monologue and provide structured data:

PLAY: {play_title}
CHARACTER: {character}
TEXT:
{text}

Provide a JSON response with:
1. primary_emotion: The dominant emotion (choose one: joy, sadness, anger, fear, surprise, disgust, anticipation, trust, melancholy, hope)
2. emotion_scores: A dictionary of emotions to scores 0.0-1.0 (include at least 3 emotions)
3. themes: List of 2-4 themes (e.g., love, death, betrayal, identity, power, family, revenge, ambition)
4. tone: Overall tone (dramatic, comedic, sarcastic, philosophical, romantic, dark, inspirational)
5. difficulty_level: beginner, intermediate, or advanced (based on language complexity, emotional range)
6. character_age_range: Estimated age (e.g., "20s", "30-40", "50+", "teens", "elderly")
7. character_gender: male, female, non-binary, or any
8. scene_description: 1-2 sentence description of the situation/context

Return ONLY valid JSON, no markdown or explanation."""

        response = self.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a theatrical content analyzer. Return only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            response_format={"type": "json_object"}
        )

        result = json.loads(response.choices[0].message.content)
        return result

    def generate_embedding(self, text: str) -> List[float]:
        """Generate semantic embedding for search"""

        response = self.client.embeddings.create(
            model="text-embedding-3-small",
            input=text,
            dimensions=1536
        )

        return response.data[0].embedding

    def generate_search_tags(self, analysis: Dict, text: str) -> List[str]:
        """Generate searchable tags from analysis"""

        tags = []

        # Add emotion tags
        tags.append(analysis['primary_emotion'])
        for emotion, score in analysis.get('emotion_scores', {}).items():
            if score > 0.3:
                tags.append(emotion)

        # Add theme tags
        tags.extend(analysis.get('themes', []))

        # Add tone
        tags.append(analysis['tone'])

        # Add difficulty
        tags.append(analysis['difficulty_level'])

        # Add character tags
        if analysis.get('character_gender'):
            tags.append(analysis['character_gender'])

        if analysis.get('character_age_range'):
            tags.append(analysis['character_age_range'])

        # Extract key phrases (simple approach)
        # TODO: Could use KeyBERT or RAKE for better keyword extraction

        return list(set(tags))  # Remove duplicates
```

### C. Batch Processing for Initial Database Population

```python
# backend/app/services/ai/batch_processor.py

from typing import List
import asyncio
from .content_analyzer import ContentAnalyzer
from app.models.monologue import Monologue
from sqlalchemy.orm import Session

class BatchProcessor:
    """Process multiple monologues efficiently"""

    def __init__(self, db: Session):
        self.db = db
        self.analyzer = ContentAnalyzer()

    async def process_monologues(self, monologue_ids: List[int], batch_size: int = 10):
        """
        Process monologues in batches to avoid rate limits.

        OpenAI rate limits (Tier 1):
        - GPT-4o-mini: 500 RPM, 200,000 TPM
        - Embeddings: 500 RPM, 1,000,000 TPM
        """

        monologues = self.db.query(Monologue).filter(
            Monologue.id.in_(monologue_ids),
            Monologue.embedding.is_(None)  # Not yet processed
        ).all()

        for i in range(0, len(monologues), batch_size):
            batch = monologues[i:i + batch_size]

            # Process batch
            for monologue in batch:
                try:
                    # Analyze content
                    analysis = self.analyzer.analyze_monologue(
                        monologue.text,
                        monologue.character_name,
                        monologue.play.title
                    )

                    # Update monologue with analysis
                    monologue.primary_emotion = analysis['primary_emotion']
                    monologue.emotion_scores = analysis['emotion_scores']
                    monologue.themes = analysis['themes']
                    monologue.tone = analysis['tone']
                    monologue.difficulty_level = analysis['difficulty_level']
                    monologue.character_age_range = analysis.get('character_age_range')
                    monologue.character_gender = analysis.get('character_gender')
                    monologue.scene_description = analysis.get('scene_description')

                    # Generate embedding
                    embedding = self.analyzer.generate_embedding(monologue.text)
                    monologue.embedding = embedding

                    # Generate tags
                    tags = self.analyzer.generate_search_tags(analysis, monologue.text)
                    monologue.search_tags = tags

                    self.db.commit()

                    print(f"✓ Processed: {monologue.title}")

                except Exception as e:
                    print(f"✗ Error processing {monologue.id}: {e}")
                    self.db.rollback()
                    continue

            # Rate limiting: wait between batches
            await asyncio.sleep(2)
```

---

## 4. Legal Strategies for Contemporary Content

### A. Public Domain Strategy (Phase 1 - Immediate)

**Timeline:** Before 1928 is public domain in USA

```python
PUBLIC_DOMAIN_AUTHORS = [
    # Pre-1928 playwrights
    "William Shakespeare",
    "Anton Chekhov",
    "Henrik Ibsen",
    "Oscar Wilde",
    "George Bernard Shaw",
    "August Strindberg",
    "Molière",
    "Sophocles",
    "Euripides",
    "Christopher Marlowe",
    # ... many more
]
```

**Sources:**
- Project Gutenberg (gutendex.com API) - 70,000+ books
- Folger Shakespeare Library API - All Shakespeare plays
- Internet Archive - Millions of texts
- Perseus Digital Library - Classical texts

### B. Fair Use Strategy (Phase 2 - Moderate Risk)

**Fair Use Factors:**
1. **Purpose:** Educational/transformative (monologue discovery for actors)
2. **Nature:** Published creative works
3. **Amount:** Small excerpts (1-2 minute monologues from 90+ minute plays)
4. **Market Effect:** Drives purchases (include buy links)

**Implementation:**
```python
# Limit excerpt length for copyrighted works
MAX_COPYRIGHTED_EXCERPT_WORDS = 500  # ~2-3 minutes at performance speed

# Always include attribution and purchase links
def format_copyrighted_monologue(monologue):
    return {
        'text': monologue.text,
        'attribution': f"From '{monologue.play.title}' by {monologue.play.author}",
        'copyright_notice': f"© {monologue.play.year_written} - {monologue.play.publisher}",
        'purchase_url': monologue.play.purchase_url,
        'license_info': 'This excerpt displayed under Fair Use for educational purposes.'
    }
```

**Legal Protection:**
- Terms of Service: "Educational use only, not for commercial performance"
- DMCA takedown process
- Partnership agreements with publishers

### C. Partnership Strategy (Phase 3 - Safest for Contemporary)

**Target Partners:**

1. **New Play Exchange (NPX)**
   - 28,000+ contemporary scripts
   - Contact: partnerships@newplayexchange.org
   - Proposal: Drive traffic + revenue share
   - **Approach:** "We'll send actors to read full plays on your platform"

2. **Samuel French/Concord Theatricals**
   - Major play publisher
   - Licensing division
   - **Approach:** "API access to monologue excerpts with licensing integration"

3. **Dramatists Play Service**
   - Another major publisher
   - Similar licensing model

4. **Individual Playwrights**
   - Contact emerging playwrights directly
   - Offer exposure in exchange for monologue rights
   - Platform for them to showcase work

**Partnership Pitch Template:**

```markdown
Subject: Partnership Opportunity - ActorRise Monologue Discovery Platform

Dear [Partner],

ActorRise is building an AI-powered monologue finder for 100,000+ actors worldwide.
We help actors discover perfect audition pieces through semantic search.

**The Opportunity:**
- We drive actors to your platform/catalog to purchase full scripts
- Revenue share: 10% of purchases originating from our referrals
- Attribution and direct "Buy Full Script" links on every monologue

**What We Need:**
- API access to monologue excerpts (500 words max)
- Metadata (character info, play details)
- Deep links to your purchase pages

**What You Get:**
- Increased script sales from targeted actor audience
- SEO benefits from our high-traffic platform
- Analytics on popular monologues/plays

Can we schedule a call to discuss?

Best regards,
[Your Name]
ActorRise Founder
```

### D. User-Generated Content Strategy (Phase 4 - Community)

**Model:** Like Genius.com for plays

- Allow actors to submit public domain monologues
- Community verification system
- Attribution requirements
- Moderation for copyright compliance

```python
class UserSubmittedMonologue(Base):
    __tablename__ = "user_submitted_monologues"

    id = Column(Integer, primary_key=True)
    submitted_by = Column(Integer, ForeignKey("users.id"))
    monologue_id = Column(Integer, ForeignKey("monologues.id"))
    verification_status = Column(String)  # pending, verified, rejected
    verified_by = Column(Integer, ForeignKey("users.id"), nullable=True)
```

---

## 5. Search & Matching System

### A. Semantic Search with pgvector

```python
# backend/app/services/search/semantic_search.py

from sqlalchemy import func, select
from app.models.monologue import Monologue
from app.services.ai.content_analyzer import ContentAnalyzer
from typing import List, Dict, Optional

class SemanticSearch:
    """Semantic search using vector embeddings"""

    def __init__(self, db):
        self.db = db
        self.analyzer = ContentAnalyzer()

    def search(
        self,
        query: str,
        limit: int = 20,
        filters: Optional[Dict] = None
    ) -> List[Monologue]:
        """
        Semantic search for monologues.

        Args:
            query: Natural language search query
            limit: Number of results
            filters: {
                'gender': 'female',
                'age_range': '20s',
                'emotion': 'sad',
                'theme': 'love',
                'difficulty': 'intermediate',
                'category': 'classical',
                'max_duration': 180  # seconds
            }
        """

        # Generate embedding for query
        query_embedding = self.analyzer.generate_embedding(query)

        # Build base query with vector similarity
        # Using cosine distance (1 - cosine similarity)
        base_query = select(
            Monologue,
            func.cosine_distance(Monologue.embedding, query_embedding).label('distance')
        )

        # Apply filters
        if filters:
            if filters.get('gender'):
                base_query = base_query.where(
                    (Monologue.character_gender == filters['gender']) |
                    (Monologue.character_gender == 'any')
                )

            if filters.get('age_range'):
                base_query = base_query.where(
                    Monologue.character_age_range == filters['age_range']
                )

            if filters.get('emotion'):
                base_query = base_query.where(
                    Monologue.primary_emotion == filters['emotion']
                )

            if filters.get('theme'):
                base_query = base_query.where(
                    Monologue.themes.contains([filters['theme']])
                )

            if filters.get('difficulty'):
                base_query = base_query.where(
                    Monologue.difficulty_level == filters['difficulty']
                )

            if filters.get('category'):
                # Join with Play table
                from app.models.monologue import Play
                base_query = base_query.join(Play).where(
                    Play.category == filters['category']
                )

            if filters.get('max_duration'):
                base_query = base_query.where(
                    Monologue.estimated_duration_seconds <= filters['max_duration']
                )

        # Order by similarity and limit
        base_query = base_query.order_by('distance').limit(limit)

        # Execute query
        results = self.db.execute(base_query).all()

        return [row[0] for row in results]  # Extract Monologue objects
```

### B. Profile-Based Recommendations

```python
# backend/app/services/search/recommender.py

from app.models.actor import ActorProfile
from app.models.monologue import Monologue, MonologueFavorite
from .semantic_search import SemanticSearch

class Recommender:
    """Recommend monologues based on actor profile"""

    def __init__(self, db):
        self.db = db
        self.semantic_search = SemanticSearch(db)

    def recommend_for_actor(
        self,
        actor_profile: ActorProfile,
        limit: int = 20
    ) -> List[Monologue]:
        """
        Recommend monologues based on actor profile.

        Considers:
        - Profile bias (age, gender, experience)
        - Preferred genres
        - Overdone alert sensitivity
        - Previously favorited pieces (collaborative filtering)
        """

        # Build filters from profile
        filters = {}

        if actor_profile.profile_bias_enabled:
            if actor_profile.gender:
                filters['gender'] = actor_profile.gender

            if actor_profile.age_range:
                filters['age_range'] = actor_profile.age_range

            if actor_profile.experience_level:
                difficulty_map = {
                    'beginner': 'beginner',
                    'intermediate': 'intermediate',
                    'advanced': 'advanced',
                    'professional': 'advanced'
                }
                filters['difficulty'] = difficulty_map.get(actor_profile.experience_level)

        # Generate query from preferences
        preferred_genres = actor_profile.preferred_genres or []
        query = f"monologue about {' '.join(preferred_genres)}" if preferred_genres else "dramatic monologue"

        # Search with filters
        results = self.semantic_search.search(query, limit=limit * 2, filters=filters)

        # Apply overdone filtering
        if actor_profile.overdone_alert_sensitivity > 0:
            threshold = 1.0 - actor_profile.overdone_alert_sensitivity
            results = [m for m in results if m.overdone_score <= threshold]

        # Limit results
        return results[:limit]

    def get_similar_monologues(self, monologue_id: int, limit: int = 10) -> List[Monologue]:
        """Find similar monologues based on embedding similarity"""

        monologue = self.db.query(Monologue).get(monologue_id)
        if not monologue or not monologue.embedding:
            return []

        # Find monologues with similar embeddings
        similar = self.db.execute(
            select(
                Monologue,
                func.cosine_distance(Monologue.embedding, monologue.embedding).label('distance')
            )
            .where(Monologue.id != monologue_id)
            .order_by('distance')
            .limit(limit)
        ).all()

        return [row[0] for row in similar]
```

---

## 6. API Endpoints

```python
# backend/app/api/monologues.py

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.monologue import Monologue, MonologueFavorite, Play
from app.services.search.semantic_search import SemanticSearch
from app.services.search.recommender import Recommender
from pydantic import BaseModel

router = APIRouter(prefix="/api/monologues", tags=["monologues"])


# Pydantic schemas
class MonologueResponse(BaseModel):
    id: int
    title: str
    character_name: str
    text: str
    play_title: str
    author: str
    category: str
    character_gender: Optional[str]
    character_age_range: Optional[str]
    primary_emotion: Optional[str]
    themes: List[str]
    tone: Optional[str]
    difficulty_level: Optional[str]
    word_count: int
    estimated_duration_seconds: int
    is_favorited: bool = False
    overdone_score: float


class SearchFilters(BaseModel):
    gender: Optional[str] = None
    age_range: Optional[str] = None
    emotion: Optional[str] = None
    theme: Optional[str] = None
    difficulty: Optional[str] = None
    category: Optional[str] = None
    max_duration: Optional[int] = None


@router.get("/search", response_model=List[MonologueResponse])
async def search_monologues(
    q: str = Query(..., min_length=1, description="Search query"),
    gender: Optional[str] = None,
    age_range: Optional[str] = None,
    emotion: Optional[str] = None,
    theme: Optional[str] = None,
    difficulty: Optional[str] = None,
    category: Optional[str] = None,
    max_duration: Optional[int] = None,
    limit: int = Query(20, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Semantic search for monologues.

    Example queries:
    - "sad monologue about loss"
    - "funny piece for young woman"
    - "shakespearean tragedy about revenge"
    """

    # Build filters
    filters = {
        'gender': gender,
        'age_range': age_range,
        'emotion': emotion,
        'theme': theme,
        'difficulty': difficulty,
        'category': category,
        'max_duration': max_duration
    }
    filters = {k: v for k, v in filters.items() if v is not None}

    # Search
    search_service = SemanticSearch(db)
    results = search_service.search(q, limit=limit, filters=filters)

    # Get user's favorites
    favorites = db.query(MonologueFavorite.monologue_id).filter(
        MonologueFavorite.user_id == current_user.id
    ).all()
    favorite_ids = {f[0] for f in favorites}

    # Format response
    return [
        MonologueResponse(
            id=m.id,
            title=m.title,
            character_name=m.character_name,
            text=m.text,
            play_title=m.play.title,
            author=m.play.author,
            category=m.play.category,
            character_gender=m.character_gender,
            character_age_range=m.character_age_range,
            primary_emotion=m.primary_emotion,
            themes=m.themes or [],
            tone=m.tone,
            difficulty_level=m.difficulty_level,
            word_count=m.word_count,
            estimated_duration_seconds=m.estimated_duration_seconds,
            is_favorited=m.id in favorite_ids,
            overdone_score=m.overdone_score
        )
        for m in results
    ]


@router.get("/recommendations", response_model=List[MonologueResponse])
async def get_recommendations(
    limit: int = Query(20, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get personalized monologue recommendations based on actor profile"""

    # Get actor profile
    actor_profile = current_user.actor_profile
    if not actor_profile:
        raise HTTPException(status_code=400, detail="Actor profile not found")

    # Get recommendations
    recommender = Recommender(db)
    results = recommender.recommend_for_actor(actor_profile, limit=limit)

    # Get favorites
    favorites = db.query(MonologueFavorite.monologue_id).filter(
        MonologueFavorite.user_id == current_user.id
    ).all()
    favorite_ids = {f[0] for f in favorites}

    # Format response
    return [
        MonologueResponse(
            id=m.id,
            title=m.title,
            character_name=m.character_name,
            text=m.text,
            play_title=m.play.title,
            author=m.play.author,
            category=m.play.category,
            character_gender=m.character_gender,
            character_age_range=m.character_age_range,
            primary_emotion=m.primary_emotion,
            themes=m.themes or [],
            tone=m.tone,
            difficulty_level=m.difficulty_level,
            word_count=m.word_count,
            estimated_duration_seconds=m.estimated_duration_seconds,
            is_favorited=m.id in favorite_ids,
            overdone_score=m.overdone_score
        )
        for m in results
    ]


@router.get("/{monologue_id}", response_model=MonologueResponse)
async def get_monologue(
    monologue_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get detailed monologue information"""

    monologue = db.query(Monologue).filter(Monologue.id == monologue_id).first()
    if not monologue:
        raise HTTPException(status_code=404, detail="Monologue not found")

    # Increment view count
    monologue.view_count += 1
    db.commit()

    # Check if favorited
    is_favorited = db.query(MonologueFavorite).filter(
        MonologueFavorite.user_id == current_user.id,
        MonologueFavorite.monologue_id == monologue_id
    ).first() is not None

    return MonologueResponse(
        id=monologue.id,
        title=monologue.title,
        character_name=monologue.character_name,
        text=monologue.text,
        play_title=monologue.play.title,
        author=monologue.play.author,
        category=monologue.play.category,
        character_gender=monologue.character_gender,
        character_age_range=monologue.character_age_range,
        primary_emotion=monologue.primary_emotion,
        themes=monologue.themes or [],
        tone=monologue.tone,
        difficulty_level=monologue.difficulty_level,
        word_count=monologue.word_count,
        estimated_duration_seconds=monologue.estimated_duration_seconds,
        is_favorited=is_favorited,
        overdone_score=monologue.overdone_score
    )


@router.post("/{monologue_id}/favorite")
async def favorite_monologue(
    monologue_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Add monologue to favorites"""

    # Check if already favorited
    existing = db.query(MonologueFavorite).filter(
        MonologueFavorite.user_id == current_user.id,
        MonologueFavorite.monologue_id == monologue_id
    ).first()

    if existing:
        return {"message": "Already favorited"}

    # Create favorite
    favorite = MonologueFavorite(
        user_id=current_user.id,
        monologue_id=monologue_id
    )
    db.add(favorite)

    # Update favorite count
    monologue = db.query(Monologue).get(monologue_id)
    if monologue:
        monologue.favorite_count += 1

    db.commit()

    return {"message": "Favorited successfully"}


@router.delete("/{monologue_id}/favorite")
async def unfavorite_monologue(
    monologue_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Remove monologue from favorites"""

    favorite = db.query(MonologueFavorite).filter(
        MonologueFavorite.user_id == current_user.id,
        MonologueFavorite.monologue_id == monologue_id
    ).first()

    if not favorite:
        raise HTTPException(status_code=404, detail="Favorite not found")

    db.delete(favorite)

    # Update favorite count
    monologue = db.query(Monologue).get(monologue_id)
    if monologue and monologue.favorite_count > 0:
        monologue.favorite_count -= 1

    db.commit()

    return {"message": "Unfavorited successfully"}


@router.get("/{monologue_id}/similar", response_model=List[MonologueResponse])
async def get_similar_monologues(
    monologue_id: int,
    limit: int = Query(10, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get similar monologues"""

    recommender = Recommender(db)
    results = recommender.get_similar_monologues(monologue_id, limit=limit)

    # Get favorites
    favorites = db.query(MonologueFavorite.monologue_id).filter(
        MonologueFavorite.user_id == current_user.id
    ).all()
    favorite_ids = {f[0] for f in favorites}

    return [
        MonologueResponse(
            id=m.id,
            title=m.title,
            character_name=m.character_name,
            text=m.text,
            play_title=m.play.title,
            author=m.play.author,
            category=m.play.category,
            character_gender=m.character_gender,
            character_age_range=m.character_age_range,
            primary_emotion=m.primary_emotion,
            themes=m.themes or [],
            tone=m.tone,
            difficulty_level=m.difficulty_level,
            word_count=m.word_count,
            estimated_duration_seconds=m.estimated_duration_seconds,
            is_favorited=m.id in favorite_ids,
            overdone_score=m.overdone_score
        )
        for m in results
    ]
```

---

## 7. Frontend Components

### A. Search Page Component

```typescript
// app/(platform)/search/page.tsx

'use client'

import { useState } from 'react'
import { Search, Filter } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { MonologueCard } from '@/components/search/monologue-card'
import { FilterPanel } from '@/components/search/filter-panel'

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState({})
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)

  const handleSearch = async () => {
    setLoading(true)

    const params = new URLSearchParams({
      q: query,
      ...filters
    })

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/monologues/search?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    )

    const data = await response.json()
    setResults(data)
    setLoading(false)
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold mb-8">Find Your Perfect Monologue</h1>

      {/* Search Bar */}
      <div className="flex gap-4 mb-8">
        <Input
          type="text"
          placeholder="Search: 'sad monologue about loss' or 'funny piece for young woman'"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          className="flex-1"
        />
        <Button onClick={handleSearch} disabled={loading}>
          <Search className="mr-2 h-4 w-4" />
          Search
        </Button>
      </div>

      {/* Filters */}
      <FilterPanel filters={filters} setFilters={setFilters} />

      {/* Results */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {results.map((monologue) => (
          <MonologueCard key={monologue.id} monologue={monologue} />
        ))}
      </div>

      {results.length === 0 && !loading && query && (
        <p className="text-center text-gray-500 mt-8">
          No monologues found. Try adjusting your search or filters.
        </p>
      )}
    </div>
  )
}
```

### B. Monologue Card Component

```typescript
// components/search/monologue-card.tsx

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Heart, Clock, User } from 'lucide-react'

interface MonologueCardProps {
  monologue: {
    id: number
    title: string
    character_name: string
    text: string
    play_title: string
    author: string
    primary_emotion: string
    themes: string[]
    difficulty_level: string
    estimated_duration_seconds: number
    is_favorited: boolean
    overdone_score: number
  }
}

export function MonologueCard({ monologue }: MonologueCardProps) {
  const minutes = Math.floor(monologue.estimated_duration_seconds / 60)
  const seconds = monologue.estimated_duration_seconds % 60

  return (
    <Card className="hover:shadow-lg transition-shadow cursor-pointer">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg">{monologue.title}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {monologue.play_title} by {monologue.author}
            </p>
          </div>
          <Heart
            className={`h-5 w-5 ${
              monologue.is_favorited ? 'fill-red-500 text-red-500' : 'text-gray-400'
            }`}
          />
        </div>
      </CardHeader>

      <CardContent>
        {/* Preview Text */}
        <p className="text-sm mb-4 line-clamp-3">
          {monologue.text}
        </p>

        {/* Metadata */}
        <div className="flex flex-wrap gap-2 mb-3">
          <Badge variant="secondary">{monologue.primary_emotion}</Badge>
          {monologue.themes.slice(0, 2).map(theme => (
            <Badge key={theme} variant="outline">{theme}</Badge>
          ))}
        </div>

        {/* Footer Info */}
        <div className="flex justify-between items-center text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <User className="h-4 w-4" />
            {monologue.character_name}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            {minutes}:{seconds.toString().padStart(2, '0')}
          </span>
        </div>

        {/* Overdone Alert */}
        {monologue.overdone_score > 0.7 && (
          <p className="text-xs text-amber-600 mt-2">
            ⚠️ Frequently performed piece
          </p>
        )}
      </CardContent>
    </Card>
  )
}
```

---

## 8. MVP Implementation Plan (4 Phases)

### **Phase 1: Foundation (Weeks 1-3)**

**Goal:** Basic monologue database with Shakespeare + search

**Backend Tasks:**
1. ✅ Enhance Monologue and Play models (database schema)
2. ✅ Install pgvector extension
3. ✅ Build extraction pipeline for TEI-XML (Folger Shakespeare)
4. ✅ Create ContentAnalyzer service (OpenAI integration)
5. ✅ Build batch processor for AI analysis
6. ✅ Implement basic semantic search
7. ✅ Create monologue API endpoints

**Data Ingestion:**
- Extract all Shakespeare plays from Folger Library (~1,000 monologues)
- Run AI analysis on all pieces
- Generate embeddings for semantic search

**Frontend Tasks:**
1. ✅ Build search page UI
2. ✅ Create MonologueCard component
3. ✅ Add filter panel
4. ✅ Implement monologue detail page
5. ✅ Add favorites functionality

**Dependencies:**
```toml
# backend/pyproject.toml additions
dependencies = [
    # ... existing ...
    "openai>=1.0.0",
    "pgvector>=0.2.0",
    "lxml>=4.9.0",
    "beautifulsoup4>=4.12.0",
    "pdfplumber>=0.10.0",
    "spacy>=3.7.0",
]
```

**Success Criteria:**
- ✅ 1,000+ Shakespeare monologues in database
- ✅ Semantic search working
- ✅ Users can search, filter, and favorite monologues

---

### **Phase 2: Expansion (Weeks 4-6)**

**Goal:** Add 5,000+ classical monologues from multiple sources

**Data Sources:**
1. **Project Gutenberg** (gutendex.com API)
   - Chekhov, Ibsen, Shaw, Wilde, etc.
   - ~50 plays = ~3,000 monologues
2. **Internet Archive** (archive.org API)
   - Additional classical plays
3. **Perseus Digital Library**
   - Greek tragedies (Sophocles, Euripides, Aeschylus)

**Backend Tasks:**
1. ✅ Build Project Gutenberg scraper
2. ✅ Implement plain text parser for unstructured plays
3. ✅ Add Internet Archive integration
4. ✅ Create admin dashboard for data ingestion
5. ✅ Implement overdone score calculator (based on view/favorite counts)

**Frontend Tasks:**
1. ✅ Add "Recommendations" page (profile-based)
2. ✅ Create "Similar Monologues" feature
3. ✅ Add advanced filters (author, year, genre)
4. ✅ Implement infinite scroll for search results

**Success Criteria:**
- ✅ 5,000+ total monologues (all public domain)
- ✅ Recommendations working based on actor profiles
- ✅ Overdone alerts functional

---

### **Phase 3: Contemporary Content (Weeks 7-10)**

**Goal:** Add contemporary monologues through partnerships & fair use

**Legal Strategy:**
1. **Reach out to New Play Exchange**
   - Draft partnership proposal
   - Negotiate API access
   - Target: 500+ contemporary pieces

2. **Fair Use Implementation**
   - Manually curate 200-300 popular contemporary monologues
   - Limit to 500 words max
   - Include robust attribution and purchase links
   - Implement DMCA takedown process

3. **Individual Playwright Outreach**
   - Contact 50 emerging playwrights
   - Offer platform exposure
   - Target: 100+ contemporary pieces

**Backend Tasks:**
1. ✅ Add copyright compliance features
2. ✅ Implement excerpt length limits for copyrighted works
3. ✅ Create attribution system
4. ✅ Build DMCA takedown process
5. ✅ Add publisher links integration

**Frontend Tasks:**
1. ✅ Display copyright notices
2. ✅ Add "Buy Full Script" CTAs
3. ✅ Show attribution prominently
4. ✅ Create "Contemporary" category filter

**Success Criteria:**
- ✅ 800+ contemporary monologues
- ✅ Partnership with at least 1 publisher/platform
- ✅ Legally compliant attribution system
- ✅ 0 DMCA complaints

---

### **Phase 4: Community & Advanced Features (Weeks 11-12)**

**Goal:** User-generated content + advanced AI features

**Features:**
1. **User Submissions**
   - Allow actors to submit public domain monologues
   - Community verification system
   - Moderation queue

2. **Advanced AI Analysis**
   - Performance difficulty scoring
   - Accent/dialect requirements detection
   - Suggested character interpretations
   - Practice tips generation

3. **Enhanced Recommendations**
   - Collaborative filtering (based on favorites of similar users)
   - "Actors who liked this also liked..."
   - Trending monologues

**Backend Tasks:**
1. ✅ Build user submission system
2. ✅ Create moderation workflow
3. ✅ Implement collaborative filtering
4. ✅ Add trending algorithm
5. ✅ Build performance tips generator (GPT-4o-mini)

**Frontend Tasks:**
1. ✅ Create submission form
2. ✅ Build moderation dashboard (admin)
3. ✅ Add "Trending" section
4. ✅ Display AI-generated performance tips

**Success Criteria:**
- ✅ User submission system working
- ✅ 50+ community submissions
- ✅ Trending monologues feature live
- ✅ Performance tips displayed for all monologues

---

## 9. Data Sources & APIs

### A. Classical (Public Domain) Sources

| Source | API | Content | Extraction Method |
|--------|-----|---------|------------------|
| **Folger Shakespeare Library** | https://www.folgerdigitaltexts.org/ | All Shakespeare plays in TEI-XML | TEI Parser |
| **Project Gutenberg** | https://gutendex.com/books/ | 70,000+ books, ~200 plays | Plain Text Parser |
| **Internet Archive** | https://archive.org/developers/ | Millions of texts | PDF/Plain Text Parser |
| **Perseus Digital Library** | http://www.perseus.tufts.edu/ | Greek & Latin classics | TEI Parser |
| **Oxford Text Archive** | https://ota.bodleian.ox.ac.uk/ | Scholarly editions | TEI Parser |
| **Wikisource** | https://en.wikisource.org/w/api.php | Open-source texts | HTML Parser |

### B. Contemporary Sources (Partnerships Required)

| Source | Contact Method | Content | Business Model |
|--------|---------------|---------|----------------|
| **New Play Exchange** | partnerships@newplayexchange.org | 28,000 scripts | Revenue share on referrals |
| **Samuel French** | https://www.concordtheatricals.com/contact | Major publisher catalog | Licensing + referral fees |
| **Dramatists Play Service** | https://www.dramatists.com/contact | Major publisher catalog | Licensing + referral fees |
| **Playscripts Inc** | https://www.playscripts.com/ | Educational scripts | Referral fees |
| **Individual Playwrights** | Direct outreach | Emerging works | Free (exposure-based) |

### C. Scraping Example: Project Gutenberg

```python
# backend/app/services/data_ingestion/gutenberg_scraper.py

import requests
from app.services.extraction.plain_text_parser import PlainTextParser
from app.models.monologue import Play, Monologue
from sqlalchemy.orm import Session

class GutenbergScraper:
    """Scrape plays from Project Gutenberg"""

    BASE_URL = "https://gutendex.com/books/"

    def __init__(self, db: Session):
        self.db = db
        self.parser = PlainTextParser()

    def search_plays(self, author: str):
        """Search for plays by a specific author"""

        response = requests.get(
            self.BASE_URL,
            params={
                'search': f'{author} play',
                'mime_type': 'text/plain'
            }
        )

        data = response.json()
        return data['results']

    def download_and_extract(self, book_id: int, play_metadata: dict):
        """Download play text and extract monologues"""

        # Get text URL
        book_url = f"https://www.gutenberg.org/files/{book_id}/{book_id}-0.txt"

        response = requests.get(book_url)
        text = response.text

        # Create Play record
        play = Play(
            title=play_metadata['title'],
            author=play_metadata['authors'][0]['name'] if play_metadata['authors'] else 'Unknown',
            year_written=None,  # Would need manual entry
            genre='drama',
            category='classical',
            copyright_status='public_domain',
            source_url=book_url,
            full_text=text,
            text_format='plain'
        )

        self.db.add(play)
        self.db.commit()

        # Extract monologues
        monologues = self.parser.extract_monologues(text)

        # Save monologues
        for m in monologues:
            monologue = Monologue(
                play_id=play.id,
                title=f"{m['character']}'s monologue from {play.title}",
                character_name=m['character'],
                text=m['text'],
                word_count=m['word_count'],
                estimated_duration_seconds=int(m['word_count'] / 150 * 60)  # 150 wpm
            )
            self.db.add(monologue)

        self.db.commit()

        return len(monologues)
```

---

## 10. Technical Stack Additions

### Backend Dependencies

```toml
# backend/pyproject.toml

[project]
name = "actorrise-backend"
version = "0.1.0"
description = "ActorRise Platform Backend API"
requires-python = ">=3.9"
dependencies = [
    # ... existing dependencies ...

    # AI & NLP
    "openai>=1.0.0",
    "anthropic>=0.18.0",  # For Claude Haiku

    # Vector Search
    "pgvector>=0.2.0",

    # Text Processing
    "lxml>=4.9.0",
    "beautifulsoup4>=4.12.0",
    "pdfplumber>=0.10.0",
    "spacy>=3.7.0",
    "python-magic>=0.4.27",

    # Data Ingestion
    "requests>=2.31.0",
    "aiohttp>=3.9.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=7.4.0",
    "pytest-asyncio>=0.21.0",
    "black>=23.0.0",
    "pylint>=2.17.0",
]
```

### Frontend Dependencies

```json
// package.json additions

{
  "dependencies": {
    // ... existing ...
    "@radix-ui/react-slider": "^1.1.2",
    "@radix-ui/react-checkbox": "^1.0.4",
    "@radix-ui/react-accordion": "^1.1.2"
  }
}
```

### Environment Variables

```bash
# backend/.env additions

# OpenAI
OPENAI_API_KEY=sk-...

# Anthropic (optional, for Claude)
ANTHROPIC_API_KEY=sk-ant-...

# Database (ensure pgvector is installed)
DATABASE_URL=postgresql://user:password@localhost:5432/actorrise

# Rate Limiting
OPENAI_RPM_LIMIT=500
OPENAI_TPM_LIMIT=200000
```

---

## Cost Estimates

### AI Processing Costs (Initial 10,000 Monologues)

| Task | Model | Cost per Monologue | Total Cost |
|------|-------|-------------------|------------|
| Content Analysis | GPT-4o-mini | ~$0.0015 | $15 |
| Embeddings | text-embedding-3-small | ~$0.0001 | $1 |
| **TOTAL** | | | **~$16** |

**Ongoing costs:** ~$0.0016 per new monologue analyzed

### Infrastructure Costs (Monthly)

| Service | Tier | Cost |
|---------|------|------|
| PostgreSQL (Supabase) | Pro | $25 |
| Storage (plays + headshots) | 10GB | Included |
| OpenAI API | Pay-as-you-go | ~$50 |
| **TOTAL** | | **~$75/month** |

---

## Next Steps

1. **Review this plan** - Adjust timelines and priorities
2. **Set up OpenAI account** - Get API keys
3. **Install pgvector** - Enable vector search in PostgreSQL
4. **Start Phase 1** - I can begin implementing immediately

**Would you like me to start implementing Phase 1 now?** I can:
- Enhance the database models
- Build the extraction pipeline
- Integrate OpenAI for analysis
- Create the search API endpoints
- Build the frontend components

Let me know which part you'd like me to tackle first!
