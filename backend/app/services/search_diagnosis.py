"""Why a search failed: missing content, or a search that could not find it.

The admin page used to report five overlapping counts (zero, weak, repeat, gap,
wrong_tab) and none of them answered the only question that changes what gets
done next. Measured over the 30 days to 2026-09-20, the answer was 66% content
we do not hold and 34% pieces we do.

The judgement runs the SAME detection the live search runs, never a second rule
written for this page. That makes it accurate by construction -- if search
cannot find it, neither can this -- and it makes the have-it list self-cleaning:
"kill bill" left that list the moment the subtitle-head fix shipped, with
nothing to run and nothing to remember.
"""

from collections import Counter
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from app.models.search_log import SearchLog
from app.models.user import User
from app.services.admin_filters import test_user_filter
from sqlalchemy import or_
from sqlalchemy.orm import Session

#: What a failed search is blamed on.
HAVE_IT = "have_it"
MISSING = "missing"

#: How many of the most-asked queries the funnel shows under it.
MOST_ASKED_LIMIT = 8


def classify_query(db: Session, query: str) -> Tuple[str, Optional[str]]:
    """(verdict, what it resolves to) for one failed search.

    Anything that cannot be judged counts as MISSING. The costs are not
    symmetric: overstating a content gap puts a name on a scrape list, while
    understating one hides a real search bug behind a content excuse.
    """
    if not query or not query.strip():
        return MISSING, None

    # Imported here rather than at module scope: title_lookup pulls in the
    # search stack, and the admin API should not pay that at import time.
    from app.services.search.title_lookup import (detect_catalogue_character,
                                                  detect_catalogue_title)

    # ONLY the two pre-passes that actually retrieve. `term_is_in_catalogue`
    # was here and answers a different question -- whether a word appears
    # anywhere in the catalogue, which grounding uses to judge whether a query
    # is servable at all. The library holds a character named "War" (one piece,
    # in Numantia), so "war" was landing on the "search to fix" list, claiming
    # search should have surfaced a speech nobody asking about war wants. Same
    # for "clifford" via H. Clifford McBride in Ad Astra.
    try:
        hit = detect_catalogue_title(db, query)
        if hit:
            return HAVE_IT, hit["title"]

        character = detect_catalogue_character(db, query)
        if character:
            return HAVE_IT, str(character.get("character") or "").strip() or None
    except Exception:
        return MISSING, None

    return MISSING, None


def _real_search_rows(db: Session, start: datetime, end: datetime):
    """Every search in the window that a real actor ran.

    Staff are excluded through the same rule as every other admin number, and
    anonymous rows are kept: `user_id IS NULL` is a logged-out actor.
    """
    staff = [r[0] for r in db.query(User.id).filter(test_user_filter()).all()]
    q = db.query(
        SearchLog.query, SearchLog.results_count, SearchLog.weak_match
    ).filter(SearchLog.created_at >= start, SearchLog.created_at < end)
    if staff:
        q = q.filter(
            or_(SearchLog.user_id.is_(None), SearchLog.user_id.notin_(staff))
        )
    return q.all()


def diagnose_window(db: Session, start: datetime, end: datetime) -> Dict[str, Any]:
    """The funnel: how many searches, how many came up short, and why.

    `short` is one count over `results_count = 0 OR weak_match`, never the sum
    of the two. A search can be both -- 15 rows in production are -- and adding
    them is how the old page reported 382 when the answer was 347.

    Classification runs over DISTINCT failing queries rather than every row, so
    the work is bounded by vocabulary instead of traffic.
    """
    rows = _real_search_rows(db, start, end)
    total = len(rows)

    asked: Counter = Counter()
    failed: Counter = Counter()
    for query, results_count, weak in rows:
        text = (query or "").strip()
        if not text:
            continue
        asked[text.lower()] += 1
        if (results_count or 0) == 0 or bool(weak):
            failed[text.lower()] += 1

    short = sum(failed.values())

    have_queries: List[Dict[str, Any]] = []
    missing_queries: List[Dict[str, Any]] = []
    have_searches = missing_searches = 0
    for text, count in failed.most_common():
        verdict, resolves_to = classify_query(db, text)
        row: Dict[str, Any] = {"query": text, "count": count}
        if verdict == HAVE_IT:
            row["resolves_to"] = resolves_to
            have_queries.append(row)
            have_searches += count
        else:
            missing_queries.append(row)
            missing_searches += count

    return {
        "total": total,
        "found": total - short,
        "short": short,
        "have_it": {"searches": have_searches, "queries": have_queries},
        "missing": {"searches": missing_searches, "queries": missing_queries},
        "most_asked": [
            {"query": q, "count": c} for q, c in asked.most_common(MOST_ASKED_LIMIT)
        ],
    }
