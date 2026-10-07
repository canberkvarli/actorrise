# Audition Tracker (web v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a ticket-rail audition tracker on the web where every audition opens into a prep room wired to ScenePartner and monologue search, with three reminder emails per audition and admin metrics that can tell whether weekly returning users moved.

**Architecture:**
- **Backend:** three new tables (`auditions`, `audition_pieces`, `audition_events`) plus a reminder claim table. The logic sits in a small service package (`app/services/auditions/`), with a thin REST router at `/api/auditions` that Ghost Light can reuse later. Reminders run on an hourly daemon thread like the lifecycle emails.
- **Frontend:** `/auditions` and `/auditions/[id]` render one shell. On desktop that's the rail plus the prep room; on a phone it's one or the other. A post-login hop (`/auditions/next`) sends anyone with an audition in the next 14 days straight to its prep room.
- **Source of truth:** `docs/superpowers/specs/2026-10-07-audition-tracker-design.md`.

**Tech Stack:** FastAPI, SQLAlchemy, Postgres on Supabase (raw SQL migrations in `backend/scripts/`), OpenAI `gpt-4o-mini` via `get_llm()`, Resend, Next.js App Router, React Query, Tailwind v4, Theatre Walk tokens in `app/globals.css`, vitest, unittest/pytest.

---

## Ground rules for whoever executes this

- **Commands.**
  - Backend tests: `cd backend && .venv/bin/python -m pytest tests/<file> -q`. Full suite: `.venv/bin/python -m pytest tests/ -q`.
  - Frontend tests: `npx vitest run <path>`. Typecheck: `npx tsc --noEmit`.
- **Test database.** Backend tests run against an in-memory SQLite database built by `tests/dbfixture.memory_db([...models])`. Name every table a test needs, including `Organization` and `User`, and always call `restore(saved)` in `tearDown`.
- **Timezones in SQLite.** SQLite hands back naive datetimes, so every service function that compares times goes through `aware()` (Task 3).
- **No dashes in copy.** No em or en dashes in any user-facing text, email copy or docs. `CopyTests` enforces this for emails.
- **Orange.** Use `bg-primary` / `text-primary-foreground` only, never a hex value. The theme swaps it in dark mode.
- **Fonts.** In CSS write `font-family: var(--t-display);` alone. A var with a fallback gets silently dropped by the build.
- **Display rules.** Never put `display:` in a custom class on an element that also uses Tailwind `md:hidden` / `max-md:hidden`, because unlayered CSS wins. Visibility goes in Tailwind classes only.
- **Overflow.** Use `overflow-x-clip`, never `overflow-x-hidden` (it breaks sticky).
- **Commits.** Commit after every task. Standing OK to commit on `main`; do NOT push until Task 20.
- **Deploy order.** `backend/scripts/add_auditions_tables.sql` must run on Supabase BEFORE the backend deploys (Task 20).

## Where this plan departs from the spec (decided while planning)

- **Onboarding:** instead of a new wizard step, the existing "Bring your own sides" exit on the onboarding payoff now opens the tracker's capture (`/auditions?new=1&from=onboarding`). It's a smaller change to a 1,300-line flow, and it reaches the same people.
- **Strip dismissal:** remembered per browser (localStorage), not per user. That avoids a new column.
- **Calendar link:** sits in the `/auditions` header, not the account menu.
- **Insights teaser:** the blurred callback-rate card after 5 outcomes is NOT in this plan. It goes in the first follow-up, once outcomes exist to show.
- **Sides upload:** the browser calls the existing `/api/scripts/upload-background`. The spec was updated to match.

## File map

**Backend, new:**
- `backend/scripts/add_auditions_tables.sql`: DDL for the 4 tables and the `users.calendar_feed_key` column.
- `backend/app/models/audition.py`: `Audition`, `AuditionPiece`, `AuditionEvent`, `AuditionReminderSend`.
- `backend/app/services/auditions/__init__.py`: empty.
- `backend/app/services/auditions/core.py`: create/update/outcome/list/next, scope, prep steps, serialization.
- `backend/app/services/auditions/parse.py`: LLM prompt, draft normalization, quota.
- `backend/app/services/auditions/ics.py`: calendar feed text.
- `backend/app/services/auditions/reminders.py`: due moments, selection, render, send.
- `backend/app/services/engagement.py`: engaged-activity weeks for admin.
- `backend/app/api/auditions.py`: the router.
- `backend/app/api/admin/auditions.py`: the admin panel endpoint.
- `backend/emails/auditions/prep.txt`, `eve.txt`, `after.txt`: reminder copy.
- Tests: `backend/tests/test_auditions_core.py`, `test_auditions_parse.py`, `test_auditions_ics.py`, `test_audition_reminders.py`, `test_engagement.py`.

**Backend, modified:**
- `backend/app/models/__init__.py`: export the new models.
- `backend/app/models/user.py`: add `calendar_feed_key`.
- `backend/app/services/events.py`: new event names.
- `backend/app/services/app_settings.py`: `AUDITION_REMINDERS_ENABLED`.
- `backend/app/api/admin/emails.py`: the toggle endpoints.
- `backend/app/api/admin/stats.py`: engaged columns in `/growth`.
- `backend/app/main.py`: register routers and start the scheduler.

**Frontend, new:**
- `lib/auditions.ts` + `lib/auditions.test.ts`: types and pure helpers.
- `hooks/useAuditions.ts`: React Query hooks.
- `components/auditions/AuditionTicket.tsx`
- `components/auditions/TicketRail.tsx`
- `components/auditions/PrepRoom.tsx`
- `components/auditions/DropBox.tsx`
- `components/auditions/DraftCard.tsx`
- `components/auditions/AuditionsShell.tsx`
- `components/auditions/CalendarLink.tsx`
- `components/auditions/AuditionStrip.tsx`
- `app/(platform)/auditions/page.tsx`
- `app/(platform)/auditions/[id]/page.tsx`
- `app/(platform)/auditions/next/page.tsx`

**Frontend, modified:**
- `lib/events.ts`
- `app/globals.css`: append the `.theatre-auditions` block.
- `app/(platform)/layout.tsx`: nav item, label.
- `middleware.ts`: protected path and matcher.
- `app/(auth)/login/page.tsx`: redirect target.
- `app/(platform)/rehearse/page.tsx`, `app/(platform)/monologues/page.tsx`: strip.
- `components/onboarding/ProfileOnboardingFlow.tsx`: sides route.
- `app/(platform)/admin/emails/page.tsx`: toggle.
- `app/(platform)/admin/page.tsx`: engaged columns and the auditions card.

---

## Phase 1: Backend data

### Task 1: Tables, models, migration

**Files:**
- Create: `backend/scripts/add_auditions_tables.sql`
- Create: `backend/app/models/audition.py`
- Modify: `backend/app/models/__init__.py` (append import)
- Modify: `backend/app/models/user.py` (add one column after `marketing_opt_in`)
- Test: `backend/tests/test_auditions_core.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_auditions_core.py`:

```python
"""Audition tracker: the tables, the service, the prep steps."""

import unittest
from datetime import datetime, timedelta, timezone

from sqlalchemy.exc import IntegrityError

from app.models.audition import Audition, AuditionEvent, AuditionPiece, AuditionReminderSend
from app.models.organization import Organization
from app.models.user import User
from tests.dbfixture import memory_db, restore

NOW = datetime(2026, 10, 7, 15, 0, tzinfo=timezone.utc)
TABLES = [Organization, User, Audition, AuditionPiece, AuditionEvent, AuditionReminderSend]


class TableTests(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db(TABLES)
        self.user = User(email="a@x.com", supabase_id="a")
        self.db.add(self.user)
        self.db.commit()

    def tearDown(self):
        restore(self.saved)

    def test_audition_gets_a_token_and_defaults(self):
        a = Audition(user_id=self.user.id, project="The Glass Menagerie", tz="America/New_York")
        self.db.add(a)
        self.db.commit()
        self.assertTrue(a.outcome_token and len(a.outcome_token) >= 24)
        self.assertTrue(a.reminders_on)
        self.assertEqual(a.kind, "in_person")
        self.assertEqual(a.source, "manual")

    def test_reminder_claim_is_unique_per_moment(self):
        a = Audition(user_id=self.user.id, project="P", tz="UTC")
        self.db.add(a)
        self.db.commit()
        self.db.add(AuditionReminderSend(audition_id=a.id, user_id=self.user.id, moment="eve", local_day="2026-10-08"))
        self.db.commit()
        self.db.add(AuditionReminderSend(audition_id=a.id, user_id=self.user.id, moment="eve", local_day="2026-10-08"))
        with self.assertRaises(IntegrityError):
            self.db.commit()
        self.db.rollback()


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_auditions_core.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.models.audition'`

- [ ] **Step 3: Write the models**

Create `backend/app/models/audition.py`:

```python
"""The audition tracker (docs/superpowers/specs/2026-10-07-audition-tracker-design.md).

Plural on purpose: app/models/audition_usage.py and /api/audition belong to the
self-tape recorder, which is a different feature.

auditions        one row per audition an actor is going to, or went to
audition_pieces  the monologues or scenes they picked for it ("used" feeds insights)
audition_events  append-only timeline; admin metrics and the prep room read it
audition_reminder_sends  claim rows: the INSERT that wins sends, everyone else skips
"""

import secrets
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy import text as sql_text
from sqlalchemy.dialects.postgresql import JSONB

from app.core.database import Base

KINDS = ("in_person", "self_tape", "virtual")
STATUSES = ("submitted", "scheduled", "callback", "booked", "pinned", "passed")
SOURCES = ("parse", "manual", "onboarding")
CLOSED_STATUSES = ("booked", "passed")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _token() -> str:
    return secrets.token_urlsafe(24)


class Audition(Base):
    __tablename__ = "auditions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    project = Column(String(200), nullable=False)
    role = Column(String(200), nullable=True)
    kind = Column(String(16), nullable=False, default="in_person")
    status = Column(String(16), nullable=False, default="scheduled")
    starts_at = Column(DateTime(timezone=True), nullable=True)  # appointment
    due_at = Column(DateTime(timezone=True), nullable=True)  # self-tape deadline
    tz = Column(String(64), nullable=False, default="UTC")  # IANA, from the browser
    location = Column(String(300), nullable=True)
    casting = Column(String(200), nullable=True)
    casting_key = Column(String(200), nullable=True, index=True)
    material_raw = Column(String(300), nullable=True)
    material = Column(JSON().with_variant(JSONB(), "postgresql"), nullable=True)
    bring = Column(String(300), nullable=True)
    notes = Column(Text, nullable=True)
    tape_link = Column(String(500), nullable=True)
    source = Column(String(16), nullable=False, default="manual")
    user_script_id = Column(Integer, ForeignKey("user_scripts.id", ondelete="SET NULL"), nullable=True)
    reminders_on = Column(Boolean, nullable=False, default=True)
    outcome_token = Column(String(48), nullable=False, unique=True, default=_token)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_now, server_default=sql_text("now()"))
    updated_at = Column(
        DateTime(timezone=True), nullable=False, default=_now, onupdate=_now, server_default=sql_text("now()")
    )
    deleted_at = Column(DateTime(timezone=True), nullable=True)


class AuditionPiece(Base):
    __tablename__ = "audition_pieces"

    id = Column(Integer, primary_key=True, index=True)
    audition_id = Column(Integer, ForeignKey("auditions.id", ondelete="CASCADE"), nullable=False, index=True)
    # Exactly one of the two is set; enforced in services/auditions/core.add_piece.
    # No FK on purpose: monologues and scenes carry pgvector columns the SQLite
    # test fixture cannot create, and a piece that is later hidden should not
    # take the audition's history down with it.
    monologue_id = Column(Integer, nullable=True)
    scene_id = Column(Integer, nullable=True)
    used = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_now, server_default=sql_text("now()"))


class AuditionEvent(Base):
    __tablename__ = "audition_events"

    id = Column(Integer, primary_key=True, index=True)
    audition_id = Column(Integer, ForeignKey("auditions.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # created | status_changed | outcome_logged | reminder_sent | note_added
    kind = Column(String(24), nullable=False)
    data = Column(JSON().with_variant(JSONB(), "postgresql"), nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_now, server_default=sql_text("now()"))


class AuditionReminderSend(Base):
    __tablename__ = "audition_reminder_sends"
    __table_args__ = (UniqueConstraint("audition_id", "moment", name="uq_audition_reminder_moment"),)

    id = Column(Integer, primary_key=True, index=True)
    audition_id = Column(Integer, ForeignKey("auditions.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    moment = Column(String(8), nullable=False)  # prep | eve | after
    # YYYY-MM-DD in the audition's tz. One audition email per user per local day.
    local_day = Column(String(10), nullable=False)
    sent_at = Column(DateTime(timezone=True), nullable=False, default=_now, server_default=sql_text("now()"))
```

In `backend/app/models/user.py`, add directly under the `marketing_opt_in` line:

```python
    # Secret for the read-only calendar feed /api/auditions/calendar.ics?k=.
    # Made on first request; "Reset link" replaces it.
    calendar_feed_key = Column(String(48), unique=True, nullable=True)
```

(Check `String` is already imported at the top of `user.py`. If it isn't, add it to the existing `from sqlalchemy import ...` line.)

Append to `backend/app/models/__init__.py`:

```python
from app.models.audition import Audition, AuditionEvent, AuditionPiece, AuditionReminderSend
```

- [ ] **Step 4: Write the migration**

Create `backend/scripts/add_auditions_tables.sql`:

```sql
-- Audition tracker (backend/app/models/audition.py). Additive.
-- Apply on Supabase BEFORE the backend deploy that uses it.

CREATE TABLE IF NOT EXISTS auditions (
    id             SERIAL PRIMARY KEY,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project        VARCHAR(200) NOT NULL,
    role           VARCHAR(200),
    kind           VARCHAR(16) NOT NULL DEFAULT 'in_person',
    status         VARCHAR(16) NOT NULL DEFAULT 'scheduled',
    starts_at      TIMESTAMPTZ,
    due_at         TIMESTAMPTZ,
    tz             VARCHAR(64) NOT NULL DEFAULT 'UTC',
    location       VARCHAR(300),
    casting        VARCHAR(200),
    casting_key    VARCHAR(200),
    material_raw   VARCHAR(300),
    material       JSONB,
    bring          VARCHAR(300),
    notes          TEXT,
    tape_link      VARCHAR(500),
    source         VARCHAR(16) NOT NULL DEFAULT 'manual',
    user_script_id INTEGER REFERENCES user_scripts(id) ON DELETE SET NULL,
    reminders_on   BOOLEAN NOT NULL DEFAULT TRUE,
    outcome_token  VARCHAR(48) NOT NULL UNIQUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_auditions_user_id ON auditions (user_id);
CREATE INDEX IF NOT EXISTS ix_auditions_casting_key ON auditions (casting_key);
CREATE INDEX IF NOT EXISTS ix_auditions_when ON auditions ((coalesce(starts_at, due_at))) WHERE deleted_at IS NULL;
ALTER TABLE auditions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS audition_pieces (
    id           SERIAL PRIMARY KEY,
    audition_id  INTEGER NOT NULL REFERENCES auditions(id) ON DELETE CASCADE,
    monologue_id INTEGER,
    scene_id     INTEGER,
    used         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_audition_pieces_audition_id ON audition_pieces (audition_id);
ALTER TABLE audition_pieces ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS audition_events (
    id          SERIAL PRIMARY KEY,
    audition_id INTEGER NOT NULL REFERENCES auditions(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind        VARCHAR(24) NOT NULL,
    data        JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_audition_events_audition_id ON audition_events (audition_id);
CREATE INDEX IF NOT EXISTS ix_audition_events_user_id ON audition_events (user_id);
ALTER TABLE audition_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS audition_reminder_sends (
    id          SERIAL PRIMARY KEY,
    audition_id INTEGER NOT NULL REFERENCES auditions(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    moment      VARCHAR(8) NOT NULL,
    local_day   VARCHAR(10) NOT NULL,
    sent_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_audition_reminder_moment UNIQUE (audition_id, moment)
);
CREATE INDEX IF NOT EXISTS ix_audition_reminder_sends_user_day ON audition_reminder_sends (user_id, local_day);
ALTER TABLE audition_reminder_sends ENABLE ROW LEVEL SECURITY;

ALTER TABLE users ADD COLUMN IF NOT EXISTS calendar_feed_key VARCHAR(48) UNIQUE;

-- Reading it back:
--   select status, count(*) from auditions where deleted_at is null group by 1;
--   select moment, count(*) from audition_reminder_sends group by 1;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/test_auditions_core.py -q`
Expected: 2 passed

Run the full suite to make sure the new `users` column broke nothing: `.venv/bin/python -m pytest tests/ -q`
Expected: same pass count as before plus 2.

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/audition.py backend/app/models/__init__.py backend/app/models/user.py backend/scripts/add_auditions_tables.sql backend/tests/test_auditions_core.py
git commit -m "Auditions: the tables"
```

### Task 2: Event vocabulary

**Files:**
- Modify: `backend/app/services/events.py` (`SERVER_EVENT_NAMES`, `CLIENT_EVENT_NAMES`)
- Modify: `lib/events.ts` (`UserEventName`)
- Test: `backend/tests/test_auditions_core.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_auditions_core.py`, above the `if __name__` line:

```python
class VocabularyTests(unittest.TestCase):
    def test_tracker_events_are_known(self):
        from app.services.events import CLIENT_EVENT_NAMES, SERVER_EVENT_NAMES

        server = {
            "audition_created", "audition_status_changed", "audition_outcome_logged",
            "audition_parse_requested", "audition_parse_failed", "audition_reminder_sent",
        }
        client = {
            "audition_parse_corrected", "audition_prep_started", "audition_reminder_clicked",
            "audition_landing_shown", "audition_strip_clicked", "calendar_feed_subscribed",
        }
        self.assertTrue(server <= SERVER_EVENT_NAMES, server - SERVER_EVENT_NAMES)
        self.assertTrue(client <= CLIENT_EVENT_NAMES, client - CLIENT_EVENT_NAMES)
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_auditions_core.py -q -k vocabulary`
Expected: FAIL with an AssertionError listing the missing names

- [ ] **Step 3: Add the names**

In `backend/app/services/events.py`, add inside the `SERVER_EVENT_NAMES` set, before its closing `}`:

```python
        # The audition tracker (services/auditions). Written where the fact is
        # certain: the row exists, the status moved, the email left.
        "audition_created",  # {source: parse|manual|onboarding, kind, has_sides, has_material}
        "audition_status_changed",  # {audition_id, from, to}
        "audition_outcome_logged",  # {audition_id, outcome: good|callback|no, via: email|app}
        "audition_parse_requested",  # {has_pdf, has_text}; also the free quota counter
        "audition_parse_failed",  # {reason}
        "audition_reminder_sent",  # {audition_id, moment: prep|eve|after}
```

Add inside the `CLIENT_EVENT_NAMES` set, before its closing `}`:

```python
        # Audition tracker, browser side.
        "audition_parse_corrected",  # {fields}: parsed fields the actor changed before saving
        "audition_prep_started",  # {audition_id, kind: sides|monologue}
        "audition_reminder_clicked",  # {audition_id, moment}: landed from a reminder link
        "audition_landing_shown",  # {audition_id}: login sent them to the prep room
        "audition_strip_clicked",  # {surface: rehearse|monologues|winback_email}
        "calendar_feed_subscribed",  # copied the calendar link
```

In `lib/events.ts`, extend the `UserEventName` union. Replace the last line `  | "scene_run_abandoned";` with:

```ts
  | "scene_run_abandoned"
  | "audition_parse_corrected"
  | "audition_prep_started"
  | "audition_reminder_clicked"
  | "audition_landing_shown"
  | "audition_strip_clicked"
  | "calendar_feed_subscribed";
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_auditions_core.py -q`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/events.py lib/events.ts backend/tests/test_auditions_core.py
git commit -m "Auditions: the events they write"
```

### Task 3: Core service (create, update, outcome, scopes, prep)

**Files:**
- Create: `backend/app/services/auditions/__init__.py` (empty)
- Create: `backend/app/services/auditions/core.py`
- Test: `backend/tests/test_auditions_core.py`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_auditions_core.py`, above the `if __name__` line:

```python
from unittest import mock  # noqa: E402

from app.services.auditions import core  # noqa: E402


class CoreTests(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db(TABLES)
        self.user = User(email="a@x.com", supabase_id="a")
        self.other = User(email="b@x.com", supabase_id="b")
        self.db.add_all([self.user, self.other])
        self.db.commit()
        self.events = []
        self.p = mock.patch.object(core, "record_user_event", lambda uid, name, props=None: self.events.append((name, props)))
        self.p.start()

    def tearDown(self):
        self.p.stop()
        restore(self.saved)

    def _make(self, **kw):
        data = {"project": "The Glass Menagerie", "role": "Laura", "tz": "America/New_York"}
        data.update(kw)
        return core.create_audition(self.db, self.user.id, data, source="manual", now=NOW)

    def test_casting_key_groups_spellings(self):
        self.assertEqual(core.casting_key("Telsey + Co. Casting"), core.casting_key("telsey co"))
        self.assertIsNone(core.casting_key("   "))

    def test_create_sets_status_from_date_and_writes_events(self):
        dated = self._make(starts_at=NOW + timedelta(days=2))
        undated = self._make()
        self.assertEqual(dated.status, "scheduled")
        self.assertEqual(undated.status, "submitted")
        kinds = [e.kind for e in self.db.query(AuditionEvent).all()]
        self.assertEqual(kinds, ["created", "created"])
        self.assertEqual(self.events[0][0], "audition_created")
        self.assertEqual(self.events[0][1]["source"], "manual")

    def test_create_rejects_bad_kind_and_blank_project(self):
        with self.assertRaises(ValueError):
            self._make(kind="hologram")
        with self.assertRaises(ValueError):
            self._make(project="  ")

    def test_update_status_writes_status_changed(self):
        a = self._make(starts_at=NOW + timedelta(days=2))
        core.update_audition(self.db, a, {"status": "callback", "location": "Ripley Grier"})
        self.assertEqual(a.status, "callback")
        ev = self.db.query(AuditionEvent).filter_by(kind="status_changed").one()
        self.assertEqual(ev.data, {"from": "scheduled", "to": "callback"})
        self.assertIn(("audition_status_changed", {"audition_id": a.id, "from": "scheduled", "to": "callback"}), self.events)

    def test_update_ignores_unknown_fields(self):
        a = self._make()
        core.update_audition(self.db, a, {"user_id": self.other.id, "outcome_token": "x"})
        self.assertEqual(a.user_id, self.user.id)
        self.assertNotEqual(a.outcome_token, "x")

    def test_outcome_moves_status(self):
        a = self._make(starts_at=NOW - timedelta(hours=20))
        core.log_outcome(self.db, a, "callback", via="email")
        self.assertEqual(a.status, "callback")
        core.log_outcome(self.db, a, "no", via="app")
        self.assertEqual(a.status, "passed")
        b = self._make(starts_at=NOW - timedelta(hours=20))
        core.log_outcome(self.db, b, "good", via="email")
        self.assertEqual(b.status, "scheduled")
        with self.assertRaises(ValueError):
            core.log_outcome(self.db, b, "meh", via="app")

    def test_same_outcome_twice_is_a_no_op(self):
        a = self._make(starts_at=NOW - timedelta(hours=20))
        core.log_outcome(self.db, a, "callback", via="email")
        core.log_outcome(self.db, a, "callback", via="email")
        self.assertEqual(self.db.query(AuditionEvent).filter_by(kind="outcome_logged").count(), 1)

    def test_scope(self):
        up = self._make(starts_at=NOW + timedelta(days=1))
        waiting = self._make(starts_at=NOW - timedelta(days=3))
        undated = self._make()
        booked = self._make(starts_at=NOW - timedelta(days=3))
        core.update_audition(self.db, booked, {"status": "booked"})
        stale = self._make(starts_at=NOW - timedelta(days=90))
        self.assertEqual(core.scope_of(up, NOW), "upcoming")
        self.assertEqual(core.scope_of(waiting, NOW), "waiting")
        self.assertEqual(core.scope_of(undated, NOW), "waiting")
        self.assertEqual(core.scope_of(booked, NOW), "past")
        self.assertEqual(core.scope_of(stale, NOW), "past")

    def test_list_is_per_user_sorted_and_skips_deleted(self):
        later = self._make(project="Later", starts_at=NOW + timedelta(days=9))
        sooner = self._make(project="Sooner", starts_at=NOW + timedelta(days=1))
        gone = self._make(project="Gone", starts_at=NOW + timedelta(days=2))
        core.delete_audition(self.db, gone, now=NOW)
        core.create_audition(self.db, self.other.id, {"project": "Theirs", "tz": "UTC"}, source="manual", now=NOW)
        names = [a.project for a in core.list_auditions(self.db, self.user.id, NOW)]
        self.assertEqual(names, ["Sooner", "Later"])
        self.assertEqual(later.status, "scheduled")

    def test_next_upcoming_only_inside_window(self):
        self._make(project="Far", starts_at=NOW + timedelta(days=20))
        self.assertIsNone(core.next_upcoming(self.db, self.user.id, NOW))
        self._make(project="Near", starts_at=NOW + timedelta(days=3))
        self.assertEqual(core.next_upcoming(self.db, self.user.id, NOW).project, "Near")

    def test_get_owned(self):
        a = self._make()
        self.assertIs(core.get_owned(self.db, self.user.id, a.id), a)
        self.assertIsNone(core.get_owned(self.db, self.other.id, a.id))

    def test_add_piece_needs_exactly_one(self):
        a = self._make()
        core.add_piece(self.db, a, monologue_id=7)
        with self.assertRaises(ValueError):
            core.add_piece(self.db, a)
        with self.assertRaises(ValueError):
            core.add_piece(self.db, a, monologue_id=1, scene_id=2)
        self.assertEqual(self.db.query(AuditionPiece).count(), 1)


class PrepStepTests(unittest.TestCase):
    def _a(self, **kw):
        return Audition(id=5, project="P", tz="UTC", **kw)

    def test_sides_first_then_piece(self):
        steps = core.build_prep_steps(self._a(user_script_id=9, material_raw="1 min contemporary comedic"), runs=0, piece_count=0)
        self.assertEqual([s["key"] for s in steps], ["sides", "piece"])
        self.assertEqual(steps[0]["href"], "/practice?script=9")
        self.assertFalse(steps[0]["done"])
        self.assertEqual(steps[1]["href"], "/monologues?q=1+min+contemporary+comedic")

    def test_done_flags(self):
        steps = core.build_prep_steps(self._a(user_script_id=9, material_raw="x"), runs=2, piece_count=1)
        self.assertTrue(all(s["done"] for s in steps))

    def test_nothing_known_asks_what_you_are_bringing(self):
        (step,) = core.build_prep_steps(self._a(), runs=0, piece_count=0)
        self.assertEqual(step["key"], "bring")
        self.assertEqual(step["href"], "/rehearse")
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_auditions_core.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.auditions'`

- [ ] **Step 3: Write the service**

Create an empty `backend/app/services/auditions/__init__.py`.

Create `backend/app/services/auditions/core.py`:

```python
"""Everything the audition router does, as plain functions on a session.

The router stays thin so these can be tested against the SQLite fixture and so
Ghost Light gets the same behaviour from the same endpoints later.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from urllib.parse import urlencode

from sqlalchemy.orm import Session

from app.models.audition import (
    CLOSED_STATUSES,
    KINDS,
    SOURCES,
    STATUSES,
    Audition,
    AuditionEvent,
    AuditionPiece,
)
from app.services.events import record_user_event

LANDING_WINDOW_DAYS = 14  # login goes to the prep room only this close
WAITING_DAYS = 60  # unresolved this long after the date, it drops to Past
OUTCOMES = {"good": None, "callback": "callback", "no": "passed"}  # outcome -> new status (None keeps it)

EDITABLE = (
    "project", "role", "kind", "status", "starts_at", "due_at", "tz", "location", "casting",
    "material_raw", "material", "bring", "notes", "tape_link", "user_script_id", "reminders_on",
)
_CASTING_NOISE = {"casting", "csa", "inc", "llc", "co", "the", "and"}


def aware(dt: Optional[datetime]) -> Optional[datetime]:
    """SQLite hands back naive datetimes; Postgres does not. Treat naive as UTC."""
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def when(a: Audition) -> Optional[datetime]:
    return aware(a.starts_at or a.due_at)


def casting_key(name: Optional[str]) -> Optional[str]:
    words = re.sub(r"[^a-z0-9]+", " ", (name or "").lower()).split()
    words = [w for w in words if w not in _CASTING_NOISE]
    return " ".join(words) or None


def scope_of(a: Audition, now: datetime) -> str:
    w = when(a)
    if w is not None and w >= now and a.status not in CLOSED_STATUSES:
        return "upcoming"
    if a.status in CLOSED_STATUSES:
        return "past"
    if w is None or now - w <= timedelta(days=WAITING_DAYS):
        return "waiting"
    return "past"


def _clean(data: dict[str, Any]) -> dict[str, Any]:
    out = {k: v for k, v in data.items() if k in EDITABLE}
    for k, v in list(out.items()):
        if isinstance(v, str):
            out[k] = v.strip() or None
    if "kind" in out and out["kind"] not in KINDS:
        raise ValueError(f"kind must be one of {KINDS}")
    if "status" in out and out["status"] not in STATUSES:
        raise ValueError(f"status must be one of {STATUSES}")
    if "project" in out and not out["project"]:
        raise ValueError("project is required")
    return out


def _event(db: Session, a: Audition, kind: str, data: Optional[dict] = None) -> None:
    db.add(AuditionEvent(audition_id=a.id, user_id=a.user_id, kind=kind, data=data or {}))


def create_audition(
    db: Session, user_id: int, data: dict[str, Any], *, source: str, now: Optional[datetime] = None
) -> Audition:
    if source not in SOURCES:
        raise ValueError(f"source must be one of {SOURCES}")
    fields = _clean(data)
    if not fields.get("project"):
        raise ValueError("project is required")
    fields.setdefault("kind", "in_person")
    fields.setdefault("tz", "UTC")
    if "status" not in fields:
        fields["status"] = "scheduled" if (fields.get("starts_at") or fields.get("due_at")) else "submitted"
    a = Audition(user_id=user_id, source=source, casting_key=casting_key(fields.get("casting")), **fields)
    if now is not None:
        a.created_at = now
        a.updated_at = now
    db.add(a)
    db.flush()
    _event(db, a, "created", {"source": source})
    db.commit()
    record_user_event(user_id, "audition_created", {
        "source": source,
        "kind": a.kind,
        "has_sides": a.user_script_id is not None,
        "has_material": bool(a.material_raw or a.material),
    })
    return a


def update_audition(db: Session, a: Audition, changes: dict[str, Any]) -> Audition:
    fields = _clean(changes)
    old_status = a.status
    for k, v in fields.items():
        setattr(a, k, v)
    if "casting" in fields:
        a.casting_key = casting_key(a.casting)
    if a.status != old_status:
        _event(db, a, "status_changed", {"from": old_status, "to": a.status})
    db.commit()
    if a.status != old_status:
        record_user_event(a.user_id, "audition_status_changed", {"audition_id": a.id, "from": old_status, "to": a.status})
    return a


def delete_audition(db: Session, a: Audition, *, now: Optional[datetime] = None) -> None:
    a.deleted_at = now or datetime.now(timezone.utc)
    db.commit()


def log_outcome(db: Session, a: Audition, outcome: str, *, via: str) -> Audition:
    if outcome not in OUTCOMES:
        raise ValueError(f"outcome must be one of {tuple(OUTCOMES)}")
    last = (
        db.query(AuditionEvent)
        .filter(AuditionEvent.audition_id == a.id, AuditionEvent.kind == "outcome_logged")
        .order_by(AuditionEvent.id.desc())
        .first()
    )
    if last is not None and (last.data or {}).get("outcome") == outcome:
        return a  # a second tap on the same link changes nothing
    new_status = OUTCOMES[outcome]
    if new_status and new_status != a.status:
        _event(db, a, "status_changed", {"from": a.status, "to": new_status})
        a.status = new_status
    _event(db, a, "outcome_logged", {"outcome": outcome, "via": via})
    db.commit()
    record_user_event(a.user_id, "audition_outcome_logged", {"audition_id": a.id, "outcome": outcome, "via": via})
    return a


def get_owned(db: Session, user_id: int, audition_id: int) -> Optional[Audition]:
    return (
        db.query(Audition)
        .filter(Audition.id == audition_id, Audition.user_id == user_id, Audition.deleted_at.is_(None))
        .first()
    )


def list_auditions(db: Session, user_id: int, now: datetime, scope: Optional[str] = None) -> list[Audition]:
    rows = db.query(Audition).filter(Audition.user_id == user_id, Audition.deleted_at.is_(None)).all()
    order = {"upcoming": 0, "waiting": 1, "past": 2}
    far = datetime.max.replace(tzinfo=timezone.utc)

    def key(a: Audition):
        s = scope_of(a, now)
        w = when(a) or far
        # upcoming soonest first; waiting and past most recent first
        return (order[s], w.timestamp() if s == "upcoming" else -w.timestamp() if w != far else 0)

    rows.sort(key=key)
    if scope:
        rows = [a for a in rows if scope_of(a, now) == scope]
    return rows


def next_upcoming(db: Session, user_id: int, now: datetime) -> Optional[Audition]:
    horizon = now + timedelta(days=LANDING_WINDOW_DAYS)
    for a in list_auditions(db, user_id, now, scope="upcoming"):
        if when(a) <= horizon:
            return a
    return None


def add_piece(
    db: Session, a: Audition, *, monologue_id: Optional[int] = None, scene_id: Optional[int] = None
) -> AuditionPiece:
    if (monologue_id is None) == (scene_id is None):
        raise ValueError("give exactly one of monologue_id or scene_id")
    piece = AuditionPiece(audition_id=a.id, monologue_id=monologue_id, scene_id=scene_id)
    db.add(piece)
    db.commit()
    return piece


def remove_piece(db: Session, a: Audition, piece_id: int) -> bool:
    piece = db.query(AuditionPiece).filter_by(id=piece_id, audition_id=a.id).first()
    if piece is None:
        return False
    db.delete(piece)
    db.commit()
    return True


def pieces_for(db: Session, a: Audition) -> list[AuditionPiece]:
    return db.query(AuditionPiece).filter_by(audition_id=a.id).order_by(AuditionPiece.id).all()


def count_runs(db: Session, a: Audition) -> tuple[int, Optional[datetime]]:
    """Completed ScenePartner runs on the sides, plus Monologue Work starts on the
    linked pieces, since the audition was added. Imports inside: the actor models
    carry Postgres-only columns, and tests patch this function out."""
    from app.models.actor import RehearsalSession, Scene
    from app.models.user_event import UserEvent

    since = aware(a.created_at)
    stamps: list[datetime] = []
    if a.user_script_id:
        q = (
            db.query(RehearsalSession.created_at)
            .join(Scene, Scene.id == RehearsalSession.scene_id)
            .filter(
                Scene.user_script_id == a.user_script_id,
                RehearsalSession.user_id == a.user_id,
                RehearsalSession.status == "completed",
                RehearsalSession.created_at >= since,
            )
        )
        stamps += [aware(r[0]) for r in q.all()]
    mono_ids = {p.monologue_id for p in pieces_for(db, a) if p.monologue_id}
    if mono_ids:
        rows = (
            db.query(UserEvent.created_at, UserEvent.properties)
            .filter(
                UserEvent.user_id == a.user_id,
                UserEvent.event_name == "monologue_work_started",
                UserEvent.created_at >= since,
            )
            .all()
        )
        stamps += [aware(c) for c, props in rows if (props or {}).get("monologue_id") in mono_ids]
    return len(stamps), (max(stamps) if stamps else None)


def build_prep_steps(a: Audition, *, runs: int, piece_count: int) -> list[dict[str, Any]]:
    steps: list[dict[str, Any]] = []
    if a.user_script_id:
        steps.append({"key": "sides", "label": "Run the sides", "done": runs > 0,
                      "href": f"/practice?script={a.user_script_id}"})
    if a.material_raw or a.material:
        q = a.material_raw or " ".join(str(v) for v in (a.material or {}).values() if v)
        steps.append({"key": "piece", "label": "Pick your piece", "done": piece_count > 0,
                      "href": "/monologues?" + urlencode({"q": q})})
    if not steps:
        steps.append({"key": "bring", "label": "What are you bringing?", "done": piece_count > 0,
                      "href": "/rehearse"})
    return steps


def _iso(dt: Optional[datetime]) -> Optional[str]:
    dt = aware(dt)
    return dt.isoformat() if dt else None


def serialize(db: Session, a: Audition, now: datetime, *, with_prep: bool = True) -> dict[str, Any]:
    pieces = pieces_for(db, a)
    out: dict[str, Any] = {
        "id": a.id, "project": a.project, "role": a.role, "kind": a.kind, "status": a.status,
        "starts_at": _iso(a.starts_at), "due_at": _iso(a.due_at), "when": _iso(when(a)), "tz": a.tz,
        "location": a.location, "casting": a.casting, "material_raw": a.material_raw, "material": a.material,
        "bring": a.bring, "notes": a.notes, "tape_link": a.tape_link, "source": a.source,
        "user_script_id": a.user_script_id, "reminders_on": a.reminders_on,
        "scope": scope_of(a, now), "created_at": _iso(a.created_at),
        "pieces": [{"id": p.id, "monologue_id": p.monologue_id, "scene_id": p.scene_id, "used": p.used} for p in pieces],
    }
    if with_prep:
        runs, last = count_runs(db, a)
        out["prep"] = {"runs": runs, "last_run_at": _iso(last),
                       "steps": build_prep_steps(a, runs=runs, piece_count=len(pieces))}
    return out
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/test_auditions_core.py -q`
Expected: all pass (18 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/auditions backend/tests/test_auditions_core.py
git commit -m "Auditions: create, move, log an outcome, and work out the prep"
```

### Task 4: Breakdown parsing and the free quota

**Files:**
- Create: `backend/app/services/auditions/parse.py`
- Test: `backend/tests/test_auditions_parse.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_auditions_parse.py`:

```python
"""Breakdown parsing: the model is never called here. Recorded model outputs go
through normalize_draft, and parse_notice gets a fake llm_call."""

import json
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

from app.models.organization import Organization
from app.models.user import User
from app.models.user_event import UserEvent
from app.services.auditions import parse
from tests.dbfixture import memory_db, restore

NOW = datetime(2026, 10, 7, 15, 0, tzinfo=timezone.utc)  # a Wednesday

BACKSTAGE = {
    "project": {"value": "Arden Theatre 2027 Season", "confidence": "high"},
    "role": {"value": None, "confidence": "high"},
    "kind": {"value": "in_person", "confidence": "high"},
    "starts_at": {"value": "2026-10-09T10:40:00", "confidence": "high"},
    "due_at": {"value": None, "confidence": "high"},
    "location": {"value": "Ripley Grier, Studio 16C", "confidence": "high"},
    "casting": {"value": "Telsey + Co", "confidence": "low"},
    "material_raw": {"value": "1 min contemporary comedic", "confidence": "high"},
    "material": {"length_seconds": 60, "genre": "comedic", "era": "contemporary", "count": 1},
    "bring": {"value": "headshot and resume", "confidence": "high"},
}


class NormalizeTests(unittest.TestCase):
    def test_local_time_becomes_utc_and_confidence_survives(self):
        d = parse.normalize_draft(BACKSTAGE, NOW, "America/New_York")
        self.assertEqual(d["starts_at"]["value"], "2026-10-09T14:40:00+00:00")  # EDT is UTC-4
        self.assertEqual(d["starts_at"]["confidence"], "high")
        self.assertEqual(d["casting"]["confidence"], "low")
        self.assertEqual(d["material"], {"length_seconds": 60, "genre": "comedic", "era": "contemporary", "count": 1})

    def test_past_and_far_future_dates_drop_to_low(self):
        raw = dict(BACKSTAGE, starts_at={"value": "2026-09-01T10:00:00", "confidence": "high"})
        self.assertEqual(parse.normalize_draft(raw, NOW, "UTC")["starts_at"]["confidence"], "low")
        raw = dict(BACKSTAGE, starts_at={"value": "2029-01-01T10:00:00", "confidence": "high"})
        self.assertEqual(parse.normalize_draft(raw, NOW, "UTC")["starts_at"]["confidence"], "low")

    def test_garbage_is_survivable(self):
        d = parse.normalize_draft({"project": "not a dict", "kind": {"value": "hologram"},
                                   "starts_at": {"value": "next thursday-ish"}}, NOW, "Not/AZone")
        self.assertEqual(d["project"], {"value": None, "confidence": "low"})
        self.assertEqual(d["kind"], {"value": "in_person", "confidence": "low"})
        self.assertEqual(d["starts_at"], {"value": None, "confidence": "low"})

    def test_long_strings_are_cut(self):
        raw = dict(BACKSTAGE, project={"value": "x" * 900, "confidence": "high"})
        self.assertEqual(len(parse.normalize_draft(raw, NOW, "UTC")["project"]["value"]), 200)


class ParseNoticeTests(unittest.TestCase):
    def test_good_call(self):
        out = parse.parse_notice("notice", NOW, "UTC", llm_call=lambda prompt: json.dumps(BACKSTAGE))
        self.assertTrue(out["ok"])
        self.assertEqual(out["draft"]["project"]["value"], "Arden Theatre 2027 Season")

    def test_retries_once_then_gives_the_text_back(self):
        calls = []

        def bad(prompt):
            calls.append(prompt)
            return "not json"

        out = parse.parse_notice("CALLBACK Thursday for LAURA", NOW, "UTC", llm_call=bad)
        self.assertEqual(len(calls), 2)
        self.assertFalse(out["ok"])
        self.assertEqual(out["draft"]["notes"]["value"], "CALLBACK Thursday for LAURA")

    def test_prompt_carries_date_and_zone(self):
        seen = []
        parse.parse_notice("x", NOW, "Europe/London", llm_call=lambda p: seen.append(p) or json.dumps(BACKSTAGE))
        self.assertIn("Wednesday 2026-10-07", seen[0])
        self.assertIn("Europe/London", seen[0])

    def test_text_is_capped(self):
        seen = []
        parse.parse_notice("y" * 50_000, NOW, "UTC", llm_call=lambda p: seen.append(p) or json.dumps(BACKSTAGE))
        self.assertLess(len(seen[0]), parse.MAX_TEXT + 3000)


class QuotaTests(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db([Organization, User, UserEvent])
        self.user = User(email="q@x.com", supabase_id="q")
        self.db.add(self.user)
        self.db.commit()

    def tearDown(self):
        restore(self.saved)

    def _use(self, n, when):
        for _ in range(n):
            self.db.add(UserEvent(user_id=self.user.id, event_name="audition_parse_requested", properties={}, created_at=when))
        self.db.commit()

    def test_free_gets_five_a_calendar_month(self):
        with mock.patch.object(parse, "_is_paid", lambda db, uid: False):
            self._use(4, NOW - timedelta(days=1))
            self._use(9, datetime(2026, 9, 28, tzinfo=timezone.utc))  # last month, does not count
            q = parse.quota(self.db, self.user.id, NOW)
            self.assertEqual((q["used"], q["limit"], q["remaining"]), (4, 5, 1))
            self._use(1, NOW)
            self.assertEqual(parse.quota(self.db, self.user.id, NOW)["remaining"], 0)

    def test_paid_is_unlimited(self):
        with mock.patch.object(parse, "_is_paid", lambda db, uid: True):
            self._use(40, NOW)
            q = parse.quota(self.db, self.user.id, NOW)
            self.assertIsNone(q["limit"])
            self.assertIsNone(q["remaining"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_auditions_parse.py -q`
Expected: FAIL with `ImportError: cannot import name 'parse'`

- [ ] **Step 3: Write the parser**

Create `backend/app/services/auditions/parse.py`:

```python
"""Turn a pasted casting notice (and/or the first pages of a sides PDF) into a
draft audition the actor confirms. Nothing here saves anything.

gpt-4o-mini in JSON mode through get_llm(), temperature 0. Every field comes
back as {value, confidence}; the card outlines the low ones. A model failure is
never a dead end: the caller gets an empty draft with the pasted text in notes.
"""

from __future__ import annotations

import json
import logging
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy.orm import Session

from app.models.audition import KINDS

logger = logging.getLogger(__name__)

MAX_TEXT = 12_000
TIMEOUT_S = 10
FREE_PARSES_PER_MONTH = 5
FIELDS = ("project", "role", "kind", "starts_at", "due_at", "location", "casting", "material_raw", "bring", "notes")
MAX_LEN = {"project": 200, "role": 200, "location": 300, "casting": 200, "material_raw": 300, "bring": 300, "notes": 4000}

PROMPT = """You read casting notices and audition emails for actors.
Today is {today}. The actor's timezone is {tz}.
Return JSON with exactly these keys. Each of them except "material" is an object {{"value": ..., "confidence": "high" or "low"}}:
project, role, kind ("in_person", "self_tape" or "virtual"), starts_at (appointment, ISO 8601 local time without offset, e.g. 2026-10-09T10:40:00), due_at (self-tape deadline, same format), location, casting (casting director or office), material_raw (what to prepare, as written, e.g. "1 min contemporary comedic"), bring (what to bring).
"material" is an object {{"length_seconds": int or null, "genre": "comedic", "dramatic" or null, "era": "contemporary", "classical" or null, "count": int or null}}.
Use a null value when the notice does not say. Use "low" confidence for anything you inferred or are unsure about, including relative dates like "Thursday".

Notice:
<<<
{text}
>>>"""


def _zone(tz: str) -> ZoneInfo:
    try:
        return ZoneInfo(tz)
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("UTC")


def _field(raw: Any) -> tuple[Any, str]:
    if not isinstance(raw, dict):
        return None, "low"
    conf = raw.get("confidence") if raw.get("confidence") in ("high", "low") else "low"
    return raw.get("value"), conf


def _date(value: Any, conf: str, now: datetime, zone: ZoneInfo) -> dict:
    if not isinstance(value, str) or not value.strip():
        return {"value": None, "confidence": conf if value is None else "low"}
    try:
        dt = datetime.fromisoformat(value.strip())
    except ValueError:
        return {"value": None, "confidence": "low"}
    dt = dt.replace(tzinfo=zone) if dt.tzinfo is None else dt
    dt = dt.astimezone(timezone.utc)
    if dt < now - timedelta(days=1) or dt > now + timedelta(days=548):
        conf = "low"
    return {"value": dt.isoformat(), "confidence": conf}


def empty_draft(notes: str = "") -> dict:
    d = {f: {"value": None, "confidence": "low"} for f in FIELDS}
    d["kind"] = {"value": "in_person", "confidence": "low"}
    d["notes"] = {"value": notes[:MAX_LEN["notes"]] or None, "confidence": "high"}
    d["material"] = None
    return d


def normalize_draft(raw: dict, now: datetime, tz: str) -> dict:
    zone = _zone(tz)
    d = empty_draft()
    d["notes"] = {"value": None, "confidence": "high"}
    for f in ("project", "role", "location", "casting", "material_raw", "bring"):
        value, conf = _field(raw.get(f))
        if isinstance(value, str) and value.strip():
            d[f] = {"value": value.strip()[: MAX_LEN[f]], "confidence": conf}
        else:
            d[f] = {"value": None, "confidence": "low" if not isinstance(raw.get(f), dict) else conf}
    kind, conf = _field(raw.get("kind"))
    d["kind"] = {"value": kind, "confidence": conf} if kind in KINDS else {"value": "in_person", "confidence": "low"}
    for f in ("starts_at", "due_at"):
        value, conf = _field(raw.get(f))
        d[f] = _date(value, conf, now, zone)
    m = raw.get("material")
    if isinstance(m, dict):
        d["material"] = {
            "length_seconds": m.get("length_seconds") if isinstance(m.get("length_seconds"), int) else None,
            "genre": m.get("genre") if m.get("genre") in ("comedic", "dramatic") else None,
            "era": m.get("era") if m.get("era") in ("contemporary", "classical") else None,
            "count": m.get("count") if isinstance(m.get("count"), int) else None,
        }
    return d


def _default_llm_call(prompt: str) -> str:
    from app.services.ai.langchain.config import get_llm

    llm = get_llm(model="gpt-4o-mini", temperature=0, use_json_format=True)
    with ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(lambda: llm.invoke(prompt).content).result(timeout=TIMEOUT_S)


def parse_notice(
    text: str, now: datetime, tz: str, llm_call: Optional[Callable[[str], str]] = None
) -> dict:
    """{ok, draft}. ok is False when the model failed twice or timed out."""
    call = llm_call or _default_llm_call
    local = now.astimezone(_zone(tz))
    prompt = PROMPT.format(today=local.strftime("%A %Y-%m-%d %H:%M"), tz=tz, text=text[:MAX_TEXT])
    for attempt in range(2):
        try:
            raw = json.loads(call(prompt))
            if isinstance(raw, dict):
                return {"ok": True, "draft": normalize_draft(raw, now, tz)}
        except (json.JSONDecodeError, TypeError):
            continue
        except (FutureTimeout, Exception) as exc:  # noqa: BLE001
            logger.warning("audition parse failed: %s", exc)
            break
    return {"ok": False, "draft": empty_draft(text)}


def header_text_from_pdf(content: bytes) -> str:
    """The first two pages: enough for the title, role and casting header."""
    from app.services.script_parser import extract_pdf_text

    try:
        return extract_pdf_text(content, only_pages={1, 2}) or ""
    except Exception as exc:  # noqa: BLE001
        logger.warning("audition parse: pdf text failed: %s", exc)
        return ""


def _is_paid(db: Session, user_id: int) -> bool:
    from app.models.billing import UserSubscription

    sub = db.query(UserSubscription).filter(UserSubscription.user_id == user_id).first()
    return bool(sub and sub.is_active and sub.tier and sub.tier.name != "free")


def quota(db: Session, user_id: int, now: datetime) -> dict:
    """Free: 5 parses per calendar month (UTC), counted off the events table."""
    from app.models.user_event import UserEvent

    if _is_paid(db, user_id):
        return {"used": None, "limit": None, "remaining": None}
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    used = (
        db.query(UserEvent)
        .filter(
            UserEvent.user_id == user_id,
            UserEvent.event_name == "audition_parse_requested",
            UserEvent.created_at >= start,
        )
        .count()
    )
    return {"used": used, "limit": FREE_PARSES_PER_MONTH, "remaining": max(0, FREE_PARSES_PER_MONTH - used)}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/test_auditions_parse.py -q`
Expected: 10 passed

If `test_free_gets_five_a_calendar_month` fails because SQLite compares naive with aware: `memory_db` stores `created_at` naive. In that case change `start` in `quota` to `start.replace(tzinfo=None)` only when `db.bind.dialect.name == "sqlite"`, and re-run.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/auditions/parse.py backend/tests/test_auditions_parse.py
git commit -m "Auditions: read a casting notice into a draft, five a month free"
```

### Task 5: Calendar feed

**Files:**
- Create: `backend/app/services/auditions/ics.py`
- Test: `backend/tests/test_auditions_ics.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_auditions_ics.py`:

```python
import unittest
from datetime import datetime, timezone

from app.models.audition import Audition
from app.services.auditions import ics

NOW = datetime(2026, 10, 7, 15, 0, tzinfo=timezone.utc)


class IcsTests(unittest.TestCase):
    def test_timed_and_all_day(self):
        timed = Audition(id=1, project="The Glass Menagerie", role="Laura", kind="in_person", status="callback",
                         starts_at=datetime(2026, 10, 9, 14, 40, tzinfo=timezone.utc), tz="America/New_York",
                         location="Ripley Grier, 16C", casting="Telsey; Co", bring="sides")
        tape = Audition(id=2, project="Untitled Pilot", kind="self_tape", status="scheduled",
                        due_at=datetime(2026, 10, 12, 21, 0, tzinfo=timezone.utc), tz="America/New_York")
        out = ics.build_calendar([timed, tape], now=NOW, site="https://actorrise.com")
        self.assertTrue(out.startswith("BEGIN:VCALENDAR\r\n"))
        self.assertTrue(out.endswith("END:VCALENDAR\r\n"))
        self.assertIn("UID:audition-1@actorrise.com", out)
        self.assertIn("DTSTART:20261009T144000Z", out)
        self.assertIn("DTEND:20261009T154000Z", out)
        self.assertIn("SUMMARY:Callback: The Glass Menagerie (Laura)", out)
        self.assertIn("LOCATION:Ripley Grier\\, 16C", out)
        self.assertIn("Casting: Telsey\\; Co", out)
        self.assertIn("DTSTART;VALUE=DATE:20261012", out)
        self.assertIn("DTEND;VALUE=DATE:20261013", out)
        self.assertIn("SUMMARY:Tape due 5:00 PM: Untitled Pilot", out)

    def test_lines_are_folded(self):
        a = Audition(id=3, project="P" * 200, kind="in_person", status="scheduled",
                     starts_at=datetime(2026, 10, 9, 14, 0, tzinfo=timezone.utc), tz="UTC")
        for line in ics.build_calendar([a], now=NOW, site="https://a").split("\r\n"):
            self.assertLessEqual(len(line.encode()), 75)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_auditions_ics.py -q`
Expected: FAIL with `ImportError: cannot import name 'ics'`

- [ ] **Step 3: Write the feed builder**

Create `backend/app/services/auditions/ics.py`:

```python
"""One read-only iCalendar feed per actor (RFC 5545, the subset calendars read)."""

from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.models.audition import Audition
from app.services.auditions.core import aware


def _esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def _fold(line: str) -> list[str]:
    out, cur = [], ""
    for ch in line:
        limit = 75 if not out else 74  # continuation lines start with a space
        if len((cur + ch).encode()) > limit:
            out.append(cur)
            cur = ch
        else:
            cur += ch
    out.append(cur)
    return [out[0]] + [" " + c for c in out[1:]]


def _utc(dt: datetime) -> str:
    return aware(dt).strftime("%Y%m%dT%H%M%SZ")


def _label(a: Audition) -> str:
    return "Callback" if a.status == "callback" else "Audition"


def _event(a: Audition, now: datetime, site: str) -> list[str]:
    try:
        zone = ZoneInfo(a.tz)
    except (ZoneInfoNotFoundError, ValueError):
        zone = ZoneInfo("UTC")
    lines = ["BEGIN:VEVENT", f"UID:audition-{a.id}@actorrise.com", f"DTSTAMP:{_utc(now)}"]
    title = f"{a.project} ({a.role})" if a.role else a.project
    if a.kind == "self_tape" and a.due_at:
        local = aware(a.due_at).astimezone(zone)
        day = local.date()
        lines += [f"DTSTART;VALUE=DATE:{day:%Y%m%d}", f"DTEND;VALUE=DATE:{day + timedelta(days=1):%Y%m%d}"]
        clock = local.strftime("%I:%M %p").lstrip("0")
        lines.append(f"SUMMARY:{_esc(f'Tape due {clock}: {title}')}")
    else:
        start = aware(a.starts_at)
        lines += [f"DTSTART:{_utc(start)}", f"DTEND:{_utc(start + timedelta(hours=1))}"]
        lines.append(f"SUMMARY:{_esc(f'{_label(a)}: {title}')}")
    if a.location:
        lines.append(f"LOCATION:{_esc(a.location)}")
    desc = []
    if a.casting:
        desc.append(f"Casting: {a.casting}")
    if a.bring:
        desc.append(f"Bring: {a.bring}")
    desc.append(f"Prep: {site}/auditions/{a.id}")
    lines.append(f"DESCRIPTION:{_esc(chr(10).join(desc))}")
    lines.append("END:VEVENT")
    return lines


def build_calendar(auditions: list[Audition], *, now: datetime, site: str) -> str:
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ActorRise//Auditions//EN",
             "CALSCALE:GREGORIAN", "X-WR-CALNAME:Auditions (ActorRise)"]
    for a in auditions:
        if a.starts_at or a.due_at:
            lines += _event(a, now, site)
    lines.append("END:VCALENDAR")
    folded = [piece for line in lines for piece in _fold(line)]
    return "\r\n".join(folded) + "\r\n"
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_auditions_ics.py -q`
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/auditions/ics.py backend/tests/test_auditions_ics.py
git commit -m "Auditions: a calendar feed"
```

### Task 6: The router

The router has no unit tests of its own. The repo tests services, not routes, and every route here is a few lines over Tasks 3 to 5. Task 19 verifies it end to end against a running backend.

**Files:**
- Create: `backend/app/api/auditions.py`
- Modify: `backend/app/main.py` (import and `include_router` next to the other routers, around line 483)

- [ ] **Step 1: Write the router**

Create `backend/app/api/auditions.py`:

```python
"""/api/auditions: the audition tracker.

Plain REST and plain JSON so Ghost Light can use the same endpoints later.
Static paths are declared before /{audition_id}, which would otherwise swallow
"next" and "parse" and answer 422.
"""

import os
import secrets
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.database import get_db
from app.models.audition import Audition
from app.models.user import User
from app.services.auditions import core, ics, parse
from app.services.events import record_user_event

router = APIRouter(prefix="/api/auditions", tags=["auditions"])

SITE_URL = os.getenv("SITE_URL", "https://actorrise.com")
API_PUBLIC_URL = os.getenv("API_PUBLIC_URL", "https://api.actorrise.com")


def _now() -> datetime:
    return datetime.now(timezone.utc)


class AuditionIn(BaseModel):
    project: str = Field(min_length=1, max_length=200)
    role: Optional[str] = Field(None, max_length=200)
    kind: str = "in_person"
    status: Optional[str] = None
    starts_at: Optional[datetime] = None
    due_at: Optional[datetime] = None
    tz: str = Field("UTC", max_length=64)
    location: Optional[str] = Field(None, max_length=300)
    casting: Optional[str] = Field(None, max_length=200)
    material_raw: Optional[str] = Field(None, max_length=300)
    material: Optional[dict[str, Any]] = None
    bring: Optional[str] = Field(None, max_length=300)
    notes: Optional[str] = Field(None, max_length=4000)
    tape_link: Optional[str] = Field(None, max_length=500)
    user_script_id: Optional[int] = None
    reminders_on: bool = True
    source: str = "manual"


class AuditionPatch(BaseModel):
    project: Optional[str] = Field(None, max_length=200)
    role: Optional[str] = Field(None, max_length=200)
    kind: Optional[str] = None
    status: Optional[str] = None
    starts_at: Optional[datetime] = None
    due_at: Optional[datetime] = None
    tz: Optional[str] = Field(None, max_length=64)
    location: Optional[str] = Field(None, max_length=300)
    casting: Optional[str] = Field(None, max_length=200)
    material_raw: Optional[str] = Field(None, max_length=300)
    material: Optional[dict[str, Any]] = None
    bring: Optional[str] = Field(None, max_length=300)
    notes: Optional[str] = Field(None, max_length=4000)
    tape_link: Optional[str] = Field(None, max_length=500)
    user_script_id: Optional[int] = None
    reminders_on: Optional[bool] = None


class PieceIn(BaseModel):
    monologue_id: Optional[int] = None
    scene_id: Optional[int] = None


class OutcomeIn(BaseModel):
    outcome: str


def _owned(db: Session, user: User, audition_id: int) -> Audition:
    a = core.get_owned(db, int(user.id), audition_id)
    if a is None:
        raise HTTPException(status_code=404, detail="Audition not found")
    return a


# ---------- static paths first ----------


@router.get("/next")
def get_next(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    now = _now()
    a = core.next_upcoming(db, int(user.id), now)
    return {"audition": core.serialize(db, a, now, with_prep=False) if a else None}


@router.get("/quota")
def get_quota(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return parse.quota(db, int(user.id), _now())


@router.post("/parse")
async def parse_breakdown(
    text: Optional[str] = Form(None),
    tz: str = Form("UTC"),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    now = _now()
    q = parse.quota(db, int(user.id), now)
    if q["remaining"] == 0:
        raise HTTPException(status_code=403, detail={"error": "audition_parse_quota", "quota": q})
    body = (text or "").strip()
    has_pdf = False
    if file is not None and file.filename:
        if not file.filename.lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail="Sides must be a PDF")
        content = await file.read()
        if len(content) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File too large (max 10MB)")
        has_pdf = True
        header = parse.header_text_from_pdf(content)
        body = f"{body}\n\n[First pages of the sides]\n{header}".strip()
    if not body:
        raise HTTPException(status_code=400, detail="Paste the notice or drop the sides")
    record_user_event(int(user.id), "audition_parse_requested", {"has_pdf": has_pdf, "has_text": bool(text)})
    from fastapi.concurrency import run_in_threadpool

    result = await run_in_threadpool(parse.parse_notice, body, now, tz)
    if not result["ok"]:
        record_user_event(int(user.id), "audition_parse_failed", {"reason": "model"})
    result["quota"] = parse.quota(db, int(user.id), now)
    return result


@router.get("/calendar-link")
def get_calendar_link(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not user.calendar_feed_key:
        user.calendar_feed_key = secrets.token_urlsafe(24)
        db.commit()
    return {"url": f"{API_PUBLIC_URL}/api/auditions/calendar.ics?k={user.calendar_feed_key}"}


@router.post("/calendar-link/reset")
def reset_calendar_link(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    user.calendar_feed_key = secrets.token_urlsafe(24)
    db.commit()
    return {"url": f"{API_PUBLIC_URL}/api/auditions/calendar.ics?k={user.calendar_feed_key}"}


@router.get("/calendar.ics")
def calendar_feed(k: str = Query(..., min_length=10), db: Session = Depends(get_db)):
    owner = db.query(User).filter(User.calendar_feed_key == k).first()
    if owner is None:
        raise HTTPException(status_code=404, detail="Unknown calendar")
    now = _now()
    rows = [a for a in core.list_auditions(db, int(owner.id), now) if core.scope_of(a, now) != "past"]
    return Response(
        content=ics.build_calendar(rows, now=now, site=SITE_URL),
        media_type="text/calendar; charset=utf-8",
        headers={"Cache-Control": "private, max-age=900"},
    )


@router.get("/outcome/{token}")
def outcome_from_email(token: str, o: str = Query(...), db: Session = Depends(get_db)):
    """The three links in the morning-after email. No login: the token is the key."""
    a = db.query(Audition).filter(Audition.outcome_token == token, Audition.deleted_at.is_(None)).first()
    if a is None or o not in core.OUTCOMES:
        return RedirectResponse(f"{SITE_URL}/auditions", status_code=303)
    core.log_outcome(db, a, o, via="email")
    return RedirectResponse(f"{SITE_URL}/auditions/{a.id}?logged={o}&ar=after", status_code=303)


# ---------- collection ----------


@router.get("")
def list_auditions(
    scope: Optional[str] = Query(None, pattern="^(upcoming|waiting|past)$"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    now = _now()
    return [core.serialize(db, a, now) for a in core.list_auditions(db, int(user.id), now, scope)]


@router.post("", status_code=201)
def create(body: AuditionIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    data = body.model_dump(exclude={"source"})
    try:
        a = core.create_audition(db, int(user.id), data, source=body.source)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return core.serialize(db, a, _now())


# ---------- one audition ----------


@router.get("/{audition_id}")
def get_one(audition_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return core.serialize(db, _owned(db, user, audition_id), _now())


@router.patch("/{audition_id}")
def patch(audition_id: int, body: AuditionPatch, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    a = _owned(db, user, audition_id)
    try:
        core.update_audition(db, a, body.model_dump(exclude_unset=True))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return core.serialize(db, a, _now())


@router.delete("/{audition_id}", status_code=204)
def delete(audition_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    core.delete_audition(db, _owned(db, user, audition_id))
    return Response(status_code=204)


@router.post("/{audition_id}/outcome")
def outcome_in_app(audition_id: int, body: OutcomeIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    a = _owned(db, user, audition_id)
    try:
        core.log_outcome(db, a, body.outcome, via="app")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return core.serialize(db, a, _now())


@router.post("/{audition_id}/pieces", status_code=201)
def add_piece(audition_id: int, body: PieceIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    a = _owned(db, user, audition_id)
    try:
        core.add_piece(db, a, monologue_id=body.monologue_id, scene_id=body.scene_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return core.serialize(db, a, _now())


@router.delete("/{audition_id}/pieces/{piece_id}", status_code=204)
def remove_piece(audition_id: int, piece_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not core.remove_piece(db, _owned(db, user, audition_id), piece_id):
        raise HTTPException(status_code=404, detail="Piece not found")
    return Response(status_code=204)
```

In `backend/app/main.py`, add next to the other API router imports:

```python
from app.api.auditions import router as auditions_router
```

and next to the other `app.include_router(...)` lines:

```python
app.include_router(auditions_router)
```

- [ ] **Step 2: Check it imports and the routes are registered**

Run: `cd backend && .venv/bin/python -c "from app.main import app; print(sorted({r.path for r in app.routes if r.path.startswith('/api/auditions')}))"`
Expected: a list with `/api/auditions`, `/api/auditions/next`, `/api/auditions/parse`, `/api/auditions/calendar.ics`, `/api/auditions/outcome/{token}`, `/api/auditions/{audition_id}` and the rest.

- [ ] **Step 3: Run the full backend suite**

Run: `cd backend && .venv/bin/python -m pytest tests/ -q`
Expected: all pass

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/auditions.py backend/app/main.py
git commit -m "Auditions: the API"
```

---

## Phase 2: Reminders

### Task 7: Reminder copy

**Files:**
- Create: `backend/emails/auditions/prep.txt`, `backend/emails/auditions/eve.txt`, `backend/emails/auditions/after.txt`

Same format as `backend/emails/lifecycle/*.txt`: the first line is `subject: ...`, the body is lowercase in Canberk's voice, and it ends on `canberk`. No reply-UNSUBSCRIBE line, because these are triggered emails (CLAUDE.md, 2026-09-29). Placeholders are filled by Task 8.

- [ ] **Step 1: Write the three files**

`backend/emails/auditions/prep.txt`:

```
subject: {project} is {days_phrase}

hey {name},

{project}{role_line} is {when_phrase}. {step_line}

{link}

i'll send one more note the night before.

canberk
```

`backend/emails/auditions/eve.txt`:

```
subject: tomorrow: {project}

hey {name},

{tomorrow_line}{bring_line}

{runs_line} one more run before bed: {link}

break a leg.

canberk
```

`backend/emails/auditions/after.txt`:

```
subject: how did {project} go?

hey {name},

how did it go? one tap and i'll keep track of it for you.

felt good: {good}

got a callback: {callback}

not this time: {no}

whatever happened, the next one goes on the rail too.

canberk
```

(The eve subject uses a colon, not a dash.)

- [ ] **Step 2: Commit**

```bash
git add backend/emails/auditions
git commit -m "Auditions: the three reminder letters"
```

### Task 8: Reminder service

**Files:**
- Create: `backend/app/services/auditions/reminders.py`
- Test: `backend/tests/test_audition_reminders.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_audition_reminders.py`:

```python
"""Audition reminders: when each moment is due, one email a day, the claim, the copy."""

import re
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

from app.models.audition import Audition, AuditionEvent, AuditionPiece, AuditionReminderSend
from app.models.email_do_not_contact import EmailDoNotContact
from app.models.organization import Organization
from app.models.user import User
from app.services.auditions import reminders
from tests.dbfixture import memory_db, restore

NY = "America/New_York"


def utc(y, mo, d, h, mi=0):
    return datetime(y, mo, d, h, mi, tzinfo=timezone.utc)


def aud(**kw):
    base = dict(id=1, user_id=1, project="The Glass Menagerie", role="Laura", kind="in_person",
                status="scheduled", tz=NY, reminders_on=True, outcome_token="tok",
                created_at=utc(2026, 9, 30, 12), starts_at=utc(2026, 10, 9, 14, 40))  # Thu 10:40 EDT
    base.update(kw)
    return Audition(**base)


class DueTests(unittest.TestCase):
    def test_prep_three_days_before_at_6pm_local(self):
        a = aud()
        self.assertEqual(reminders.due_moments(a, utc(2026, 10, 6, 22, 0)), ["prep"])  # Mon 6pm EDT
        self.assertEqual(reminders.due_moments(a, utc(2026, 10, 6, 21, 59)), [])

    def test_eve_at_7pm_the_day_before(self):
        self.assertEqual(reminders.due_moments(aud(), utc(2026, 10, 8, 23, 30)), ["eve"])  # Wed 7:30pm EDT

    def test_after_at_9am_the_day_after(self):
        self.assertEqual(reminders.due_moments(aud(), utc(2026, 10, 10, 13, 5)), ["after"])  # Fri 9:05am EDT

    def test_window_closes_after_six_hours(self):
        self.assertEqual(reminders.due_moments(aud(), utc(2026, 10, 7, 4, 1)), [])

    def test_added_late_gets_prep_soon_after_creation(self):
        a = aud(created_at=utc(2026, 10, 7, 16, 0))  # inside the 3 days
        self.assertEqual(reminders.due_moments(a, utc(2026, 10, 7, 17, 0)), ["prep"])

    def test_added_the_night_before_skips_prep_and_gets_eve(self):
        a = aud(created_at=utc(2026, 10, 9, 0, 30))  # Wed 8:30pm EDT
        self.assertEqual(reminders.due_moments(a, utc(2026, 10, 9, 1, 0)), ["eve"])

    def test_dst_change_uses_local_clock(self):
        # Sun Nov 1 2026 clocks go back in New York. Audition Tue Nov 3 10:00 EST = 15:00 UTC.
        a = aud(starts_at=utc(2026, 11, 3, 15, 0))
        self.assertEqual(reminders.due_moments(a, utc(2026, 11, 3, 0, 0)), ["eve"])  # Mon 7pm EST

    def test_self_tape_keys_off_due_at(self):
        a = aud(kind="self_tape", starts_at=None, due_at=utc(2026, 10, 12, 21, 0))  # Mon 5pm EDT
        self.assertEqual(reminders.due_moments(a, utc(2026, 10, 11, 23, 10)), ["eve"])

    def test_muted_closed_and_undated_never_due(self):
        t = utc(2026, 10, 8, 23, 30)
        self.assertEqual(reminders.due_moments(aud(reminders_on=False), t), [])
        self.assertEqual(reminders.due_moments(aud(status="booked"), t), [])
        self.assertEqual(reminders.due_moments(aud(starts_at=None), t), [])
        self.assertEqual(reminders.due_moments(aud(deleted_at=t), t), [])


class RunTests(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db([Organization, User, EmailDoNotContact, Audition, AuditionPiece,
                                         AuditionEvent, AuditionReminderSend])
        self.user = User(email="maya@x.com", supabase_id="m", name="Maya Lopez")
        self.db.add(self.user)
        self.db.commit()
        self.sent = []
        self.client = mock.Mock()
        self.client.send_email.side_effect = lambda **kw: self.sent.append(kw)
        self.patches = [
            mock.patch.object(reminders, "record_user_event", lambda *a, **k: None),
            mock.patch.object(reminders, "count_runs", lambda db, a: (3, None)),
            mock.patch.object(reminders, "build_unsubscribe_url", lambda e: "https://actorrise.com/unsubscribe?t=1"),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        restore(self.saved)

    def _add(self, **kw):
        data = dict(user_id=self.user.id, project="The Glass Menagerie", role="Laura", tz=NY,
                    created_at=utc(2026, 9, 30, 12), starts_at=utc(2026, 10, 9, 14, 40))
        data.update(kw)
        a = Audition(**data)
        self.db.add(a)
        self.db.commit()
        return a

    def test_sends_once_and_records(self):
        a = self._add()
        t = utc(2026, 10, 8, 23, 30)
        stats = reminders.run(self.db, now=t, send=True, client=self.client)
        self.assertEqual(stats["sent"], 1)
        self.assertEqual(self.sent[0]["to"], "maya@x.com")
        self.assertEqual(self.db.query(AuditionReminderSend).one().moment, "eve")
        self.assertEqual(self.db.query(AuditionEvent).filter_by(kind="reminder_sent").one().data, {"moment": "eve"})
        reminders.run(self.db, now=t + timedelta(hours=1), send=True, client=self.client)
        self.assertEqual(len(self.sent), 1)
        self.assertEqual(a.id, self.db.query(AuditionReminderSend).one().audition_id)

    def test_one_email_per_local_day_nearest_wins(self):
        near = self._add(project="Near")
        self._add(project="Far", starts_at=utc(2026, 10, 9, 18, 0))
        reminders.run(self.db, now=utc(2026, 10, 8, 23, 30), send=True, client=self.client)
        self.assertEqual(len(self.sent), 1)
        self.assertIn("Near", self.sent[0]["subject"])
        self.assertEqual(self.db.query(AuditionReminderSend).one().audition_id, near.id)

    def test_do_not_contact_and_anon_are_skipped(self):
        self._add()
        self.db.add(EmailDoNotContact(email="MAYA@x.com", reason="OPT-OUT: test"))
        self.db.commit()
        self.assertEqual(reminders.run(self.db, now=utc(2026, 10, 8, 23, 30), send=True, client=self.client)["sent"], 0)

    def test_dry_run_sends_nothing_and_claims_nothing(self):
        self._add()
        stats = reminders.run(self.db, now=utc(2026, 10, 8, 23, 30), send=False, client=self.client)
        self.assertEqual(stats["eligible"], 1)
        self.assertEqual(self.sent, [])
        self.assertEqual(self.db.query(AuditionReminderSend).count(), 0)


class CopyTests(unittest.TestCase):
    def test_every_moment_has_copy_and_no_strays(self):
        files = {p.stem for p in reminders.COPY_DIR.glob("*.txt")}
        self.assertEqual(files, set(reminders.MOMENTS))

    def test_voice_and_nothing_unfilled(self):
        cases = [
            aud(),
            aud(kind="self_tape", starts_at=None, due_at=utc(2026, 10, 12, 21, 0), role=None),
            aud(user_script_id=4, material_raw="1 min contemporary", location="Ripley Grier", bring="headshot"),
        ]
        for a in cases:
            for moment in reminders.MOMENTS:
                subject, html, plain = reminders.render(a, moment, "Maya Lopez", runs=2,
                                                        unsubscribe_url="https://actorrise.com/unsubscribe?t=1")
                for out in (subject, plain):
                    self.assertIsNone(re.search(r"[‒–—―]| - ", out), (moment, out))
                    self.assertIsNone(re.search(r"\b(we|our|us)\b", out, re.I), (moment, out))
                    self.assertNotRegex(out, r"\{[a-z_]+\}")
                self.assertLessEqual(len(subject), 60)
                self.assertTrue(plain.rstrip().endswith("\ncanberk"), moment)
                self.assertNotIn("unsubscribe", plain.lower())
                self.assertIn("https://actorrise.com/unsubscribe?t=1", html)

    def test_after_links_carry_the_token(self):
        _, html, plain = reminders.render(aud(), "after", "Maya", runs=0, unsubscribe_url=None)
        for o in ("good", "callback", "no"):
            self.assertIn(f"/api/auditions/outcome/tok?o={o}", plain)
            self.assertIn(f"/api/auditions/outcome/tok?o={o}", html)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_audition_reminders.py -q`
Expected: FAIL with `ImportError: cannot import name 'reminders'`

- [ ] **Step 3: Write the service**

Create `backend/app/services/auditions/reminders.py`:

```python
"""Three emails per audition: prep (3 days out, 6pm), eve (day before, 7pm),
after (morning after, 9am), all on the audition's own clock.

Service emails for a date the actor typed in, so they sit outside the lifecycle
cap of two a week. Their own ceiling: one audition email per person per local
day; when two collide the nearer audition wins and the other moment is skipped.
A claim row is written before the send; a failed send is not retried, because a
night-before note that arrives late is worse than none.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, time, timedelta, timezone
from pathlib import Path
from typing import Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from markupsafe import Markup, escape
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.audition import CLOSED_STATUSES, Audition, AuditionEvent, AuditionReminderSend
from app.models.email_do_not_contact import EmailDoNotContact
from app.models.user import User
from app.services.auditions.core import aware, count_runs, when
from app.services.email.marketing import build_unsubscribe_url
from app.services.email.templates import EmailTemplates
from app.services.events import record_user_event

logger = logging.getLogger(__name__)

COPY_DIR = Path(__file__).resolve().parents[3] / "emails" / "auditions"
MOMENTS = ("prep", "eve", "after")
WINDOW = timedelta(hours=6)
SITE_URL = os.getenv("SITE_URL", "https://actorrise.com")
API_PUBLIC_URL = os.getenv("API_PUBLIC_URL", "https://api.actorrise.com")
UNREACHABLE = ("@anon.actorrise.com", "@privaterelay.appleid.com")


def _zone(a: Audition) -> ZoneInfo:
    try:
        return ZoneInfo(a.tz or "UTC")
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("UTC")


def _at(a: Audition, day_offset: int, hour: int) -> datetime:
    zone = _zone(a)
    local_day = when(a).astimezone(zone).date() + timedelta(days=day_offset)
    return datetime.combine(local_day, time(hour), tzinfo=zone).astimezone(timezone.utc)


def due_moments(a: Audition, now: datetime) -> list[str]:
    w = when(a)
    if w is None or not a.reminders_on or a.deleted_at is not None or a.status in CLOSED_STATUSES:
        return []
    prep_at, eve_at, after_at = _at(a, -3, 18), _at(a, -1, 19), _at(a, 1, 9)
    prep_from = max(prep_at, aware(a.created_at))
    due = []
    if prep_from <= now < prep_from + WINDOW and now < eve_at - timedelta(hours=2):
        due.append("prep")
    if eve_at <= now < eve_at + WINDOW and now < w:
        due.append("eve")
    if after_at <= now < after_at + WINDOW:
        due.append("after")
    return due


def load_copy(moment: str) -> tuple[str, str]:
    raw = (COPY_DIR / f"{moment}.txt").read_text(encoding="utf-8")
    head, _, body = raw.partition("\n")
    label, _, subject = head.partition(":")
    if label.strip().lower() != "subject" or not subject.strip():
        raise ValueError(f"{moment}.txt must open with 'subject: ...'")
    return subject.strip(), body.strip() + "\n"


def _clock(dt: datetime) -> str:
    return dt.strftime("%I:%M %p").lstrip("0").lower().replace(":00", "")


def _fields(a: Audition, moment: str, name: str, runs: int) -> tuple[dict, dict]:
    """(plain fields, link fields). Links are kept apart so the HTML can wrap them."""
    zone = _zone(a)
    local = when(a).astimezone(zone)
    tape = a.kind == "self_tape"
    days = (local.date() - datetime.now(zone).date()).days if moment == "prep" else 0
    days_phrase = "in 3 days" if days >= 3 else "in 2 days" if days == 2 else "tomorrow" if days == 1 else "soon"
    when_phrase = (f"due {local:%A} at {_clock(local)}" if tape else f"{local:%A} at {_clock(local)}")
    if a.user_script_id:
        step = "your sides are loaded. run them once tonight and they'll sit better by then."
    elif a.material_raw:
        step = f"you still need a piece for it ({a.material_raw}). i pulled a few that fit."
    else:
        step = "worth deciding tonight what you're bringing."
    if tape:
        tomorrow = f"your tape for {a.project} is due tomorrow at {_clock(local)}."
    else:
        where = f" at {a.location}" if a.location else ""
        tomorrow = f"tomorrow, {_clock(local)}{where}."
    fields = {
        "name": name,
        "project": a.project,
        "role_line": f" ({a.role})" if a.role else "",
        "days_phrase": days_phrase,
        "when_phrase": when_phrase,
        "step_line": step,
        "tomorrow_line": tomorrow,
        "bring_line": f" bring {a.bring}." if a.bring else "",
        "runs_line": (f"you've run it {runs} times." if runs > 1 else "you've run it once." if runs == 1
                      else "you haven't run it here yet."),
    }
    base = f"{SITE_URL}/auditions/{a.id}?ar={moment}"
    out = f"{API_PUBLIC_URL}/api/auditions/outcome/{a.outcome_token}?o="
    links = {"link": base, "good": out + "good", "callback": out + "callback", "no": out + "no"}
    return fields, links


def _fill(text: str, fields: dict, links: dict) -> str:
    for k, v in {**fields, **links}.items():
        text = text.replace("{" + k + "}", str(v))
    return text


def render(a: Audition, moment: str, user_name: Optional[str], *, runs: int,
           unsubscribe_url: Optional[str], tpl: Optional[EmailTemplates] = None) -> tuple[str, str, str]:
    subject, body = load_copy(moment)
    name = (EmailTemplates._first_name(user_name) or "").lower()
    fields, links = _fields(a, moment, name, runs)
    if not name:
        body = body.replace("hey {name},", "hey,")
    subject = _fill(subject, fields, {})
    plain = _fill(body, fields, links)
    esc_fields = {k: str(escape(v)) for k, v in fields.items()}
    anchors = {k: str(Markup('<a href="{0}" style="font-weight:500;">{0}</a>').format(v)) for k, v in links.items()}
    paragraphs = [Markup(_fill(str(escape(block)), esc_fields, anchors)) for block in body.strip().split("\n\n")]
    html = (tpl or EmailTemplates()).env.get_template("triggered.html").render(
        subject=subject, paragraphs=paragraphs, unsubscribe_url=unsubscribe_url
    )
    return subject, html, plain


def _local_day(a: Audition, now: datetime) -> str:
    return now.astimezone(_zone(a)).date().isoformat()


def _claim(db: Session, a: Audition, moment: str, local_day: str) -> bool:
    try:
        db.add(AuditionReminderSend(audition_id=a.id, user_id=a.user_id, moment=moment, local_day=local_day))
        db.commit()
        return True
    except IntegrityError:
        db.rollback()
        return False


def select_due(db: Session, now: datetime) -> list[tuple[Audition, User, str]]:
    """(audition, user, moment) to send now, already reduced to one per person per local day."""
    lo, hi = now - timedelta(days=2), now + timedelta(days=4)
    blocked = {e.lower() for (e,) in db.query(EmailDoNotContact.email).all()}
    rows = (
        db.query(Audition, User)
        .join(User, User.id == Audition.user_id)
        .filter(Audition.deleted_at.is_(None), Audition.reminders_on.is_(True))
        .all()
    )
    sent_moments = {(r.audition_id, r.moment) for r in db.query(AuditionReminderSend).all()}
    candidates = []
    for a, u in rows:
        w = when(a)
        if w is None or not (lo <= w <= hi):
            continue
        email = (u.email or "").lower()
        if not email or email in blocked or email.endswith(UNREACHABLE):
            continue
        for moment in due_moments(a, now):
            if (a.id, moment) not in sent_moments:
                candidates.append((a, u, moment))
    candidates.sort(key=lambda c: abs((when(c[0]) - now).total_seconds()))
    taken_days = {(r.user_id, r.local_day) for r in db.query(AuditionReminderSend).all()}
    out = []
    for a, u, moment in candidates:
        key = (u.id, _local_day(a, now))
        if key in taken_days:
            continue
        taken_days.add(key)
        out.append((a, u, moment))
    return out


def run(db: Session, *, now: Optional[datetime] = None, send: bool = False, client=None, cap: int = 200) -> dict:
    now = now or datetime.now(timezone.utc)
    due = select_due(db, now)
    stats = {"eligible": len(due), "sent": 0, "failed": 0}
    if not send:
        stats["previews"] = [(a.id, moment) for a, _, moment in due]
        return stats
    if client is None:
        from app.services.email.resend_client import ResendEmailClient

        client = ResendEmailClient()
    tpl = EmailTemplates()
    for a, u, moment in due:
        if stats["sent"] >= cap:
            logger.warning("audition reminders: hit cap %s", cap)
            break
        if not _claim(db, a, moment, _local_day(a, now)):
            continue
        try:
            unsub = None
            try:
                unsub = build_unsubscribe_url(u.email)
            except Exception:  # noqa: BLE001
                pass
            runs, _ = count_runs(db, a)
            subject, html, plain = render(a, moment, u.name, runs=runs, unsubscribe_url=unsub, tpl=tpl)
            client.send_email(to=u.email, subject=subject, html=html, plain_text=plain, unsubscribe_url=unsub)
            db.add(AuditionEvent(audition_id=a.id, user_id=a.user_id, kind="reminder_sent", data={"moment": moment}))
            db.commit()
            stats["sent"] += 1
            record_user_event(a.user_id, "audition_reminder_sent", {"audition_id": a.id, "moment": moment})
        except Exception as exc:  # noqa: BLE001
            stats["failed"] += 1
            logger.warning("audition reminder %s failed for audition %s: %s", moment, a.id, exc)
    return stats
```

Note on `days_phrase`: it is computed against the real clock, so the subject is right on the day the email is sent. The tests only check its shape, not its value.

- [ ] **Step 4: Run them to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/test_audition_reminders.py -q`
Expected: all pass (17 tests)

If `test_do_not_contact_and_anon_are_skipped` fails on the `reason` column, read `app/models/email_do_not_contact.py` and use the column names it actually has.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/auditions/reminders.py backend/tests/test_audition_reminders.py
git commit -m "Auditions: prep, night-before and morning-after emails, one a day at most"
```

### Task 9: Scheduler and admin switch

**Files:**
- Modify: `backend/app/services/app_settings.py` (add the key under `TRIGGERED_EMAILS_ENABLED`)
- Modify: `backend/app/main.py` (new `_start_audition_reminder_scheduler`, call it in the lifespan next to `_start_lifecycle_email_scheduler()`)
- Modify: `backend/app/api/admin/emails.py` (GET/PUT `/audition-reminders` after the triggered-emails endpoints)
- Modify: `app/(platform)/admin/emails/page.tsx` (fourth switch)

- [ ] **Step 1: Add the setting key**

In `backend/app/services/app_settings.py`, under the `TRIGGERED_EMAILS_ENABLED` line:

```python
# The audition tracker's prep / night-before / morning-after emails
# (services/auditions/reminders.py). Defaults OFF; turned on at launch.
AUDITION_REMINDERS_ENABLED = "audition_reminders_enabled"
```

- [ ] **Step 2: Add the scheduler**

In `backend/app/main.py`, add after `_start_lifecycle_email_scheduler`:

```python
def _start_audition_reminder_scheduler() -> None:
    """Hourly audition reminders (services/auditions/reminders.py).

    Runtime switch app_settings.AUDITION_REMINDERS_ENABLED, default OFF. Env
    hard-kill: AUDITION_REMINDERS_ENABLED=false. Production only, like every
    scheduler here: a local uvicorn talks to the prod pooler.
    """
    import os

    from app.services.scheduler_gate import scheduler_status

    status = scheduler_status(
        "audition_reminders",
        environment=os.getenv("ENVIRONMENT"),
        flag=os.getenv("AUDITION_REMINDERS_ENABLED"),
    )
    if not status.will_run:
        logger.warning(status.reason)
        return

    def loop() -> None:
        time.sleep(180)  # after the lifecycle loop's first pass
        while True:
            try:
                from app.core.database import SessionLocal
                from app.services import app_settings
                from app.services.auditions import reminders

                db = SessionLocal()
                try:
                    if not app_settings.get_bool(db, app_settings.AUDITION_REMINDERS_ENABLED, default=False):
                        logger.info("audition reminders: skipped, app_settings switch is off")
                    else:
                        stats = reminders.run(db, send=True)
                        logger.info("audition reminders: eligible %s sent %s failed %s",
                                    stats["eligible"], stats["sent"], stats["failed"])
                finally:
                    db.close()
            except Exception as e:  # noqa: BLE001
                logger.error("audition reminder scheduler run FAILED: %s", e, exc_info=True)
            time.sleep(3600)

    threading.Thread(target=loop, daemon=True, name="audition-reminders").start()
```

Check the bottom of `_start_lifecycle_email_scheduler` to see how it starts its thread and sleeps between runs (`threading.Thread(...)` and `time.sleep(...)`), and match that exactly. If the module imports `threading` under another name, use that.

In the lifespan, directly under `_start_lifecycle_email_scheduler()`:

```python
    _start_audition_reminder_scheduler()
```

- [ ] **Step 3: Add the admin endpoints**

In `backend/app/api/admin/emails.py`, after `set_triggered_emails`:

```python
@router.get("/audition-reminders", response_model=SavedPieceReminderToggle)
def get_audition_reminders(
    _: User = Depends(require_approval_permission),
    db: Session = Depends(get_db),
) -> SavedPieceReminderToggle:
    """Whether the audition tracker's three reminder emails are sending. Off by default."""
    enabled = app_settings.get_bool(db, app_settings.AUDITION_REMINDERS_ENABLED, default=False)
    return SavedPieceReminderToggle(enabled=enabled)


@router.put("/audition-reminders", response_model=SavedPieceReminderToggle)
def set_audition_reminders(
    payload: SavedPieceReminderToggle,
    _: User = Depends(require_approval_permission),
    db: Session = Depends(get_db),
) -> SavedPieceReminderToggle:
    """Turn audition reminders on or off (takes effect within the hour)."""
    enabled = app_settings.set_bool(db, app_settings.AUDITION_REMINDERS_ENABLED, payload.enabled)
    return SavedPieceReminderToggle(enabled=enabled)
```

- [ ] **Step 4: Add the switch to the admin page**

In `app/(platform)/admin/emails/page.tsx`:

1. Next to the `triggeredOn` state (line ~258):

```tsx
  const [auditionRemindersOn, setAuditionRemindersOn] = useState<boolean | null>(null);
  const [auditionRemindersSaving, setAuditionRemindersSaving] = useState(false);
```

2. In the `Promise.all([...])` list (line ~283), add:

```tsx
      api.get<{ enabled: boolean }>("/api/admin/emails/audition-reminders").then(({ data }) => setAuditionRemindersOn(data.enabled)).catch(() => {}),
```

3. After `updateTriggeredEmails`:

```tsx
  async function updateAuditionReminders(enabled: boolean) {
    const prev = auditionRemindersOn;
    setAuditionRemindersOn(enabled);
    setAuditionRemindersSaving(true);
    try {
      const { data } = await api.put<{ enabled: boolean }>("/api/admin/emails/audition-reminders", { enabled });
      setAuditionRemindersOn(data.enabled);
      toast.success(data.enabled ? "Audition reminders are on" : "Audition reminders paused.");
    } catch {
      setAuditionRemindersOn(prev);
      toast.error("Failed to update the audition reminder setting");
    } finally {
      setAuditionRemindersSaving(false);
    }
  }
```

4. After the triggered-emails block (the `{canSend && triggeredOn !== null && (...)}` div, line ~934 to ~955):

```tsx
      {canSend && auditionRemindersOn !== null && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-border p-3 sm:p-4">
          <div className="flex items-start gap-2.5">
            <IconClock className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Audition reminders</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {auditionRemindersOn
                  ? "On. Three notes per audition the actor added: 3 days out, the night before, the morning after. Never more than one a day, outside the weekly cap."
                  : "Off. Nothing sends until you turn this on. Copy is in backend/emails/auditions."}
              </p>
            </div>
          </div>
          <Switch
            checked={auditionRemindersOn}
            disabled={auditionRemindersSaving}
            onCheckedChange={updateAuditionReminders}
            aria-label="Toggle audition reminders"
          />
        </div>
      )}
```

- [ ] **Step 5: Verify**

Run: `cd backend && .venv/bin/python -c "from app.main import app; import app.services.app_settings as s; print(s.AUDITION_REMINDERS_ENABLED)"`
Expected: `audition_reminders_enabled`

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/app_settings.py backend/app/main.py backend/app/api/admin/emails.py "app/(platform)/admin/emails/page.tsx"
git commit -m "Auditions: the hourly reminder run and its switch in /admin/emails"
```

---

## Phase 3: Measurement

### Task 10: Engaged weekly actives

**Files:**
- Create: `backend/app/services/engagement.py`
- Modify: `backend/app/api/admin/stats.py` (`get_growth_stats`)
- Modify: `app/(platform)/admin/page.tsx` (two columns in Weekly retention)
- Test: `backend/tests/test_engagement.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_engagement.py`:

```python
import unittest
from datetime import date

from app.services import engagement


class EngagedWeeksTests(unittest.TestCase):
    def test_returning_means_seen_in_an_earlier_week(self):
        rows = [
            (1, date(2026, 9, 28)), (1, date(2026, 10, 6)),  # week 1, back week 2
            (2, date(2026, 10, 5)),  # new in week 2
            (3, date(2026, 9, 29)), (3, date(2026, 9, 30)),  # week 1 only
        ]
        weeks = engagement.weekly(rows)
        self.assertEqual(weeks[date(2026, 9, 28)], {"active": 2, "returning": 0})
        self.assertEqual(weeks[date(2026, 10, 5)], {"active": 2, "returning": 1})

    def test_engaged_names_exclude_passive_ones(self):
        self.assertIn("audition_created", engagement.ENGAGED_EVENTS)
        self.assertNotIn("audition_reminder_sent", engagement.ENGAGED_EVENTS)
        self.assertNotIn("email_sent", engagement.ENGAGED_EVENTS)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_engagement.py -q`
Expected: FAIL with `ImportError`

- [ ] **Step 3: Write it**

Create `backend/app/services/engagement.py`:

```python
"""Engaged activity: usage_metrics days plus days with a meaningful user_event.

The admin's WAU reads usage_metrics alone, which only gated features write
(search, ScenePartner, CraftCoach, Monologue Work). An actor who opens the
audition tracker every week to log an outcome counted as inactive. This is the
second line, kept beside the old one so the before/after stays comparable.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Iterable

ENGAGED_EVENTS = frozenset({
    "monologue_work_started", "monologue_work_finished", "scene_line_delivered",
    "guided_scene_started", "beat_saved", "memorized_toggled", "cut_editor_opened",
    "audition_created", "audition_status_changed", "audition_outcome_logged",
    "audition_prep_started", "audition_reminder_clicked", "audition_landing_shown",
    "audition_strip_clicked", "audition_parse_requested", "calendar_feed_subscribed",
})


def week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


def weekly(rows: Iterable[tuple[int, date]]) -> dict[date, dict[str, int]]:
    by_week: dict[date, set[int]] = {}
    for uid, d in rows:
        by_week.setdefault(week_start(d), set()).add(uid)
    out, seen = {}, set()
    for w in sorted(by_week):
        users = by_week[w]
        out[w] = {"active": len(users), "returning": len(users & seen)}
        seen |= users
    return out


def activity_rows(db, real_ids) -> list[tuple[int, date]]:
    """Distinct (user_id, day) across usage_metrics and engaged user_events."""
    from sqlalchemy import Date, cast

    from app.models.billing import UsageMetrics
    from app.models.user_event import UserEvent

    a = db.query(UsageMetrics.user_id, UsageMetrics.date).filter(UsageMetrics.user_id.in_(real_ids)).distinct().all()
    b = (
        db.query(UserEvent.user_id, cast(UserEvent.created_at, Date))
        .filter(UserEvent.user_id.in_(real_ids), UserEvent.event_name.in_(ENGAGED_EVENTS))
        .distinct()
        .all()
    )
    return list({(u, d) for u, d in a + b if u is not None and d is not None})
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_engagement.py -q`
Expected: 2 passed

- [ ] **Step 5: Wire it into /growth**

In `backend/app/api/admin/stats.py`, inside `get_growth_stats`, directly before the `retention_weeks = []` line (~380), add:

```python
    from app.services import engagement

    engaged_rows = engagement.activity_rows(db, real_ids)
    engaged_by_week = engagement.weekly(engaged_rows)
    engaged_wau = len({u for u, d in engaged_rows if to_d - timedelta(days=6) <= d <= to_d})
```

In the `retention_weeks.append({...})` dict, add two keys:

```python
                "engaged_active": engaged_by_week.get(w, {}).get("active", 0),
                "engaged_returning": engaged_by_week.get(w, {}).get("returning", 0),
```

Find the `"active": {...}` block in the returned dict (it holds `dau`, `wau`, `mau`) and add `"engaged_wau": engaged_wau,` next to `"wau": wau,`.

The engaged weeks are keyed by Monday, the same as `week_users`, so `w` lines up.

- [ ] **Step 6: Show it in admin**

In `app/(platform)/admin/page.tsx`:

1. In the `retention.weeks` type (line ~166 to 172), add `engaged_active: number; engaged_returning: number;`. In the `active` type (line ~160), add `engaged_wau?: number;`.

2. In the table header (line ~276), after the `Returning` header cell:

```tsx
                <th className="py-1.5 text-right font-medium" title="usage_metrics plus tracker and rehearsal events">Engaged</th>
                <th className="py-1.5 text-right font-medium">Eng. returning</th>
```

3. In the row, after the `returning` cell:

```tsx
                  <td className="py-1.5 text-right tabular-nums">{w.engaged_active ?? 0}</td>
                  <td className="py-1.5 text-right tabular-nums" style={{ color: (w.engaged_returning ?? 0) > 0 ? BRAND : undefined }}>
                    {w.engaged_returning ?? 0}
                  </td>
```

- [ ] **Step 7: Verify and commit**

Run: `cd backend && .venv/bin/python -m pytest tests/ -q && cd .. && npx tsc --noEmit`
Expected: all pass, no type errors

```bash
git add backend/app/services/engagement.py backend/tests/test_engagement.py backend/app/api/admin/stats.py "app/(platform)/admin/page.tsx"
git commit -m "Admin: an engaged WAU that counts the tracker, beside the old one"
```

### Task 11: Auditions admin panel

**Files:**
- Create: `backend/app/api/admin/auditions.py`
- Modify: `backend/app/main.py` (include the router)
- Modify: `app/(platform)/admin/page.tsx` (one card)

- [ ] **Step 1: Write the endpoint**

Create `backend/app/api/admin/auditions.py`:

```python
"""GET /api/admin/auditions: is the tracker being used, and is it bringing people back?"""

from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.admin.stats import require_moderator
from app.core.database import get_db
from app.models.audition import Audition
from app.models.user import User
from app.models.user_event import UserEvent
from app.services import engagement
from app.services.admin_filters import real_user_ids_query
from app.services.auditions.core import aware, when

router = APIRouter(prefix="/api/admin/auditions", tags=["admin"])


@router.get("")
def auditions_panel(_: User = Depends(require_moderator), db: Session = Depends(get_db)) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    real_ids = {r[0] for r in db.query(User.id).filter(User.id.in_(real_user_ids_query(db))).all()}
    rows = [a for a in db.query(Audition).filter(Audition.deleted_at.is_(None)).all() if a.user_id in real_ids]
    tracker_users = {a.user_id for a in rows}

    by_week_source: dict[str, Counter] = {}
    for a in rows:
        w = engagement.week_start(aware(a.created_at).date()).isoformat()
        by_week_source.setdefault(w, Counter())[a.source] += 1

    def events(names):
        return (
            db.query(UserEvent.user_id, UserEvent.event_name, UserEvent.properties, UserEvent.created_at)
            .filter(UserEvent.event_name.in_(names), UserEvent.user_id.in_(real_ids))
            .all()
        )

    ev = events(("audition_parse_requested", "audition_parse_corrected", "audition_parse_failed",
                 "audition_prep_started", "audition_reminder_sent", "audition_reminder_clicked",
                 "audition_outcome_logged", "audition_strip_clicked"))
    count = Counter(e[1] for e in ev)

    # Prep before the date: a past audition with an audition_prep_started before its time.
    prep_at: dict[int, list[datetime]] = {}
    for uid, name, props, created in ev:
        if name == "audition_prep_started" and (props or {}).get("audition_id"):
            prep_at.setdefault(int(props["audition_id"]), []).append(aware(created))
    past = [a for a in rows if when(a) is not None and when(a) < now]
    prepped = sum(1 for a in past if any(t <= when(a) for t in prep_at.get(a.id, [])))

    reminders = Counter((props or {}).get("moment") for _, n, props, _ in ev if n == "audition_reminder_sent")
    clicks = Counter((props or {}).get("moment") for _, n, props, _ in ev if n == "audition_reminder_clicked")
    outcomes = Counter((props or {}).get("via") for _, n, props, _ in ev if n == "audition_outcome_logged")

    # Habit: of each week's active tracker users vs other actives, how many came back the next week.
    act = engagement.activity_rows(db, list(real_ids))
    by_week: dict = {}
    for uid, d in act:
        by_week.setdefault(engagement.week_start(d), set()).add(uid)
    habit = []
    for w in sorted(by_week)[-7:-1]:
        nxt = by_week.get(w + timedelta(days=7), set())
        t = by_week[w] & tracker_users
        o = by_week[w] - tracker_users
        habit.append({
            "week_start": w.isoformat(),
            "tracker_active": len(t), "tracker_back": len(t & nxt),
            "other_active": len(o), "other_back": len(o & nxt),
        })

    winback_users = {uid for uid, n, props, _ in ev
                     if n == "audition_strip_clicked" and (props or {}).get("surface") == "winback_email"}

    return {
        "users_with_auditions": len(tracker_users),
        "auditions": len(rows),
        "created_by_week": [{"week_start": w, **dict(c)} for w, c in sorted(by_week_source.items())[-8:]],
        "parse": {"requested": count["audition_parse_requested"], "corrected": count["audition_parse_corrected"],
                  "failed": count["audition_parse_failed"]},
        "prep_before_date": {"past": len(past), "prepped": prepped},
        "reminders": {"sent": dict(reminders), "clicked": dict(clicks)},
        "outcomes_by_via": dict(outcomes),
        "habit": habit,
        "winback_users": len(winback_users),
    }
```

`real_user_ids_query` is the same helper `stats.py` imports. If it already returns a list of ids instead of a subquery, simplify the `real_ids` line to `set(real_user_ids_query(db))`.

In `backend/app/main.py`:

```python
from app.api.admin.auditions import router as admin_auditions_router
...
app.include_router(admin_auditions_router)
```

- [ ] **Step 2: Add the admin card**

In `app/(platform)/admin/page.tsx`, add this component near the retention component:

```tsx
type AuditionsPanel = {
  users_with_auditions: number;
  auditions: number;
  parse: { requested: number; corrected: number; failed: number };
  prep_before_date: { past: number; prepped: number };
  reminders: { sent: Record<string, number>; clicked: Record<string, number> };
  outcomes_by_via: Record<string, number>;
  habit: { week_start: string; tracker_active: number; tracker_back: number; other_active: number; other_back: number }[];
  winback_users: number;
};

function pct(n: number, d: number) {
  return d ? `${Math.round((n / d) * 100)}%` : "-";
}

function AuditionsCard() {
  const { data } = useQuery<AuditionsPanel>({
    queryKey: ["admin", "auditions"],
    queryFn: async () => (await api.get<AuditionsPanel>("/api/admin/auditions")).data,
    staleTime: 60_000,
  });
  if (!data) return null;
  const moments = ["prep", "eve", "after"];
  return (
    <div className="border border-border bg-card p-4 space-y-3">
      <div>
        <p className="text-sm font-medium">Audition tracker</p>
        <p className="text-xs text-muted-foreground">
          {data.users_with_auditions} actors, {data.auditions} auditions. Prep before the date:{" "}
          {pct(data.prep_before_date.prepped, data.prep_before_date.past)} (baseline rehearse rate 17.5%).
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div>Parses {data.parse.requested}<br /><span className="text-muted-foreground">corrected {pct(data.parse.corrected, data.parse.requested)}, failed {pct(data.parse.failed, data.parse.requested)}</span></div>
        {moments.map((m) => (
          <div key={m}>
            {m}: {data.reminders.sent[m] ?? 0} sent<br />
            <span className="text-muted-foreground">{pct(data.reminders.clicked[m] ?? 0, data.reminders.sent[m] ?? 0)} clicked</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Outcomes: {data.outcomes_by_via.email ?? 0} by email, {data.outcomes_by_via.app ?? 0} in app. Win-back clicks: {data.winback_users}.
      </p>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="py-1.5 text-left font-medium">Week of</th>
            <th className="py-1.5 text-right font-medium">Tracker back next week</th>
            <th className="py-1.5 text-right font-medium">Everyone else</th>
          </tr>
        </thead>
        <tbody>
          {data.habit.map((h) => (
            <tr key={h.week_start} className="border-b border-border/50 last:border-0">
              <td className="py-1.5 text-muted-foreground">{h.week_start.slice(5)}</td>
              <td className="py-1.5 text-right tabular-nums">{h.tracker_back}/{h.tracker_active} ({pct(h.tracker_back, h.tracker_active)})</td>
              <td className="py-1.5 text-right tabular-nums">{h.other_back}/{h.other_active} ({pct(h.other_back, h.other_active)})</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

Render `<AuditionsCard />` directly after the Weekly retention card wherever that card is placed in the page JSX. If `useQuery` or `api` aren't imported in this file yet, add `import { useQuery } from "@tanstack/react-query";` and `import api from "@/lib/api";`.

- [ ] **Step 3: Verify and commit**

Run: `cd backend && .venv/bin/python -c "from app.main import app" && cd .. && npx tsc --noEmit`
Expected: no errors

```bash
git add backend/app/api/admin/auditions.py backend/app/main.py "app/(platform)/admin/page.tsx"
git commit -m "Admin: the audition tracker card"
```

---

## Phase 4: Frontend

### Task 12: Types and pure helpers

**Files:**
- Create: `lib/auditions.ts`
- Test: `lib/auditions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/auditions.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { countdown, groupByScope, toLocalInput, fromLocalInput, changedFields, type Audition } from "./auditions";

const NOW = new Date("2026-10-07T15:00:00Z");

function a(over: Partial<Audition>): Audition {
  return {
    id: 1, project: "P", role: null, kind: "in_person", status: "scheduled", starts_at: null, due_at: null,
    when: null, tz: "UTC", location: null, casting: null, material_raw: null, material: null, bring: null,
    notes: null, tape_link: null, source: "manual", user_script_id: null, reminders_on: true, scope: "upcoming",
    created_at: NOW.toISOString(), pieces: [], ...over,
  };
}

describe("countdown", () => {
  it("days when two or more out", () => {
    expect(countdown("2026-10-11T15:00:00Z", NOW)).toEqual({ n: "4", unit: "days" });
  });
  it("hours inside 48", () => {
    expect(countdown("2026-10-08T20:00:00Z", NOW)).toEqual({ n: "29", unit: "hours" });
  });
  it("one hour reads singular, under an hour reads now", () => {
    expect(countdown("2026-10-07T16:10:00Z", NOW)).toEqual({ n: "1", unit: "hour" });
    expect(countdown("2026-10-07T15:20:00Z", NOW)).toEqual({ n: "Now", unit: "" });
  });
  it("past and undated", () => {
    expect(countdown("2026-10-01T15:00:00Z", NOW)).toEqual({ n: "Oct 1", unit: "" });
    expect(countdown(null, NOW)).toEqual({ n: "?", unit: "no date" });
  });
});

describe("groupByScope", () => {
  it("keeps server order inside each group", () => {
    const g = groupByScope([a({ id: 1, scope: "upcoming" }), a({ id: 2, scope: "waiting" }), a({ id: 3, scope: "upcoming" })]);
    expect(g.upcoming.map((x) => x.id)).toEqual([1, 3]);
    expect(g.waiting.map((x) => x.id)).toEqual([2]);
    expect(g.past).toEqual([]);
  });
});

describe("datetime-local round trip", () => {
  it("survives", () => {
    const iso = "2026-10-09T14:40:00.000Z";
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
    expect(toLocalInput(null)).toBe("");
    expect(fromLocalInput("")).toBeNull();
  });
});

describe("changedFields", () => {
  it("lists parsed fields the actor edited", () => {
    expect(changedFields({ project: "A", role: "B", casting: null }, { project: "A", role: "C", casting: "X" })).toEqual(["role", "casting"]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/auditions.test.ts`
Expected: FAIL, cannot resolve `./auditions`

- [ ] **Step 3: Write the helpers**

Create `lib/auditions.ts`:

```ts
/**
 * The audition tracker, browser side. Shapes mirror backend/app/services/auditions/core.serialize.
 */

export type AuditionKind = "in_person" | "self_tape" | "virtual";
export type AuditionStatus = "submitted" | "scheduled" | "callback" | "booked" | "pinned" | "passed";
export type AuditionScope = "upcoming" | "waiting" | "past";

export type PrepStep = { key: "sides" | "piece" | "bring"; label: string; done: boolean; href: string | null };

export type Audition = {
  id: number;
  project: string;
  role: string | null;
  kind: AuditionKind;
  status: AuditionStatus;
  starts_at: string | null;
  due_at: string | null;
  when: string | null;
  tz: string;
  location: string | null;
  casting: string | null;
  material_raw: string | null;
  material: Record<string, unknown> | null;
  bring: string | null;
  notes: string | null;
  tape_link: string | null;
  source: "parse" | "manual" | "onboarding";
  user_script_id: number | null;
  reminders_on: boolean;
  scope: AuditionScope;
  created_at: string;
  pieces: { id: number; monologue_id: number | null; scene_id: number | null; used: boolean }[];
  prep?: { runs: number; last_run_at: string | null; steps: PrepStep[] };
};

export type DraftField<T = string | null> = { value: T; confidence: "high" | "low" };
export type Draft = {
  project: DraftField; role: DraftField; kind: DraftField<AuditionKind>; starts_at: DraftField; due_at: DraftField;
  location: DraftField; casting: DraftField; material_raw: DraftField; bring: DraftField; notes: DraftField;
  material: Record<string, unknown> | null;
};
export type ParseResult = { ok: boolean; draft: Draft; quota: { used: number | null; limit: number | null; remaining: number | null } };

export const STATUS_ORDER: AuditionStatus[] = ["submitted", "scheduled", "callback", "booked", "pinned", "passed"];
export const STATUS_LABEL: Record<AuditionStatus, string> = {
  submitted: "Submitted", scheduled: "Audition", callback: "Callback", booked: "Booked", pinned: "Pinned", passed: "Passed",
};
export const KIND_LABEL: Record<AuditionKind, string> = { in_person: "In the room", self_tape: "Self-tape", virtual: "Virtual" };

const HOUR = 3_600_000;

export function countdown(when: string | null, now: Date = new Date()): { n: string; unit: string } {
  if (!when) return { n: "?", unit: "no date" };
  const t = new Date(when);
  const ms = t.getTime() - now.getTime();
  if (ms < 0) return { n: t.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }), unit: "" };
  if (ms < HOUR) return { n: "Now", unit: "" };
  if (ms < 48 * HOUR) {
    const h = Math.floor(ms / HOUR);
    return { n: String(h), unit: h === 1 ? "hour" : "hours" };
  }
  return { n: String(Math.floor(ms / (24 * HOUR))), unit: "days" };
}

/** "Thu Oct 9 · 10:40 AM" in the audition's own zone. */
export function whenLabel(a: Pick<Audition, "when" | "tz" | "kind">): string {
  if (!a.when) return "No date yet";
  const d = new Date(a.when);
  const day = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: a.tz });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: a.tz });
  return a.kind === "self_tape" ? `Due ${day}, ${time}` : `${day} · ${time}`;
}

export function groupByScope(list: Audition[]): Record<AuditionScope, Audition[]> {
  const out: Record<AuditionScope, Audition[]> = { upcoming: [], waiting: [], past: [] };
  for (const a of list) out[a.scope].push(a);
  return out;
}

/** ISO (UTC) -> value for <input type="datetime-local"> in the browser's zone. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

export function browserTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function changedFields(parsed: Record<string, unknown>, saved: Record<string, unknown>): string[] {
  return Object.keys(saved).filter((k) => k in parsed && (parsed[k] ?? null) !== (saved[k] ?? null));
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run lib/auditions.test.ts`
Expected: all pass

The round-trip test relies on the test machine's timezone and must pass in any zone, because both directions use local time. If it fails, `toLocalInput` and `fromLocalInput` disagree and need fixing. Don't change the test.

- [ ] **Step 5: Commit**

```bash
git add lib/auditions.ts lib/auditions.test.ts
git commit -m "Auditions: browser types, countdown, grouping"
```

### Task 13: Data hooks

**Files:**
- Create: `hooks/useAuditions.ts`

- [ ] **Step 1: Write the hooks**

Create `hooks/useAuditions.ts`:

```ts
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import api, { API_URL } from "@/lib/api";
import type { Audition, ParseResult } from "@/lib/auditions";

const KEY = ["auditions"] as const;

async function token(): Promise<string | null> {
  const { data } = await (await import("@/lib/supabase")).supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function multipart<T>(path: string, form: FormData): Promise<T> {
  const t = await token();
  if (!t) throw new Error("Please sign in again.");
  const res = await fetch(`${API_URL}${path}`, { method: "POST", headers: { Authorization: `Bearer ${t}` }, body: form });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(typeof body.detail === "string" ? body.detail : "Something went wrong") as Error & { detail?: unknown; status?: number };
    err.detail = body.detail;
    err.status = res.status;
    throw err;
  }
  return body as T;
}

export function useAuditions() {
  return useQuery<Audition[]>({
    queryKey: KEY,
    queryFn: async () => (await api.get<Audition[]>("/api/auditions")).data,
    staleTime: 30_000,
  });
}

export function useNextAudition(enabled = true) {
  return useQuery<{ audition: Audition | null }>({
    queryKey: [...KEY, "next"],
    queryFn: async () => (await api.get<{ audition: Audition | null }>("/api/auditions/next")).data,
    enabled,
    staleTime: 60_000,
  });
}

export function useParseBreakdown() {
  return useMutation({
    mutationFn: async (input: { text: string; file: File | null; tz: string }) => {
      const form = new FormData();
      if (input.text) form.append("text", input.text);
      if (input.file) form.append("file", input.file);
      form.append("tz", input.tz);
      return multipart<ParseResult>("/api/auditions/parse", form);
    },
  });
}

/** The sides go to ScenePartner exactly as its own upload does; the id comes back at once. */
export async function uploadSides(file: File): Promise<number | null> {
  const form = new FormData();
  form.append("file", file);
  form.append("mode", "full");
  try {
    const script = await multipart<{ id: number }>("/api/scripts/upload-background", form);
    return script.id;
  } catch {
    return null;
  }
}

export function useCreateAudition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => (await api.post<Audition>("/api/auditions", body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateAudition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: number } & Record<string, unknown>) =>
      (await api.patch<Audition>(`/api/auditions/${id}`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useLogOutcome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, outcome }: { id: number; outcome: "good" | "callback" | "no" }) =>
      (await api.post<Audition>(`/api/auditions/${id}/outcome`, { outcome })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteAudition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => api.delete(`/api/auditions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useAddPiece() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, monologue_id }: { id: number; monologue_id: number }) =>
      (await api.post<Audition>(`/api/auditions/${id}/pieces`, { monologue_id })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useCalendarLink(enabled: boolean) {
  return useQuery<{ url: string }>({
    queryKey: [...KEY, "calendar"],
    queryFn: async () => (await api.get<{ url: string }>("/api/auditions/calendar-link")).data,
    enabled,
  });
}
```

- [ ] **Step 2: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors. If `API_URL` isn't a named export of `lib/api.ts`, it is: line 6 exports it.

```bash
git add hooks/useAuditions.ts
git commit -m "Auditions: data hooks"
```

### Task 14: Ticket styles

**Files:**
- Modify: `app/globals.css` (append one block at the very end)

- [ ] **Step 1: Append the block**

Append to the end of `app/globals.css`. It uses only Theatre Walk tokens, so light and dark both follow the house-light switch. Orange is NOT set here; components put `bg-primary text-primary-foreground` on the stub. No `display` on anything that also gets a Tailwind visibility class.

```css
/* ============================================================
   AUDITIONS: the ticket rail and the prep room.
   Tokens only, so both house-light modes follow. Orange comes from
   bg-primary on the element, never from here. Visibility (rail vs
   prep room on phones) is Tailwind's job, so no `display` on the
   shell columns.
   ============================================================ */
.theatre-auditions {
  background: var(--t-cream);
  color: var(--t-ink);
  font-family: var(--t-body);
}
.aud-title {
  font-family: var(--t-display);
  font-weight: 400;
  line-height: 1;
}
.aud-dir {
  font-family: var(--t-direction);
}
.aud-ticket {
  background: var(--t-paper);
  border: 1.5px solid var(--t-ink);
  box-shadow: 4px 4px 0 var(--t-hard-shadow);
  transition: transform 200ms var(--t-spring), border-color 200ms;
}
.aud-ticket:focus-visible {
  outline: 2px solid var(--t-ink);
  outline-offset: 3px;
}
.aud-ticket[data-open="true"] {
  transform: translateX(8px);
}
.aud-ticket[data-dim="true"] {
  opacity: 0.6;
}
.aud-stub {
  border-right: 1.5px dashed var(--t-ink);
}
.aud-ticket[data-open="true"] .aud-stub,
.aud-prep-stub {
  border-color: currentColor;
}
.aud-stub-n {
  font-family: var(--t-display);
  line-height: 0.9;
}
.aud-chip {
  font-family: var(--t-direction);
  font-size: 10.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  border: 1px solid var(--t-ink);
  padding: 1px 6px;
}
.aud-chip[data-tone="gel"] {
  background: var(--t-gel);
  border-color: var(--t-gel);
  color: var(--t-on-gel);
}
.aud-drop {
  background: var(--t-paper);
  border: 1.5px dashed var(--t-ink);
}
.aud-drop[data-over="true"] {
  border-style: solid;
  background: var(--t-paper-2);
}
.aud-prep {
  background: var(--t-paper);
  border: 1.5px solid var(--t-ink);
  box-shadow: 6px 6px 0 var(--t-hard-shadow);
}
.aud-row {
  border-bottom: 1px dashed var(--t-line-light);
}
.aud-row dt {
  color: var(--t-muted-dark);
  font-size: 10.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.aud-step {
  border: 1px solid var(--t-line-light);
}
.aud-box {
  width: 18px;
  height: 18px;
  border: 1.5px solid var(--t-ink);
}
.aud-box[data-done="true"] {
  background: var(--t-ink);
}
.aud-field[data-unsure="true"] {
  outline: 2px solid var(--t-gel);
  outline-offset: 1px;
}
.aud-muted {
  color: var(--t-muted-dark);
}
@media (prefers-reduced-motion: reduce) {
  .aud-ticket {
    transition: none;
  }
}
```

Check that `--t-on-gel`, `--t-spring`, `--t-hard-shadow`, `--t-line-light`, `--t-muted-dark` and `--t-paper-2` all exist: `grep -c -- "--t-on-gel:" app/globals.css` (and so on). Each should print 1 or more. If one is missing, use the nearest token that does exist and note it in the commit message.

- [ ] **Step 2: Commit**

```bash
git add app/globals.css
git commit -m "Auditions: ticket and prep room styles, tokens only"
```

### Task 15: Ticket and rail

**Files:**
- Create: `components/auditions/AuditionTicket.tsx`
- Create: `components/auditions/TicketRail.tsx`

- [ ] **Step 1: Write the ticket**

Create `components/auditions/AuditionTicket.tsx`:

```tsx
"use client";

import Link from "next/link";

import { countdown, STATUS_LABEL, KIND_LABEL, whenLabel, type Audition } from "@/lib/auditions";

export function AuditionTicket({ a, open, now }: { a: Audition; open: boolean; now: Date }) {
  const c = countdown(a.when, now);
  const prep = a.prep;
  const runs = prep?.runs ?? 0;
  const noPrep = prep && !prep.steps.some((s) => s.done) && a.scope === "upcoming";
  return (
    <Link
      href={`/auditions/${a.id}`}
      className="aud-ticket flex min-h-[84px]"
      data-open={open ? "true" : "false"}
      data-dim={a.scope === "past" ? "true" : "false"}
      aria-current={open ? "page" : undefined}
    >
      <div
        className={`aud-stub flex w-[72px] shrink-0 flex-col items-center justify-center px-2 py-2 ${
          open ? "bg-primary text-primary-foreground" : ""
        }`}
      >
        <span className={`aud-stub-n ${c.n.length > 3 ? "text-xl" : "text-4xl"}`}>{c.n}</span>
        {c.unit && <span className="aud-dir text-[10px] uppercase">{c.unit}</span>}
      </div>
      <div className="min-w-0 flex-1 px-3 py-2.5">
        <p className="aud-title truncate text-xl">{a.project}</p>
        <p className="aud-dir aud-muted mt-0.5 truncate text-[11px] uppercase">
          {[a.role, whenLabel(a)].filter(Boolean).join(" · ")}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <span className="aud-chip" data-tone={a.status === "callback" || a.status === "booked" ? "gel" : undefined}>
            {a.kind === "self_tape" && a.status === "scheduled" ? KIND_LABEL.self_tape : STATUS_LABEL[a.status]}
          </span>
          {runs > 0 && <span className="aud-chip">{runs} {runs === 1 ? "run" : "runs"}</span>}
          {noPrep && <span className="aud-chip">no prep yet</span>}
        </div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Write the rail**

Create `components/auditions/TicketRail.tsx`:

```tsx
"use client";

import { useState } from "react";

import { groupByScope, type Audition } from "@/lib/auditions";
import { AuditionTicket } from "./AuditionTicket";

const HEAD = "aud-dir aud-muted mb-2 mt-4 text-[10.5px] uppercase tracking-[0.08em]";

export function TicketRail({ list, openId, now }: { list: Audition[]; openId: number | null; now: Date }) {
  const g = groupByScope(list);
  const [showPast, setShowPast] = useState(false);
  return (
    <nav aria-label="Your auditions">
      {g.upcoming.length > 0 && (
        <>
          <p className={HEAD}>Coming up</p>
          <ul className="flex flex-col gap-2.5">
            {g.upcoming.map((a) => (
              <li key={a.id}><AuditionTicket a={a} open={a.id === openId} now={now} /></li>
            ))}
          </ul>
        </>
      )}
      {g.waiting.length > 0 && (
        <>
          <p className={HEAD}>Waiting to hear</p>
          <ul className="flex flex-col gap-2.5">
            {g.waiting.map((a) => (
              <li key={a.id}><AuditionTicket a={a} open={a.id === openId} now={now} /></li>
            ))}
          </ul>
        </>
      )}
      {g.past.length > 0 && (
        <>
          <button type="button" className={`${HEAD} underline-offset-2 hover:underline`} onClick={() => setShowPast((v) => !v)}>
            Past ({g.past.length}) {showPast ? "hide" : "show"}
          </button>
          {showPast && (
            <ul className="flex flex-col gap-2.5">
              {g.past.map((a) => (
                <li key={a.id}><AuditionTicket a={a} open={a.id === openId} now={now} /></li>
              ))}
            </ul>
          )}
        </>
      )}
    </nav>
  );
}
```

- [ ] **Step 3: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors

```bash
git add components/auditions/AuditionTicket.tsx components/auditions/TicketRail.tsx
git commit -m "Auditions: the ticket and the rail"
```

### Task 16: Capture (drop box and draft card)

**Files:**
- Create: `components/auditions/DraftCard.tsx`
- Create: `components/auditions/DropBox.tsx`

- [ ] **Step 1: Write the draft card**

Create `components/auditions/DraftCard.tsx`:

```tsx
"use client";

import { useState } from "react";

import { fromLocalInput, toLocalInput, KIND_LABEL, type AuditionKind, type Draft } from "@/lib/auditions";

export type DraftValues = {
  project: string; role: string; kind: AuditionKind; when: string; location: string; casting: string;
  material_raw: string; bring: string; notes: string; tape_link: string;
};

export function valuesFromDraft(d: Draft | null): DraftValues {
  const v = (f?: { value: string | null }) => f?.value ?? "";
  const kind = (d?.kind.value ?? "in_person") as AuditionKind;
  return {
    project: v(d?.project), role: v(d?.role), kind,
    when: toLocalInput(kind === "self_tape" ? d?.due_at.value ?? null : d?.starts_at.value ?? null),
    location: v(d?.location), casting: v(d?.casting), material_raw: v(d?.material_raw), bring: v(d?.bring),
    notes: v(d?.notes), tape_link: "",
  };
}

export function bodyFromValues(v: DraftValues): Record<string, unknown> {
  const iso = fromLocalInput(v.when);
  return {
    project: v.project.trim(), role: v.role || null, kind: v.kind,
    starts_at: v.kind === "self_tape" ? null : iso, due_at: v.kind === "self_tape" ? iso : null,
    location: v.location || null, casting: v.casting || null, material_raw: v.material_raw || null,
    bring: v.bring || null, notes: v.notes || null, tape_link: v.tape_link || null,
  };
}

const LABEL = "aud-dir aud-muted text-[10.5px] uppercase tracking-[0.06em]";
const INPUT = "aud-field mt-1 w-full border border-[var(--t-line-light)] bg-[var(--t-paper)] px-2.5 py-2 text-sm";

export function DraftCard({
  draft, sidesName, saving, onSave, onCancel,
}: {
  draft: Draft | null;
  sidesName: string | null;
  saving: boolean;
  onSave: (v: DraftValues) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState<DraftValues>(() => valuesFromDraft(draft));
  const unsure = (k: keyof Draft) => {
    const f = draft?.[k] as { value: unknown; confidence: string } | null | undefined;
    return draft && f && typeof f === "object" && "confidence" in f && (f.confidence === "low" || f.value == null) ? "true" : "false";
  };
  const set = (k: keyof DraftValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setV((p) => ({ ...p, [k]: e.target.value }));
  const whenKey = v.kind === "self_tape" ? "due_at" : "starts_at";

  return (
    <form
      className="aud-prep p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (v.project.trim()) onSave(v);
      }}
    >
      <p className="aud-title text-2xl">{draft ? "Check what I read" : "Add an audition"}</p>
      {draft && <p className="aud-muted mt-1 text-sm">The outlined ones I wasn&apos;t sure about.</p>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className={LABEL}>Project</span>
          <input required autoFocus className={INPUT} data-unsure={unsure("project")} value={v.project} onChange={set("project")} />
        </label>
        <label><span className={LABEL}>Role</span>
          <input className={INPUT} data-unsure={unsure("role")} value={v.role} onChange={set("role")} />
        </label>
        <label><span className={LABEL}>Kind</span>
          <select className={INPUT} data-unsure={unsure("kind")} value={v.kind} onChange={set("kind")}>
            {(Object.keys(KIND_LABEL) as AuditionKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <label><span className={LABEL}>{v.kind === "self_tape" ? "Tape due" : "When"}</span>
          <input type="datetime-local" className={INPUT} data-unsure={unsure(whenKey)} value={v.when} onChange={set("when")} />
        </label>
        <label><span className={LABEL}>Where</span>
          <input className={INPUT} data-unsure={unsure("location")} value={v.location} onChange={set("location")} />
        </label>
        <label><span className={LABEL}>Casting</span>
          <input className={INPUT} data-unsure={unsure("casting")} value={v.casting} onChange={set("casting")} />
        </label>
        <label><span className={LABEL}>What they asked for</span>
          <input className={INPUT} data-unsure={unsure("material_raw")} placeholder="1 min contemporary comedic" value={v.material_raw} onChange={set("material_raw")} />
        </label>
        <label className="sm:col-span-2"><span className={LABEL}>Bring</span>
          <input className={INPUT} data-unsure={unsure("bring")} value={v.bring} onChange={set("bring")} />
        </label>
        {v.kind === "self_tape" && (
          <label className="sm:col-span-2"><span className={LABEL}>Tape link (optional)</span>
            <input type="url" className={INPUT} value={v.tape_link} onChange={set("tape_link")} />
          </label>
        )}
        <label className="sm:col-span-2"><span className={LABEL}>Notes</span>
          <textarea rows={2} className={INPUT} value={v.notes} onChange={set("notes")} />
        </label>
      </div>
      {sidesName && <p className="aud-dir aud-muted mt-3 text-xs">Sides: {sidesName}. They&apos;ll load into ScenePartner when you save.</p>}
      <div className="mt-4 flex items-center gap-3">
        <button type="submit" disabled={saving} className="t-cta bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold">
          {saving ? "Saving" : "Save it"}
        </button>
        <button type="button" onClick={onCancel} className="aud-muted text-sm underline-offset-2 hover:underline">Cancel</button>
      </div>
      <p className="aud-dir aud-muted mt-2 text-[11px]">Times are in {Intl.DateTimeFormat().resolvedOptions().timeZone}.</p>
    </form>
  );
}
```

- [ ] **Step 2: Write the drop box**

Create `components/auditions/DropBox.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { trackEvent } from "@/lib/events";
import { browserTz, changedFields, type Draft } from "@/lib/auditions";
import { uploadSides, useCreateAudition, useParseBreakdown } from "@/hooks/useAuditions";
import { DraftCard, bodyFromValues, valuesFromDraft, type DraftValues } from "./DraftCard";

type Stage = "idle" | "reading" | "card";

export function DropBox({ source = "parse", startOpen = false }: { source?: "parse" | "onboarding"; startOpen?: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const [stage, setStage] = useState<Stage>(startOpen ? "card" : "idle");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [manual, setManual] = useState(startOpen);
  const fileInput = useRef<HTMLInputElement>(null);
  const parse = useParseBreakdown();
  const create = useCreateAudition();

  async function read() {
    if (!text.trim() && !file) return;
    setStage("reading");
    try {
      const res = await parse.mutateAsync({ text: text.trim(), file, tz: browserTz() });
      setDraft(res.draft);
      setManual(false);
      if (!res.ok) toast.message("I couldn't read that one. Fill it in and I'll keep your text in the notes.");
    } catch (e) {
      const err = e as Error & { detail?: { error?: string } };
      if (err.detail?.error === "audition_parse_quota") {
        toast.message("That's your 5 free reads this month. Fill this one in by hand, or go Plus for unlimited.");
      } else {
        toast.error(err.message);
      }
      setDraft(null);
      setManual(true);
    }
    setStage("card");
  }

  async function save(v: DraftValues) {
    const body: Record<string, unknown> = { ...bodyFromValues(v), tz: browserTz(), source: manual ? (source === "onboarding" ? "onboarding" : "manual") : source };
    if (file) {
      const scriptId = await uploadSides(file);
      if (scriptId) body.user_script_id = scriptId;
      else toast.message("The sides didn't load into ScenePartner. You can add them from the prep room.");
    }
    if (draft && !manual) {
      const fields = changedFields(valuesFromDraft(draft) as unknown as Record<string, unknown>, v as unknown as Record<string, unknown>);
      if (fields.length) trackEvent("audition_parse_corrected", { fields: fields.join(",") });
    }
    try {
      const a = await create.mutateAsync(body);
      reset();
      router.push(`/auditions/${a.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function reset() {
    setText("");
    setFile(null);
    setDraft(null);
    setStage("idle");
    setManual(false);
  }

  if (stage === "card") {
    return (
      <DraftCard
        draft={manual ? null : draft}
        sidesName={file?.name ?? null}
        saving={create.isPending}
        onSave={save}
        onCancel={reset}
      />
    );
  }

  return (
    <div
      className="aud-drop p-3"
      data-over={over ? "true" : "false"}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f && f.type === "application/pdf") setFile(f);
        else if (f) toast.message("Sides need to be a PDF.");
      }}
    >
      <p className="text-sm"><b>Got one coming up?</b> Paste the casting email or drop the sides.</p>
      <textarea
        rows={stage === "reading" ? 2 : 3}
        className="mt-2 w-full resize-y border border-[var(--t-line-light)] bg-[var(--t-paper)] px-2.5 py-2 text-sm"
        placeholder="Paste it here"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={stage === "reading"}
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={read}
          disabled={stage === "reading" || (!text.trim() && !file)}
          className="t-cta bg-primary text-primary-foreground px-3.5 py-1.5 text-sm font-semibold disabled:opacity-50"
        >
          {stage === "reading" ? "Reading it" : "Read it"}
        </button>
        <button type="button" className="aud-dir text-xs underline-offset-2 hover:underline" onClick={() => fileInput.current?.click()}>
          {file ? `Sides: ${file.name}` : "attach sides (PDF)"}
        </button>
        <input ref={fileInput} type="file" accept="application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button type="button" className="aud-dir aud-muted ml-auto text-xs underline-offset-2 hover:underline" onClick={() => { setManual(true); setStage("card"); }}>
          or fill it in yourself
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors

```bash
git add components/auditions/DraftCard.tsx components/auditions/DropBox.tsx
git commit -m "Auditions: paste or drop, read it, check the card, save"
```

### Task 17: Prep room, shell, pages, nav

**Files:**
- Create: `components/auditions/PrepRoom.tsx`
- Create: `components/auditions/CalendarLink.tsx`
- Create: `components/auditions/AuditionsShell.tsx`
- Create: `app/(platform)/auditions/page.tsx`
- Create: `app/(platform)/auditions/[id]/page.tsx`
- Create: `app/(platform)/auditions/next/page.tsx`
- Modify: `app/(platform)/layout.tsx` (navItems around line 187, `currentLabel` chain)
- Modify: `middleware.ts` (`protectedPaths` and `matcher`)
- Modify: `app/(auth)/login/page.tsx` (`redirectTo`)

- [ ] **Step 1: Write the prep room**

Create `components/auditions/PrepRoom.tsx`:

```tsx
"use client";

import Link from "next/link";

import { trackEvent } from "@/lib/events";
import { countdown, STATUS_LABEL, STATUS_ORDER, whenLabel, type Audition, type AuditionStatus } from "@/lib/auditions";
import { useDeleteAudition, useLogOutcome, useUpdateAudition } from "@/hooks/useAuditions";

export function PrepRoom({ a, now }: { a: Audition; now: Date }) {
  const c = countdown(a.when, now);
  const update = useUpdateAudition();
  const outcome = useLogOutcome();
  const del = useDeleteAudition();
  const rows: [string, string | null][] = [
    ["Where", a.location], ["Casting", a.casting], ["Bring", a.bring], ["Asked for", a.material_raw],
  ];
  const past = a.scope !== "upcoming";
  return (
    <article className="aud-prep grid sm:grid-cols-[150px_1fr]">
      <div className="aud-prep-stub bg-primary text-primary-foreground flex items-center gap-4 border-dashed px-4 py-3 max-sm:border-b-2 sm:flex-col sm:items-center sm:justify-start sm:border-r-2 sm:py-6 sm:text-center">
        <div>
          <p className="aud-stub-n text-6xl sm:text-8xl">{c.n}</p>
          {c.unit && <p className="aud-dir text-[11px] uppercase tracking-[0.1em]">{c.unit}</p>}
        </div>
        <p className="aud-dir text-[11.5px] leading-relaxed sm:mt-4">{whenLabel(a)}</p>
      </div>

      <div className="min-w-0 p-4 sm:p-6">
        <p className="aud-dir text-[11px] uppercase tracking-[0.08em]">{STATUS_LABEL[a.status]}</p>
        <h1 className="aud-title text-3xl sm:text-4xl">{a.project}</h1>
        {a.role && <p className="aud-muted mt-0.5 text-sm">{a.role}</p>}

        <dl className="mt-3">
          {rows.filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className="aud-row aud-dir grid grid-cols-[84px_1fr] py-1.5 text-[12.5px]">
              <dt>{k}</dt><dd>{v}</dd>
            </div>
          ))}
        </dl>

        {a.prep && (
          <ol className="mt-4 grid gap-2.5">
            {a.prep.steps.map((s) => (
              <li key={s.key} className="aud-step grid grid-cols-[22px_1fr_auto] items-center gap-3 px-3 py-2.5">
                <span className="aud-box" data-done={s.done ? "true" : "false"} aria-label={s.done ? "done" : "not yet"} />
                <span className="text-sm">
                  {s.label}
                  {s.key === "sides" && (
                    <span className="aud-dir aud-muted block text-[11px]">
                      {a.prep!.runs === 0 ? "not run yet" : `${a.prep!.runs} ${a.prep!.runs === 1 ? "run" : "runs"}`}
                    </span>
                  )}
                </span>
                {s.href && (
                  <Link
                    href={s.href}
                    onClick={() => s.key !== "bring" && trackEvent("audition_prep_started", { audition_id: a.id, kind: s.key === "sides" ? "sides" : "monologue" })}
                    className={`t-cta px-3 py-1.5 text-[12.5px] font-semibold ${s.done ? "border border-current" : "bg-primary text-primary-foreground"}`}
                  >
                    {s.key === "sides" ? (a.prep!.runs ? "Run it again" : "Run it") : s.key === "piece" ? "See them" : "Your collection"}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        )}

        {past && a.status !== "booked" && a.status !== "passed" && (
          <div className="mt-5">
            <p className="text-sm">How did it go?</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {([["good", "Felt good"], ["callback", "Got a callback"], ["no", "Not this time"]] as const).map(([o, label]) => (
                <button key={o} type="button" className="aud-chip px-2.5 py-1" disabled={outcome.isPending}
                  onClick={() => outcome.mutate({ id: a.id, outcome: o })}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-1.5" role="group" aria-label="Status">
          {STATUS_ORDER.map((s: AuditionStatus) => (
            <button key={s} type="button" className="aud-chip px-2 py-1" data-tone={s === a.status ? "gel" : undefined}
              aria-pressed={s === a.status} onClick={() => s !== a.status && update.mutate({ id: a.id, status: s })}>
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>

        <div className="aud-dir aud-muted mt-5 flex flex-wrap items-center gap-4 text-[11.5px]">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={a.reminders_on} onChange={(e) => update.mutate({ id: a.id, reminders_on: e.target.checked })} />
            email me about this one
          </label>
          {a.tape_link && <a href={a.tape_link} target="_blank" rel="noreferrer" className="underline">tape</a>}
          <button type="button" className="underline-offset-2 hover:underline" onClick={() => del.mutate(a.id)}>remove</button>
        </div>
        {a.notes && <p className="aud-muted mt-4 whitespace-pre-wrap text-sm">{a.notes}</p>}
      </div>
    </article>
  );
}
```

- [ ] **Step 2: Write the calendar link**

Create `components/auditions/CalendarLink.tsx`:

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";

import { trackEvent } from "@/lib/events";
import { useCalendarLink } from "@/hooks/useAuditions";

export function CalendarLink() {
  const [open, setOpen] = useState(false);
  const { data } = useCalendarLink(open);
  return (
    <div className="aud-dir text-[11.5px]">
      {!open ? (
        <button type="button" className="underline-offset-2 hover:underline" onClick={() => setOpen(true)}>
          put these in my calendar
        </button>
      ) : data ? (
        <button
          type="button"
          className="underline-offset-2 hover:underline"
          onClick={async () => {
            await navigator.clipboard.writeText(data.url);
            trackEvent("calendar_feed_subscribed");
            toast.success("Copied. In Google Calendar: Other calendars, From URL. On iPhone: Settings, Calendar, Add Subscribed Calendar.");
          }}
        >
          copy the calendar link
        </button>
      ) : (
        <span className="aud-muted">getting the link</span>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write the shell**

Create `components/auditions/AuditionsShell.tsx`:

```tsx
"use client";

import { useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

import { theatreFontVars } from "@/lib/fonts/theatre";
import { trackEvent } from "@/lib/events";
import { useAuditions } from "@/hooks/useAuditions";
import { DropBox } from "./DropBox";
import { TicketRail } from "./TicketRail";
import { PrepRoom } from "./PrepRoom";
import { CalendarLink } from "./CalendarLink";

/**
 * One shell for /auditions and /auditions/[id]. Desktop: rail left, prep room
 * right. Phone: the rail is the page; with an id it is the prep room alone.
 * Visibility is Tailwind only (see globals.css AUDITIONS note).
 */
export function AuditionsShell({ selectedId }: { selectedId: number | null }) {
  const params = useSearchParams();
  const { data: list = [], isLoading } = useAuditions();
  const now = useMemo(() => new Date(), [list]); // eslint-disable-line react-hooks/exhaustive-deps
  const fallback = list.find((a) => a.scope === "upcoming") ?? list[0] ?? null;
  const open = (selectedId != null ? list.find((a) => a.id === selectedId) : fallback) ?? null;

  useEffect(() => {
    const ar = params.get("ar");
    if (ar && selectedId) trackEvent("audition_reminder_clicked", { audition_id: selectedId, moment: ar });
    if (params.get("utm_campaign") === "auditions_winback") trackEvent("audition_strip_clicked", { surface: "winback_email" });
    if (params.get("from") === "login" && selectedId) trackEvent("audition_landing_shown", { audition_id: selectedId });
  }, [params, selectedId]);

  const startOpen = params.get("new") === "1";
  const source = params.get("from") === "onboarding" ? "onboarding" : "parse";

  return (
    <div className={`theatre-tokens theatre-auditions ${theatreFontVars} min-h-[calc(100dvh-65px)] overflow-x-clip`}>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 md:grid-cols-[360px_1fr] md:py-10">
        <section className={selectedId != null ? "max-md:hidden" : ""}>
          <div className="mb-4 flex items-end justify-between">
            <h1 className="aud-title text-4xl">Auditions</h1>
            <CalendarLink />
          </div>
          <DropBox startOpen={startOpen} source={source} />
          {isLoading ? (
            <p className="aud-muted mt-6 text-sm">Loading your rail</p>
          ) : list.length === 0 ? (
            <div className="mt-6">
              <div className="aud-ticket flex min-h-[84px] items-center justify-center border-dashed opacity-60">
                <p className="aud-dir text-xs">your next one goes here</p>
              </div>
              <p className="aud-muted mt-4 text-sm">Paste the next casting email you get. I&apos;ll handle the reminders.</p>
            </div>
          ) : (
            <TicketRail list={list} openId={open?.id ?? null} now={now} />
          )}
        </section>

        <section className={selectedId == null ? "max-md:hidden" : ""}>
          {selectedId != null && (
            <Link href="/auditions" className="aud-dir mb-3 inline-block text-xs md:hidden">all auditions</Link>
          )}
          {open ? (
            <PrepRoom a={open} now={now} />
          ) : !isLoading && selectedId != null ? (
            <p className="aud-muted text-sm">That audition isn&apos;t on your rail.</p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write the three pages**

`app/(platform)/auditions/page.tsx`:

```tsx
import { Suspense } from "react";

import { AuditionsShell } from "@/components/auditions/AuditionsShell";

export const metadata = { title: "Auditions | ActorRise" };

export default function AuditionsPage() {
  return (
    <Suspense>
      <AuditionsShell selectedId={null} />
    </Suspense>
  );
}
```

`app/(platform)/auditions/[id]/page.tsx`:

```tsx
import { Suspense } from "react";

import { AuditionsShell } from "@/components/auditions/AuditionsShell";

export const metadata = { title: "Prep room | ActorRise" };

export default async function AuditionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  return (
    <Suspense>
      <AuditionsShell selectedId={Number.isFinite(n) ? n : null} />
    </Suspense>
  );
}
```

(Check another dynamic page in `app/(platform)`, e.g. `monologue/[id]/page.tsx`, to see whether this Next version types `params` as a Promise. Match it.)

`app/(platform)/auditions/next/page.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useNextAudition } from "@/hooks/useAuditions";

/**
 * Where login sends people. With an audition in the next 14 days: its prep
 * room. Otherwise the Collection, exactly as before the tracker existed.
 */
export default function NextAuditionHop() {
  const router = useRouter();
  const { data, isError } = useNextAudition();
  useEffect(() => {
    if (isError) router.replace("/rehearse");
    else if (data) router.replace(data.audition ? `/auditions/${data.audition.id}?from=login` : "/rehearse");
  }, [data, isError, router]);
  return null;
}
```

- [ ] **Step 5: Navigation, protection, login**

In `app/(platform)/layout.tsx`, add a fourth entry to `navItems` (line ~197), after Collection. Use an icon from the same Tabler import already in the file. Add `IconTicket` to that import list if it isn't there:

```tsx
    // The tracker. Prefix match so the prep room (/auditions/12) lights the tab.
    { href: "/auditions", label: "Auditions", icon: IconTicket, match: "prefix" as const },
```

Check that the phone tab bar still fits five slots (four tabs plus the avatar) at 390px, and fix spacing if a label wraps.

In `middleware.ts`, add `'/auditions'` to `protectedPaths` and `'/auditions/:path*'` to `matcher` (keep the two lists in sync, as the comment there asks).

In `app/(auth)/login/page.tsx`, change `redirectTo="/rehearse"` to `redirectTo="/auditions/next"`, and add one line to the comment above it: `Since the audition tracker, /auditions/next decides: the prep room when one is inside 14 days, else the Collection.`

- [ ] **Step 6: Typecheck, build, commit**

Run: `npx tsc --noEmit && npx vitest run lib/auditions.test.ts`
Expected: no errors, tests pass

```bash
git add components/auditions "app/(platform)/auditions" "app/(platform)/layout.tsx" middleware.ts "app/(auth)/login/page.tsx"
git commit -m "Auditions: the prep room, the rail page, the tab, and login lands on the next one"
```

### Task 18: Strip, onboarding route, win-back link

**Files:**
- Create: `components/auditions/AuditionStrip.tsx`
- Modify: `app/(platform)/rehearse/page.tsx`
- Modify: `app/(platform)/monologues/page.tsx`
- Modify: `components/onboarding/ProfileOnboardingFlow.tsx` (line ~855 and the "Bring your own sides" note at ~1190)

- [ ] **Step 1: Write the strip**

Create `components/auditions/AuditionStrip.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { trackEvent } from "@/lib/events";
import { useAuditions } from "@/hooks/useAuditions";

const KEY = "aud-strip-dismissed";

/** One slim line for people with nothing upcoming. Dismissal is per browser. */
export function AuditionStrip({ surface }: { surface: "rehearse" | "monologues" }) {
  const { data } = useAuditions();
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(KEY) === "1");
    } catch {
      setHidden(false);
    }
  }, []);
  if (hidden || !data || data.some((a) => a.scope === "upcoming")) return null;
  return (
    <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2 text-sm">
      <Link href="/auditions?new=1" onClick={() => trackEvent("audition_strip_clicked", { surface })} className="underline-offset-2 hover:underline">
        Got an audition coming up? Add it and I&apos;ll remind you.
      </Link>
      <button
        type="button"
        aria-label="Dismiss"
        className="text-xs opacity-70"
        onClick={() => {
          try { localStorage.setItem(KEY, "1"); } catch {}
          setHidden(true);
        }}
      >
        not now
      </button>
    </div>
  );
}
```

The spec says the dismissal is remembered per user. localStorage remembers it per browser, which is a deliberate v1 simplification: no new column, and a dismissed strip coming back on another device is harmless. Mention it in the commit message.

- [ ] **Step 2: Place it**

In `app/(platform)/rehearse/page.tsx`, render `<AuditionStrip surface="rehearse" />` as the first child inside the `theatre-tokens theatre-collection` wrapper div (line ~39). In `app/(platform)/monologues/page.tsx`, render `<AuditionStrip surface="monologues" />` directly above the search header. Search the file for the outermost element returned by the page component and put it just inside it. Import from `@/components/auditions/AuditionStrip` in both.

- [ ] **Step 3: Point onboarding's sides option at the tracker**

In `components/onboarding/ProfileOnboardingFlow.tsx`, line ~855, change:

```tsx
                onOwnSides={() => { endFlow(); router.push("/practice"); }}
```

to:

```tsx
                // A real audition's sides go through the tracker now: same
                // ScenePartner upload, plus the date and the reminders.
                onOwnSides={() => { endFlow(); router.push("/auditions?new=1&from=onboarding"); }}
```

And change the `note` on the "Bring your own sides" `WayOn` (line ~1190) from `"A real audition script. I'll read every role that isn't yours."` to `"A real audition? Drop the sides and the date. I'll read the other roles and remind you."`.

- [ ] **Step 4: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors

```bash
git add components/auditions/AuditionStrip.tsx "app/(platform)/rehearse/page.tsx" "app/(platform)/monologues/page.tsx" components/onboarding/ProfileOnboardingFlow.tsx
git commit -m "Auditions: the strip for people with nothing booked, and onboarding's sides go through the tracker"
```

---

## Phase 5: Verify and launch

### Task 19: End-to-end check in both themes

**Files:** none (verification only)

- [ ] **Step 1: Full test suites**

Run: `cd backend && .venv/bin/python -m pytest tests/ -q`
Expected: everything passes, about 1,596 tests plus the roughly 50 new ones.

Run: `npx vitest run && npx tsc --noEmit`
Expected: all pass, no type errors

- [ ] **Step 2: Apply the migration to a local or branch database and run both servers**

Run `backend/scripts/add_auditions_tables.sql` against your local database. Then start the backend: `cd backend && .venv/bin/uvicorn app.main:app --port 8000`. Before you do, check `pgrep -f uvicorn`: a second local uvicorn runs schedulers against prod. With `ENVIRONMENT` unset, `scheduler_gate` keeps the schedulers off.

Start the frontend with `npm run dev`. If a CSS edit doesn't show up, run `rm -rf .next/dev/cache` and restart.

- [ ] **Step 3: Walk the flow logged in, desktop and 390px, light and dark**

Use the logged-in phone-width recipe from memory `mobile-first-run-branch.md`. Remember that headless 390px isn't really 390px (`headless-screenshots-lie.md`). Check each of these and fix anything that fails before moving on:
1. `/auditions` empty: the outline ticket and the line in Canberk's voice show, with the drop box on top.
2. Paste a Backstage-style notice and click Read it. The card opens with low-confidence fields outlined. Save. You land on `/auditions/<id>`, the ticket slides out, and the stub is orange.
3. Drop a sides PDF and save. The prep room shows "Run the sides" linking to `/practice?script=<id>`, and the script appears on the ScenePartner shelf.
4. Click "See them" on "Pick your piece". `/monologues?q=...` runs the search.
5. Status chips move the ticket between groups. "How did it go?" shows for a past audition.
6. Toggle house lights. Every surface follows: the paper, the ink, the stub label (white on light orange, dark on dark orange), and the gel chips.
7. On a phone: the rail is the page, a ticket opens the full-screen prep room, "all auditions" goes back, and the tab bar fits.
8. Log out and log in with an audition 3 days out. You land on its prep room. With none inside 14 days, you land on `/rehearse`.
9. `GET /api/auditions/calendar.ics?k=<key>` imports into Apple or Google Calendar.
10. Dry-run the reminders against real data: `cd backend && .venv/bin/python -c "from app.core.database import SessionLocal; from app.services.auditions import reminders; print(reminders.run(SessionLocal(), send=False))"`

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "Auditions: fixes from the walk-through"
```

### Task 20: Launch (Canberk's steps, in order)

- [ ] **Step 1:** Run `backend/scripts/add_auditions_tables.sql` on Supabase (SQL editor). Check: `select count(*) from auditions;` returns 0.
- [ ] **Step 2:** Push `main`. Render deploys the backend and Vercel deploys the frontend.
- [ ] **Step 3:** In `/admin/emails`, turn on **Audition reminders**.
- [ ] **Step 4:** Add a decision entry to `docs/metrics/decisions.md`: "2026-10-XX Audition tracker shipped. Baseline: 82 WAU, 451 MAU, returning per week 3 to 17, 17.5% ever rehearse, 984 dormant. Success: returning per week toward 40+ by week 4, read off Engaged returning in /admin." Commit and push.
- [ ] **Step 5 (week 2):** Ask Claude to draft the dormant win-back email with the `draft-actorrise-email` skill. The rules:
  - Audience: dormant users with `marketing_opt_in`.
  - Voice: first person, signed Canberk, include the reply-UNSUBSCRIBE line, no CURTAIN, no offer.
  - One ask, linking to `https://actorrise.com/auditions?new=1&utm_campaign=auditions_winback`.

  Canberk sends it from `/admin/emails`.
- [ ] **Step 6 (weeks 3 to 5):** Read Engaged returning and the Audition tracker card weekly. No new features until the read is in.
