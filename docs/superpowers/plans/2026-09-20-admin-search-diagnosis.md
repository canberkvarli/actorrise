# Admin Search Diagnosis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace five overlapping stat tiles and four tabs with one funnel that splits every failed search into "we don't have it" and "we have it, search missed it".

**Architecture:** A classifier runs the same detection the live search runs, so the have-it list self-cleans when a search bug is fixed. One new endpoint serves the funnel; the nav badge narrows to the actionable side only.

**Tech Stack:** FastAPI + SQLAlchemy + Postgres, Next.js App Router + TanStack Query + Tailwind, pytest on the backend (`.venv/bin/python -m pytest`), vitest on the frontend.

**Spec:** `docs/superpowers/specs/2026-09-20-admin-search-diagnosis-design.md`

---

## Before you start

The backend venv has **no pip**. To add a package: `uv pip install --python .venv/bin/python <pkg>`.
The full backend suite is `cd backend && .venv/bin/python -m pytest tests/ -q` — 1,596 tests, about 5 seconds.
Frontend tests are pure-logic only; there is no DOM environment, so no component rendering tests.

## File structure

**Create:**
- `backend/app/services/search_diagnosis.py` — classify one query, and aggregate a window. No HTTP, no formatting.
- `backend/tests/test_search_diagnosis.py`
- `components/admin/searches/DiagnosisTab.tsx` — the funnel and the two lists.
- `components/admin/searches/Funnel.tsx` — the bars only, so the tab stays readable.
- `lib/searchDiagnosis.ts` — percentage maths and filter building. Pure.
- `lib/searchDiagnosis.test.ts`

**Modify:**
- `backend/app/api/admin/searches.py` — add the endpoint.
- `backend/app/api/admin/pulse.py` — narrow the badge.
- `backend/tests/test_admin_pulse.py` — badge test.
- `app/(platform)/admin/searches/page.tsx` — four tabs to two.
- `components/admin/searches/shared.tsx` — add the response type.

**Delete:** `components/admin/searches/ProblemsTab.tsx`, `DemandTab.tsx`, `PeopleTab.tsx`.

The classifier is its own module rather than living in `searches.py` (900 lines already) because the badge in `pulse.py` needs it too, and two callers sharing a rule is the whole point.

---

## Task 1: Classify one query

**Files:**
- Create: `backend/app/services/search_diagnosis.py`
- Create: `backend/tests/test_search_diagnosis.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_search_diagnosis.py`:

```python
"""Classifying a failed search: do we hold the piece, or not?

This is the only split on the diagnosis page, so the cost of getting it wrong is
asymmetric. Saying "we don't have it" about something we do costs a name on a
scrape list. Saying "we have it" about something we do not hides a real search
bug behind a content excuse. So anything the classifier cannot judge counts as
missing.
"""

import pytest

from app.services.search_diagnosis import classify_query


class FakeDB:
    """The detection under test is pure Python over a cached catalogue."""

    def __init__(self, titles=(), characters=()):
        self.titles = list(titles)
        self.characters = list(characters)
        self.calls = 0

    def execute(self, stmt, params=None):
        self.calls += 1
        self._last = str(stmt)
        return self

    def fetchall(self):
        # The catalogue loader asks for titles; the character loader asks for
        # character names. Both arrive here; tell them apart by the SQL.
        if "character_name" in self._last:
            return list(self.characters)
        return list(self.titles)


@pytest.fixture(autouse=True)
def _fresh_cache():
    from app.services.search.title_lookup import reset_catalogue_cache
    reset_catalogue_cache()
    yield
    reset_catalogue_cache()


def test_a_title_we_hold_is_have_it():
    db = FakeDB(titles=[("Mean Girls", "film")])
    verdict, resolves_to = classify_query(db, "mean girls")
    assert verdict == "have_it"
    assert resolves_to == "Mean Girls"


def test_a_subtitled_title_we_hold_is_have_it():
    db = FakeDB(titles=[("Ivanoff: A Play", "play")])
    verdict, resolves_to = classify_query(db, "ivanoff")
    assert verdict == "have_it"
    assert resolves_to == "Ivanoff: A Play"


def test_a_query_naming_nothing_is_missing():
    db = FakeDB(titles=[("Mean Girls", "film")])
    assert classify_query(db, "fantasy setting") == ("missing", None)


def test_an_unjudgeable_query_falls_to_missing():
    """A failed catalogue load must not be read as 'we have it'."""

    class BrokenDB:
        def execute(self, *a, **k):
            raise RuntimeError("database is down")

    assert classify_query(BrokenDB(), "mean girls") == ("missing", None)


def test_an_empty_query_is_missing():
    assert classify_query(FakeDB(), "   ") == ("missing", None)
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd backend && .venv/bin/python -m pytest tests/test_search_diagnosis.py -q
```

Expected: `ModuleNotFoundError: No module named 'app.services.search_diagnosis'`

- [ ] **Step 3: Write the classifier**

Create `backend/app/services/search_diagnosis.py`:

```python
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

from typing import Optional, Tuple

from sqlalchemy.orm import Session

#: What a failed search is blamed on.
HAVE_IT = "have_it"
MISSING = "missing"


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
                                                  detect_catalogue_title,
                                                  term_is_in_catalogue)

    try:
        hit = detect_catalogue_title(db, query)
        if hit:
            return HAVE_IT, hit["title"]

        character = detect_catalogue_character(db, query)
        if character:
            return HAVE_IT, str(character.get("character") or "").strip() or None

        if term_is_in_catalogue(db, query):
            return HAVE_IT, None
    except Exception:
        return MISSING, None

    return MISSING, None
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
cd backend && .venv/bin/python -m pytest tests/test_search_diagnosis.py -q
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/search_diagnosis.py backend/tests/test_search_diagnosis.py
git commit -m "Judge a failed search with the same detection search uses

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Aggregate a window into the funnel

**Files:**
- Modify: `backend/app/services/search_diagnosis.py`
- Modify: `backend/tests/test_search_diagnosis.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_search_diagnosis.py`:

```python
from datetime import datetime, timedelta, timezone

from app.models.actor import FilmTvReference, Monologue, Play
from app.models.organization import Organization
from app.models.search_log import SearchLog
from app.models.user import User
from app.services.search_diagnosis import diagnose_window
from tests.dbfixture import memory_db, restore


class TestDiagnoseWindow:
    def setup_method(self):
        self.db, self.saved = memory_db(
            [Organization, User, FilmTvReference, Play, Monologue, SearchLog]
        )
        self.actor = User(email="actor@gmail.com", hashed_password="x")
        self.staff = User(email="canberkvarli@gmail.com", hashed_password="x")
        self.db.add_all([self.actor, self.staff])
        self.db.commit()
        self.start = datetime(2026, 9, 1, tzinfo=timezone.utc)
        self.end = datetime(2026, 10, 1, tzinfo=timezone.utc)
        self.when = self.start + timedelta(days=1)

    def teardown_method(self):
        self.db.close()
        restore(self.saved)

    def _log(self, query, *, results=20, weak=False, user=None):
        self.db.add(
            SearchLog(
                query=query, results_count=results, weak_match=weak,
                user_id=user.id if user else None, created_at=self.when,
            )
        )
        self.db.commit()

    def test_found_and_short_sum_to_total(self):
        self._log("hamlet", results=20, weak=False, user=self.actor)
        self._log("lila", results=0, weak=True, user=self.actor)
        out = diagnose_window(self.db, self.start, self.end)
        assert out["total"] == 2
        assert out["found"] + out["short"] == out["total"]
        assert out["short"] == 1

    def test_a_row_that_is_both_zero_and_weak_counts_once(self):
        """15 rows in prod are both. Adding zero + weak double-counts them."""
        self._log("tech bro", results=0, weak=True, user=self.actor)
        assert diagnose_window(self.db, self.start, self.end)["short"] == 1

    def test_staff_searches_are_excluded(self):
        self._log("my own test", results=0, weak=True, user=self.staff)
        assert diagnose_window(self.db, self.start, self.end)["total"] == 0

    def test_anonymous_searches_are_counted(self):
        """A logged-out actor is a real actor."""
        self._log("crazy birds", results=0, weak=True, user=None)
        assert diagnose_window(self.db, self.start, self.end)["total"] == 1

    def test_failures_split_into_the_two_lists(self):
        self._log("lila", results=0, weak=True, user=self.actor)
        self._log("lila", results=0, weak=True, user=self.actor)
        out = diagnose_window(self.db, self.start, self.end)
        assert out["missing"]["searches"] == 2
        assert out["missing"]["queries"][0]["query"] == "lila"
        assert out["missing"]["queries"][0]["count"] == 2
        assert out["have_it"]["searches"] == 0

    def test_most_asked_counts_every_search_not_only_failures(self):
        for _ in range(3):
            self._log("comedic monologue", results=20, weak=False, user=self.actor)
        out = diagnose_window(self.db, self.start, self.end)
        assert out["most_asked"][0] == {"query": "comedic monologue", "count": 3}

    def test_an_empty_window_does_not_divide_by_zero(self):
        out = diagnose_window(self.db, self.start, self.end)
        assert out["total"] == 0 and out["short"] == 0
        assert out["missing"]["queries"] == []
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd backend && .venv/bin/python -m pytest tests/test_search_diagnosis.py::TestDiagnoseWindow -q
```

Expected: `ImportError: cannot import name 'diagnose_window'`

- [ ] **Step 3: Write the aggregator**

Append the code below to `backend/app/services/search_diagnosis.py`, but **move
its import block up to join the ones already at the top of the file** rather
than leaving a second import block halfway down.

```python
from collections import Counter
from datetime import datetime
from typing import Any, Dict, List

from app.models.search_log import SearchLog
from app.models.user import User
from app.services.admin_filters import test_user_filter
from sqlalchemy import func, or_

#: How many of the most-asked queries the funnel shows under it.
MOST_ASKED_LIMIT = 8


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

    asked = Counter()
    failed = Counter()
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
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
cd backend && .venv/bin/python -m pytest tests/test_search_diagnosis.py -q
```

Expected: 12 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/search_diagnosis.py backend/tests/test_search_diagnosis.py
git commit -m "One funnel whose numbers add up

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Serve it

**Files:**
- Modify: `backend/app/api/admin/searches.py` (after `get_search_logs_summary`, around line 372)
- Modify: `backend/tests/test_search_diagnosis.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_search_diagnosis.py`:

```python
def test_the_endpoint_returns_the_whole_funnel():
    from app.api.admin.searches import get_search_diagnosis

    db, saved = memory_db(
        [Organization, User, FilmTvReference, Play, Monologue, SearchLog]
    )
    try:
        mod = User(email="mod@actorrise.com", hashed_password="x")
        db.add(mod)
        db.commit()
        out = get_search_diagnosis(from_date=None, to_date=None, db=db, _mod=mod)
        assert set(out) == {
            "total", "found", "short", "have_it", "missing",
            "most_asked", "struggling_actors",
        }
    finally:
        db.close()
        restore(saved)
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd backend && .venv/bin/python -m pytest tests/test_search_diagnosis.py::test_the_endpoint_returns_the_whole_funnel -q
```

Expected: `ImportError: cannot import name 'get_search_diagnosis'`

- [ ] **Step 3: Add the endpoint**

In `backend/app/api/admin/searches.py`, add the import near the other service imports at the top:

```python
from app.services.search_diagnosis import diagnose_window
```

Then add this immediately after `get_search_logs_summary`:

```python
@router.get("/searches/diagnosis")
def get_search_diagnosis(
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    db: Session = Depends(get_db),
    _mod: User = Depends(require_moderator),
) -> dict[str, Any]:
    """The funnel behind the Diagnosis tab.

    Everything the page needs in one call: how many searches, how many came up
    short, and the two lists that split them. Fetched once when the page opens,
    which is why the full classification lives here and not in `/pulse` -- that
    one is polled every 60 seconds by every open admin tab.
    """
    start_dt, end_dt = _date_range(from_date, to_date)
    out = diagnose_window(db, start_dt, end_dt)
    out["struggling_actors"] = _struggling_actor_count(db, start_dt, end_dt)
    return out


def _struggling_actor_count(db: Session, start: datetime, end: datetime) -> int:
    """Actors who searched three or more times and mostly came up short.

    The whole of the retired People tab worth keeping. A ranked table of every
    actor is browsing; knowing which ones are quietly failing is something to
    act on before they go quiet.
    """
    rows = (
        db.query(
            SearchLog.user_id,
            func.count(SearchLog.id).label("n"),
            func.count(SearchLog.id)
            .filter(or_(SearchLog.results_count == 0, SearchLog.weak_match.is_(True)))
            .label("bad"),
        )
        .filter(
            SearchLog.created_at >= start,
            SearchLog.created_at < end,
            SearchLog.user_id.isnot(None),
            SearchLog.user_id.notin_(_test_user_ids(db)),
        )
        .group_by(SearchLog.user_id)
        .having(func.count(SearchLog.id) >= 3)
        .all()
    )
    return sum(1 for _uid, n, bad in rows if bad * 2 > n)
```

`_test_user_ids` already exists in this file (around line 52) and returns the
staff ids; do not write a second one.

- [ ] **Step 4: Run the tests and watch them pass**

```bash
cd backend && .venv/bin/python -m pytest tests/test_search_diagnosis.py -q
```

Expected: 13 passed.

- [ ] **Step 5: Confirm the route is registered**

```bash
cd backend && .venv/bin/python -c "from app.main import app; print([r.path for r in app.routes if 'diagnosis' in r.path])"
```

Expected: `['/api/admin/searches/diagnosis']`

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/admin/searches.py backend/tests/test_search_diagnosis.py
git commit -m "Serve the funnel in one call

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Narrow the badge to what you can act on

**Files:**
- Modify: `backend/app/api/admin/pulse.py`
- Modify: `backend/tests/test_admin_pulse.py`

- [ ] **Step 1: Write the failing test**

In `backend/tests/test_admin_pulse.py`, add to `UnseenCountTests`:

```python
    def test_only_failures_we_could_have_answered_badge(self):
        """A content gap is a backlog, not an event. Badging it is how a badge
        stops meaning anything -- the Search badge read 99+.

        The cache reset is load-bearing: the catalogue is module-level state, so
        a catalogue loaded by an earlier test would leak in here and make
        "hamlet" resolve, and the test would pass or fail on run order.
        """
        from app.services.search.title_lookup import reset_catalogue_cache
        reset_catalogue_cache()
        self.addCleanup(reset_catalogue_cache)

        self.db.add_all([
            SearchLog(query="fantasy setting", results_count=0, weak_match=True,
                      user_id=self.actor.id, created_at=self.after),
            SearchLog(query="hamlet", results_count=0, weak_match=True,
                      user_id=self.actor.id, created_at=self.after),
        ])
        self.db.commit()
        # Neither title is in this fixture's catalogue, so both classify as
        # missing and neither badges.
        self.assertEqual(unseen_bad_searches(self.db, self.cutoff), 0)
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd backend && .venv/bin/python -m pytest tests/test_admin_pulse.py -q
```

Expected: FAIL, `2 != 0` — every failure still badges.

- [ ] **Step 3: Narrow the count**

In `backend/app/api/admin/pulse.py`, replace the body of `unseen_bad_searches`
after the staff filter with:

```python
    rows = q.with_entities(SearchLog.query).all()
    # Only failures we could have answered. A content gap is a backlog, not an
    # event, and badging one is how the Search badge came to read 99+.
    #
    # Classifies ONLY the queries newer than `since` -- a handful. This endpoint
    # is polled every 60 seconds by every open admin tab, so the full pass
    # belongs to /searches/diagnosis, which is fetched when the page opens.
    seen: dict[str, bool] = {}
    actionable = 0
    for (text,) in rows:
        key = (text or "").strip().lower()
        if not key:
            continue
        if key not in seen:
            verdict, _ = classify_query(db, key)
            seen[key] = verdict == HAVE_IT
        if seen[key]:
            actionable += 1
    return actionable
```

Change the query that feeds it from a `count` to a row select, and add the
import at the top of the file:

```python
from app.services.search_diagnosis import HAVE_IT, classify_query
```

The full function reads:

```python
def unseen_bad_searches(db: Session, since: datetime) -> int:
    """Searches since `since` that failed AND that we could have answered.

    The predicate mirrors the raw SQL in `admin/searches.py::_compute_summary`
    ("results_count = 0 OR weak_match IS TRUE"). One count, not zero plus weak
    added together: rows that are both must be counted once.

    `user_id IS NULL` is an anonymous search -- a real logged-out actor, counted.
    """
    staff = _staff_ids(db)
    q = db.query(SearchLog.query).filter(
        SearchLog.created_at > since,
        or_(SearchLog.results_count == 0, SearchLog.weak_match.is_(True)),
    )
    if staff:
        q = q.filter(or_(SearchLog.user_id.is_(None), SearchLog.user_id.notin_(staff)))

    rows = q.all()
    seen: dict[str, bool] = {}
    actionable = 0
    for (text,) in rows:
        key = (text or "").strip().lower()
        if not key:
            continue
        if key not in seen:
            verdict, _ = classify_query(db, key)
            seen[key] = verdict == HAVE_IT
        if seen[key]:
            actionable += 1
    return actionable
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
cd backend && .venv/bin/python -m pytest tests/test_admin_pulse.py -q
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/admin/pulse.py backend/tests/test_admin_pulse.py
git commit -m "Badge only the searches you can act on

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: The funnel maths, where a test can reach it

**Files:**
- Create: `lib/searchDiagnosis.ts`
- Create: `lib/searchDiagnosis.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/searchDiagnosis.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { funnelBars, queryFilter, type Diagnosis } from "./searchDiagnosis";

const D: Diagnosis = {
  total: 1250,
  found: 903,
  short: 347,
  have_it: { searches: 71, queries: [{ query: "potter", count: 2 }] },
  missing: { searches: 138, queries: [{ query: "lila", count: 5 }] },
  most_asked: [{ query: "comedic monologue", count: 23 }],
  struggling_actors: 14,
};

describe("funnelBars", () => {
  it("gives each bar its share of the total", () => {
    const [found, short] = funnelBars(D);
    expect(found.pct).toBe(72);
    expect(short.pct).toBe(28);
  });

  it("bars sum to 100 so the picture cannot lie", () => {
    const [found, short] = funnelBars(D);
    expect(found.pct + short.pct).toBe(100);
  });

  it("survives an empty window instead of dividing by zero", () => {
    const empty = { ...D, total: 0, found: 0, short: 0 };
    const [found, short] = funnelBars(empty);
    expect(found.pct).toBe(0);
    expect(short.pct).toBe(0);
  });
});

describe("queryFilter", () => {
  it("builds a filter that opens the searches behind one query", () => {
    expect(queryFilter("lila")).toEqual({
      q: "lila",
      source: "all",
      problem: "any",
      user: "",
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run lib/searchDiagnosis.test.ts
```

Expected: `Cannot find module './searchDiagnosis'`

- [ ] **Step 3: Write the module**

Create `lib/searchDiagnosis.ts`:

```ts
export type DiagnosisQuery = {
  query: string;
  count: number;
  resolves_to?: string | null;
};

export type Diagnosis = {
  total: number;
  found: number;
  short: number;
  have_it: { searches: number; queries: DiagnosisQuery[] };
  missing: { searches: number; queries: DiagnosisQuery[] };
  most_asked: { query: string; count: number }[];
  struggling_actors: number;
};

export type FunnelBar = { label: string; value: number; pct: number };

/**
 * The two bars, each as a share of the total.
 *
 * Rounded so they sum to exactly 100: the point of the funnel is that its
 * numbers add up, and two independently rounded halves showing 71 + 28 would
 * undo that on the one screen built to fix it.
 */
export function funnelBars(d: Diagnosis): [FunnelBar, FunnelBar] {
  if (!d.total) {
    return [
      { label: "found something", value: 0, pct: 0 },
      { label: "came up short", value: 0, pct: 0 },
    ];
  }
  const foundPct = Math.round((d.found / d.total) * 100);
  return [
    { label: "found something", value: d.found, pct: foundPct },
    { label: "came up short", value: d.short, pct: 100 - foundPct },
  ];
}

/** Open the raw feed at the searches behind one query. */
export function queryFilter(query: string) {
  return { q: query, source: "all" as const, problem: "any" as const, user: "" };
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run lib/searchDiagnosis.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/searchDiagnosis.ts lib/searchDiagnosis.test.ts
git commit -m "Funnel maths that sums to 100

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: The funnel bars

**Files:**
- Create: `components/admin/searches/Funnel.tsx`

- [ ] **Step 1: Write the component**

Create `components/admin/searches/Funnel.tsx`:

```tsx
"use client";

import { BRAND } from "./shared";
import { funnelBars, type Diagnosis } from "@/lib/searchDiagnosis";

/**
 * Two bars and a total. No charting library: this is a div with a width.
 *
 * It replaces five stat tiles that counted the same searches five different
 * ways -- zero, weak, repeat, gap and wrong_tab all overlap, so none of them
 * added up to any other, and the headline above them reported 382 by adding 33
 * empty to 349 poor when a search can be both.
 */
export function Funnel({ d }: { d: Diagnosis }) {
  const [found, short] = funnelBars(d);

  return (
    <section className="space-y-3">
      <p className="text-sm text-muted-foreground">
        <strong className="tabular-nums text-foreground">
          {d.total.toLocaleString()}
        </strong>{" "}
        searches · last 30 days
      </p>

      {[found, short].map((bar, i) => (
        <div key={bar.label} className="flex items-center gap-3">
          <div className="h-6 flex-1 bg-muted/40">
            <div
              className="h-full transition-[width] duration-500"
              style={{
                width: `${bar.pct}%`,
                backgroundColor: i === 0 ? "var(--muted-foreground)" : BRAND,
              }}
            />
          </div>
          <p className="w-52 shrink-0 text-sm tabular-nums">
            <strong>{bar.value.toLocaleString()}</strong>{" "}
            <span className="text-muted-foreground">
              {bar.label} · {bar.pct}%
            </span>
          </p>
        </div>
      ))}
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit 2>&1 | grep -v "^\.next/"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add components/admin/searches/Funnel.tsx
git commit -m "The funnel is a div with a width

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: The Diagnosis tab

**Files:**
- Create: `components/admin/searches/DiagnosisTab.tsx`

- [ ] **Step 1: Write the component**

Create `components/admin/searches/DiagnosisTab.tsx`:

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";

import api from "@/lib/api";
import { queryFilter, type Diagnosis, type DiagnosisQuery } from "@/lib/searchDiagnosis";
import { Funnel } from "./Funnel";
import { useTrackQuery } from "./useTrackQuery";
import { BRAND, type LogFilters } from "./shared";

/**
 * One funnel, then the only split that changes what gets done next: content we
 * do not hold, against pieces we do that search could not find.
 *
 * The have-it side self-cleans. It is judged by the same detection the live
 * search runs, so "kill bill" left this list the moment the subtitle-head fix
 * shipped, with nothing to run and nothing to remember.
 */
export function DiagnosisTab({ onDrillIntoQuery }: { onDrillIntoQuery: (f: LogFilters) => void }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-search-diagnosis"],
    queryFn: async () => {
      const res = await api.get<Diagnosis>("/api/admin/searches/diagnosis");
      return res.data;
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return <p className="py-10 text-center text-muted-foreground">Reading the logs…</p>;
  }
  if (isError || !data) {
    return (
      <p className="py-10 text-center text-muted-foreground">
        Couldn&apos;t read the logs just now. Refresh to try again.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <Funnel d={data} />

      <div className="grid gap-6 lg:grid-cols-2">
        <QueryColumn
          heading="We don't have it"
          subheading="content to add"
          searches={data.missing.searches}
          queries={data.missing.queries}
          onOpen={(q) => onDrillIntoQuery(queryFilter(q))}
          trackable
        />
        <QueryColumn
          heading="We have it"
          subheading="search to fix"
          searches={data.have_it.searches}
          queries={data.have_it.queries}
          onOpen={(q) => onDrillIntoQuery(queryFilter(q))}
        />
      </div>

      <div className="space-y-1 border-t border-border/40 pt-4 text-sm text-muted-foreground">
        <p>
          Asked for most:{" "}
          {data.most_asked.map((m, i) => (
            <span key={m.query}>
              {i > 0 && " · "}
              <button
                type="button"
                className="underline-offset-2 hover:underline"
                onClick={() => onDrillIntoQuery(queryFilter(m.query))}
              >
                {m.query}
              </button>{" "}
              <span className="tabular-nums">{m.count}</span>
            </span>
          ))}
        </p>
        {data.struggling_actors > 0 && (
          <p>
            <strong className="tabular-nums text-foreground">
              {data.struggling_actors}
            </strong>{" "}
            actors searched three or more times and mostly came up short.
          </p>
        )}
      </div>
    </div>
  );
}

function QueryColumn({
  heading,
  subheading,
  searches,
  queries,
  onOpen,
  trackable = false,
}: {
  heading: string;
  subheading: string;
  searches: number;
  queries: DiagnosisQuery[];
  onOpen: (query: string) => void;
  trackable?: boolean;
}) {
  const track = useTrackQuery();

  return (
    <section>
      <header className="mb-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.14em]">{heading}</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          <strong className="tabular-nums" style={{ color: BRAND }}>
            {searches.toLocaleString()}
          </strong>{" "}
          searches · {subheading}
        </p>
      </header>

      {queries.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">Nothing here.</p>
      ) : (
        <ul className="space-y-1">
          {queries.slice(0, 12).map((q) => (
            <li key={q.query} className="flex items-baseline gap-3 text-sm">
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left underline-offset-2 hover:underline"
                onClick={() => onOpen(q.query)}
                title={q.resolves_to ? `we hold: ${q.resolves_to}` : undefined}
              >
                {q.query}
              </button>
              <span className="tabular-nums text-muted-foreground">{q.count}</span>
              {trackable && (
                <button
                  type="button"
                  className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:underline"
                  onClick={() => track.mutate(q.query)}
                >
                  track
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit 2>&1 | grep -v "^\.next/"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add components/admin/searches/DiagnosisTab.tsx
git commit -m "Two lists, and the one question worth asking

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Four tabs become two

**Files:**
- Modify: `app/(platform)/admin/searches/page.tsx`
- Delete: `components/admin/searches/ProblemsTab.tsx`, `DemandTab.tsx`, `PeopleTab.tsx`

- [ ] **Step 1: Rewrite the tab list and the bodies**

In `app/(platform)/admin/searches/page.tsx`:

Replace the three tab imports:

```tsx
import { DemandTab } from "@/components/admin/searches/DemandTab";
import { PeopleTab } from "@/components/admin/searches/PeopleTab";
import { ProblemsTab } from "@/components/admin/searches/ProblemsTab";
```

with:

```tsx
import { DiagnosisTab } from "@/components/admin/searches/DiagnosisTab";
```

Replace `TABS` with:

```tsx
const TABS = [
  { id: "diagnosis", label: "Diagnosis", hint: "What's failing, and whose fault it is" },
  { id: "searches", label: "Searches", hint: "Every search, filterable" },
] as const;
```

Change the default tab:

```tsx
  const [tab, setTab] = useState<TabId>("diagnosis");
```

Replace the four render lines with:

```tsx
      {tab === "diagnosis" && (
        <DiagnosisTab
          onDrillIntoQuery={(next) => {
            setFilters(next);
            setTab("searches");
          }}
        />
      )}
```

The existing `recent` body becomes the `searches` body — change its condition
from `tab === "recent"` to `tab === "searches"` and leave everything inside it
as it is.

Delete the now-unused `drillInto` helper if nothing else calls it; `tsc` will
tell you.

- [ ] **Step 2: Delete the retired tabs**

```bash
git rm components/admin/searches/ProblemsTab.tsx \
       components/admin/searches/DemandTab.tsx \
       components/admin/searches/PeopleTab.tsx
```

- [ ] **Step 3: Confirm nothing still imports them**

```bash
grep -rn "ProblemsTab\|DemandTab\|PeopleTab" app components lib
```

Expected: no output.

- [ ] **Step 4: Typecheck and run the frontend tests**

```bash
npx tsc --noEmit 2>&1 | grep -v "^\.next/"
npx vitest run
```

Expected: no tsc output; all vitest files pass.

- [ ] **Step 5: Commit**

```bash
git add -A app components
git commit -m "Nine panels across four tabs become one funnel and a table

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: The arrival line

**Files:**
- Modify: `app/(platform)/admin/searches/page.tsx`

- [ ] **Step 1: Say what the badge counted**

The page already calls `useMarkSeen("searches")`. Add, directly under the
`<header>` block:

```tsx
      {(pulse?.searches ?? 0) > 0 && (
        <p className="text-sm text-muted-foreground">
          <strong className="tabular-nums text-foreground">{pulse?.searches}</strong>{" "}
          {pulse?.searches === 1 ? "search" : "searches"} since you last looked
          found nothing, and we hold the piece.
        </p>
      )}
```

Read the count from the same source the badge does, so the two can never
disagree — add near the top of the component:

```tsx
  const { data: pulse } = useQuery({
    queryKey: ["admin-pulse"],
    queryFn: async () => {
      const res = await api.get<Record<string, number>>("/api/admin/pulse");
      return res.data;
    },
    staleTime: 30_000,
  });
```

`useMarkSeen` invalidates `["admin-pulse"]` on mount, so this line shows the
count from the moment of arrival and then clears, which is the intended
behaviour: it tells you what you came for, once.

Add the imports if the file does not already have them:

```tsx
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit 2>&1 | grep -v "^\.next/"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add "app/(platform)/admin/searches/page.tsx"
git commit -m "Say what the badge counted

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Verify against the real database

- [ ] **Step 1: Run every test**

```bash
cd backend && .venv/bin/python -m pytest tests/ -q
cd .. && npx vitest run && npx tsc --noEmit 2>&1 | grep -v "^\.next/"
```

Expected: 1,596+ backend tests pass, all vitest pass, no tsc output.

- [ ] **Step 2: Check the funnel against prod, and against the old numbers**

```bash
cd backend && export $(grep -E '^DATABASE_URL=' .env | xargs) && .venv/bin/python - <<'PY'
from datetime import datetime, timedelta, timezone
from app.core.database import SessionLocal
from app.services.search_diagnosis import diagnose_window
db = SessionLocal()
end = datetime.now(timezone.utc)
out = diagnose_window(db, end - timedelta(days=30), end)
print("total", out["total"], "found", out["found"], "short", out["short"])
print("sums:", out["found"] + out["short"] == out["total"])
print("missing", out["missing"]["searches"], "have_it", out["have_it"]["searches"])
print("top missing:", [q["query"] for q in out["missing"]["queries"][:5]])
print("top have_it:", [q["query"] for q in out["have_it"]["queries"][:5]])
db.close()
PY
```

Expected: `sums: True`, total around 1,250, short around 347, and the missing
side clearly larger than the have-it side. Measured 2026-09-20: 903 found, 347
short, 273 missing against 74 have-it.

`kill bill` DOES appear on the have-it list, and that is correct. An earlier
draft of this plan expected it to have vanished, which misread how the
self-cleaning works: those searches really did fail inside the window, and we
really do hold the piece. The property works forward — a `kill bill` search run
today succeeds, so it never enters the failed set — and the historical failures
age out with the window. The list is a record of what failed, not a claim that
it would fail again now.

If `short` comes back near 382, the predicate is adding zero and weak instead of
counting the union. Stop and reconcile against `_compute_summary`.

- [ ] **Step 3: Look at it**

```bash
cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000
```

In a second shell: `npm run dev`, then open `http://localhost:3000/admin/searches`.

Confirm: two tabs; the bars sum to the total; clicking a query on either side
opens Searches filtered to it; the Search badge in the nav is a small number,
not 99+.

- [ ] **Step 4: Push**

```bash
git push origin main
```

Per `memory/no-prs-solo-dev.md` and the standing authorization: commit and push,
no PR.

---

## Self-review notes

- The spec's "a query the classifier cannot judge counts as missing" is Task 1
  Step 3's bare `except Exception` plus its test.
- The spec's warning that `/pulse` must not re-run the full classification is
  Task 4: it classifies only rows newer than `seen_at`, and memoises per
  distinct query within the call.
- `funnelBars` rounds one half and subtracts for the other, so the two always
  sum to 100. Rounding both independently would print 71 + 28 on the one screen
  built to make the numbers add up.
- `StatTile` stays in `shared.tsx`: the Sessions page imports it. Only the three
  tab components are deleted.
