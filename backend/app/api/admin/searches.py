"""Admin search analytics API."""

from datetime import date, datetime, time, timedelta
from typing import Any, Optional

from app.api.admin.stats import require_moderator
from app.core.database import get_db
from app.models.actor import Monologue, Play
from app.models.content_request import ContentRequest
from app.models.search_log import SearchLog
from app.models.user import User
from app.services.admin_filters import test_user_filter
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import desc, func, or_, text as sa_text
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/admin", tags=["admin", "searches"])


def _date_range(from_date: Optional[str], to_date: Optional[str]) -> tuple[datetime, datetime]:
    """Resolve query date strings to a [start, end) datetime range usable
    directly against ``SearchLog.created_at``. Avoids ``cast(..., Date)``
    on the column, which prevents index usage in Postgres."""
    end_d = date.fromisoformat(to_date) if to_date else date.today()
    start_d = date.fromisoformat(from_date) if from_date else end_d - timedelta(days=30)
    start_dt = datetime.combine(start_d, time.min)
    end_dt = datetime.combine(end_d + timedelta(days=1), time.min)
    return start_dt, end_dt


#: Staff, demo and testing accounts, kept out of every number on this page.
#:
#: The founder's own testing was the busiest "actor" in the library — 49
#: searches, more than twice the next person — so he sat at the top of every
#: table and moved every average. Anonymous rows (user_id IS NULL) are real
#: visitors and stay.
#:
#: Resolved ONCE into a list of ids and passed as a bind parameter, rather than
#: written twice — as a SQLAlchemy expression for the ORM paths and by hand in
#: SQL for the raw ones. Two copies of one rule is how the search review gate
#: ended up applied to a single query path out of five.
#:
#: The rule itself lives in `admin_filters.test_user_filter`, so this page and
#: /admin/stats cannot disagree about who counts.


def _staff_ids(db: Session) -> list[int]:
    """Ids whose activity must not appear in analytics."""
    return [r[0] for r in db.query(User.id).filter(test_user_filter()).all()]


#: Raw-SQL predicate. Pair it with `{"staff_ids": _staff_ids(db)}`.
_NOT_STAFF = "(user_id IS NULL OR NOT (user_id = ANY(:staff_ids)))"


def _exclude_staff(query, db: Session):
    """The ORM twin of :data:`_NOT_STAFF`."""
    return query.filter(
        or_(SearchLog.user_id.is_(None), SearchLog.user_id.notin_(_staff_ids(db)))
    )


def _compute_summary(start_dt: datetime, end_dt: datetime, db: Session) -> dict[str, Any]:
    """Run the four summary aggregates over the date range. Date filter
    uses raw ``created_at`` comparisons so any (created_at) index can be
    used by the planner."""
    summary_base = _exclude_staff(
        db.query(SearchLog).filter(
            SearchLog.created_at >= start_dt,
            SearchLog.created_at < end_dt,
        ),
        db,
    )

    # The five headline aggregates in ONE index scan / ONE round trip instead of
    # five. On a single-worker backend talking to Supabase, each avoided round
    # trip is real wall-clock — this endpoint was doing ~10 sequential queries,
    # wide enough that a deploy restart mid-request dropped the whole page.
    totals = db.execute(
        sa_text(
            "SELECT count(*) AS total, "
            "count(*) FILTER (WHERE results_count = 0) AS zero, "
            "count(*) FILTER (WHERE weak_match IS TRUE) AS weak, "
            # content_gap is jsonb: a real gap is an object; most rows store the
            # jsonb literal 'null' (NOT sql NULL), so IS NOT NULL over-counts.
            "count(*) FILTER (WHERE jsonb_typeof(content_gap) = 'object') AS gaps, "
            "avg(best_cosine) FILTER (WHERE best_cosine IS NOT NULL) AS avg_cos, "
            # The weak-rate denominator must be the SCOREABLE (vector) rows only.
            # Title/character pre-pass hits never set weak_match or best_cosine,
            # so counting them dilutes the rate (33.2% reported vs 41.9% real).
            "count(*) FILTER (WHERE best_cosine IS NOT NULL) AS scoreable, "
            "count(*) FILTER (WHERE match_strategy IN "
            "  ('title_exact','title_exact_backfilled','character_exact','character_exact_backfilled')"
            ") AS title_lookup, "
            # Silent-retry signal: the stored is_repeat flag (same user re-ran an
            # identical query within 10 min). Set at write time, backfilled once.
            "count(*) FILTER (WHERE is_repeat IS TRUE) AS repeats "
            "FROM search_logs WHERE created_at >= :start AND created_at < :end "
            "AND " + _NOT_STAFF
        ),
        {"start": start_dt, "end": end_dt, "staff_ids": _staff_ids(db)},
    ).fetchone()
    total_searches = int(totals[0] or 0)
    zero_results = int(totals[1] or 0)
    weak_matches = int(totals[2] or 0)
    content_gaps = int(totals[3] or 0)
    avg_cosine = totals[4]
    scoreable = int(totals[5] or 0)
    title_lookup_count = int(totals[6] or 0)
    repeat_count = int(totals[7] or 0)

    def _distribution(column):
        rows = (
            summary_base.with_entities(column.label("k"), func.count().label("cnt"))
            .filter(column.isnot(None))
            .group_by(column)
            .order_by(desc("cnt"))
            .all()
        )
        return [{"key": k, "count": c} for k, c in rows]

    by_match_strategy = _distribution(SearchLog.match_strategy)
    by_query_type = _distribution(SearchLog.query_type)

    # Retry signal (H-13): the same normalised query issued 3+ times by one user
    # inside a 30-min window — the strongest dissatisfaction indicator we have.
    # search_logs has no session_id, so a 30-min epoch bucket stands in for a
    # session. Raw SQL: the group-by-then-count-groups shape is awkward in ORM.
    retry = db.execute(
        sa_text(
            "SELECT count(*) AS events, count(DISTINCT user_id) AS users FROM ("
            "  SELECT user_id FROM search_logs"
            "  WHERE created_at >= :start AND created_at < :end AND user_id IS NOT NULL"
            "  AND " + _NOT_STAFF + " "
            "  GROUP BY user_id, lower(btrim(query)), floor(extract(epoch from created_at)/1800)"
            "  HAVING count(*) >= 3"
            ") r"
        ),
        {"start": start_dt, "end": end_dt, "staff_ids": _staff_ids(db)},
    ).fetchone()
    retry_events = int(retry[0] or 0) if retry else 0
    retry_users = int(retry[1] or 0) if retry else 0

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

    # Weak-but-not-empty queries: we returned *something* and it was bad. These
    # never show up in the zero-result list, so without them the "what's broken"
    # view misses the larger half of the failures.
    top_weak = (
        summary_base
        .filter(SearchLog.weak_match.is_(True), SearchLog.results_count > 0)
        .with_entities(
            func.lower(SearchLog.query).label("q"),
            func.count().label("cnt"),
            func.avg(SearchLog.best_cosine).label("avg_cos"),
        )
        .group_by(func.lower(SearchLog.query))
        .order_by(desc("cnt"))
        .limit(10)
        .all()
    )

    return {
        "total_searches": total_searches,
        "zero_result_count": zero_results,
        "weak_match_count": weak_matches,
        # Rate over SCOREABLE (vector) searches only — title/character lookups
        # can never be weak, so including them understated the true failure rate.
        "weak_match_rate": round(weak_matches / scoreable * 100, 1) if scoreable else 0.0,
        "scoreable_count": scoreable,
        "title_lookup_count": title_lookup_count,
        "content_gap_count": content_gaps,
        "avg_best_cosine": round(float(avg_cosine), 3) if avg_cosine is not None else None,
        "by_match_strategy": by_match_strategy,
        "by_query_type": by_query_type,
        "retry_events": retry_events,
        "retry_users": retry_users,
        "repeat_count": repeat_count,
        "repeat_rate": round(repeat_count / total_searches * 100, 1) if total_searches else 0.0,
        "top_queries": [{"query": q, "count": c} for q, c in top_queries],
        "top_zero_result_queries": [{"query": q, "count": c} for q, c in top_zero],
        "top_weak_queries": [
            {
                "query": q,
                "count": c,
                "avg_cosine": round(float(cos), 3) if cos is not None else None,
            }
            for q, c, cos in top_weak
        ],
    }


@router.get("/searches")
def get_search_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(25, le=100),
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    zero_only: bool = Query(False, description="Only show zero-result searches"),
    problem: Optional[str] = Query(
        None,
        description="Only failures of one kind: zero | weak | gap | repeat | any",
    ),
    user: Optional[str] = Query(None, description="Filter by user email (substring)"),
    source: Optional[str] = Query(None, description="Filter by source: search or demo"),
    q: Optional[str] = Query(None, description="Filter by query text"),
    db: Session = Depends(get_db),
    _mod: User = Depends(require_moderator),
) -> dict[str, Any]:
    """Paginated search logs only — summary stats moved to ``/searches/summary``
    so paginating doesn't re-compute heavy aggregates each time."""

    start_dt, end_dt = _date_range(from_date, to_date)

    base = db.query(SearchLog).filter(
        SearchLog.created_at >= start_dt,
        SearchLog.created_at < end_dt,
    )
    # The raw feed too. An explicit `user=` search is the one exception: asking
    # for a specific address by name should find it, staff or not, or the filter
    # becomes a thing you cannot debug your way past.
    if not user:
        base = _exclude_staff(base, db)

    if zero_only:
        base = base.filter(SearchLog.results_count == 0)
    if problem:
        # `content_gap` is jsonb — most rows hold the jsonb literal 'null', so a
        # plain IS NOT NULL matches everything. Same test as _compute_summary.
        gap_clause = sa_text("jsonb_typeof(search_logs.content_gap) = 'object'")
        clauses = {
            "zero": lambda qy: qy.filter(SearchLog.results_count == 0),
            "weak": lambda qy: qy.filter(SearchLog.weak_match.is_(True)),
            "gap": lambda qy: qy.filter(gap_clause),
            "repeat": lambda qy: qy.filter(SearchLog.is_repeat.is_(True)),
            "any": lambda qy: qy.filter(
                (SearchLog.results_count == 0)
                | (SearchLog.weak_match.is_(True))
                | (SearchLog.is_repeat.is_(True))
            ),
        }
        if problem not in clauses:
            raise HTTPException(
                status_code=400,
                detail="problem must be one of: zero, weak, gap, repeat, any",
            )
        base = clauses[problem](base)
    if user:
        # search_logs stores user_id only; resolve emails to ids up front so the
        # log query stays a plain indexed filter instead of a join per page.
        matching_ids = [
            row.id for row in db.query(User.id).filter(User.email.ilike(f"%{user}%")).all()
        ]
        if not matching_ids:
            return {"searches": [], "total": 0, "page": page, "limit": limit, "summary": None}
        base = base.filter(SearchLog.user_id.in_(matching_ids))
    if source:
        base = base.filter(SearchLog.source == source)
    if q:
        base = base.filter(SearchLog.query.ilike(f"%{q}%"))

    total = base.count()

    logs = (
        base.order_by(desc(SearchLog.created_at))
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    # Collect user emails for display
    user_ids = {log.user_id for log in logs if log.user_id}
    user_map: dict = {}
    if user_ids:
        users = db.query(User.id, User.email).filter(User.id.in_(user_ids)).all()
        user_map = {u.id: u.email for u in users}

    searches = [
        {
            "id": log.id,
            "query": log.query,
            "filters_used": log.filters_used,
            "results_count": log.results_count,
            "result_ids": log.result_ids,
            "user_email": user_map.get(log.user_id),
            "source": log.source,
            "weak_match": log.weak_match,
            "best_cosine": round(float(log.best_cosine), 3) if log.best_cosine is not None else None,
            "match_strategy": log.match_strategy,
            "query_type": log.query_type,
            "content_gap": log.content_gap,
            "is_repeat": log.is_repeat,
            "created_at": log.created_at.isoformat(),
        }
        for log in logs
    ]

    # Summary only on page 1 — paginating doesn't change the aggregate,
    # so we save four COUNT/GROUP BY scans per page-change.
    summary = _compute_summary(start_dt, end_dt, db) if page == 1 else None

    return {
        "searches": searches,
        "total": total,
        "page": page,
        "limit": limit,
        "summary": summary,
    }


@router.get("/searches/summary")
def get_search_logs_summary(
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    db: Session = Depends(get_db),
    _mod: User = Depends(require_moderator),
) -> dict[str, Any]:
    """Dedicated summary endpoint. Same payload as the embedded `summary`
    in `/searches?page=1` — frontend can call this directly when it wants
    fresh aggregates without re-fetching the paginated rows."""
    start_dt, end_dt = _date_range(from_date, to_date)
    return _compute_summary(start_dt, end_dt, db)


@router.get("/searches/by-user")
def get_searches_by_user(
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
    _mod: User = Depends(require_moderator),
) -> dict[str, Any]:
    """Per-actor search behaviour, busiest first.

    One row per user with how much they searched and how often it failed, so a
    struggling user is visible as a person rather than as scattered log rows.
    """
    start_dt, end_dt = _date_range(from_date, to_date)

    rows = db.execute(
        sa_text(
            "SELECT user_id, count(*) AS searches, "
            "count(*) FILTER (WHERE results_count = 0) AS zero, "
            "count(*) FILTER (WHERE weak_match IS TRUE) AS weak, "
            "count(*) FILTER (WHERE is_repeat IS TRUE) AS repeats, "
            "count(DISTINCT lower(btrim(query))) AS distinct_queries, "
            # One count, not zero+weak added together: 15 rows are BOTH, so
            # summing them double-counts and the UI showed 120% "went badly".
            "count(*) FILTER (WHERE results_count = 0 OR weak_match IS TRUE) AS bad, "
            "avg(best_cosine) FILTER (WHERE best_cosine IS NOT NULL) AS avg_cos, "
            "max(created_at) AS last_seen, min(created_at) AS first_seen "
            "FROM search_logs "
            "WHERE created_at >= :start AND created_at < :end AND user_id IS NOT NULL "
            "AND " + _NOT_STAFF + " "
            "GROUP BY user_id ORDER BY searches DESC LIMIT :limit"
        ),
        {"start": start_dt, "end": end_dt, "limit": limit,
         "staff_ids": _staff_ids(db)},
    ).mappings().all()   # by name: adding a column must not renumber the rest

    user_ids = [r["user_id"] for r in rows]
    user_map: dict = {}
    if user_ids:
        users = db.query(User.id, User.email).filter(User.id.in_(user_ids)).all()
        user_map = {u.id: u.email for u in users}

    # How many anonymous (logged-out / demo) searches we're not attributing —
    # otherwise the per-user numbers silently don't add up to the total.
    anon = db.execute(
        sa_text(
            "SELECT count(*) FROM search_logs WHERE created_at >= :start "
            "AND created_at < :end AND user_id IS NULL"
        ),
        {"start": start_dt, "end": end_dt, "staff_ids": _staff_ids(db)},
    ).scalar()

    return {
        "users": [
            {
                "user_id": r["user_id"],
                "email": user_map.get(r["user_id"]),
                "searches": int(r["searches"] or 0),
                "zero_results": int(r["zero"] or 0),
                "weak_matches": int(r["weak"] or 0),
                "repeats": int(r["repeats"] or 0),
                "distinct_queries": int(r["distinct_queries"] or 0),
                # zero OR weak, counted once. The UI used to add
                # zero_results + weak_matches and could exceed 100%.
                "bad_searches": int(r["bad"] or 0),
                "avg_best_cosine": (
                    round(float(r["avg_cos"]), 3) if r["avg_cos"] is not None else None
                ),
                "last_seen": r["last_seen"].isoformat() if r["last_seen"] else None,
                "first_seen": r["first_seen"].isoformat() if r["first_seen"] else None,
            }
            for r in rows
        ],
        "anonymous_searches": int(anon or 0),
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


# ── Content Requests ──────────────────────────────────────────────────────────


@router.get("/content-requests")
def get_content_requests(
    db: Session = Depends(get_db),
    _mod: User = Depends(require_moderator),
) -> dict[str, Any]:
    """All content requests, most-demanded first, freshest breaking the tie."""
    requests = (
        db.query(ContentRequest)
        .order_by(desc(ContentRequest.request_count), desc(ContentRequest.last_requested_at))
        .all()
    )
    return {"requests": [_serialize_request(r) for r in requests]}


VALID_STATUSES = ("requested", "planned", "added", "rejected")


def _serialize_request(r: ContentRequest) -> dict[str, Any]:
    return {
        "id": r.id,
        "play_title": r.play_title,
        "author": r.author,
        "character_name": r.character_name,
        "request_count": r.request_count,
        "first_requested_at": r.first_requested_at.isoformat(),
        "last_requested_at": r.last_requested_at.isoformat(),
        "status": r.status,
    }


class ContentRequestUpdate(BaseModel):
    """Every field optional — a status-only PATCH stays valid, which is what the
    old status dropdown sends."""

    play_title: Optional[str] = None
    author: Optional[str] = None
    character_name: Optional[str] = None
    status: Optional[str] = None


class ContentRequestCreate(BaseModel):
    play_title: str
    author: Optional[str] = None
    character_name: Optional[str] = None
    status: Optional[str] = None


def _clean(value: Optional[str]) -> Optional[str]:
    """Trim, and treat a cleared field as NULL rather than an empty string — the
    (play_title, author) unique index treats '' and NULL as different keys, so
    empty strings would quietly split what should be one row."""
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


@router.patch("/content-requests/{request_id}")
def update_content_request(
    request_id: int,
    body: ContentRequestUpdate,
    db: Session = Depends(get_db),
    _mod: User = Depends(require_moderator),
) -> dict[str, Any]:
    """Edit a content request: retitle it, fix the author, set a character, or
    move its status. Fields left out of the body are untouched."""
    req = db.query(ContentRequest).filter(ContentRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Content request not found")

    if body.status is not None:
        if body.status not in VALID_STATUSES:
            raise HTTPException(
                status_code=400,
                detail=f"Status must be one of: {', '.join(VALID_STATUSES)}",
            )
        req.status = body.status

    if body.play_title is not None:
        title = _clean(body.play_title)
        if not title:
            raise HTTPException(status_code=400, detail="Title cannot be empty")
        req.play_title = title

    if body.author is not None:
        req.author = _clean(body.author)

    if body.character_name is not None:
        req.character_name = _clean(body.character_name)

    # Renaming can collide with the unique (play_title, author) index — which is
    # exactly what happens when you fix a typo'd duplicate into its real title.
    # Fold the two rows together instead of 500ing on the constraint.
    if body.play_title is not None or body.author is not None:
        twin = (
            db.query(ContentRequest)
            .filter(
                ContentRequest.id != req.id,
                func.lower(ContentRequest.play_title) == req.play_title.lower(),
                func.lower(func.coalesce(ContentRequest.author, ""))
                == (req.author or "").lower(),
            )
            .first()
        )
        if twin:
            twin.request_count += req.request_count
            twin.last_requested_at = max(twin.last_requested_at, req.last_requested_at)
            twin.first_requested_at = min(twin.first_requested_at, req.first_requested_at)
            if body.status is not None:
                twin.status = req.status
            if req.character_name and not twin.character_name:
                twin.character_name = req.character_name
            db.delete(req)
            db.commit()
            return {"status": "ok", "merged_into": twin.id, "request": _serialize_request(twin)}

    db.commit()
    db.refresh(req)
    return {"status": "ok", "request": _serialize_request(req)}


@router.delete("/content-requests/{request_id}")
def delete_content_request(
    request_id: int,
    db: Session = Depends(get_db),
    _mod: User = Depends(require_moderator),
) -> dict[str, str]:
    """Drop a request outright — for junk entries like a stray keyboard mash."""
    req = db.query(ContentRequest).filter(ContentRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Content request not found")
    db.delete(req)
    db.commit()
    return {"status": "ok"}


@router.post("/content-requests")
def create_content_request(
    body: ContentRequestCreate,
    db: Session = Depends(get_db),
    _mod: User = Depends(require_moderator),
) -> dict[str, Any]:
    """Add a request by hand — used by the 'track this' action on a failed
    search, so a content gap spotted in the logs becomes a tracked row without
    retyping it. Reuses the same (title, author) dedupe as the user-facing path,
    so tracking a query users already requested bumps the existing row."""
    title = _clean(body.play_title)
    if not title:
        raise HTTPException(status_code=400, detail="Title cannot be empty")
    if body.status is not None and body.status not in VALID_STATUSES:
        raise HTTPException(
            status_code=400, detail=f"Status must be one of: {', '.join(VALID_STATUSES)}"
        )

    author = _clean(body.author)
    existing = (
        db.query(ContentRequest)
        .filter(
            func.lower(ContentRequest.play_title) == title.lower(),
            func.lower(func.coalesce(ContentRequest.author, "")) == (author or "").lower(),
        )
        .first()
    )
    if existing:
        existing.request_count += 1
        existing.last_requested_at = datetime.utcnow()
        if body.status:
            existing.status = body.status
        db.commit()
        db.refresh(existing)
        return {"status": "ok", "created": False, "request": _serialize_request(existing)}

    row = ContentRequest(
        play_title=title,
        author=author,
        character_name=_clean(body.character_name),
        status=body.status or "requested",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"status": "ok", "created": True, "request": _serialize_request(row)}
