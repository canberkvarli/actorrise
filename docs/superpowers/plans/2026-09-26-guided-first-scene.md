# Guided First Scene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A never-rehearsed actor opening `/practice` gets a six-line scene started at them, answers it on the existing rehearse engine in a guided mode, and is offered their own sides on the win screen.

**Architecture:** A hidden system script ("Late", RILEY and ALEX) seeded next to The Breakup, excluded from every shelf by a new `user_scripts.is_guided` column. A meter-free `POST /api/scenes/rehearse/start-guided` creates a real session. The hub renders a `GuidedInvitation` instead of the library when a pure rule says so; the rehearse page reads `guided=1` and adds a coaching line driven by a pure state machine, the cue accent, a nudge after six quiet seconds, and a win screen with the upload control.

**Tech Stack:** FastAPI + SQLAlchemy (backend, pytest with `tests/dbfixture.memory_db`), Next.js app router + React (frontend, vitest for pure modules), Postgres on Supabase (prod), theatre CSS tokens in `app/globals.css`.

Spec: `docs/superpowers/specs/2026-09-26-guided-first-scene-design.md`.

Conventions the executor must keep:
- Backend tests are `unittest.TestCase` files under `backend/tests/`, run with `cd backend && .venv/bin/python -m pytest tests/<file> -q`. DB-backed tests use `from tests.dbfixture import memory_db, restore` exactly as `tests/test_whats_next.py` does.
- Frontend pure tests are vitest files next to the module (`lib/x.test.ts`), run with `npx vitest run lib/x.test.ts`.
- Commit after every task. Never commit `backend/app/api/webhooks.py`, `backend/app/services/stripe_sync.py` or `backend/tests/test_subscription_created_webhook.py`; they are someone else's uncommitted work. Stage files by name.
- A push to `main` touching `backend/**` deploys Render. The `is_guided` column is applied to Supabase in Task 1 before anything is pushed.
- No em dashes in copy or comments.

---

## File map

Create:
- `backend/app/services/guided_scene.py` (find the guided scene, start a meter-free session)
- `backend/tests/test_guided_scene.py`
- `lib/guided-scene.ts` (the constants the hub prints before a session exists)
- `lib/guided-invite.ts` + `lib/guided-invite.test.ts` (who gets the invitation)
- `lib/guided-coach.ts` + `lib/guided-coach.test.ts` (the coaching line state machine)
- `components/practice/GuidedInvitation.tsx` (the hub state)
- `components/rehearse/GuidedCoachLine.tsx` (the ticking wrapper around the state machine)

Modify:
- `backend/app/models/actor.py` (column)
- `backend/scripts/seed_sample_script.py` (seed "Late")
- `backend/app/api/scripts.py`, `backend/app/api/community.py`, `backend/app/api/scenes.py` (exclusions + route)
- `backend/app/services/events.py`, `lib/events.ts` (event names)
- `app/(platform)/practice/page.tsx` (render the invitation)
- `app/(platform)/scenes/[id]/rehearse/page.tsx` (guided mode)
- `app/globals.css` (`.t-invite*`, `.t-coach`)

---

### Task 1: The `is_guided` column, on the model and on Supabase

**Files:**
- Modify: `backend/app/models/actor.py` (after the `shared_with_community` column, around line 505)

- [ ] **Step 1: Add the column to the model**

In `backend/app/models/actor.py`, directly after the `shared_with_community = Column(...)` block inside `class UserScript`, add:

```python
    # The guided first scene (docs/superpowers/specs/2026-09-26-guided-first-scene-design.md).
    # A sample no shelf lists: the hub starts it at an actor who has never
    # rehearsed. Every listing that shows samples filters this out.
    is_guided = Column(
        Boolean, default=False, nullable=False, server_default=sql_text("false")
    )
```

- [ ] **Step 2: Apply the column to the prod database before anything is pushed**

Run from the repo root:

```bash
cd backend && .venv/bin/python - <<'EOF'
import os, psycopg2
from dotenv import load_dotenv
load_dotenv("/Users/canberkvarli/Development/actorrise/backend/.env")
c = psycopg2.connect(os.environ["DATABASE_URL"]); cur = c.cursor()
cur.execute("ALTER TABLE user_scripts ADD COLUMN IF NOT EXISTS is_guided BOOLEAN NOT NULL DEFAULT false")
c.commit()
cur.execute("select column_name, data_type, column_default from information_schema.columns where table_name='user_scripts' and column_name='is_guided'")
print(cur.fetchone())
EOF
```

Expected: `('is_guided', 'boolean', 'false')`

- [ ] **Step 3: Confirm the model still loads and the existing suite is green**

Run: `cd backend && .venv/bin/python -m pytest tests/test_whats_next.py -q`
Expected: all pass (the fixture creates `user_scripts` with the new column on SQLite).

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/actor.py
git commit -m "A sample script can be guided, which means no shelf lists it

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Seed "Late"

**Files:**
- Modify: `backend/scripts/seed_sample_script.py`
- Test: `backend/tests/test_guided_scene.py` (created here, extended in Task 4)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_guided_scene.py`:

```python
"""The guided first scene.

Spec: docs/superpowers/specs/2026-09-26-guided-first-scene-design.md. The hub
starts this scene at an actor who has never rehearsed. It is a real sample
script that no shelf lists, started by an endpoint that charges no meter.
"""
import unittest

from app.models.actor import (
    Play,
    RehearsalLineDelivery,
    RehearsalSession,
    Scene,
    SceneLine,
    UserScript,
)
from app.models.billing import UsageMetrics
from app.models.organization import Organization
from app.models.user import User
from scripts.seed_sample_script import seed_late
from tests.dbfixture import memory_db, restore

_TABLES = (
    Organization, User, Play, UserScript, Scene, SceneLine,
    RehearsalSession, RehearsalLineDelivery, UsageMetrics,
)


class Fixture(unittest.TestCase):
    def setUp(self):
        self.db, self._saved = memory_db(_TABLES)
        self.user = User(email="actor@example.com", hashed_password="x")
        self.db.add(self.user)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        restore(self._saved)


class TheSeed(Fixture):
    def test_it_seeds_a_guided_sample_with_six_lines(self):
        seed_late(self.db)
        self.db.commit()
        script = self.db.query(UserScript).filter(UserScript.title == "Late").one()
        self.assertTrue(script.is_sample)
        self.assertTrue(script.is_guided)
        self.assertIsNone(script.user_id)
        scene = self.db.query(Scene).filter(Scene.user_script_id == script.id).one()
        lines = sorted(scene.lines, key=lambda l: l.line_order)
        self.assertEqual(len(lines), 6)
        self.assertEqual((lines[0].character_name, lines[0].text), ("RILEY", "You're late."))
        self.assertEqual([l.character_name for l in lines], ["RILEY", "ALEX"] * 3)

    def test_it_is_idempotent(self):
        seed_late(self.db)
        seed_late(self.db)
        self.db.commit()
        self.assertEqual(self.db.query(UserScript).filter(UserScript.title == "Late").count(), 1)
        self.assertEqual(self.db.query(SceneLine).count(), 6)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_guided_scene.py -q`
Expected: FAIL with `ImportError: cannot import name 'seed_late'`

- [ ] **Step 3: Add the seed**

In `backend/scripts/seed_sample_script.py`:

Update the module docstring's `Demos:` list with a third entry:

```
  - "Late"         — the guided first scene; is_guided, so no shelf lists it (1 scene)
```

Add this function after `seed_hamlet` (before `def seed_sample_scripts`):

```python
def seed_late(db):
    """The guided first scene. Six lines, the actor is ALEX, the partner reads RILEY.

    Marked is_guided so the shelf, the community list and the "demo speaks
    first" rung never show it; the hub starts it directly.
    """
    if db.query(UserScript).filter(
        UserScript.is_sample == True, UserScript.title == "Late"
    ).first():
        print('Demo "Late" already exists. Skipping.')
        return

    play = Play(
        title="Late",
        author="Sample Script",
        genre="drama",
        category="contemporary",
        copyright_status="public_domain",
    )
    db.add(play)
    db.flush()

    script = UserScript(
        user_id=None,
        is_sample=True,
        is_guided=True,
        title="Late",
        author="Sample Script",
        description="A first scene. Riley waited; Alex has something to say.",
        original_filename="late.txt",
        file_type="txt",
        file_size_bytes=0,
        raw_text=LATE_TEXT,
        characters=[
            {"name": "RILEY", "gender": "neutral"},
            {"name": "ALEX", "gender": "neutral"},
        ],
        processing_status="completed",
        ai_extraction_completed=True,
        genre="drama",
        num_characters=2,
        num_scenes_extracted=1,
    )
    db.add(script)
    db.flush()

    scene = Scene(
        play_id=play.id,
        user_script_id=script.id,
        title="Late",
        scene_number="1",
        description="Riley waited an hour. Alex finally shows up.",
        character_1_name="RILEY",
        character_2_name="ALEX",
        character_1_gender="neutral",
        character_2_gender="neutral",
        line_count=6,
        estimated_duration_seconds=45,
        difficulty_level="beginner",
        primary_emotions=["tension", "relief"],
        relationship_dynamic="friends",
        tone="dramatic",
    )
    db.add(scene)
    db.flush()

    _add_lines(db, scene, [
        ("RILEY", "You're late.", None),
        ("ALEX", "I know. I'm sorry.", None),
        ("RILEY", "I waited an hour. I almost left.", None),
        ("ALEX", "But you didn't.", None),
        ("RILEY", "No. I didn't. Don't make me regret it.", None),
        ("ALEX", "I won't. Sit down. I'll tell you everything.", None),
    ])

    print(f"Demo \"Late\" seeded (script_id={script.id}, scene_id={scene.id}).")
```

In `seed_sample_scripts()`, add `seed_late(db)` after `seed_hamlet(db)`.

Add the text constant after `BREAKUP_TEXT`:

```python
LATE_TEXT = """LATE
A first scene. Author: Sample Script.

RILEY
You're late.

ALEX
I know. I'm sorry.

RILEY
I waited an hour. I almost left.

ALEX
But you didn't.

RILEY
No. I didn't. Don't make me regret it.

ALEX
I won't. Sit down. I'll tell you everything.
"""
```

- [ ] **Step 4: Run the test**

Run: `cd backend && .venv/bin/python -m pytest tests/test_guided_scene.py -q`
Expected: 2 passed. If `scripts` is not importable as a package, add an empty `backend/scripts/__init__.py` (check first; `ls backend/scripts/__init__.py`).

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/seed_sample_script.py backend/tests/test_guided_scene.py backend/scripts/__init__.py
git commit -m "Seed Late, the six-line scene the hub will start at a first-time actor

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

(Drop `backend/scripts/__init__.py` from the `git add` if it already existed or was not needed.)

---

### Task 3: No shelf lists a guided script

**Files:**
- Modify: `backend/app/api/scripts.py:1257-1262`
- Modify: `backend/app/api/community.py:186-191`
- Modify: `backend/app/api/scenes.py:558-563`
- Test: `backend/tests/test_guided_scene.py`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_guided_scene.py` (add `from app.api.scenes import whats_next` to the imports):

```python
class NoShelfListsIt(Fixture):
    def setUp(self):
        super().setUp()
        seed_late(self.db)
        self.db.commit()

    def test_the_demo_rung_never_picks_it(self):
        # whats_next's last rung is "the sample play speaks first". With only
        # the guided sample seeded there must be nothing to say.
        self.assertIsNone(whats_next(self.db, self.user.id))

    def test_the_shelf_query_excludes_it(self):
        from app.api.scripts import shelf_scripts_query
        rows = shelf_scripts_query(self.db, self.user.id).all()
        self.assertEqual([s.title for s in rows], [])

    def test_the_community_query_excludes_it(self):
        from app.api.community import community_scripts_query
        rows = community_scripts_query(self.db).all()
        self.assertEqual(rows, [])
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_guided_scene.py -q`
Expected: 3 new failures (`whats_next` returns the demo rung; the two query helpers do not exist).

- [ ] **Step 3: The demo rung**

In `backend/app/api/scenes.py`, the query at the "Nothing of their own" comment becomes:

```python
    demo_scene = (
        db.query(Scene)
        .join(UserScript, Scene.user_script_id == UserScript.id)
        .filter(UserScript.is_sample.is_(True), UserScript.is_guided.is_(False))
        .order_by(UserScript.id, Scene.id)
        .first()
    )
```

- [ ] **Step 4: The shelf list**

In `backend/app/api/scripts.py`, add a module-level helper directly above the endpoint that contains the `"""Get all scripts uploaded by the current user, plus sample scripts"""` docstring:

```python
def shelf_scripts_query(db: Session, user_id: int):
    """Everything the actor's shelf shows: their own scripts and the samples.

    The guided first scene is a sample too, but it is started by the hub, not
    picked off a shelf, so it never appears here.
    """
    from sqlalchemy import or_
    return db.query(UserScript).filter(
        or_(
            UserScript.user_id == user_id,
            UserScript.is_sample == True,
        ),
        UserScript.is_guided.is_(False),
    ).order_by(UserScript.is_sample.desc(), *_SHELF_ORDER)
```

Then in that endpoint replace the inline query so the body reads:

```python
    _fail_abandoned_extractions(db, current_user.id)
    scripts = shelf_scripts_query(db, current_user.id).all()
```

(`Session` is already imported in the file; if it is not, add `from sqlalchemy.orm import Session`.)

- [ ] **Step 5: The community list**

In `backend/app/api/community.py`, add a helper above the endpoint whose docstring mentions "demo scripts (labeled), so the shelf is never empty":

```python
def community_scripts_query(db: Session):
    """Shared scripts plus the demos, real shares first, newest within each.

    The guided first scene is a demo that belongs to the hub, not the
    community shelf, so it is filtered here as it is on the actor's own shelf.
    """
    return (
        db.query(UserScript, User, ActorProfile)
        .outerjoin(User, UserScript.user_id == User.id)
        .outerjoin(ActorProfile, ActorProfile.user_id == User.id)
        .filter(
            or_(
                UserScript.shared_with_community.is_(True),
                UserScript.is_sample.is_(True),
            ),
            UserScript.is_guided.is_(False),
        )
        .order_by(
            UserScript.is_sample.asc(),
            func.coalesce(UserScript.updated_at, UserScript.created_at).desc(),
        )
    )
```

And in the endpoint replace the `rows = (db.query(UserScript, User, ActorProfile) ... .limit(limit).all())` expression with:

```python
    rows = community_scripts_query(db).limit(limit).all()
```

The test's `_TABLES` needs `ActorProfile` for this query to run on SQLite: add `from app.models.actor import ActorProfile` (check where `ActorProfile` lives with `grep -rn "class ActorProfile" backend/app/models`) and include it in `_TABLES`.

- [ ] **Step 6: Run the tests**

Run: `cd backend && .venv/bin/python -m pytest tests/test_guided_scene.py tests/test_whats_next.py -q`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/scripts.py backend/app/api/community.py backend/app/api/scenes.py backend/tests/test_guided_scene.py
git commit -m "The guided scene is off every shelf

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `POST /api/scenes/rehearse/start-guided`

**Files:**
- Create: `backend/app/services/guided_scene.py`
- Modify: `backend/app/api/scenes.py` (new route after `start_rehearsal`)
- Test: `backend/tests/test_guided_scene.py`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_guided_scene.py`:

```python
from fastapi import HTTPException


class StartingIt(Fixture):
    def setUp(self):
        super().setUp()
        seed_late(self.db)
        self.db.commit()

    def _start(self):
        from app.services.guided_scene import start_guided_session
        return start_guided_session(self.db, self.user, user_agent=None)

    def test_it_creates_a_real_session_cast_as_alex(self):
        session, first_line = self._start()
        self.assertEqual(session.user_character, "ALEX")
        self.assertEqual(session.user_characters, ["ALEX"])
        self.assertEqual(session.ai_character, "RILEY")
        self.assertEqual(session.status, "in_progress")
        self.assertEqual(session.current_line_index, 0)
        self.assertIsNone(session.max_lines)
        self.assertEqual(first_line, "I know. I'm sorry.")
        self.assertEqual(self.db.query(RehearsalSession).count(), 1)

    def test_it_charges_no_meter(self):
        self._start()
        self.assertEqual(self.db.query(UsageMetrics).count(), 0)

    def test_it_marks_the_first_rehearsal_as_seen(self):
        self.assertFalse(self.user.has_seen_first_rehearsal)
        self._start()
        self.db.refresh(self.user)
        self.assertTrue(self.user.has_seen_first_rehearsal)

    def test_a_second_run_is_allowed_and_still_free(self):
        self._start()
        self._start()
        self.assertEqual(self.db.query(RehearsalSession).count(), 2)
        self.assertEqual(self.db.query(UsageMetrics).count(), 0)

    def test_it_records_the_device(self):
        from app.services.guided_scene import start_guided_session
        ua = ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 "
              "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1")
        session, _ = start_guided_session(self.db, self.user, user_agent=ua)
        self.assertEqual(session.client_platform, "ios")


class WithNothingSeeded(Fixture):
    def test_it_is_a_404(self):
        from app.services.guided_scene import start_guided_session
        with self.assertRaises(HTTPException) as ctx:
            start_guided_session(self.db, self.user, user_agent=None)
        self.assertEqual(ctx.exception.status_code, 404)
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_guided_scene.py -q`
Expected: 6 new failures, `ModuleNotFoundError: app.services.guided_scene`.

- [ ] **Step 3: The service**

Create `backend/app/services/guided_scene.py`:

```python
"""The guided first scene: one real rehearsal session, no meter, no tier check.

The hub starts this at an actor who has never rehearsed. It is the same
RehearsalSession the rest of the engine uses, so deliver, abandon, telemetry
and the win screen all work unchanged. What it skips is require_scene_partner
(the 3-a-month meter and the free-tier "sample only" rule): a six-line scene is
not worth metering, and a run that failed on the mic must be retryable.

Spec: docs/superpowers/specs/2026-09-26-guided-first-scene-design.md
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.actor import RehearsalSession, Scene, UserScript
from app.models.user import User
from app.services.rehearsal_client import client_browser, client_platform

# Must agree with the seed (scripts/seed_sample_script.py::seed_late) and with
# lib/guided-scene.ts, which prints the opening line before a session exists.
GUIDED_ACTOR = "ALEX"


def guided_scene(db: Session) -> Optional[Scene]:
    """The one scene of the one is_guided script, or None if nothing is seeded."""
    return (
        db.query(Scene)
        .join(UserScript, Scene.user_script_id == UserScript.id)
        .filter(UserScript.is_guided.is_(True))
        .order_by(Scene.id)
        .first()
    )


def start_guided_session(
    db: Session, user: User, user_agent: Optional[str]
) -> Tuple[RehearsalSession, Optional[str]]:
    """Create the session and return it with the actor's first line.

    Also flips users.has_seen_first_rehearsal, which is what stops the hub
    inviting again: has_ever_rehearsed is computed from the meter this
    endpoint deliberately does not touch.
    """
    scene = guided_scene(db)
    if scene is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The guided scene is not seeded",
        )

    lines = sorted(scene.lines, key=lambda l: l.line_order)
    cue_names = [l.character_name for l in lines]
    if GUIDED_ACTOR not in cue_names:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"The guided scene has no lines for {GUIDED_ACTOR}",
        )
    partner = next(name for name in cue_names if name != GUIDED_ACTOR)

    session = RehearsalSession(
        user_id=user.id,
        scene_id=scene.id,
        user_character=GUIDED_ACTOR,
        user_characters=[GUIDED_ACTOR],
        ai_character=partner,
        status="in_progress",
        current_line_index=0,
        max_lines=None,
        started_at=datetime.now(timezone.utc),
        client_platform=client_platform(user_agent),
        client_browser=client_browser(user_agent),
    )
    db.add(session)
    user.has_seen_first_rehearsal = True
    db.commit()
    db.refresh(session)

    first_line = next((l.text for l in lines if l.character_name == GUIDED_ACTOR), None)
    return session, first_line
```

- [ ] **Step 4: The route**

In `backend/app/api/scenes.py`, directly after the `start_rehearsal` function (before `def _duration_seconds`), add:

```python
@router.post("/rehearse/start-guided", response_model=RehearsalSessionResponse)
async def start_guided_rehearsal(
    http_request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _burst: bool = Depends(BurstLimiter("scene_partner")),
):
    """Start the guided first scene. No meter, no tier check; see services/guided_scene."""
    from app.services.guided_scene import start_guided_session

    session, first_line = start_guided_session(
        db, current_user, http_request.headers.get("user-agent")
    )
    return RehearsalSessionResponse(**{**session.__dict__, "first_line_for_user": first_line})
```

- [ ] **Step 5: Run the tests**

Run: `cd backend && .venv/bin/python -m pytest tests/test_guided_scene.py -q`
Expected: all pass. If `UsageMetrics` refuses to create on SQLite, replace the two `UsageMetrics` assertions with an assertion that the route has no feature gate:

```python
        from app.api.scenes import router
        route = next(r for r in router.routes if r.path.endswith("/rehearse/start-guided"))
        names = [type(d.call).__name__ for d in route.dependant.dependencies]
        self.assertNotIn("FeatureGate", names)
```

and drop `UsageMetrics` from `_TABLES`.

- [ ] **Step 6: Run the whole backend suite**

Run: `cd backend && .venv/bin/python -m pytest tests/ -q`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/guided_scene.py backend/app/api/scenes.py backend/tests/test_guided_scene.py
git commit -m "A meter-free start for the guided scene

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Event names

**Files:**
- Modify: `backend/app/services/events.py` (CLIENT_EVENT_NAMES)
- Modify: `lib/events.ts` (UserEventName)

- [ ] **Step 1: Backend allowlist**

In `backend/app/services/events.py`, after the `"scene_line_delivered"` entry inside `CLIENT_EVENT_NAMES`, add:

```python
        # The guided first scene (2026-09-26). 513 people a month opened
        # /practice and about 25 opened a scene. These three say whether the
        # invitation is taken and whether the run survives its first line;
        # scene_line_delivered carries guided=true on those runs.
        "guided_scene_shown",  # {}
        "guided_scene_started",  # {platform}
        "guided_scene_finished",  # {lines_heard, tap_mode, take_ms_total}
```

- [ ] **Step 2: Frontend union**

In `lib/events.ts`, extend the union:

```ts
  | "scene_line_delivered"
  | "guided_scene_shown"
  | "guided_scene_started"
  | "guided_scene_finished";
```

- [ ] **Step 3: Verify**

Run: `cd backend && .venv/bin/python -m pytest tests/ -q -k event` and `npx tsc --noEmit -p . 2>&1 | tail -3`
Expected: pass; 0 type errors.

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/events.py lib/events.ts
git commit -m "Three events for the guided scene

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Who gets the invitation

**Files:**
- Create: `lib/guided-scene.ts`
- Create: `lib/guided-invite.ts`
- Test: `lib/guided-invite.test.ts`

- [ ] **Step 1: The constants**

Create `lib/guided-scene.ts`:

```ts
/**
 * The guided first scene, as the hub prints it before a session exists.
 * Must agree with backend/scripts/seed_sample_script.py::seed_late and
 * backend/app/services/guided_scene.py.
 */
export const GUIDED_PARTNER = "RILEY";
export const GUIDED_ACTOR = "ALEX";
export const GUIDED_OPENING_LINE = "You're late.";
export const GUIDED_LINE_COUNT = 6;
```

- [ ] **Step 2: Write the failing test**

Create `lib/guided-invite.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { shouldInvite } from "./guided-invite";

const fresh = { has_ever_rehearsed: false, has_seen_first_rehearsal: false };

describe("shouldInvite", () => {
  it("invites a signed-in actor who has never rehearsed and owns nothing", () => {
    expect(shouldInvite(fresh, 0, false)).toBe(true);
  });

  it("never invites the demo account", () => {
    expect(shouldInvite(fresh, 0, true)).toBe(false);
  });

  it("stops once they have rehearsed anything", () => {
    expect(shouldInvite({ ...fresh, has_ever_rehearsed: true }, 0, false)).toBe(false);
  });

  it("stops once the guided scene has been started, even if never finished", () => {
    // has_ever_rehearsed comes from the meter the guided endpoint skips, so
    // this flag is the only thing that remembers a started guided run.
    expect(shouldInvite({ ...fresh, has_seen_first_rehearsal: true }, 0, false)).toBe(false);
  });

  it("does not invite someone who brought their own script", () => {
    expect(shouldInvite(fresh, 1, false)).toBe(false);
  });

  it("does not guess when the user is unknown or the flags are missing", () => {
    expect(shouldInvite(null, 0, false)).toBe(false);
    expect(shouldInvite(undefined, 0, false)).toBe(false);
    expect(shouldInvite({}, 0, false)).toBe(false);
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run lib/guided-invite.test.ts`
Expected: FAIL, cannot find module `./guided-invite`.

- [ ] **Step 4: The rule**

Create `lib/guided-invite.ts`:

```ts
/**
 * Whether /practice opens on the guided first scene instead of the shelf.
 *
 * A rule, not a redirect: the hub renders a different page for this actor and
 * never yanks anyone anywhere (the old first-run gate did, and it cost a real
 * actor a hijacked session on 2026-09-23).
 *
 * has_ever_rehearsed is computed from the ScenePartner meter, which the guided
 * endpoint does not charge, so has_seen_first_rehearsal (set by that endpoint)
 * is what remembers a guided run that was started but not finished.
 */
export interface InviteUser {
  has_ever_rehearsed?: boolean;
  has_seen_first_rehearsal?: boolean;
}

export function shouldInvite(
  user: InviteUser | null | undefined,
  ownScriptCount: number,
  isDemoUser: boolean,
): boolean {
  if (!user || isDemoUser) return false;
  // A stale cached user missing the field is unknown, not "never rehearsed".
  if (user.has_ever_rehearsed !== false) return false;
  if (user.has_seen_first_rehearsal === true) return false;
  return ownScriptCount === 0;
}
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run lib/guided-invite.test.ts`
Expected: 6 passed.

- [ ] **Step 6: Commit**

```bash
git add lib/guided-scene.ts lib/guided-invite.ts lib/guided-invite.test.ts
git commit -m "Who the hub invites into the guided scene

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: The coaching line state machine

**Files:**
- Create: `lib/guided-coach.ts`
- Test: `lib/guided-coach.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/guided-coach.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { COACH_TEXT, NUDGE_AFTER_MS, coachState, type CoachInput } from "./guided-coach";

const base: CoachInput = {
  partnerSpeaking: false,
  micOpen: false,
  linesHeard: 0,
  msSinceMicOpened: 0,
  voicedThisTake: false,
  tapMode: false,
};

describe("coachState", () => {
  it("says listen while the partner opens the scene", () => {
    expect(coachState("quiet", { ...base, partnerSpeaking: true })).toBe("listen");
  });

  it("says your line when the mic opens for the first line", () => {
    expect(coachState("listen", { ...base, micOpen: true })).toBe("your_line");
  });

  it("says that's it exactly once, while the partner answers the first line", () => {
    expect(coachState("your_line", { ...base, partnerSpeaking: true, linesHeard: 1 })).toBe("heard_first");
    expect(coachState("heard_first", { ...base, partnerSpeaking: true, linesHeard: 2 })).toBe("quiet");
  });

  it("goes quiet on the second and later lines", () => {
    expect(coachState("heard_first", { ...base, micOpen: true, linesHeard: 1 })).toBe("quiet");
    expect(coachState("quiet", { ...base, micOpen: true, linesHeard: 2 })).toBe("quiet");
  });

  it("nudges after six quiet seconds with the mic open", () => {
    expect(coachState("your_line", { ...base, micOpen: true, msSinceMicOpened: NUDGE_AFTER_MS })).toBe("nudge");
    expect(coachState("quiet", { ...base, micOpen: true, linesHeard: 2, msSinceMicOpened: NUDGE_AFTER_MS + 1 })).toBe("nudge");
  });

  it("does not nudge someone who is speaking", () => {
    expect(coachState("your_line", { ...base, micOpen: true, msSinceMicOpened: NUDGE_AFTER_MS, voicedThisTake: true })).toBe("your_line");
  });

  it("never nudges while partner audio plays", () => {
    expect(coachState("your_line", { ...base, partnerSpeaking: true, msSinceMicOpened: NUDGE_AFTER_MS * 2 })).toBe("listen");
  });

  it("tap mode overrides everything", () => {
    expect(coachState("listen", { ...base, partnerSpeaking: true, tapMode: true })).toBe("tap_mode");
    expect(coachState("nudge", { ...base, micOpen: true, msSinceMicOpened: NUDGE_AFTER_MS, tapMode: true })).toBe("tap_mode");
  });

  it("holds the previous state between beats", () => {
    // Neither speaking nor listening: the transcript is being processed.
    expect(coachState("your_line", base)).toBe("your_line");
  });

  it("has a line of house text for every state, and none for quiet", () => {
    expect(COACH_TEXT.quiet).toBe("");
    for (const state of ["listen", "your_line", "heard_first", "nudge", "tap_mode"] as const) {
      expect(COACH_TEXT[state].length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run lib/guided-coach.test.ts`
Expected: FAIL, cannot find module `./guided-coach`.

- [ ] **Step 3: The machine**

Create `lib/guided-coach.ts`:

```ts
/**
 * The one line of house text above the script in the guided first scene.
 *
 * It changes three times and then goes quiet: "Listen." while the partner
 * opens, "Your line." when the mic opens, "That's it. Keep going." while the
 * partner answers the first line, and nothing after that. Two exceptions
 * outrank the sequence: a nudge after six quiet seconds with the mic open,
 * and tap mode when the mic is blocked or recognition threw.
 *
 * Pure. The rehearse page feeds it what it already knows; the tests hold the
 * rules. Spec: docs/superpowers/specs/2026-09-26-guided-first-scene-design.md
 */
export type CoachState = "listen" | "your_line" | "heard_first" | "quiet" | "nudge" | "tap_mode";

export interface CoachInput {
  /** Partner audio is loading or playing. */
  partnerSpeaking: boolean;
  /** The mic is open on the actor's line. */
  micOpen: boolean;
  /** Actor lines delivered so far in this run. */
  linesHeard: number;
  /** How long the mic has been open on this take. */
  msSinceMicOpened: number;
  /** The level gate has heard voice on this take. */
  voicedThisTake: boolean;
  /** Mic blocked or speech recognition broken: the actor taps each line. */
  tapMode: boolean;
}

export const NUDGE_AFTER_MS = 6000;

export const COACH_TEXT: Record<CoachState, string> = {
  listen: "Listen.",
  your_line: "Your line.",
  heard_first: "That's it. Keep going.",
  quiet: "",
  nudge: "Say it again, or tap it.",
  tap_mode: "Tap each line when you've said it.",
};

export function coachState(prev: CoachState, input: CoachInput): CoachState {
  if (input.tapMode) return "tap_mode";
  if (input.partnerSpeaking) {
    if (input.linesHeard === 0) return "listen";
    if (input.linesHeard === 1) return "heard_first";
    return "quiet";
  }
  if (input.micOpen) {
    if (!input.voicedThisTake && input.msSinceMicOpened >= NUDGE_AFTER_MS) return "nudge";
    return input.linesHeard === 0 ? "your_line" : "quiet";
  }
  return prev;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run lib/guided-coach.test.ts`
Expected: 10 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/guided-coach.ts lib/guided-coach.test.ts
git commit -m "The coaching line: three beats, then quiet

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: The invitation on the hub

**Files:**
- Create: `components/practice/GuidedInvitation.tsx`
- Modify: `app/globals.css` (append `.t-invite*` rules near `.t-shelf-heading`)
- Modify: `app/(platform)/practice/page.tsx`

- [ ] **Step 1: The component**

Create `components/practice/GuidedInvitation.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { trackEvent } from "@/lib/events";
import {
  GUIDED_ACTOR,
  GUIDED_LINE_COUNT,
  GUIDED_OPENING_LINE,
  GUIDED_PARTNER,
} from "@/lib/guided-scene";
import { UploadScriptButton } from "@/components/practice/UploadScriptButton";

type StartedSession = { id: number; scene_id: number };

/**
 * The hub, for an actor who has never rehearsed.
 *
 * Not a description of ScenePartner: the partner's first line, already said
 * to you, and one control that answers it. The shelf, the walkthrough and the
 * tour are all absent on this state; see lib/guided-invite.ts for who gets it.
 */
export function GuidedInvitation() {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const [starting, setStarting] = useState(false);
  const [failed, setFailed] = useState(false);
  const shownRef = useRef(false);

  useEffect(() => {
    if (shownRef.current) return;
    shownRef.current = true;
    trackEvent("guided_scene_shown");
  }, []);

  const answer = async () => {
    if (starting) return;
    setStarting(true);
    setFailed(false);
    try {
      const { data } = await api.post<StartedSession>("/api/scenes/rehearse/start-guided", {});
      try {
        sessionStorage.setItem(`actorrise_session_${data.id}`, JSON.stringify(data));
      } catch {}
      trackEvent("guided_scene_started", {
        platform: /iPhone|iPad/.test(navigator.userAgent) ? "ios" : /Android/.test(navigator.userAgent) ? "android" : "desktop",
      });
      // The endpoint flipped has_seen_first_rehearsal; pull it so the hub does
      // not invite again if they come straight back.
      void refreshUser();
      router.push(`/scenes/${data.scene_id}/rehearse?session=${data.id}&guided=1`);
    } catch {
      setFailed(true);
      setStarting(false);
    }
  };

  return (
    <section className="t-invite" aria-labelledby="guided-opening-line">
      <p className="t-invite__cue">{GUIDED_PARTNER}</p>
      <h1 id="guided-opening-line" className="t-invite__line">
        {GUIDED_OPENING_LINE}
      </h1>
      <p className="t-invite__house">
        I&apos;ll read {titleCase(GUIDED_PARTNER)}. You&apos;re {titleCase(GUIDED_ACTOR)}. {GUIDED_LINE_COUNT} lines,
        under a minute.
      </p>
      <button type="button" className="t-invite__answer" onClick={answer} disabled={starting}>
        {starting ? "One moment" : "Answer"}
      </button>
      {failed && (
        <p className="t-invite__house" role="alert">
          That didn&apos;t start. Try once more.
        </p>
      )}
      <div className="t-invite__alt">
        <UploadScriptButton variant="compact" className="t-how-link">
          Bring in a script instead
        </UploadScriptButton>
      </div>
    </section>
  );
}

function titleCase(name: string): string {
  return name.charAt(0) + name.slice(1).toLowerCase();
}
```

- [ ] **Step 2: The styles**

In `app/globals.css`, directly after the `.t-shelf-heading { ... }` rule, add:

```css
/* --- The guided first scene's invitation -----------------------------------
   The partner's first line, said at you. A cue in the direction face, the line
   in the display serif, one control. Tokens flip it with the theme. */
.t-invite {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  max-width: 42rem;
  padding: clamp(24px, 8vh, 72px) 0 0;
}
.t-invite__cue {
  margin: 0;
  font-family: var(--t-direction);
  font-size: 14px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--t-muted-dark);
}
.t-invite__line {
  margin: 0;
  font-family: var(--t-display);
  font-weight: 400;
  font-size: clamp(44px, 9vw, 92px);
  line-height: 0.98;
  letter-spacing: -0.02em;
  color: var(--t-text);
}
.t-invite__house {
  margin: 14px 0 0;
  font-family: var(--t-body);
  font-size: 16px;
  line-height: 1.5;
  color: var(--t-muted-dark);
}
.t-invite__answer {
  position: relative;
  display: inline-flex;
  align-items: center;
  margin-top: 22px;
  height: 60px;
  padding: 0 34px;
  border-radius: 999px;
  border: 1.5px solid var(--t-cta-bd);
  background: var(--t-cta-bg);
  color: var(--t-cta-fg);
  font-family: var(--t-body);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.01em;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  box-shadow: 0 20px 60px -15px oklch(0.7 0.18 48 / 0.7);
  transition: transform 0.3s var(--t-spring), box-shadow 0.3s;
}
.t-invite__answer:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 26px 70px -15px oklch(0.7 0.18 48 / 0.8);
}
.t-invite__answer:disabled {
  opacity: 0.7;
  cursor: default;
}
.t-invite__alt {
  margin-top: 18px;
}
```

- [ ] **Step 3: Wire the hub**

In `app/(platform)/practice/page.tsx`:

Add imports:

```tsx
import { GuidedInvitation } from "@/components/practice/GuidedInvitation";
import { shouldInvite } from "@/lib/guided-invite";
```

Change the auth line to:

```tsx
  const { user, loading: authLoading, isDemoUser } = useAuth();
```

In the `useMemo` that returns `{ demoScript, featuredScriptId, safeScripts, hasOwnScript }`, also return `ownScriptCount: userScripts.length` and destructure it.

After the `useMemo`, add:

```tsx
  // The guided first scene replaces the library for an actor who has never
  // rehearsed. It is a different page, not a redirect: see lib/guided-invite.
  const invite = !!user && scriptsFetched && shouldInvite(user, ownScriptCount, isDemoUser);
```

Change the two derived flags so neither the playbill nor the tour can open on top of the invitation:

```tsx
  const walkthroughOpen =
    walkthroughOverride ?? (!!user && scriptsFetched && !hasOwnScript && unseen && !invite);
```

```tsx
  const tourOpen = showTour && !walkthroughOpen && scriptsFetched && !isLoading && !invite;
```

Replace the `<Suspense fallback={<LibrarySkeleton />}> ... </Suspense>` block with:

```tsx
          {invite ? (
            <GuidedInvitation />
          ) : (
            <Suspense fallback={<LibrarySkeleton />}>
              <PracticeLibrary
                scripts={safeScripts}
                featuredScriptId={featuredScriptId}
                demoScriptId={demoScript?.id ?? null}
                onOpenWalkthrough={() => setWalkthroughOverride(true)}
              />
            </Suspense>
          )}
```

- [ ] **Step 4: Type-check and look at it**

Run: `npx tsc --noEmit -p . 2>&1 | tail -3`
Expected: 0 errors.

The dev server on port 3000 is logged in as the demo user, which the rule excludes. To see the state, temporarily pass `false` for `isDemoUser` in the `shouldInvite` call, load `http://localhost:3000/practice`, confirm the cue, the line, the house text and the Answer button render in both themes, then put `isDemoUser` back. Do not commit the temporary change.

- [ ] **Step 5: Commit**

```bash
git add components/practice/GuidedInvitation.tsx app/globals.css "app/(platform)/practice/page.tsx"
git commit -m "The hub starts a scene at an actor who has never rehearsed

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Guided mode on the rehearse page

**Files:**
- Create: `components/rehearse/GuidedCoachLine.tsx`
- Modify: `app/(platform)/scenes/[id]/rehearse/page.tsx`
- Modify: `app/globals.css` (`.t-coach`)

- [ ] **Step 1: The coach line component**

Create `components/rehearse/GuidedCoachLine.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

import { COACH_TEXT, coachState, type CoachState } from "@/lib/guided-coach";

interface Props {
  partnerSpeaking: boolean;
  micOpen: boolean;
  linesHeard: number;
  /** The level gate's answer for the current take; read on every tick. */
  voicedThisTake: () => boolean;
  tapMode: boolean;
  /** Reported on every change so the page can make the line tappable on a nudge. */
  onState?: (state: CoachState) => void;
}

/**
 * Feeds lib/guided-coach what the rehearse page knows, on a half-second tick
 * while the mic is open (the nudge is a function of time, and the page has no
 * event for "six seconds passed").
 */
export function GuidedCoachLine({ partnerSpeaking, micOpen, linesHeard, voicedThisTake, tapMode, onState }: Props) {
  const [state, setState] = useState<CoachState>("listen");
  const stateRef = useRef<CoachState>("listen");
  const micOpenedAtRef = useRef<number | null>(null);
  const onStateRef = useRef(onState);
  onStateRef.current = onState;

  useEffect(() => {
    micOpenedAtRef.current = micOpen ? Date.now() : null;
  }, [micOpen]);

  useEffect(() => {
    const step = () => {
      const openedAt = micOpenedAtRef.current;
      const next = coachState(stateRef.current, {
        partnerSpeaking,
        micOpen,
        linesHeard,
        msSinceMicOpened: openedAt == null ? 0 : Date.now() - openedAt,
        voicedThisTake: voicedThisTake(),
        tapMode,
      });
      if (next !== stateRef.current) {
        stateRef.current = next;
        setState(next);
        onStateRef.current?.(next);
      }
    };
    step();
    if (!micOpen) return;
    const id = setInterval(step, 500);
    return () => clearInterval(id);
  }, [partnerSpeaking, micOpen, linesHeard, tapMode, voicedThisTake]);

  const text = COACH_TEXT[state];
  return (
    <p className="t-coach" aria-live="polite" data-state={state}>
      {text || " "}
    </p>
  );
}
```

- [ ] **Step 2: Its style**

In `app/globals.css`, after the `.t-invite__alt` rule from Task 8, add:

```css
/* The guided scene's one line of house text, above the script. Reserved
   height so the parchment does not jump when it goes quiet. */
.t-coach {
  min-height: 1.6em;
  margin: 0 0 12px;
  text-align: center;
  font-family: var(--t-direction);
  font-style: italic;
  font-size: 15px;
  letter-spacing: 0.04em;
  color: var(--t-muted-dark);
  transition: color 0.25s;
}
.t-coach[data-state="nudge"],
.t-coach[data-state="tap_mode"] {
  color: var(--t-orange);
}
```

- [ ] **Step 3: Read the flag**

In `app/(platform)/scenes/[id]/rehearse/page.tsx`, after `const firstRun = searchParams.get('firstRun') === '1';` add:

```tsx
  // Guided first scene: casting pre-decided, no countdown, a coaching line,
  // and a win screen that offers their own sides. Started by the hub through
  // /rehearse/start-guided. Spec: docs/superpowers/specs/2026-09-26-guided-first-scene-design.md
  const guided = searchParams.get('guided') === '1';
```

Add imports near the other component imports:

```tsx
import { GuidedCoachLine } from '@/components/rehearse/GuidedCoachLine';
import type { CoachState } from '@/lib/guided-coach';
```

- [ ] **Step 4: No countdown, no silent skip, in guided mode**

Replace the `rehearsalSettings` initialiser:

```tsx
  const [rehearsalSettings] = useState<RehearsalSettings>(() => {
    const saved = typeof window !== 'undefined'
      ? getRehearsalSettings()
      : { pauseBetweenLinesSeconds: 0.3, skipMyLineIfSilent: false, skipAfterSeconds: 10, countdownSeconds: 3, useAIVoice: true, highlightMyLines: true, autoAdvanceOnFinish: true };
    // The guided scene runs on the coaching line, not a countdown, and never
    // skips a line the actor has not said.
    return guided ? { ...saved, countdownSeconds: 0, skipMyLineIfSilent: false, highlightMyLines: true } : saved;
  });
```

- [ ] **Step 5: The Begin gate copy**

In the Begin gate block (the `<AnimatePresence>` whose comment starts "Begin gate — the user gesture iOS needs"), replace the `{sceneWithLines && (<div className="max-w-md"> ... </div>)}` block with:

```tsx
            {sceneWithLines && (
              <div className="max-w-md">
                {guided ? (
                  <>
                    <p className={cn("text-xs uppercase tracking-widest", STAGE_INK_FAINT)}>Your first scene</p>
                    <h2 className={cn("mt-2 text-2xl font-semibold", STAGE_INK)}>
                      I&apos;ll read {session ? titleCaseName(session.ai_character) : 'the other part'}.
                    </h2>
                    <p className={cn("mt-1 text-sm", STAGE_INK_SOFT)}>
                      When the dot turns green, say your line.
                    </p>
                  </>
                ) : (
                  <>
                    <p className={cn("text-xs uppercase tracking-widest", STAGE_INK_FAINT)}>Ready to rehearse</p>
                    <h2 className={cn("mt-2 text-2xl font-semibold", STAGE_INK)}>{sceneWithLines.title}</h2>
                    {session && (
                      <p className={cn("mt-1 text-sm", STAGE_INK_SOFT)}>
                        You&apos;re playing <span className={cn("font-medium", STAGE_INK)}>{sessionRoles(session).join(' + ')}</span>
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
```

And change the button label expression to:

```tsx
              {checkingMic ? 'Checking your mic…' : guided ? 'Begin' : 'Begin scene'}
```

Add a module-level helper next to `sessionRoles`:

```tsx
function titleCaseName(name: string): string {
  return name.charAt(0) + name.slice(1).toLowerCase();
}
```

- [ ] **Step 6: The coaching line and the nudge**

Add state near the other `useState` declarations (after `const [toast, setToast] = useState<string | null>(null);`):

```tsx
  const [coach, setCoach] = useState<CoachState>('listen');
```

Inside the script parchment, directly after the `{/* Script header */}` block's closing `</div>` and before `{/* Script lines */}`, add:

```tsx
              {guided && (
                <GuidedCoachLine
                  partnerSpeaking={isSpeakingAI || isLoadingAI || isSpeakingBrowser}
                  micOpen={isListening}
                  linesHeard={linesDelivered}
                  voicedThisTake={heardAnySpeech}
                  tapMode={isMicBlocked || speechIsBroken}
                  onState={setCoach}
                />
              )}
```

In the line's `onClick`, add a first branch so a nudged line delivers on tap:

```tsx
                      onClick={() => {
                        if (guided && isCurrentUserLine && coach === 'nudge') {
                          handleManualAdvance();
                          return;
                        }
                        if (!isCurrent) handleJumpToLine(lineIdx);
```

(`handleManualAdvance` is defined later in the file with `useCallback`; it is in scope at render time.)

- [ ] **Step 7: The cue accent**

In the character name row, change the name span:

```tsx
                        <span className={cn(
                          "text-base font-extrabold uppercase tracking-widest",
                          guided ? (isUser ? "text-[var(--t-orange)]" : "text-neutral-500") : "text-black",
                        )}>
                          {line.character_name}
                        </span>
```

- [ ] **Step 8: Restart routes to the guided endpoint**

In `handleRestart`, replace the `api.post<{ id: number } & Record<string, unknown>>('/api/scenes/rehearse/start', { ... })` call with:

```tsx
    const startRequest = guided
      ? api.post<{ id: number } & Record<string, unknown>>('/api/scenes/rehearse/start-guided', {})
      : api.post<{ id: number } & Record<string, unknown>>('/api/scenes/rehearse/start', {
          scene_id: session.scene_id,
          user_character: session.user_character,
        });
    startRequest.then(({ data }) => {
      try { sessionStorage.setItem(`actorrise_session_${data.id}`, JSON.stringify(data)); } catch {}
      const vp = lastKnownVoiceIdRef.current !== 'coral' ? `&voice=${lastKnownVoiceIdRef.current}` : '';
      const g = guided ? '&guided=1' : '';
      window.history.replaceState(null, '', `/scenes/${session.scene_id}/rehearse?session=${data.id}&script=${scriptId}${vp}${g}`);
      setSession(data as any);
    }).catch(() => {
      setError('Failed to create new session. Please try again.');
    });
```

Add `guided` to that `useCallback`'s dependency array.

- [ ] **Step 9: The guided flag on the per-line event**

In `handleDeliverLine`, in the `trackEvent('scene_line_delivered', { ... })` call, add the property:

```tsx
      guided: guided ? true : undefined,
```

- [ ] **Step 10: Type-check**

Run: `npx tsc --noEmit -p . 2>&1 | tail -3`
Expected: 0 errors.

- [ ] **Step 11: Commit**

```bash
git add components/rehearse/GuidedCoachLine.tsx app/globals.css "app/(platform)/scenes/[id]/rehearse/page.tsx"
git commit -m "Guided mode: a coaching line, the cue accent, a nudge, and a free restart

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: The win screen

**Files:**
- Modify: `app/(platform)/scenes/[id]/rehearse/page.tsx` (completion block)
- Modify: `docs/superpowers/specs/2026-09-26-guided-first-scene-design.md` (one line)

- [ ] **Step 1: Check the upload context is available on this page**

Run: `grep -n "UploadProvider" "app/(platform)/layout.tsx"`

If it prints a line, the provider wraps every platform route and nothing more is needed. If it prints nothing, wrap the guided win card (Step 2) in `<UploadProvider>` and add `import { UploadProvider } from '@/components/practice/UploadProvider';`.

- [ ] **Step 2: The guided variant**

Add the import:

```tsx
import { UploadScriptButton } from '@/components/practice/UploadScriptButton';
```

In the completion block, replace the `{completionOffer.visible ? ( <TrialOfferCard .../> ) : ( firstRun && ( ... ) )}` expression with:

```tsx
            {guided ? (
              // One next step, and it is theirs. The trial card yields here:
              // nobody has seen their own sides run yet.
              <div className="rounded-lg border border-primary/30 bg-primary/10 p-5 text-center space-y-3">
                <p className={cn("text-base font-semibold", STAGE_INK)}>That was your first scene.</p>
                <p className={cn("text-sm", STAGE_INK_SOFT)}>That was mine. Now yours.</p>
                <div className="flex justify-center">
                  <UploadScriptButton variant="primary">Bring in your sides</UploadScriptButton>
                </div>
                <p className={cn("text-xs", STAGE_INK_FAINT)}>A PDF or a text file. The scenes and characters pull themselves out.</p>
              </div>
            ) : completionOffer.visible ? (
              <TrialOfferCard
                headline={firstRun ? 'That was your first scene.' : 'Nice run.'}
                body="That was my script though, not yours. Upload your own sides and run them the same way, with the same partner."
                href={completionOffer.href}
                onAccept={completionOffer.accept}
                onDismiss={completionOffer.dismiss}
              />
            ) : (
              firstRun && (
                <div className="rounded-lg border border-primary/30 bg-primary/10 p-5 text-center space-y-3">
                  <p className={cn("text-base font-semibold", STAGE_INK)}>
                    That was your first scene.
                  </p>
                  <p className={cn("text-sm", STAGE_INK_SOFT)}>
                    Now bring in something that&apos;s actually yours and run it the
                    same way.
                  </p>
                  <Button
                    onClick={() => router.push('/practice')}
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    Bring in your own sides
                  </Button>
                </div>
              )
            )}
```

- [ ] **Step 3: The finished event**

Near the `completionOffer` declaration, add:

```tsx
  // Once per guided run, when the win screen shows.
  const guidedFinishedRef = useRef(false);
  useEffect(() => {
    if (!guided || !showFeedback || guidedFinishedRef.current) return;
    guidedFinishedRef.current = true;
    trackEvent('guided_scene_finished', {
      lines_heard: linesDelivered,
      tap_mode: isMicBlocked || speechIsBroken,
      take_ms_total: Date.now() - sessionStartTimeRef.current,
    });
  }, [guided, showFeedback, linesDelivered, isMicBlocked, speechIsBroken]);
```

(`speechIsBroken` is declared further down the file with `const`; if TypeScript reports it used before declaration, move this effect below the `const speechIsBroken = ...` line.)

- [ ] **Step 4: Amend the spec's one wrong word**

The client has no paste control (the paste endpoint exists on the backend, nothing calls it). In `docs/superpowers/specs/2026-09-26-guided-first-scene-design.md`, change "The upload control inline (paste or PDF)" to "The upload control inline (PDF or text file)".

- [ ] **Step 5: Type-check and the existing suites**

Run: `npx tsc --noEmit -p . 2>&1 | tail -3` and `npx vitest run 2>&1 | tail -4`
Expected: 0 errors; all vitest files pass.

- [ ] **Step 6: Commit**

```bash
git add "app/(platform)/scenes/[id]/rehearse/page.tsx" docs/superpowers/specs/2026-09-26-guided-first-scene-design.md
git commit -m "The win screen offers their own sides and nothing else

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Seed prod, run it, read the rows

**Files:** none new.

- [ ] **Step 1: Seed the guided script on prod**

Run: `cd backend && .venv/bin/python scripts/seed_sample_script.py`
Expected output includes `Demo "Late" seeded (script_id=..., scene_id=...)` and the two existing demos "already exists. Skipping."

- [ ] **Step 2: Confirm it is hidden**

```bash
cd backend && .venv/bin/python - <<'EOF'
import os, psycopg2
from dotenv import load_dotenv
load_dotenv("/Users/canberkvarli/Development/actorrise/backend/.env")
c = psycopg2.connect(os.environ["DATABASE_URL"]); cur = c.cursor()
cur.execute("select id, title, is_sample, is_guided from user_scripts where is_sample order by id")
for r in cur.fetchall(): print(r)
EOF
```

Expected: The Breakup and Hamlet with `is_guided=False`, Late with `is_guided=True`.

- [ ] **Step 3: Push**

```bash
git push origin main
```

Vercel builds the frontend; Render builds the backend (the column already exists, so no 500s).

- [ ] **Step 4: Run it on the laptop**

Once both deploys are live: on localhost with the dev server, temporarily bypass the demo exclusion as in Task 8 Step 4, load `/practice`, tap Answer, run the six lines with the speaker trick (macOS `say` for your own lines is not needed; speak them). Confirm: coaching text goes Listen → Your line → That's it. Keep going → quiet; the win screen shows the upload control; the trial card does not appear. Revert the bypass.

- [ ] **Step 5: Canberk runs it on his phone**

Ask him to open actorrise.com/practice on a fresh account or on an account that has never rehearsed, and run it once.

- [ ] **Step 6: Read the rows**

```bash
cd backend && .venv/bin/python - <<'EOF'
import os, psycopg2
from dotenv import load_dotenv
load_dotenv("/Users/canberkvarli/Development/actorrise/backend/.env")
c = psycopg2.connect(os.environ["DATABASE_URL"]); cur = c.cursor()
cur.execute("""select event_name, user_id, created_at, properties from user_events
 where event_name in ('guided_scene_shown','guided_scene_started','guided_scene_finished')
    or (event_name='scene_line_delivered' and properties->>'guided'='true')
 order by created_at desc limit 40""")
for r in cur.fetchall(): print(r)
EOF
```

Expected: shown → started → three `scene_line_delivered` rows with `guided: true` → finished, per run.

- [ ] **Step 7: Memory**

Update `/Users/canberkvarli/.claude/projects/-Users-canberkvarli-Development-actorrise/memory/` with a `guided-first-scene.md` project memory (what shipped, the commit, the three event names, the `is_guided` column, and that the hub condition is a rule in `lib/guided-invite.ts`), and add its line to `MEMORY.md` under "In-flight work".
