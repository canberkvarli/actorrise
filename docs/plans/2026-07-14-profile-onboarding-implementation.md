# Profile-First Onboarding Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the empty 3-step onboarding with a 5-tap profile capture that writes real search-filter fields, then lands new actors on a personalized "monologues for you" screen with a Rehearse button — bridging the 90%-search → 5%-rehearse cliff. Also backfill the ~227 existing users via a soft, dismissible card.

**Architecture:** The 5 answers persist to existing `actor_profiles` columns (`gender`, `age_range`, `type`, `preferred_genres`, `experience_level`, `overdone_alert_sensitivity`, `profile_bias_enabled`) plus one NEW column `preferred_mediums`. A new `users.has_completed_profile_onboarding` flag distinguishes the new flow from the legacy `has_completed_onboarding`. The payoff screen calls the existing `GET /api/monologues/search` with profile-derived filters; each result links to the existing `/monologue/[id]/memorize` rehearsal flow. No new personalization engine — we populate levers search already reads.

**Tech Stack:** Next.js App Router + TS + react-query/SWR + `lib/api.ts`; FastAPI + SQLAlchemy (`Base.metadata.create_all`, hand-written ALTER scripts); Supabase Postgres + pgvector.

**Design doc:** `docs/plans/2026-07-14-profile-onboarding-personalization-design.md`

---

## Increment A — Backend data layer

### Task A1: Add columns to models

**Files:**
- Modify: `backend/app/models/actor.py` (ActorProfile, ~line 10-43)
- Modify: `backend/app/models/user.py` (~line 27-36)

**Step 1:** In `ActorProfile`, after `preferred_genres`, add:
```python
preferred_mediums = Column(JSON, default=list)  # ["theatre","film","tv"] -> Play.source_type
```
**Step 2:** In `User`, after `has_completed_onboarding`, add:
```python
has_completed_profile_onboarding = Column(Boolean, default=False, nullable=False, server_default=text("false"))
```
Ensure `from sqlalchemy import text` present.

**Step 3:** Commit.
```bash
git add backend/app/models/actor.py backend/app/models/user.py
git commit -m "feat(models): add preferred_mediums + has_completed_profile_onboarding"
```

### Task A2: Idempotent ALTER scripts (run against live DB)

**Files:**
- Create: `backend/scripts/add_preferred_mediums.py`
- Create: `backend/scripts/add_has_completed_profile_onboarding.py`

Follow the pattern in `backend/scripts/add_has_seen_first_rehearsal.py`:
```python
from app.core.database import SessionLocal
from sqlalchemy import text

def run():
    db = SessionLocal()
    try:
        db.execute(text("ALTER TABLE actor_profiles ADD COLUMN IF NOT EXISTS preferred_mediums JSONB DEFAULT '[]'::jsonb"))
        db.commit()
    finally:
        db.close()

if __name__ == "__main__":
    run()
```
Second script: `ALTER TABLE users ADD COLUMN IF NOT EXISTS has_completed_profile_onboarding BOOLEAN NOT NULL DEFAULT FALSE`.

**Step:** Commit. (Run against prod later, after review — NOT during build.)

### Task A3: Career-stage → overdone mapping (TDD, pure function)

**Files:**
- Create: `backend/app/services/onboarding_prefs.py`
- Test: `backend/tests/test_onboarding_prefs.py`

**Step 1 (failing test):**
```python
import unittest
from app.services.onboarding_prefs import overdone_sensitivity_for_stage

class TestOnboardingPrefs(unittest.TestCase):
    def test_beginner_tolerant(self):
        self.assertEqual(overdone_sensitivity_for_stage("just_starting"), 0.2)
    def test_auditioning_balanced(self):
        self.assertEqual(overdone_sensitivity_for_stage("auditioning"), 0.5)
    def test_pro_strict(self):
        self.assertEqual(overdone_sensitivity_for_stage("working_pro"), 0.8)
    def test_unknown_defaults_balanced(self):
        self.assertEqual(overdone_sensitivity_for_stage("???"), 0.5)
```
**Step 2:** Run `python -m unittest backend.tests.test_onboarding_prefs -v` → FAIL.
**Step 3 (impl):**
```python
_STAGE_SENSITIVITY = {"just_starting": 0.2, "auditioning": 0.5, "working_pro": 0.8}
def overdone_sensitivity_for_stage(stage: str) -> float:
    return _STAGE_SENSITIVITY.get(stage, 0.5)
```
**Step 4:** Run test → PASS. **Step 5:** Commit.

### Task A4: Extend profile write schema

**Files:**
- Modify: `backend/app/api/profile.py` (`ActorProfileCreate` ~line 16-31, and GET response serialization)

**Step:** Add `preferred_mediums: list[str] | None = None` to `ActorProfileCreate` (and any response model). The existing `setattr` loop persists it automatically. Include it in the `GET ""` response dict. Commit.

### Task A5: Accept new flag in onboarding PATCH

**Files:**
- Modify: `backend/app/api/auth.py` (`update_onboarding` ~line 242 + its Pydantic body model)

**Step:** Add `has_completed_profile_onboarding: bool | None = None` to the onboarding update schema and set it on the user when provided. Commit.

---

## Increment B — 5-tap wizard + payoff

### Task B1: Frontend types + option constants

**Files:**
- Modify: `types/actor.ts` (add `preferred_mediums?: string[]`)
- Modify: `lib/profileOptions.ts` (add `MEDIUMS = [{id:"theatre",label:"Theatre"},{id:"film",label:"Film"},{id:"tv",label:"TV"}]` and a `CAREER_STAGES = [{id:"just_starting",...},{id:"auditioning",...},{id:"working_pro",...}]`; reuse existing `GENDERS`, `AGE_RANGES`. Add a `WORK_ON` set for tone/era: dramatic/comedic/classical/contemporary.)
- Modify: frontend `User` type (wherever it's defined) to include `has_completed_profile_onboarding?: boolean`.

Commit.

### Task B2: Build the 5-step wizard

**Files:**
- Rewrite: `components/onboarding/OnboardingWizard.tsx` (keep the modal shell/animation; replace steps)

Steps (one question per screen, multi-select where noted; big tappable tiles, brand `#CB4B00`):
1. How you're cast — GENDERS (single)
2. Age range — AGE_RANGES (single)
3. What you want to work on — WORK_ON dramatic/comedic/classical/contemporary (multi)
4. Medium — MEDIUMS theatre/film/tv (multi)
5. Where you are — CAREER_STAGES (single)

On finish:
- `api.put("/api/profile", { gender, age_range, type: <derived>, preferred_genres: <derived from WORK_ON>, preferred_mediums, experience_level, profile_bias_enabled: true })`
- `api.patch("/api/auth/onboarding", { has_completed_onboarding: true, has_completed_profile_onboarding: true, has_seen_welcome: true })`
- `refreshUser()` then advance to payoff (Task B3) instead of `router.push`.

Keep skippable: a low-emphasis "skip" that just sets the flags without profile writes.
Verify: `npx tsc --noEmit` clean. Commit.

### Task B3: Payoff screen — "monologues for you"

**Files:**
- Create: `components/onboarding/OnboardingPayoff.tsx`
- (Wizard renders this as its final state.)

Behavior:
- Build filter params from answers → `api.get("/api/monologues/search?" + qs)` with `gender`, `age_range`, `source_type` (comma-joined mediums→play/film/tv; map "theatre"→"play"), `category` (if classical/contemporary chosen), `exclude_overdone=true`, `limit=3`.
- Header in plain language: e.g. "3 dramatic monologues for a woman, 25–35, actively auditioning."
- Each card: title/author + **Rehearse** button → `router.push(`/monologue/${id}/memorize`)`. Secondary link: "Browse more" → `/monologues`.
- Thin-results fallback: if <1 result, show closest (drop filters progressively) + a soft banner; never blank. Reuse existing soft-fail copy if present.

Add a pure helper `buildPayoffFilters(answers)` in `lib/onboardingFilters.ts` + a light unit test if a frontend test runner exists (there isn't one yet — otherwise typecheck only).
Verify typecheck. Commit.

### Task B4: Trigger wiring

**Files:**
- Modify: `app/(platform)/layout.tsx`

**Step:** Wizard shows for `user.has_completed_onboarding === false` (unchanged). Confirm the finish path sets both flags so the backfill card (Increment C) never fires for brand-new users. Commit.

---

## Increment C — Soft backfill for existing users

### Task C1: Backfill card

**Files:**
- Create: `components/onboarding/ProfileBackfillCard.tsx`

Show when `user.has_completed_onboarding === true && user.has_completed_profile_onboarding === false` AND not locally dismissed (`localStorage "arc.profileBackfillDismissed"`). Copy: "Make your results yours — 5 taps." Buttons: **Personalize** (opens the same 5-tap wizard in backfill mode → on finish sets `has_completed_profile_onboarding: true`) and **Not now** (sets localStorage dismiss). Sharp corners on the card per UI prefs; only buttons rounded.

### Task C2: Mount card

**Files:**
- Modify: `app/(platform)/layout.tsx` (render below/independent of the new-user wizard gate)

Verify typecheck. Commit.

---

## Ship

- Push `feat/profile-onboarding` → Vercel preview (staging).
- Run the two ALTER scripts against prod (Task A2) BEFORE the branch merges/deploys to prod.
- Watch: new-flow completion rate, searched→rehearsed %, 7-day active.
