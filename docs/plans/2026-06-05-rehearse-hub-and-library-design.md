# Rehearse Hub, Scene Library, Progress, Onboarding & PWA — Design

Date: 2026-06-05
Branch: `feat/rehearse-hub`

## Goal

Fix the cold-start problem and lift activation/retention with five connected features:

1. **Curated scene library** — hand-written public-domain 2-person scenes everyone can rehearse.
2. **`/rehearse` hub** — one place with tabs `Scenes | Monologues | Saved` to browse, bookmark, and start rehearsing.
3. **`/progress`** — rehearsal history, streaks, rating trend, areas to work on.
4. **Onboarding** — 3-step full-screen first-run wizard that ends inside a real rehearsal. Includes an optional "How did you hear about us?" free-text field.
5. **PWA / mobile-first** — installable app, offline shell, polished mobile rehearse screen.

## Decisions (from brainstorming)

- Scene source: **hand-curated seed set** (~15-20 scenes), reusing the demo-seed pattern. Expandable later.
- Hub: **new `/rehearse`** with `Scenes | Monologues | Saved` tabs. `/practice` and `/monologues` remain as deep entry points.
- Onboarding: **full-screen wizard**, shown once, skippable, with optional referral-source capture.

## Data model

### Curated scenes — new `is_library` flag
- Add `Scene.is_library` (Boolean, default `False`, indexed).
- Curated scene = `Scene` with `is_library=True`, `user_script_id=NULL`, `play_id` → a real public-domain `Play` (title + author carry the attribution).
- Keeps curated scenes out of `/practice` (which lists `UserScript`s) while making them rehearsable + favoritable via existing scene endpoints.

### User onboarding/attribution — new columns on `users`
- `has_completed_onboarding` (Boolean, default `False`).
- `referral_source` (String, nullable) — free text from "How did you hear about us?".

Both via one Alembic migration alongside the `scenes.is_library` change.

## Backend

### Migration
`backend/alembic/versions/*_rehearse_hub.py`: add `scenes.is_library`, `users.has_completed_onboarding`, `users.referral_source`.

### Seed
`backend/scripts/seed_library_scenes.py`: idempotent (keyed by Play title + scene title), seeds ~15-20 curated 2-person scenes across genre/era/difficulty (Shakespeare, Chekhov, Ibsen, Wilde, Glaspell, etc.), each with `SceneLine`s, emotion/tone/difficulty tags.

### API
- Extend `GET /scenes/` with `library: bool` + browse filters (genre, difficulty, emotion, q search); include play `title`/`author` in `SceneResponse`.
- `GET /scenes/rehearse/stats` — aggregates for `/progress`: total sessions, completed, current/longest streak (by day), avg rating, rating trend (last N), top `areas_to_improve`.
- `GET /me/saved` (or reuse existing favorites list endpoints) — bookmarked scenes + monologues for the Saved tab. Prefer reusing existing favorite list endpoints if present; otherwise add thin combined endpoint.
- `POST /me/onboarding` — set `has_completed_onboarding=True`, optionally persist `referral_source`.

## Frontend

### `/rehearse` hub (`app/(platform)/rehearse/page.tsx`)
- Tabs: `Scenes | Monologues | Saved` (URL-synced `?tab=`).
- **Scenes**: curated library browse (filters + search) and a "From your scripts" section (the user's uploaded-script scenes). Card → `/scenes/[id]/rehearse`. Bookmark toggle.
- **Monologues**: reuse the existing monologue browse/search component; bookmark + open.
- **Saved**: bookmarked scenes + monologues, each linking to its rehearse/detail view.
- Shared `useLibraryScenes`, `useSavedItems`, `useRehearseStats` hooks (React Query).

### `/progress` (`app/(platform)/progress/page.tsx`)
- Header stats (streak, sessions, avg rating), rating trend sparkline, recent sessions list (link to feedback), "Areas to work on" chips. Empty state → CTA into `/rehearse`.

### Onboarding (`components/onboarding/OnboardingWizard.tsx`)
- Full-screen, gated on `!has_completed_onboarding`, mounted in `(platform)/layout.tsx`.
- Step 1: welcome + goal (audition prep / class / fun) + optional "How did you hear about us?" free text.
- Step 2: pick a demo (a Hamlet scene or a monologue).
- Step 3: route straight into that rehearsal. "Skip" allowed on every step; completing or skipping calls `POST /me/onboarding`.

### PWA
- `app/manifest.ts` (name, icons, theme `#CB4B00`, standalone), maskable icons in `public/`.
- Service worker (app-shell + offline fallback) registered client-side; keep it minimal, no heavy deps.
- iOS meta tags; install affordance. Audit `/scenes/[id]/rehearse` for mobile (tap targets, layout, safe-area).

## Sequencing (phabricator-style, each independently shippable)

1. **Migration + library data** (model flag, migration, seed, scenes API browse) — foundation.
2. **`/rehearse` hub** (Scenes + Monologues + Saved tabs, hooks, nav link).
3. **`/progress`** (stats endpoint + page).
4. **Onboarding wizard** (columns done in phase 1 migration; wizard + endpoint + layout gate).
5. **PWA + mobile rehearse polish.**

## Testing
- Backend: pytest for migration smoke, `GET /scenes/?library=true` filtering, stats aggregation, onboarding endpoint.
- Frontend: typecheck + build; manual run of `/rehearse`, `/progress`, onboarding, install.
- Verify clean baseline before starting; verify build + key flows after each phase.

## Out of scope (YAGNI)
- Gutenberg extraction pipeline (future).
- Monologue rehearsal *engine* changes — Monologues tab reuses existing flows.
- Social sharing, coaching marketplace, accents/direction controls (separate features).
