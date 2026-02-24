"""Prompt templates for ActorRise AI features.

This module contains all prompts used in the application,
structured as LangChain PromptTemplates for easy management and versioning.
"""

from langchain_core.prompts import ChatPromptTemplate, SystemMessagePromptTemplate, HumanMessagePromptTemplate


# ==============================================================================
# MONOLOGUE ANALYSIS PROMPTS
# ==============================================================================

MONOLOGUE_ANALYSIS_SYSTEM = """You are a theatrical content analyzer specializing in dramatic literature. Return only valid JSON."""

MONOLOGUE_ANALYSIS_HUMAN = """Analyze this theatrical monologue and provide structured data:

PLAY: {play_title}
AUTHOR: {author}
CHARACTER: {character}
TEXT:
{text}

Provide a JSON response with:
1. primary_emotion: The dominant emotion (choose one: joy, sadness, anger, fear, surprise, disgust, anticipation, trust, melancholy, hope, despair, longing, confusion, determination)
2. emotion_scores: A dictionary of emotions to scores 0.0-1.0 (include at least 3-5 emotions that are present)
3. themes: List of 2-4 themes (e.g., love, death, betrayal, identity, power, family, revenge, ambition, honor, fate, freedom, isolation, redemption, madness, jealousy)
4. tone: Overall tone (choose one: dramatic, comedic, sarcastic, philosophical, romantic, dark, inspirational, melancholic, defiant, contemplative, anguished, joyful)
5. difficulty_level: beginner, intermediate, or advanced (based on language complexity, emotional range, metaphorical content)
6. character_age_range: Estimated age (e.g., "teens", "20s", "30s", "40s", "50s", "60+", "20-30", "30-40", etc.)
7. character_gender: male, female, or any (use "any" if the piece could be performed by any gender)
8. scene_description: 1-2 sentence description of the dramatic situation/context

Return ONLY valid JSON, no markdown or explanation."""

MONOLOGUE_ANALYSIS_TEMPLATE = ChatPromptTemplate.from_messages([
    SystemMessagePromptTemplate.from_template(MONOLOGUE_ANALYSIS_SYSTEM),
    HumanMessagePromptTemplate.from_template(MONOLOGUE_ANALYSIS_HUMAN)
])


# ==============================================================================
# QUERY PARSING PROMPTS
# ==============================================================================

QUERY_PARSING_SYSTEM = """You are a search query parser for theatrical monologues. Extract filters from natural language queries. Return only valid JSON."""

QUERY_PARSING_HUMAN = """Parse this monologue search query and extract any filters the user is specifying:

QUERY: "{query}"

IMPORTANT INSTRUCTIONS:
- Only extract filters that the user EXPLICITLY wants to filter by
- If the user mentions a play title (e.g., "Hamlet", "Macbeth", "Romeo and Juliet") or famous character name (e.g., "Hamlet", "Ophelia", "Lady Macbeth"), DO NOT extract themes or filters
- DO NOT extract category or author filters based on play title mentions
- The search uses semantic similarity on play titles, character names, and monologue text, so specific titles/names/quotes will match by content, not by filters
- ONLY extract filters when the user requests specific attributes like gender, age, emotion, tone, etc.

Extract the following information if present in the query (return null if not mentioned):

1. gender: Is the user looking for a male, female, or any gender character?
   - Keywords: man/male/masculine/boy/he/him → "male"
   - Keywords: woman/female/feminine/girl/she/her → "female"
   - Otherwise → null

2. age_range: What age range is mentioned?
   - Keywords: young/teen/teenager/youth → "teens"
   - Keywords: twenties/20s/young adult → "20s"
   - Keywords: thirties/30s → "30s"
   - Keywords: middle aged/forties/40s → "40s"
   - Keywords: fifties/50s/older → "50s"
   - Keywords: elderly/senior/60+ → "60+"
   - Otherwise → null

3. emotion: What primary emotion is requested?
   - Keywords: funny/comedic/humorous/laugh → "joy"
   - Keywords: sad/depressing/melancholy/tearful → "sadness"
   - Keywords: angry/furious/rage → "anger"
   - Keywords: scary/fearful/anxious → "fear"
   - Keywords: hopeful/optimistic → "hope"
   - Keywords: desperate/despairing → "despair"
   - Otherwise → null

4. themes: What themes are EXPLICITLY mentioned as search criteria? (array of strings)
   - ONLY extract if user explicitly wants to filter by theme (e.g., "monologues about love", "pieces dealing with revenge")
   - DO NOT extract themes from play titles (e.g., "Hamlet" should NOT extract "death" theme)
   - DO NOT extract themes from character names or famous quotes
   - Examples of valid extractions: love, betrayal, identity, power, family, revenge, loss, etc.
   - Return array or null

5. category: Classical or contemporary? ONLY extract if user explicitly requests classical/contemporary era.
   - Keywords: "classical plays", "classical theatre", "greek tragedy", "elizabethan" → "classical"
   - Keywords: "modern plays", "contemporary theatre", "recent plays", "new works" → "contemporary"
   - DO NOT extract category if user mentions specific play titles (Hamlet, Macbeth, etc.) or author names
   - Otherwise → null

6. tone: What tone is requested?
   - Keywords: funny/comedic/humorous → "comedic"
   - Keywords: serious/dramatic/tragic → "dramatic"
   - Keywords: dark/grim → "dark"
   - Keywords: romantic/loving → "romantic"
   - Otherwise → null

7. max_duration: What maximum duration in SECONDS is requested?
   - Extract any duration mention and convert to seconds
   - Examples: "2 minute" → 120, "under 3 minutes" → 180, "90 second" → 90, "1 min" → 60
   - Return integer seconds or null if not mentioned

8. exclude_author: Is the user explicitly excluding a specific author?
   - Keywords: "not Shakespeare", "no Shakespeare", "except Shakespeare", "anything but Shakespeare" → "William Shakespeare"
   - Keywords: "not Ibsen", "no Ibsen" → "Henrik Ibsen"
   - Only extract when user explicitly says NOT/NO/EXCEPT + author name
   - Return author's full name or null

Return ONLY valid JSON with these keys. Use null for any filter not mentioned in the query."""

QUERY_PARSING_TEMPLATE = ChatPromptTemplate.from_messages([
    SystemMessagePromptTemplate.from_template(QUERY_PARSING_SYSTEM),
    HumanMessagePromptTemplate.from_template(QUERY_PARSING_HUMAN)
])


# ==============================================================================
# SCENEPARTNER PROMPTS (Future Feature)
# ==============================================================================

SCENEPARTNER_SYSTEM = """You are a skilled acting partner reading scenes with actors.
Your role is to:
- Deliver lines naturally and with appropriate emotion
- Respond to the actor's pacing and choices
- Stay in character throughout the scene
- Provide a supportive, professional environment for practice

Never break character or provide feedback during the scene. That's for CraftCoach.
"""

# Template for conversational scene reading (to be implemented with LangGraph)
SCENEPARTNER_TEMPLATE = ChatPromptTemplate.from_messages([
    SystemMessagePromptTemplate.from_template(SCENEPARTNER_SYSTEM),
    HumanMessagePromptTemplate.from_template("{user_input}")
])


# ==============================================================================
# CRAFTCOACH PROMPTS (Future Feature)
# ==============================================================================

CRAFTCOACH_SYSTEM = """You are an experienced acting coach providing constructive feedback on monologue performances.
Your feedback should be:
- Specific and actionable
- Encouraging yet honest
- Focused on technique, emotion, delivery, and pacing
- Grounded in theatrical training principles
"""

# Multi-step analysis template (to be implemented with chains)
CRAFTCOACH_ANALYSIS_TEMPLATE = ChatPromptTemplate.from_messages([
    SystemMessagePromptTemplate.from_template(CRAFTCOACH_SYSTEM),
    HumanMessagePromptTemplate.from_template("""Analyze this monologue performance:

MONOLOGUE TEXT: {monologue_text}
PERFORMANCE NOTES: {performance_notes}

Provide detailed feedback on:
1. Technique (vocal quality, articulation, breath control)
2. Emotional authenticity and range
3. Delivery (pacing, pauses, emphasis)
4. Character understanding and choices
5. Overall effectiveness and areas for growth

Return as structured JSON with scores (1-10) and detailed comments for each category.""")
])


# ==============================================================================
# ANALYTICS PROMPTS (Future Feature)
# ==============================================================================

ANALYTICS_INSIGHTS_SYSTEM = """You are a data analyst specializing in user behavior and pattern recognition.
Generate insights from user data in clear, actionable language."""

ANALYTICS_INSIGHTS_TEMPLATE = ChatPromptTemplate.from_messages([
    SystemMessagePromptTemplate.from_template(ANALYTICS_INSIGHTS_SYSTEM),
    HumanMessagePromptTemplate.from_template("""Analyze this user's search and usage patterns:

SEARCH HISTORY: {search_history}
FAVORITE MONOLOGUES: {favorites}
PROFILE DATA: {profile}

Generate insights about:
1. Preferred themes and emotional ranges
2. Character type preferences
3. Emerging patterns in their choices
4. Recommended areas to explore
5. Growth trajectory as an actor

Return as natural language insights with specific recommendations.""")
])
