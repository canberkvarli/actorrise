# Admin Unseen Badges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put an unseen-count badge on Requests, Search and Overview in the admin nav so work that arrives stops going unnoticed.

**Architecture:** One `admin_seen` table holds a per-admin, per-surface `seen_at`. One `GET /api/admin/pulse` endpoint returns every badge count in a single poll, replacing the two the layout runs today. `POST /api/admin/seen/{surface}` stamps a visit. Content requests move out of a `useState` tab into their own route so the nav can point at them.

**Tech Stack:** FastAPI + SQLAlchemy + Postgres (SQLite for tests, via `backend/tests/dbfixture.py`), Next.js App Router + TanStack Query + Tailwind, `unittest` on the backend and `vitest` on the frontend.

**Spec:** `docs/superpowers/specs/2026-09-18-admin-unseen-badges-design.md`

---

## Amendment to the spec

The spec did not account for staff exclusion. Every other admin statistic filters
internal accounts through `app/services/admin_filters.py:test_user_filter`, and
`canberkvarli@gmail.com` is named in its `EXTRA_TEST_EMAILS`. Without that filter
the founder's own test searches and his own comped subscription would drive the
badges he is meant to trust. Both the searches count and the conversions count
apply it. Anonymous search rows (`user_id IS NULL`) are real actors and do count.

## File structure

**Create:**
- `backend/app/models/admin_seen.py` — the table plus `last_seen_at` / `mark_seen`. No query logic.
- `backend/app/api/admin/pulse.py` — the count functions and the two endpoints.
- `backend/scripts/add_admin_seen_table.sql` — the migration.
- `backend/tests/test_admin_pulse.py` — counts, seen round-trip, validation.
- `lib/adminNav.ts` — nav config, `BadgeKey`, `isActive`. Pure, no React.
- `lib/adminNav.test.ts` — vitest for `isActive` and the nav config.
- `app/(platform)/admin/requests/page.tsx` — the Requests route.
- `hooks/useMarkSeen.ts` — stamps a surface on mount and refreshes the pulse.

**Modify:**
- `backend/app/models/__init__.py` — register `AdminSeen`.
- `backend/app/main.py` — include the pulse router.
- `app/(platform)/admin/layout.tsx` — one pulse query, nav moves to `lib/adminNav.ts`.
- `app/(platform)/admin/searches/page.tsx` — drop the `requests` tab.
- `app/(platform)/admin/page.tsx` — mark `revenue` seen.

Counts live in `pulse.py`, not in the model, because they reach across
`content_requests`, `search_logs` and `user_events`, and none of those owns the
question. The model file knows only about a timestamp.

---

## Task 1: The `admin_seen` model

**Files:**
- Create: `backend/app/models/admin_seen.py`
- Create: `backend/tests/test_admin_pulse.py`
- Modify: `backend/app/models/__init__.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_admin_pulse.py`:

```python
"""The admin pulse: unseen counts per surface, and the seen stamp behind them."""

import unittest
from datetime import datetime, timedelta, timezone

from app.models.admin_seen import AdminSeen, last_seen_at, mark_seen
from app.models.user import User
from tests.dbfixture import memory_db, restore


class MarkSeenTests(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db([User, AdminSeen])
        self.admin = User(email="mod@actorrise.com", hashed_password="x")
        self.db.add(self.admin)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        restore(self.saved)

    def test_no_row_returns_the_fallback(self):
        fallback = datetime(2020, 1, 1, tzinfo=timezone.utc)
        self.assertEqual(
            last_seen_at(self.db, self.admin.id, "requests", fallback), fallback
        )

    def test_mark_then_read_round_trips(self):
        stamped = mark_seen(self.db, self.admin.id, "requests")
        fallback = datetime(2020, 1, 1, tzinfo=timezone.utc)
        self.assertEqual(
            last_seen_at(self.db, self.admin.id, "requests", fallback), stamped
        )

    def test_marking_twice_updates_rather_than_duplicates(self):
        first = mark_seen(self.db, self.admin.id, "requests")
        second = mark_seen(self.db, self.admin.id, "requests")
        self.assertGreaterEqual(second, first)
        self.assertEqual(self.db.query(AdminSeen).count(), 1)

    def test_surfaces_are_independent(self):
        mark_seen(self.db, self.admin.id, "requests")
        fallback = datetime(2020, 1, 1, tzinfo=timezone.utc)
        self.assertEqual(
            last_seen_at(self.db, self.admin.id, "searches", fallback), fallback
        )


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd backend && .venv/bin/python -m pytest tests/test_admin_pulse.py -v
```

Expected: `ModuleNotFoundError: No module named 'app.models.admin_seen'`

- [ ] **Step 3: Write the model**

Create `backend/app/models/admin_seen.py`:

```python
"""When each admin last looked at a surface.

The nav badges need to answer "what arrived since I last looked", and the two
badges that already work (feedback, review) answer it with a per-row read flag.
That does not generalise: a search log or a trial conversion is not a row anyone
would ever mark read, and back-filling a flag onto every one of them to power a
counter would be absurd. One timestamp per admin per surface is the whole state.

`surface` is a plain string rather than an enum so a new badge is a new constant
here and nothing else. SURFACES is the closed vocabulary; the API validates
against it.
"""

from datetime import datetime, timezone

from app.core.database import Base
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy import text as sql_text
from sqlalchemy.orm import Session

#: Every surface that carries an unseen badge driven by this table. Feedback and
#: Review are deliberately absent — they keep their own per-row read flags.
SURFACES = ("requests", "searches", "revenue")


class AdminSeen(Base):
    __tablename__ = "admin_seen"

    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    surface = Column(String(24), primary_key=True)
    seen_at = Column(
        DateTime(timezone=True),
        # Python default as well as now(): the SQLite test fixture strips the
        # server-side default and the column is NOT NULL.
        default=lambda: datetime.now(timezone.utc),
        server_default=sql_text("now()"),
        nullable=False,
    )


def last_seen_at(
    db: Session, user_id: int, surface: str, fallback: datetime
) -> datetime:
    """When this admin last opened `surface`, or `fallback` if never.

    The fallback matters: an admin with no row has not "seen nothing since the
    beginning of time", they are simply new to the surface. The caller passes
    their account creation date so a first load reads a handful rather than the
    entire history.
    """
    row = (
        db.query(AdminSeen)
        .filter(AdminSeen.user_id == user_id, AdminSeen.surface == surface)
        .first()
    )
    return row.seen_at if row else fallback


def mark_seen(db: Session, user_id: int, surface: str) -> datetime:
    """Stamp `surface` as seen now. Returns the timestamp written."""
    now = datetime.now(timezone.utc)
    row = (
        db.query(AdminSeen)
        .filter(AdminSeen.user_id == user_id, AdminSeen.surface == surface)
        .first()
    )
    if row:
        row.seen_at = now
    else:
        db.add(AdminSeen(user_id=user_id, surface=surface, seen_at=now))
    db.commit()
    return now
```

- [ ] **Step 4: Register the model**

In `backend/app/models/__init__.py`, after the `from app.models.community import CommunityEvent` line, add:

```python
from app.models.admin_seen import AdminSeen
```

- [ ] **Step 5: Run the tests and watch them pass**

```bash
cd backend && .venv/bin/python -m pytest tests/test_admin_pulse.py -v
```

Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/admin_seen.py backend/app/models/__init__.py backend/tests/test_admin_pulse.py
git commit -m "One timestamp per admin per surface

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: The migration

**Files:**
- Create: `backend/scripts/add_admin_seen_table.sql`

- [ ] **Step 1: Write the migration**

Create `backend/scripts/add_admin_seen_table.sql`:

```sql
-- admin_seen: when each admin last opened a badged surface.
--
-- Run against prod BEFORE the deploy that ships /api/admin/pulse, or the
-- endpoint 500s on a missing relation. Idempotent, safe to re-run.

CREATE TABLE IF NOT EXISTS admin_seen (
    user_id  INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    surface  VARCHAR(24) NOT NULL,
    seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, surface)
);
```

- [ ] **Step 2: Verify it parses against a scratch database**

```bash
cd backend && .venv/bin/python -c "
import sqlparse, pathlib
sql = pathlib.Path('scripts/add_admin_seen_table.sql').read_text()
print(len(sqlparse.split(sql)), 'statement(s)')
" 2>/dev/null || echo "sqlparse absent — read the file and move on, it is four lines"
```

Expected: `1 statement(s)`, or the fallback message. Do not add a dependency for this.

- [ ] **Step 3: Commit**

```bash
git add backend/scripts/add_admin_seen_table.sql
git commit -m "Migration for admin_seen

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: The three unseen counts

**Files:**
- Create: `backend/app/api/admin/pulse.py`
- Modify: `backend/tests/test_admin_pulse.py`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_admin_pulse.py`, above the `if __name__` block:

```python
from app.api.admin.pulse import (
    unseen_conversions,
    unseen_bad_searches,
    unseen_requests,
)
from app.models.content_request import ContentRequest
from app.models.search_log import SearchLog
from app.models.user_event import UserEvent


class UnseenCountTests(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db(
            [User, AdminSeen, ContentRequest, SearchLog, UserEvent]
        )
        self.actor = User(email="actor@gmail.com", hashed_password="x")
        self.staff = User(email="canberkvarli@gmail.com", hashed_password="x")
        self.db.add_all([self.actor, self.staff])
        self.db.commit()
        self.cutoff = datetime(2026, 9, 1, tzinfo=timezone.utc)
        self.before = self.cutoff - timedelta(days=1)
        self.after = self.cutoff + timedelta(days=1)

    def tearDown(self):
        self.db.close()
        restore(self.saved)

    def test_requests_count_by_last_requested_not_first(self):
        """An old title asked for again is news. It must resurface."""
        self.db.add(
            ContentRequest(
                play_title="Heathers",
                request_count=2,
                first_requested_at=self.before,
                last_requested_at=self.after,
            )
        )
        self.db.commit()
        self.assertEqual(unseen_requests(self.db, self.cutoff), 1)

    def test_requests_ignores_untouched_rows(self):
        self.db.add(
            ContentRequest(
                play_title="Witch",
                request_count=1,
                first_requested_at=self.before,
                last_requested_at=self.before,
            )
        )
        self.db.commit()
        self.assertEqual(unseen_requests(self.db, self.cutoff), 0)

    def test_bad_search_counted_once_when_zero_and_weak(self):
        """15 rows in prod are both. Adding zero + weak double-counts them."""
        self.db.add(
            SearchLog(
                query="tech bro",
                results_count=0,
                weak_match=True,
                user_id=self.actor.id,
                created_at=self.after,
            )
        )
        self.db.commit()
        self.assertEqual(unseen_bad_searches(self.db, self.cutoff), 1)

    def test_good_search_is_not_counted(self):
        self.db.add(
            SearchLog(
                query="hamlet",
                results_count=30,
                weak_match=False,
                user_id=self.actor.id,
                created_at=self.after,
            )
        )
        self.db.commit()
        self.assertEqual(unseen_bad_searches(self.db, self.cutoff), 0)

    def test_staff_searches_do_not_badge(self):
        self.db.add(
            SearchLog(
                query="my own test query",
                results_count=0,
                user_id=self.staff.id,
                created_at=self.after,
            )
        )
        self.db.commit()
        self.assertEqual(unseen_bad_searches(self.db, self.cutoff), 0)

    def test_anonymous_searches_do_badge(self):
        """A logged-out actor is a real actor, not a test account."""
        self.db.add(
            SearchLog(
                query="crazy birds",
                results_count=0,
                user_id=None,
                created_at=self.after,
            )
        )
        self.db.commit()
        self.assertEqual(unseen_bad_searches(self.db, self.cutoff), 1)

    def test_conversions_count_trial_converted_only(self):
        self.db.add_all(
            [
                UserEvent(
                    user_id=self.actor.id,
                    event_name="trial_converted",
                    created_at=self.after,
                ),
                UserEvent(
                    user_id=self.actor.id,
                    event_name="trial_started",
                    created_at=self.after,
                ),
            ]
        )
        self.db.commit()
        self.assertEqual(unseen_conversions(self.db, self.cutoff), 1)

    def test_staff_conversions_do_not_badge(self):
        self.db.add(
            UserEvent(
                user_id=self.staff.id,
                event_name="trial_converted",
                created_at=self.after,
            )
        )
        self.db.commit()
        self.assertEqual(unseen_conversions(self.db, self.cutoff), 0)
```

- [ ] **Step 2: Run them and watch them fail**

```bash
cd backend && .venv/bin/python -m pytest tests/test_admin_pulse.py -v
```

Expected: `ModuleNotFoundError: No module named 'app.api.admin.pulse'`

- [ ] **Step 3: Write the counts**

Create `backend/app/api/admin/pulse.py`:

```python
"""Every admin nav badge, in one poll.

The layout used to poll one endpoint per badge. Two was fine; five would not be,
and each one is a single COUNT that could have travelled with the others. One
endpoint, one round trip, one place to add the next badge.

The counts here are "since you last looked" and read `admin_seen`. Feedback and
Review are folded in unchanged — they still answer from their own per-row read
flags, which work and are not worth rewriting to prove a point.
"""

from datetime import datetime, timedelta, timezone

from app.models.admin_seen import last_seen_at
from app.models.content_request import ContentRequest
from app.models.search_log import SearchLog
from app.models.user import User
from app.models.user_event import UserEvent
from app.services.admin_filters import test_user_filter
from sqlalchemy import func, or_
from sqlalchemy.orm import Session


def _staff_ids(db: Session) -> list[int]:
    """Internal accounts, whose activity must never drive a badge.

    Without this the founder's own searches badge the founder. The rule lives in
    `admin_filters.test_user_filter` and is shared with every other admin stat,
    so a new staff account disappears from all of them at once.
    """
    return [r[0] for r in db.query(User.id).filter(test_user_filter()).all()]


def unseen_requests(db: Session, since: datetime) -> int:
    """Titles asked for since `since`.

    Keyed on `last_requested_at`, not `first_requested_at`: a request that was
    already counted once and has now been asked for again is new information,
    and burying it because the row is old is the exact failure this badge exists
    to fix.
    """
    return (
        db.query(func.count(ContentRequest.id))
        .filter(ContentRequest.last_requested_at > since)
        .scalar()
        or 0
    )


def unseen_bad_searches(db: Session, since: datetime) -> int:
    """Searches since `since` that came back empty or weak.

    The predicate mirrors the raw SQL in `admin/searches.py::_compute_summary`
    ("results_count = 0 OR weak_match IS TRUE"). One count, not zero plus weak
    added together: rows that are both must be counted once.

    `user_id IS NULL` is an anonymous search — a real logged-out actor, counted.
    """
    staff = _staff_ids(db)
    q = db.query(func.count(SearchLog.id)).filter(
        SearchLog.created_at > since,
        or_(SearchLog.results_count == 0, SearchLog.weak_match.is_(True)),
    )
    if staff:
        q = q.filter(or_(SearchLog.user_id.is_(None), SearchLog.user_id.notin_(staff)))
    return q.scalar() or 0


def unseen_conversions(db: Session, since: datetime) -> int:
    """Trials that turned into money since `since`."""
    staff = _staff_ids(db)
    q = db.query(func.count(UserEvent.id)).filter(
        UserEvent.created_at > since,
        UserEvent.event_name == "trial_converted",
    )
    if staff:
        q = q.filter(or_(UserEvent.user_id.is_(None), UserEvent.user_id.notin_(staff)))
    return q.scalar() or 0
```

- [ ] **Step 4: Run them and watch them pass**

```bash
cd backend && .venv/bin/python -m pytest tests/test_admin_pulse.py -v
```

Expected: 12 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/admin/pulse.py backend/tests/test_admin_pulse.py
git commit -m "Count what arrived since you last looked

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: The pulse and seen endpoints

**Files:**
- Modify: `backend/app/api/admin/pulse.py`
- Modify: `backend/app/main.py:19` and `backend/app/main.py:412`
- Modify: `backend/tests/test_admin_pulse.py`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_admin_pulse.py`, above the `if __name__` block:

```python
from fastapi import HTTPException

from app.api.admin.pulse import admin_pulse, mark_surface_seen


class EndpointTests(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db(
            [User, AdminSeen, ContentRequest, SearchLog, UserEvent]
        )
        self.admin = User(
            email="mod@actorrise.com",
            hashed_password="x",
            created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        self.db.add(self.admin)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        restore(self.saved)

    def test_unknown_surface_is_rejected(self):
        with self.assertRaises(HTTPException) as caught:
            mark_surface_seen("dashboard", db=self.db, _mod=self.admin)
        self.assertEqual(caught.exception.status_code, 422)

    def test_marking_a_surface_clears_its_count(self):
        self.db.add(
            ContentRequest(
                play_title="Witch",
                request_count=1,
                first_requested_at=datetime(2026, 9, 17, tzinfo=timezone.utc),
                last_requested_at=datetime(2026, 9, 17, tzinfo=timezone.utc),
            )
        )
        self.db.commit()

        before = admin_pulse(db=self.db, _mod=self.admin)
        self.assertEqual(before["requests"], 1)

        mark_surface_seen("requests", db=self.db, _mod=self.admin)

        after = admin_pulse(db=self.db, _mod=self.admin)
        self.assertEqual(after["requests"], 0)

    def test_first_visit_counts_from_account_creation_not_epoch(self):
        """A never-visited surface must not report the whole history."""
        self.db.add(
            ContentRequest(
                play_title="Death of a Salesman",
                request_count=1,
                first_requested_at=datetime(2025, 5, 1, tzinfo=timezone.utc),
                last_requested_at=datetime(2025, 5, 1, tzinfo=timezone.utc),
            )
        )
        self.db.commit()
        self.assertEqual(admin_pulse(db=self.db, _mod=self.admin)["requests"], 0)

    def test_pulse_carries_every_badge_key(self):
        pulse = admin_pulse(db=self.db, _mod=self.admin)
        self.assertEqual(
            set(pulse),
            {"feedback", "review", "requests", "searches", "revenue"},
        )
```

- [ ] **Step 2: Run them and watch them fail**

```bash
cd backend && .venv/bin/python -m pytest tests/test_admin_pulse.py::EndpointTests -v
```

Expected: `ImportError: cannot import name 'admin_pulse'`

- [ ] **Step 3: Add the endpoints**

Append to `backend/app/api/admin/pulse.py`:

```python
from typing import Any

from app.api.admin.stats import require_moderator
from app.core.database import get_db
from app.models.actor import Monologue
from app.models.admin_seen import SURFACES, mark_seen
from app.models.feedback import ResultFeedback
from fastapi import APIRouter, Depends, HTTPException, Path

router = APIRouter(prefix="/api/admin", tags=["admin", "pulse"])


def _unread_feedback(db: Session) -> int:
    """Mirrors `admin/feedback.py::feedback_summary`'s `unread`."""
    return (
        db.query(func.count(ResultFeedback.id))
        .filter(
            ResultFeedback.rating == "negative",
            ResultFeedback.read_at.is_(None),
            ResultFeedback.comment.isnot(None),
            func.trim(ResultFeedback.comment) != "",
        )
        .scalar()
        or 0
    )


def _pending_review(db: Session) -> int:
    """Mirrors `admin/monologues.py::admin_review_queue_count`."""
    return db.query(Monologue).filter(Monologue.review_status == "pending").count()


@router.get("/pulse")
def admin_pulse(
    db: Session = Depends(get_db),
    _mod: User = Depends(require_moderator),
) -> dict[str, Any]:
    """Every nav badge count in one call.

    `_mod.created_at` is the fallback for a surface this admin has never opened:
    counting from epoch would have the Search badge read four figures on first
    load, which is indistinguishable from broken.

    That column is nullable, and a NULL there must not become a NULL comparison
    that silently counts zero. An admin with no creation date gets a week.
    """
    floor = _mod.created_at or datetime.now(timezone.utc) - timedelta(days=7)
    return {
        "feedback": _unread_feedback(db),
        "review": _pending_review(db),
        "requests": unseen_requests(db, last_seen_at(db, _mod.id, "requests", floor)),
        "searches": unseen_bad_searches(
            db, last_seen_at(db, _mod.id, "searches", floor)
        ),
        "revenue": unseen_conversions(db, last_seen_at(db, _mod.id, "revenue", floor)),
    }


@router.post("/seen/{surface}")
def mark_surface_seen(
    surface: str = Path(...),
    db: Session = Depends(get_db),
    _mod: User = Depends(require_moderator),
) -> dict[str, Any]:
    """Stamp a surface as seen. Called on page mount."""
    if surface not in SURFACES:
        raise HTTPException(
            status_code=422,
            detail=f"surface must be one of: {', '.join(SURFACES)}",
        )
    seen_at = mark_seen(db, _mod.id, surface)
    return {"surface": surface, "seen_at": seen_at.isoformat()}
```

Move the `from datetime import datetime` and existing imports to sit alongside
the new ones at the top of the file rather than leaving two import blocks.

- [ ] **Step 4: Wire the router**

In `backend/app/main.py`, after line 19 (`from app.api.admin.organizations import ...`) add:

```python
from app.api.admin.pulse import router as admin_pulse_router
```

And after `app.include_router(admin_organizations_router)` (line 405) add:

```python
app.include_router(admin_pulse_router)
```

- [ ] **Step 5: Run the tests and watch them pass**

```bash
cd backend && .venv/bin/python -m pytest tests/test_admin_pulse.py -v
```

Expected: 16 passed.

- [ ] **Step 6: Confirm the app still boots with the new router**

```bash
cd backend && .venv/bin/python -c "from app.main import app; print([r.path for r in app.routes if 'pulse' in r.path or '/seen/' in r.path])"
```

Expected: `['/api/admin/pulse', '/api/admin/seen/{surface}']`

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/admin/pulse.py backend/app/main.py backend/tests/test_admin_pulse.py
git commit -m "Five badges, one poll

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Extract the nav into a testable module

The bug this guards against is real and was caught in spec review: `isActive`
matches on `startsWith`, so a Requests item living under `/admin/searches` would
have lit up Search at the same time.

**Files:**
- Create: `lib/adminNav.ts`
- Create: `lib/adminNav.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/adminNav.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { ADMIN_NAV, BADGE_KEYS, isActive } from "./adminNav";

describe("isActive", () => {
  it("matches Overview only on an exact path", () => {
    expect(isActive("/admin", "/admin")).toBe(true);
    expect(isActive("/admin/users", "/admin")).toBe(false);
  });

  it("matches a section on its prefix", () => {
    expect(isActive("/admin/searches", "/admin/searches")).toBe(true);
    expect(isActive("/admin/monologues/review", "/admin/monologues/review")).toBe(
      true
    );
  });

  it("does not light Search up when Requests is open", () => {
    expect(isActive("/admin/requests", "/admin/searches")).toBe(false);
    expect(isActive("/admin/requests", "/admin/requests")).toBe(true);
  });
});

describe("ADMIN_NAV", () => {
  const items = ADMIN_NAV.flatMap((g) => g.items);

  it("has a Requests entry with a badge", () => {
    const requests = items.find((i) => i.href === "/admin/requests");
    expect(requests).toBeDefined();
    expect(requests?.badgeKey).toBe("requests");
  });

  it("only uses badge keys the pulse endpoint returns", () => {
    for (const item of items) {
      if (item.badgeKey) expect(BADGE_KEYS).toContain(item.badgeKey);
    }
  });

  it("gives every item a unique href", () => {
    const hrefs = items.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run lib/adminNav.test.ts
```

Expected: `Failed to resolve import "./adminNav"`

- [ ] **Step 3: Write the module**

Create `lib/adminNav.ts`:

```ts
import {
  IconBuilding,
  IconChartBar,
  IconClipboardCheck,
  IconFileSearch,
  IconInbox,
  IconMail,
  IconMessageReport,
  IconMicrophone,
  IconSearch,
  IconUsers,
} from "@tabler/icons-react";

/** Every key `/api/admin/pulse` returns. A nav badge may use no other. */
export const BADGE_KEYS = [
  "feedback",
  "review",
  "requests",
  "searches",
  "revenue",
] as const;

export type BadgeKey = (typeof BADGE_KEYS)[number];

/** Surfaces whose badge clears by visiting them (the `admin_seen` three). */
export const SEEN_SURFACES = ["requests", "searches", "revenue"] as const;

export type SeenSurface = (typeof SEEN_SURFACES)[number];

export type NavItem = {
  href: string;
  label: string;
  icon: typeof IconChartBar;
  badgeKey?: BadgeKey;
};

export type NavGroup = { title: string; items: NavItem[] };

// Ordered by what actually gets used. Search + Sessions + Feedback are the daily
// drivers, so they sit at the top under Pulse. Moderation was removed — retired,
// not hidden.
//
// The monologue review queue is back. It was retired while it sat empty, but the
// interleaved-dialogue and flattened-scene passes now route anything they cannot
// repair safely into it instead of guessing, so there is real work in there and
// it needs a way in. The badge is the point: a queue with no counter is a queue
// nobody opens.
//
// Requests is here for exactly that reason. It had no nav entry at all and lived
// as a tab inside Search, so fifteen titles actors asked for — one of them five
// months old — were never seen by anybody.
export const ADMIN_NAV: NavGroup[] = [
  {
    title: "Pulse",
    items: [
      { href: "/admin", label: "Overview", icon: IconChartBar, badgeKey: "revenue" },
      { href: "/admin/searches", label: "Search", icon: IconSearch, badgeKey: "searches" },
      { href: "/admin/sessions", label: "Sessions", icon: IconMicrophone },
      { href: "/admin/feedback", label: "Feedback", icon: IconMessageReport, badgeKey: "feedback" },
    ],
  },
  {
    title: "People",
    items: [
      { href: "/admin/users", label: "Users", icon: IconUsers },
      { href: "/admin/organizations", label: "Organizations", icon: IconBuilding },
    ],
  },
  {
    title: "Library",
    items: [
      { href: "/admin/content", label: "Content", icon: IconFileSearch },
      { href: "/admin/requests", label: "Requests", icon: IconInbox, badgeKey: "requests" },
      {
        href: "/admin/monologues/review",
        label: "Review",
        icon: IconClipboardCheck,
        badgeKey: "review",
      },
    ],
  },
  {
    title: "Comms",
    items: [{ href: "/admin/emails", label: "Emails", icon: IconMail }],
  },
];

/** Overview is an exact match; everything else owns its subtree. */
export function isActive(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run lib/adminNav.test.ts
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/adminNav.ts lib/adminNav.test.ts
git commit -m "Pull the admin nav out where a test can reach it

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: One pulse query in the layout

**Files:**
- Modify: `app/(platform)/admin/layout.tsx:1-136`

- [ ] **Step 1: Replace the imports and inline nav**

In `app/(platform)/admin/layout.tsx`, delete the `@tabler/icons-react` import
block, the `NavItem` / `NavGroup` types, the `GROUPS` constant and the local
`isActive` function. Replace them with:

```tsx
import { ADMIN_NAV, isActive, type BadgeKey, type NavItem } from "@/lib/adminNav";
```

- [ ] **Step 2: Replace the two queries with one**

Delete both `useQuery` blocks (the `admin-feedback-badge` and `admin-review-badge`
ones) and the `const badges = ...` line. In their place:

```tsx
  // Every nav badge in one poll. Five separate counters would have meant five
  // requests a minute for five COUNTs that could travel together.
  const { data: pulse } = useQuery({
    queryKey: ["admin-pulse"],
    queryFn: async () => {
      const res = await api.get<Record<BadgeKey, number>>("/api/admin/pulse");
      return res.data;
    },
    enabled: !!user?.is_moderator,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // A failed poll shows no badge rather than an error in the nav.
  const badgeFor = (key?: BadgeKey) => (key ? pulse?.[key] ?? 0 : 0);
```

- [ ] **Step 3: Point the renderer at it**

In `renderLink`, replace:

```tsx
    const count = item.badgeKey ? badges[item.badgeKey] : 0;
```

with:

```tsx
    const count = badgeFor(item.badgeKey);
```

And replace every `GROUPS.map(` with `ADMIN_NAV.map(`.

- [ ] **Step 4: Update the stale invalidation in the feedback page**

`app/(platform)/admin/feedback/page.tsx:92` invalidates a query key that no
longer exists. Change:

```tsx
    queryClient.invalidateQueries({ queryKey: ["admin-feedback-badge"] });
```

to:

```tsx
    queryClient.invalidateQueries({ queryKey: ["admin-pulse"] });
```

Do the same at `app/(platform)/admin/monologues/review/page.tsx:74`, replacing
`["admin-review-badge"]` with `["admin-pulse"]`.

- [ ] **Step 5: Typecheck and confirm nothing still references the old keys**

```bash
npx tsc --noEmit
grep -rn "admin-feedback-badge\|admin-review-badge" app/ lib/ components/
```

Expected: `tsc` clean, and the grep prints nothing.

- [ ] **Step 6: Commit**

```bash
git add "app/(platform)/admin/layout.tsx" "app/(platform)/admin/feedback/page.tsx" "app/(platform)/admin/monologues/review/page.tsx"
git commit -m "Five badges on one poll instead of two on two

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Requests gets its own route

**Files:**
- Create: `app/(platform)/admin/requests/page.tsx`
- Modify: `app/(platform)/admin/searches/page.tsx:5,22-28,86`

- [ ] **Step 1: Create the route**

Create `app/(platform)/admin/requests/page.tsx`:

```tsx
"use client";

import { ContentRequestsTab } from "@/components/admin/searches/ContentRequestsTab";
import { useMarkSeen } from "@/hooks/useMarkSeen";

/**
 * Titles actors asked for and could not find.
 *
 * This was a tab inside Search, which meant it had no nav entry, no badge and
 * no URL. Fifteen requests accumulated there unseen, the oldest five months
 * old. It is a work queue like Review, not a view of search behaviour, so it
 * lives in Library and carries its own counter.
 */
export default function AdminRequestsPage() {
  useMarkSeen("requests");

  return (
    <div className="space-y-4 p-3 sm:p-4 md:p-6">
      <header>
        <h1 className="text-lg font-semibold sm:text-xl">Requests</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Titles actors asked for and could not find.
        </p>
      </header>
      <ContentRequestsTab />
    </div>
  );
}
```

- [ ] **Step 2: Remove the tab from Search**

In `app/(platform)/admin/searches/page.tsx`:

Delete the import on line 5:

```tsx
import { ContentRequestsTab } from "@/components/admin/searches/ContentRequestsTab";
```

Remove the last entry from `TABS`, leaving:

```tsx
const TABS = [
  { id: "problems", label: "What's broken", hint: "Failed and weak searches" },
  { id: "demand", label: "What they want", hint: "Top queries and gaps" },
  { id: "people", label: "Who's searching", hint: "Per-actor behaviour" },
  { id: "recent", label: "Recent activity", hint: "The raw feed" },
] as const;
```

Delete the render line:

```tsx
      {tab === "requests" && <ContentRequestsTab />}
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean. (`useMarkSeen` does not exist yet, so this step fails until
Task 8. Run Task 8 first if you prefer a green board between every task; the
order here keeps the two file moves in one commit.)

- [ ] **Step 4: Commit (after Task 8 lands)**

```bash
git add "app/(platform)/admin/requests/page.tsx" "app/(platform)/admin/searches/page.tsx"
git commit -m "Requests is a queue, not a tab

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Clear the badge by looking at it

**Files:**
- Create: `hooks/useMarkSeen.ts`
- Modify: `app/(platform)/admin/searches/page.tsx`
- Modify: `app/(platform)/admin/page.tsx`

- [ ] **Step 1: Write the hook**

Create `hooks/useMarkSeen.ts`:

```ts
"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import api from "@/lib/api";
import type { SeenSurface } from "@/lib/adminNav";

/**
 * Stamp a surface as seen, once, on mount, then refresh the badges.
 *
 * Fire-and-forget on purpose: a failed stamp leaves the badge up, which is the
 * safe direction to fail in. Losing a badge you never looked at is the bug;
 * seeing one twice is an annoyance.
 */
export function useMarkSeen(surface: SeenSurface) {
  const qc = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    api
      .post(`/api/admin/seen/${surface}`)
      .then(() => {
        if (!cancelled) qc.invalidateQueries({ queryKey: ["admin-pulse"] });
      })
      .catch(() => {
        /* badge stays up; next visit tries again */
      });
    return () => {
      cancelled = true;
    };
  }, [surface, qc]);
}
```

- [ ] **Step 2: Call it from Search**

In `app/(platform)/admin/searches/page.tsx`, add the import:

```tsx
import { useMarkSeen } from "@/hooks/useMarkSeen";
```

and as the first line of `AdminSearchesPage`:

```tsx
  useMarkSeen("searches");
```

- [ ] **Step 3: Call it from Overview**

In `app/(platform)/admin/page.tsx`, add the same import and add
`useMarkSeen("revenue");` as the first statement of the default-exported
component. If that file is a server component (no `"use client"` on line 1),
do not convert it — instead leave Overview unbadged for now and delete the
`badgeKey: "revenue"` line from the Overview entry in `lib/adminNav.ts`, then
note it in the task's commit message.

- [ ] **Step 4: Typecheck and run every test**

```bash
npx tsc --noEmit && npx vitest run lib/adminNav.test.ts
cd backend && .venv/bin/python -m pytest tests/test_admin_pulse.py tests/test_content_requests.py -v
```

Expected: `tsc` clean, 6 vitest passed, backend suites passed.

- [ ] **Step 5: Commit**

```bash
git add hooks/useMarkSeen.ts "app/(platform)/admin/searches/page.tsx" "app/(platform)/admin/page.tsx" "app/(platform)/admin/requests/page.tsx" lib/adminNav.ts
git commit -m "Looking at it is what marks it seen

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Verify against the real database

Nothing here is trustworthy until the counts have been seen against prod data.

- [ ] **Step 1: Run the migration on prod**

```bash
cd backend && psql "$DATABASE_URL" -f scripts/add_admin_seen_table.sql
```

Expected: `CREATE TABLE`.

Per `memory/deploy-ordering-schema-migrations.md` this runs BEFORE the push that
deploys the new endpoint, or `/api/admin/pulse` 500s on a missing relation.

- [ ] **Step 2: Sanity-check the counts against what the dashboard already says**

```bash
cd backend && psql "$DATABASE_URL" -c "
SELECT
  (SELECT count(*) FROM content_requests WHERE status = 'requested') AS open_requests,
  (SELECT count(*) FROM search_logs
     WHERE created_at > now() - interval '30 days'
       AND (results_count = 0 OR weak_match IS TRUE)) AS bad_searches_30d,
  (SELECT count(*) FROM user_events WHERE event_name = 'trial_converted') AS conversions;
"
```

Expected: `open_requests` around 15 and `bad_searches_30d` in the high hundreds,
matching the 382 shrugs plus weak rows the Search dashboard reports. A wildly
different number means the predicate is wrong — stop and reconcile against
`_compute_summary` before shipping.

- [ ] **Step 3: Boot locally and look at it**

```bash
cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000
```

In a second shell:

```bash
npm run dev
```

Open `http://localhost:3000/admin`. Confirm: Requests appears under Library with
a badge; opening it clears the badge; Search and Overview badge and clear the
same way; Feedback still reads its old count.

- [ ] **Step 4: Push**

```bash
git push origin main
```

Per `memory/no-prs-solo-dev.md`: commit and push to the branch, no PR.

---

## Self-review notes

- Task 7 Step 3 will not typecheck until Task 8 creates `useMarkSeen`. Flagged in
  the step itself rather than silently reordered, because splitting the route
  move across two commits is worse than one red intermediate check.
- Task 8 Step 3 carries a real branch: Overview may be a server component. The
  fallback (drop the revenue badge) is spelled out rather than left to judgement.
- The staff-exclusion requirement is not in the spec. It is recorded as an
  explicit amendment at the top of this plan.
