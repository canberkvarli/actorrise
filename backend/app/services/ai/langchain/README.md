# LangChain/LangGraph Infrastructure

This directory contains the LangChain/LangGraph infrastructure for ActorRise's AI features.

## 🎯 Purpose

We migrated from direct OpenAI API calls to LangChain/LangGraph to enable:

1. **Better Observability**: LangSmith tracing for debugging and monitoring
2. **Improved Error Handling**: Built-in retry logic and graceful degradation
3. **Future Extensibility**: Easy to add complex features like ScenePartner and CraftCoach
4. **Cost Optimization**: Integrated with existing query optimizer
5. **Standardization**: Consistent patterns across all AI features

## 📁 Structure

```
langchain/
├── __init__.py          # Public API exports
├── config.py            # Model initialization and LangSmith setup
├── prompts.py           # All prompt templates
├── chains.py            # LangChain chains for analysis
├── embeddings.py        # Embedding generation
├── graph.py             # LangGraph for conversational features
└── README.md            # This file
```

## 🔧 Components

### config.py

Handles model initialization and configuration:

```python
from app.services.ai.langchain.config import get_llm, get_embeddings_model

# Get a ChatOpenAI instance
llm = get_llm(model="gpt-4o-mini", temperature=0.3)

# Get embeddings model
embeddings = get_embeddings_model(model="text-embedding-3-small")
```

**LangSmith Setup** (Optional):
```bash
export LANGCHAIN_TRACING_V2=true
export LANGCHAIN_API_KEY=your_api_key
export LANGCHAIN_PROJECT=actorrise
```

### prompts.py

Centralized prompt templates using LangChain's `ChatPromptTemplate`:

- `MONOLOGUE_ANALYSIS_TEMPLATE` - Analyze monologue content
- `QUERY_PARSING_TEMPLATE` - Parse search queries
- `SCENEPARTNER_TEMPLATE` - Scene reading (future)
- `CRAFTCOACH_ANALYSIS_TEMPLATE` - Performance feedback (future)
- `ANALYTICS_INSIGHTS_TEMPLATE` - User insights (future)

**Benefits:**
- Easy to update prompts without touching code
- Version control for prompt iterations
- A/B testing capability

### chains.py

LangChain chains for structured AI tasks:

```python
from app.services.ai.langchain.chains import (
    create_monologue_analysis_chain,
    create_query_parsing_chain
)

# Create chains
analysis_chain = create_monologue_analysis_chain()
query_chain = create_query_parsing_chain()

# Use chains
result = analysis_chain.invoke({
    "text": "To be or not to be...",
    "character": "Hamlet",
    "play_title": "Hamlet",
    "author": "William Shakespeare"
})
```

**Available Chains:**
- `create_monologue_analysis_chain()` - Analyzes monologue content
- `create_query_parsing_chain()` - Parses natural language queries
- `create_scene_partner_chain()` - Conversational scene reading (TODO)
- `create_craft_coach_chain()` - Multi-step performance analysis (TODO)

### embeddings.py

Simplified embedding generation:

```python
from app.services.ai.langchain.embeddings import (
    generate_embedding,
    generate_embeddings_batch
)

# Single embedding
embedding = generate_embedding("A sad monologue about loss")

# Batch embeddings (more efficient)
embeddings = generate_embeddings_batch([
    "sad monologue",
    "funny monologue"
])
```

### graph.py

LangGraph for stateful, multi-turn conversations:

**ScenePartner Graph** (Template for Q3 2026):
- Manages conversational scene reading
- Tracks scene position and context
- Handles user pacing preferences

**CraftCoach Graph** (Template for Q4 2026):
- Multi-step performance analysis
- Sequential analysis workflow
- Synthesizes comprehensive feedback

## 🔄 Migration

### What Changed

**Before (Direct OpenAI):**
```python
client = OpenAI(api_key=api_key)
response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[...],
    temperature=0.3
)
result = json.loads(response.choices[0].message.content)
```

**After (LangChain):**
```python
chain = create_monologue_analysis_chain()
result = chain.invoke({
    "text": text,
    "character": character,
    ...
})
```

### What Stayed the Same

✅ **ContentAnalyzer API** - Same method signatures and return types
✅ **Query Optimizer** - Keyword-based optimization still works
✅ **Caching** - Existing cache mechanisms untouched
✅ **Error Handling** - Same fallback behavior
✅ **Rate Limiting** - Same rate limit handling

## 🎮 Usage

### Current Features (MonologueMatch)

The ContentAnalyzer now uses LangChain internally but has the same API:

```python
from app.services.ai.content_analyzer import ContentAnalyzer

analyzer = ContentAnalyzer()

# Analyze monologue (now using LangChain)
analysis = analyzer.analyze_monologue(
    text="To be or not to be...",
    character="Hamlet",
    play_title="Hamlet",
    author="William Shakespeare"
)

# Generate embedding (now using LangChain)
embedding = analyzer.generate_embedding("sad monologue")

# Parse query (now using LangChain)
filters = analyzer.parse_search_query("funny piece for young woman")
```

### Future Features

#### ScenePartner (Q3 2026)

```python
from app.services.ai.langchain.graph import create_scene_partner_graph

app = create_scene_partner_graph()

# Initialize
state = {
    "scene_text": "...",
    "play_title": "Hamlet",
    "user_character": "Hamlet",
    "ai_character": "Ophelia",
    ...
}

# Run conversational flow
result = app.invoke(state)
```

#### CraftCoach (Q4 2026)

```python
from app.services.ai.langchain.graph import create_craft_coach_graph

app = create_craft_coach_graph()

# Analyze performance
state = {
    "monologue_text": "...",
    "performance_notes": "...",
    ...
}

# Get comprehensive feedback
result = app.invoke(state)
feedback = result["final_feedback"]
```

## 🧪 Testing

All existing tests should pass without modification since we maintained backward compatibility:

```bash
# Test imports
python -c "from app.services.ai.content_analyzer import ContentAnalyzer; print('✓ Success')"

# Test batch processor
python -m app.services.ai.batch_processor --help

# Test semantic search
# (should work identically to before)
```

## 💰 Cost Optimization

The LangChain migration **preserves** the existing cost optimization:

1. **Query Optimizer** still classifies queries into tiers
2. **Keyword extraction** still bypasses AI for simple queries
3. **Caching** still reduces redundant API calls

**New Benefits:**
- LangChain's built-in retry logic reduces failed requests
- LangSmith helps identify expensive operations
- Better error handling prevents wasted API calls

## 📊 Observability (Optional)

Enable LangSmith tracing to monitor AI operations:

```bash
export LANGCHAIN_TRACING_V2=true
export LANGCHAIN_API_KEY=ls_xxx
export LANGCHAIN_PROJECT=actorrise
```

**Benefits:**
- See every LLM call and its cost
- Debug prompt issues visually
- Track latency and performance
- Compare prompt versions

## 🚀 Future Roadmap

### Q3 2026: ScenePartner
- [ ] Implement ScenePartner graph
- [ ] Add speech-to-text integration
- [ ] Create scene progression tracking
- [ ] Build pacing controls

### Q4 2026: CraftCoach
- [ ] Implement CraftCoach analysis chains
- [ ] Add video/audio analysis
- [ ] Create feedback synthesis
- [ ] Build scoring system

### 2027: Advanced Analytics
- [ ] Create analytics chains
- [ ] Add pattern recognition
- [ ] Generate user insights
- [ ] Build recommendation engine

## 📝 Environment Variables

```bash
# Required
OPENAI_API_KEY=sk_xxx

# Optional (LangSmith)
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=ls_xxx
LANGCHAIN_PROJECT=actorrise
```

## 🔗 Resources

- [LangChain Documentation](https://python.langchain.com/docs/get_started/introduction)
- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)
- [LangSmith Documentation](https://docs.smith.langchain.com/)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)

## 🎓 Learning Resources

### For ScenePartner Development
- LangGraph multi-turn conversations
- State management patterns
- Conditional branching in graphs

### For CraftCoach Development
- Sequential chains
- Multi-step analysis workflows
- Feedback synthesis patterns

### For Analytics Development
- Data analysis chains
- Pattern recognition with LLMs
- Natural language insights generation

## 🐛 Troubleshooting

### Import Errors
```bash
# Install dependencies
uv pip install langchain langchain-openai langchain-core langgraph langsmith
```

### LangSmith Not Working
- Check `LANGCHAIN_TRACING_V2=true`
- Verify `LANGCHAIN_API_KEY` is set
- Ensure network access to LangSmith

### Performance Issues
- Check if caching is working
- Verify query optimizer is being used
- Look for redundant LLM calls in LangSmith

## 📜 License

MIT - Same as ActorRise platform
