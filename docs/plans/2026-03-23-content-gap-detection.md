# Content Gap Detection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Detect when a user searches for a specific play/author we don't have, show them a helpful banner with a "Request this play" button, and track demand in a dedicated table.

**Architecture:** AI parser extracts `intended_play`/`intended_author` → post-search check against results → content_gap field in response → frontend banner with request button → `ContentRequest` table with dedup/upsert.

**Tech Stack:** OpenAI Tier 3 prompt extension, SQLAlchemy, FastAPI, React/TanStack Query

---

### Task 1: Add ContentRequest Model + Migration

**Files:**
- Create: `backend/app/models/content_request.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/scripts/add_content_requests_table.py`

**Step 1: Create the model file**

```python
"""Content requests - tracks plays/authors users want but we don't have."""

from app.core.database import Base
from sqlalchemy import Column, DateTime, Index, Integer, String
from sqlalchemy import text as sql_text


class ContentRequest(Base):
    __tablename__ = "content_requests"

    id = Column(Integer, primary_key=True, index=True)
    play_title = Column(String, nullable=False)
    author = Column(String, nullable=True)
    character_name = Column(String, nullable=True)
    request_count = Column(Integer, nullable=False, default=1)
    first_requested_at = Column(DateTime, server_default=sql_text("now()"), nullable=False)
    last_requested_at = Column(DateTime, server_default=sql_text("now()"), nullable=False)
    status = Column(String(20), nullable=False, default="requested")

    __table_args__ = (
        Index("ix_content_requests_play_author", "play_title", "author", unique=True),
    )
```

**Step 2: Register in models/__init__.py**

Add: `from app.models.content_request import ContentRequest`

**Step 3: Create migration script**

Follow the pattern from `add_search_logs_table.py`: raw SQL CREATE TABLE with indexes.

**Step 4: Run migration, commit**

---

### Task 2: Add content_gap to SearchLog

**Files:**
- Modify: `backend/app/models/search_log.py`
- Create or modify migration script to add column

**Step 1: Add column to model**

Add to `SearchLog`:
```python
content_gap = Column(JSONB, nullable=True)  # {play: "...", author: "...", character: "..."}
```

**Step 2: Migration script to ALTER TABLE**

```sql
ALTER TABLE search_logs ADD COLUMN IF NOT EXISTS content_gap JSONB;
```

**Step 3: Commit**

---

### Task 3: Extend AI Query Parser for intended_play/author

**Files:**
- Modify: `backend/app/services/search/query_optimizer.py`

**Step 1: Update the Tier 3 AI parsing prompt**

Add to the extraction prompt instructions:
```
Also extract if the user is looking for a SPECIFIC play or work:
- "intended_play": the specific play/movie/show title they want (e.g., "Death of a Salesman")
- "intended_author": the author/playwright (e.g., "Arthur Miller")
Only set these if the user clearly wants a specific work, not for generic queries like "funny monologue".
```

Add these to the JSON schema the AI returns.

**Step 2: Pass intended_play/intended_author through the filter dict**

Add `intended_play` and `intended_author` to the merged filters dict returned by optimize().

**Step 3: Commit**

---

### Task 4: Post-Search Content Gap Detection

**Files:**
- Modify: `backend/app/services/search/semantic_search.py`
- Modify: `backend/app/api/monologues.py`

**Step 1: Add content gap check in semantic_search.py**

After results are scored and sorted, check:
```python
def _detect_content_gap(results, filters):
    intended_play = filters.get("intended_play")
    intended_author = filters.get("intended_author")
    if not intended_play and not intended_author:
        return None

    for monologue, score in results:
        play_title = monologue.play.title.lower()
        author = monologue.play.author.lower()
        if intended_play and intended_play.lower() in play_title:
            return None  # found it
        if intended_author and intended_author.lower() in author:
            return None  # found it

    return {
        "play": intended_play,
        "author": intended_author,
        "character": filters.get("character_name"),
    }
```

**Step 2: Return content_gap from search method**

Update return signature to include content_gap dict or None.

**Step 3: Update SearchResponse in monologues.py**

Add `content_gap: Optional[dict] = None` to `SearchResponse`.

Pass content_gap through from search results. Also save it to `SearchLog.content_gap`.

**Step 4: Commit**

---

### Task 5: Content Request API Endpoint

**Files:**
- Modify: `backend/app/api/monologues.py` (or create a small new router)

**Step 1: Add POST endpoint**

```python
@router.post("/content-request")
async def request_content(
    body: ContentRequestBody,  # play_title, author, character_name
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Upsert: find existing or create
    existing = db.query(ContentRequest).filter(
        func.lower(ContentRequest.play_title) == body.play_title.lower(),
        func.lower(ContentRequest.author) == (body.author or "").lower(),
    ).first()

    if existing:
        existing.request_count += 1
        existing.last_requested_at = datetime.utcnow()
    else:
        db.add(ContentRequest(
            play_title=body.play_title,
            author=body.author,
            character_name=body.character_name,
        ))
    db.commit()
    return {"status": "ok"}
```

**Step 2: Commit**

---

### Task 6: Frontend Content Gap Banner

**Files:**
- Create: `components/search/ContentGapBanner.tsx`
- Modify: `app/(platform)/search/page.tsx`

**Step 1: Create ContentGapBanner component**

- Shows play title and author
- "Request this play" button → POST `/api/monologues/content-request`
- After click, button becomes "Requested" (disabled)
- Clean card style, brand accent color
- Text: "We don't have [play] by [author] in our library yet."

**Step 2: Add to search page**

Render `<ContentGapBanner>` between search controls and results when `data.content_gap` is present.

**Step 3: Commit**

---

### Task 7: Admin Content Requests View

**Files:**
- Modify: `backend/app/api/admin/searches.py`
- Modify: `app/(platform)/admin/searches/page.tsx`

**Step 1: Add admin endpoint**

`GET /api/admin/content-requests` - returns all content requests sorted by request_count desc. Include ability to update status.

`PATCH /api/admin/content-requests/{id}` - update status to "planned" or "added".

**Step 2: Add Content Requests tab to admin searches page**

Table showing: play title, author, request count, first/last requested, status badge. Status dropdown to change from "requested" → "planned" → "added".

**Step 3: Commit**

---

### Task 8: Final verification

- Search for "loman death of a salesman" → should see content gap banner
- Click "Request this play" → should persist
- Check `/admin/searches` → should see content_gap data in search log
- Check content requests tab → should show Death of a Salesman with count 1
- Search for "funny monologue" → should NOT show content gap banner
