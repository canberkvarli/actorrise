# Contemporary Monologue Scraper

Automated tool to scrape and process contemporary public domain monologues from legal sources.

## ✅ Legal Sources

This scraper ONLY uses legal, public domain sources:

1. **Project Gutenberg** - Contemporary plays from 1920s-1960s (public domain)
2. **Creative Commons** - Explicitly licensed contemporary works
3. **Public Domain Works** - Pre-1928 or copyright-lapsed works

See `CONTEMPORARY_SOURCES.md` for full legal analysis.

## 🚀 Setup

### Prerequisites

1. **Python 3.9+**
2. **Backend dependencies installed**:
   ```bash
   cd backend
   uv pip install -r pyproject.toml
   ```

3. **Environment variables**:
   ```bash
   # Required
   export DATABASE_URL="postgresql://user:pass@host:port/dbname"
   export OPENAI_API_KEY="sk-..."

   # Optional
   export LANGCHAIN_API_KEY="ls_..."  # For LangSmith tracing
   export LANGCHAIN_TRACING_V2="true"  # Enable tracing
   export LANGCHAIN_PROJECT="ActorRise-Scraper"
   ```

## 🎯 Usage

### Run the scraper:

```bash
cd /home/user/actorrise/backend
python scripts/scrape_contemporary_monologues.py
```

### What it does:

1. **Fetches** contemporary play collections from Project Gutenberg
2. **Parses** plays from HTML collections
3. **Extracts** individual monologues (50+ words)
4. **Analyzes** with AI:
   - Character gender and age range
   - Primary emotion and emotion scores
   - Themes and tone
   - Difficulty level
5. **Generates** semantic embeddings for search
6. **Saves** to database with proper attribution

## 📊 Current Sources

### Project Gutenberg Collections

1. **Contemporary One-Act Plays (1922)**
   - Book ID: 37970
   - Editors: B. Roland Lewis et al.
   - URL: https://www.gutenberg.org/files/37970/37970-h/37970-h.htm

**To add more collections:**

Edit `GUTENBERG_CONTEMPORARY_PLAYS` in `scrape_contemporary_monologues.py`:

```python
GUTENBERG_CONTEMPORARY_PLAYS = [
    {
        "id": 37970,
        "title": "Contemporary One-Act Plays",
        "editors": "B. Roland Lewis et al.",
        "year": 1922,
        "url": "https://www.gutenberg.org/files/37970/37970-h/37970-h.htm"
    },
    # Add new collections here
]
```

## 🔍 How It Works

### 1. Monologue Extraction

Uses heuristics to identify character speeches:
- Pattern matching for character names (ALL CAPS)
- Minimum 50 words for monologue
- Extracts stage directions separately
- Calculates word count and duration

### 2. AI Analysis

Uses LangChain-powered ContentAnalyzer:
- **Model**: gpt-4o-mini (cost-effective)
- **Embeddings**: text-embedding-3-small (1536 dimensions)
- **Caching**: Results cached to avoid re-processing
- **Tracing**: Optional LangSmith tracing for debugging

### 3. Database Storage

Creates two types of records:
- **Play**: Source metadata (title, author, copyright status)
- **Monologue**: Individual speeches with AI analysis

## ⚙️ Configuration

### Customize extraction:

```python
# Minimum word count for monologues
MIN_WORD_COUNT = 50  # Adjust in extract_monologues_from_play()

# AI analysis temperature
temperature = 0.3  # Lower = more consistent, Higher = more creative

# Embedding model
model = "text-embedding-3-small"  # Or "text-embedding-3-large" for better quality
dimensions = 1536  # Must match model
```

## 📈 Performance

### Expected processing time:

- **Play collection fetch**: 1-2 seconds
- **Play parsing**: 5-10 seconds per collection
- **Monologue extraction**: 1-2 seconds per play
- **AI analysis**: 2-3 seconds per monologue
- **Embedding generation**: 0.5-1 second per monologue

**Total**: ~10-15 minutes for 100 monologues

### Cost estimates (OpenAI):

- **Analysis (gpt-4o-mini)**: ~$0.15 per 1000 monologues
- **Embeddings (text-embedding-3-small)**: ~$0.02 per 1000 monologues
- **Total**: ~$0.17 per 1000 monologues

## 🛡️ Safety Features

### Duplicate prevention:
- Checks if play already exists before processing
- Uses (title, author) unique constraint

### Error handling:
- Graceful failure on parsing errors
- Database rollback on analysis failures
- Continues processing after individual failures

### Legal compliance:
- Only public domain sources
- Tracks copyright status in database
- Stores source URLs for attribution

## 🐛 Debugging

### Enable verbose output:

The script already prints progress:
```
🎭 Contemporary Monologue Scraper
============================================================

Scraping: Contemporary One-Act Plays (1922)
Found 15 plays in collection

Processing: The Constant Lover by St. John Hankin
  Found 8 potential monologues
  ✓ Saved: MARGARET (127 words)
  ✓ Saved: CONSTANCE (89 words)
  ...
```

### Common issues:

1. **ModuleNotFoundError**: Install dependencies
   ```bash
   uv pip install --system httpx beautifulsoup4 lxml
   ```

2. **DATABASE_URL not set**: Export environment variable
   ```bash
   export DATABASE_URL="postgresql://..."
   ```

3. **OpenAI API errors**: Check API key and rate limits
   ```bash
   export OPENAI_API_KEY="sk-..."
   ```

## 📝 Output

### Database tables populated:

**plays**:
```sql
id | title | author | year_written | genre | category | copyright_status
1  | The Constant Lover | St. John Hankin | 1922 | Drama | Contemporary | public_domain
```

**monologues**:
```sql
id | play_id | character_name | text | word_count | character_gender | primary_emotion | embedding
1  | 1 | MARGARET | "I don't..." | 127 | female | frustration | [0.123, ...]
```

## 🔄 Next Steps

### After running the scraper:

1. **Verify data quality**:
   - Check the database directly or use the API endpoints to verify monologues were added

2. **Test search**:
   - Search for monologues in the web app
   - Check if contemporary monologues appear
   - Verify metadata accuracy

3. **Add more sources**:
   - Research additional Gutenberg collections
   - Find CC-licensed play repositories
   - Update `GUTENBERG_CONTEMPORARY_PLAYS` list

## 📚 Resources

- **Legal analysis**: `CONTEMPORARY_SOURCES.md`
- **Project Gutenberg Drama**: https://gutenberg.net.au/drama.html
- **Public domain plays**: https://library.owu.edu/playsinthepublicdomain
- **Copyright info**: https://blogs.loc.gov/copyright/

## 🤝 Contributing

To add new legal sources:

1. **Verify public domain status** (see `CONTEMPORARY_SOURCES.md`)
2. **Add to source list** in scraper
3. **Test extraction** with sample data
4. **Document** copyright status and source URL
5. **Commit** with clear attribution

## ⚠️ Important Notes

- **Only use legal sources** - See `CONTEMPORARY_SOURCES.md` for what's allowed
- **Respect rate limits** - Scraper includes delays to avoid overwhelming sources
- **Verify copyright** - When in doubt, don't scrape
- **Attribute properly** - Always store source URLs and attribution
- **Monitor costs** - OpenAI API calls have costs (but they're minimal)

## 📞 Support

Issues with the scraper? Check:
1. Environment variables are set correctly
2. Database is accessible
3. OpenAI API key is valid
4. Dependencies are installed
5. Python version is 3.9+

For legal questions about sources, see `CONTEMPORARY_SOURCES.md`.
