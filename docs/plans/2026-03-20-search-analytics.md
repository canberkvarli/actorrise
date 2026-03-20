# Search Analytics Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Track every search query (authenticated + anonymous) with filters, result count, and returned monologue IDs, then surface this data on a dedicated admin page with summary stats and an expandable result snapshot.

**Architecture:** New `SearchLog` SQLAlchemy model → INSERT at end of both search endpoints (fire-and-forget) → New admin API endpoint with pagination + summary aggregation → New Next.js admin page with summary cards + searchable table + expandable result rows.

**Tech Stack:** SQLAlchemy + PostgreSQL (JSONB), FastAPI admin endpoint, React + TanStack Query + shadcn/ui

---

### Task 1: Create SearchLog Model

**Files:**
- Create: `backend/app/models/search_log.py`
- Modify: `backend/app/models/__init__.py`

**Step 1: Create the model file**

```python
"""Search analytics - logs every search query with filters and results."""

from app.core.database import Base
from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy import text as sql_text
from sqlalchemy.dialects.postgresql import JSONB


class SearchLog(Base):
    __tablename__ = "search_logs"

    id = Column(Integer, primary_key=True, index=True)
    query = Column(Text, nullable=False)  # raw search text
    filters_used = Column(JSONB, nullable=True)  # {gender: "female", age_range: "30s", ...}
    results_count = Column(Integer, nullable=False, default=0)
    result_ids = Column(JSONB, nullable=True)  # [142, 587, 23, ...] monologue IDs
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # null = anonymous
    source = Column(String(20), nullable=False, default="search")  # "search" or "demo"
    created_at = Column(DateTime, server_default=sql_text("now()"), nullable=False)

    __table_args__ = (
        Index("ix_search_logs_created_at", "created_at"),
        Index("ix_search_logs_user_id", "user_id"),
    )
```

**Step 2: Register in models/__init__.py**

Add to `backend/app/models/__init__.py`:
```python
from app.models.search_log import SearchLog
```

**Step 3: Generate and run migration**

```bash
cd backend && alembic revision --autogenerate -m "add search_logs table"
cd backend && alembic upgrade head
```

**Step 4: Commit**

```bash
git add backend/app/models/search_log.py backend/app/models/__init__.py backend/alembic/versions/
git commit -m "feat: add SearchLog model for search analytics"
```

---

### Task 2: Log Searches in Both Endpoints

**Files:**
- Modify: `backend/app/api/monologues.py` (lines ~354-364 for authenticated, ~451-453 for demo)

**Step 1: Add logging to authenticated search endpoint**

After line 355 (`record_total_search(current_user.id, db)`), before the return statement, add:

```python
        # Log search for analytics (fire-and-forget, don't block response)
        try:
            from app.models.search_log import SearchLog
            all_result_ids = [int(m.id) for m, _ in all_results_with_scores]
            search_log = SearchLog(
                query=q.strip() if q else "",
                filters_used=filters if filters else None,
                results_count=total,
                result_ids=all_result_ids,
                user_id=int(current_user.id),
                source="search",
            )
            db.add(search_log)
            db.commit()
        except Exception:
            db.rollback()  # Don't let logging break search
```

**Step 2: Add logging to demo search endpoint**

After line 452 (`record_demo_search()`), before the return, add:

```python
    # Log demo search for analytics
    try:
        from app.models.search_log import SearchLog
        all_result_ids = [int(m.id) for m, _ in all_results_with_scores[:5]]
        search_log = SearchLog(
            query=q.strip(),
            filters_used=None,
            results_count=len(results),
            result_ids=all_result_ids,
            user_id=int(current_user.id) if current_user else None,
            source="demo",
        )
        db.add(search_log)
        db.commit()
    except Exception:
        db.rollback()
```

**Step 3: Commit**

```bash
git add backend/app/api/monologues.py
git commit -m "feat: log search queries in both search endpoints"
```

---

### Task 3: Create Admin API Endpoint

**Files:**
- Create: `backend/app/api/admin/searches.py`
- Modify: `backend/app/main.py` (register router)

**Step 1: Create the admin searches API**

```python
"""Admin search analytics API."""

from datetime import date, timedelta
from typing import Any, Optional

from app.api.admin.stats import require_moderator
from app.core.database import get_db
from app.models.actor import Monologue, Play
from app.models.search_log import SearchLog
from app.models.user import User
from fastapi import APIRouter, Depends, Query
from sqlalchemy import Date, cast as sa_cast, desc, func
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/admin", tags=["admin", "searches"])


@router.get("/searches")
def get_search_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(25, le=100),
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    zero_only: bool = Query(False, description="Only show zero-result searches"),
    source: Optional[str] = Query(None, description="Filter by source: search or demo"),
    q: Optional[str] = Query(None, description="Filter by query text"),
    db: Session = Depends(get_db),
    _mod: User = Depends(require_moderator),
) -> dict[str, Any]:
    """Paginated search logs with summary stats."""

    # Date range
    end = date.fromisoformat(to_date) if to_date else date.today()
    start = date.fromisoformat(from_date) if from_date else end - timedelta(days=30)

    base = db.query(SearchLog).filter(
        sa_cast(SearchLog.created_at, Date) >= start,
        sa_cast(SearchLog.created_at, Date) <= end,
    )

    if zero_only:
        base = base.filter(SearchLog.results_count == 0)
    if source:
        base = base.filter(SearchLog.source == source)
    if q:
        base = base.filter(SearchLog.query.ilike(f"%{q}%"))

    total = base.count()

    # Paginated results
    logs = (
        base.order_by(desc(SearchLog.created_at))
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    # Collect user emails for display
    user_ids = {log.user_id for log in logs if log.user_id}
    user_map = {}
    if user_ids:
        users = db.query(User.id, User.email).filter(User.id.in_(user_ids)).all()
        user_map = {u.id: u.email for u in users}

    searches = []
    for log in logs:
        searches.append({
            "id": log.id,
            "query": log.query,
            "filters_used": log.filters_used,
            "results_count": log.results_count,
            "result_ids": log.result_ids,
            "user_email": user_map.get(log.user_id),
            "source": log.source,
            "created_at": log.created_at.isoformat(),
        })

    # Summary stats (for the date range)
    summary_base = db.query(SearchLog).filter(
        sa_cast(SearchLog.created_at, Date) >= start,
        sa_cast(SearchLog.created_at, Date) <= end,
    )
    total_searches = summary_base.count()
    zero_results = summary_base.filter(SearchLog.results_count == 0).count()

    # Top queries (by frequency)
    top_queries = (
        summary_base
        .with_entities(
            func.lower(SearchLog.query).label("q"),
            func.count().label("cnt"),
        )
        .group_by(func.lower(SearchLog.query))
        .order_by(desc("cnt"))
        .limit(10)
        .all()
    )

    # Top zero-result queries
    top_zero = (
        summary_base
        .filter(SearchLog.results_count == 0)
        .with_entities(
            func.lower(SearchLog.query).label("q"),
            func.count().label("cnt"),
        )
        .group_by(func.lower(SearchLog.query))
        .order_by(desc("cnt"))
        .limit(10)
        .all()
    )

    return {
        "searches": searches,
        "total": total,
        "page": page,
        "limit": limit,
        "summary": {
            "total_searches": total_searches,
            "zero_result_count": zero_results,
            "top_queries": [{"query": q, "count": c} for q, c in top_queries],
            "top_zero_result_queries": [{"query": q, "count": c} for q, c in top_zero],
        },
    }


@router.get("/searches/{log_id}/results")
def get_search_result_monologues(
    log_id: int,
    db: Session = Depends(get_db),
    _mod: User = Depends(require_moderator),
) -> dict[str, Any]:
    """Get monologue snapshots for a specific search log entry."""
    from fastapi import HTTPException

    log = db.query(SearchLog).filter(SearchLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Search log not found")

    if not log.result_ids:
        return {"monologues": []}

    monologues = (
        db.query(
            Monologue.id,
            Monologue.title,
            Monologue.character_name,
            Monologue.character_gender,
            Monologue.character_age_range,
            Monologue.primary_emotion,
            Monologue.estimated_duration_seconds,
            Monologue.word_count,
            Play.title.label("play_title"),
            Play.author,
        )
        .join(Play)
        .filter(Monologue.id.in_(log.result_ids))
        .all()
    )

    return {
        "monologues": [
            {
                "id": m.id,
                "title": m.title,
                "character_name": m.character_name,
                "gender": m.character_gender,
                "age_range": m.character_age_range,
                "emotion": m.primary_emotion,
                "duration_seconds": m.estimated_duration_seconds,
                "word_count": m.word_count,
                "play_title": m.play_title,
                "author": m.author,
            }
            for m in monologues
        ],
    }
```

**Step 2: Register router in main.py**

Add import:
```python
from app.api.admin.searches import router as admin_searches_router
```

Add include:
```python
app.include_router(admin_searches_router)
```

**Step 3: Commit**

```bash
git add backend/app/api/admin/searches.py backend/app/main.py
git commit -m "feat: add admin search analytics API endpoints"
```

---

### Task 4: Create Admin Searches Frontend Page

**Files:**
- Create: `app/(platform)/admin/searches/page.tsx`

**Step 1: Create the admin searches page**

Build with:
- Summary cards at top (total searches, zero-result count)
- Top queries list + zero-result queries list side by side
- Paginated table: query, user, filters, results count, source, date
- Expandable rows: click a row to fetch `/api/admin/searches/{id}/results` and show monologue snapshot cards (title, character, author, gender, duration)
- Date range filter, source filter, zero-results-only toggle, text search
- Follow same patterns as `admin/users/page.tsx` (useQuery, pagination, Card/CardHeader/CardContent)

**Step 2: Add nav link to admin layout**

Add "Searches" link to the admin sidebar/nav (wherever the other admin links are).

**Step 3: Commit**

```bash
git add app/(platform)/admin/searches/
git commit -m "feat: add admin search analytics page"
```

---

### Task 5: Final verification

**Step 1:** Start backend, run a search, check that `search_logs` table gets a row
**Step 2:** Visit `/admin/searches`, verify the log appears with correct data
**Step 3:** Click expand on a row, verify monologue snapshots load
**Step 4:** Final commit if any fixes needed
