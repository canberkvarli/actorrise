# App Redesign: Two-Pillar Information Architecture

**Date:** 2026-05-21
**Status:** Design approved, ready for implementation planning
**Scope:** Authenticated web app only. Marketing routes and the separate iOS app are out of scope.

## Context

The current authenticated app has 15+ top-level routes (`dashboard`, `my-monologues`, `my-scripts`, `my-submissions`, `my-tapes`, `scenes`, `search`, etc.) plus a dashboard with widgets. The product currently has zero users, so we are free to redesign aggressively without migration concerns.

Actors come to ActorRise for two reasons:
1. **Practice scenes** with an AI scene partner reading other characters' lines (ScenePartner). This requires the user to upload a script.
2. **Find monologue material** for auditions.

The dashboard does not serve either goal directly. The "my-*" pages fragment the experience and add noise. This redesign spotlights ScenePartner, makes monologue search a clear secondary path, and removes everything else from the primary nav.

## Goals

- Spotlight ScenePartner as the primary verb of the app.
- Make monologue search reachable in one click but visually secondary.
- Cut the dashboard. Cut the "my-*" sprawl.
- Keep the avatar menu lean (5 items max).
- Be ruthless: zero users means no backwards compatibility, no migration shims.

Non-goals: redesigning the rehearsal view itself, redesigning the monologue detail page, touching marketing routes, anticipating the iOS app shape.

## Information Architecture

### Top nav (authenticated)

Two pillars. **Practice** is visually heavier (bolder, larger, or first position) to spotlight ScenePartner.

| Nav item | Route | Purpose |
|---|---|---|
| Practice | `/practice` | ScenePartner home: your scripts and scenes |
| Monologues | `/monologues` | Search, browse, and saved monologues |
| Avatar menu | (dropdown) | Profile, Settings, Billing, Sign out |

### Route changes

**Removed:**
- `/dashboard`
- `/my-tapes`
- `/my-submissions`
- `/my-scripts`
- `/my-monologues`
- `/search`
- `/scenes` (index only; `/scenes/[id]` is preserved or moved under `/practice/[id]`)

**Added:**
- `/practice` (adaptive landing)
- `/monologues` (search + browse + saved on one page)

**Untouched:**
- `/audition` (future home for monologue practice room)
- `/billing`, `/checkout`, `/profile`, `/settings`
- `/founding-actor` (marketing)
- `/submit-monologue` (kept; linked from inside `/monologues`)
- `/monologue/[id]` (detail page)
- `/scenes/[id]` and rehearsal sub-routes (kept; routing under `/practice` is an implementation detail)

**Redirects (for any external links and bookmarks):**
- `/dashboard` → `/practice`
- `/search` → `/monologues`
- `/my-scripts` → `/practice`
- `/my-monologues` → `/monologues`
- `/scenes` (index) → `/practice`

Authenticated `/` adaptively routes to `/practice`.

## Practice pillar (`/practice`)

The landing page is **adaptive** based on whether the user has uploaded any scripts.

### New user (no scripts)

- Hero: "Practice scenes with an AI scene partner" with a short subline.
- Two CTAs side by side:
  - Primary (brand orange `#CB4B00`): **Upload your first script**
  - Secondary: **Try the demo script →**
- Single line below the hero: "No scripts yet. Upload a PDF or Final Draft file, or play with the demo to see how it works."
- No widgets, no stats, no recent activity.

### Returning user (one or more scripts)

- **Profile completion card** (only if profile <100%): small dismissible inline card at the very top with a progress bar and "Complete your profile →" link to `/profile`. Replaces the dashboard's profile nudge in a less naggy form.
- **Continue practicing** row: 1 to 3 horizontal cards for most-recently-rehearsed scenes. Each card shows: scene title · script title · your character · Resume button. If only 1 scene, stretch full width. If no scenes have been rehearsed yet, skip this row.
- **Your scripts** section: vertical list, single column, matching the existing ScenePartner aesthetic. Demo script pinned at bottom with a subtle "Demo" tag.
- Top-right action: **+ Upload script** button.

### Script detail (`/practice/[scriptId]` or `/scenes/[id]`)

Existing layout preserved: script metadata card on top, extracted scenes list below. Single-column `max-w-3xl` per project memory.

### Rehearsal view

Untouched in this redesign.

## Monologues pillar (`/monologues`)

A single page handles search, browse, and saved monologues. No separate `/search` or `/my-monologues` routes.

### Header

- Page title small, top-left.
- Prominent search bar centered, near-full-width. Placeholder: "Search by character, play, mood, length…"
- Filter chips directly below search: **Type** (Comedic / Dramatic / Seriocomic), **Era** (Classical / Contemporary), **Length** (Under 1m / 1–2m / 2m+), **Gender** (Any / Female / Male / Non-binary), **Source** (Film/TV / Stage / Original).
- Small text link top-right: "Contribute a monologue →" (links to `/submit-monologue`).

### Body (no search query active)

Stacked rows, each a horizontal scroll with a "See all →" link:

1. **Recently saved** (only renders if user has saved any)
2. **Dramatic**
3. **Contemporary under 2 minutes**
4. **Classical**
5. **Recently added**

**Comedic** row is deferred until the `tone` field tagging pass lands (see Pre-implementation audits). Each card: title · author · length · Open. Sharp corners on non-clickable elements, plain text metadata with `·` separators.

### Body (search query active)

- Live-updating result grid (3-up desktop, 2-up tablet, 1-up mobile).
- Sort dropdown top-right: Relevance / Length / Recently added.
- Empty state: "No monologues match. Try widening filters, or contribute one."

### Saved monologues

Surfaced inline as the **Recently saved** row plus a "See all saved →" link that expands the full saved list on the same page. No dedicated route.

### Monologue detail (`/monologue/[id]`)

Untouched. Save/unsave toggle stays in the header. In a future iteration, a **Practice this monologue →** button enters the audition room (see below).

## Avatar menu

Five items only:

- Profile
- Settings
- Billing
- (divider)
- Sign out

## Future: Audition Room

The audition room is the future home for monologue-side practice: dramaturgy, character analysis, notes, recording (replacing the deleted `my-tapes`), AI tools. It lives at `/audition` (already scaffolded).

**Nav placement decision:** the audition room does NOT get its own top-level nav pillar. It is entered contextually from a monologue's detail page via a "Practice this monologue" button. This keeps the two-pillar nav clean. If the audition room grows substantial enough to warrant top-level placement later, revisit.

## Visual rules (per project memory)

- Brand orange: `#CB4B00`, hover `#B03000`.
- Sharp corners on non-clickable elements (tags, badges, status). Only buttons and clickable cards are rounded.
- Plain text with `·` separators preferred over icon-heavy stat rows.
- Card hover effect: `shadow-md` (not `shadow-lg`).
- Minimal cards: no redundant info, no decorative metadata icons.

## Rollout plan

Each step is independently shippable. Steps 1 to 3 are reversible; step 5 is the point of no return.

1. **New nav skeleton.** Update top nav to show only Practice / Monologues / avatar menu. Keep old routes live so nothing 404s.
2. **Build `/practice`** as a new route. Adaptive landing using existing scripts/scenes data. Old routes stay alive.
3. **Build `/monologues`** as a new route. Search + saved + curated rows using existing monologue data.
4. **Add redirects** for `/dashboard`, `/search`, `/my-scripts`, `/my-monologues`, `/scenes` (root only).
5. **Delete obsolete pages**: `dashboard/`, `my-tapes/`, `my-submissions/`, `my-monologues/`, `my-scripts/`, `search/`, `scenes/page.tsx`.
6. **Polish pass.** Apply visual rules consistently.

## Pre-implementation audits (resolved 2026-05-21)

### Dashboard load-bearing items

Only two pieces of dashboard functionality are load-bearing. Everything else (recommendation grids, quick-access widgets, recent searches) is duplicated elsewhere and safe to delete.

1. **Profile completion nudge** (currently a progress bar on `/dashboard`). New home: small inline card at the top of `/practice` when profile completion is below 100%, dismissible. Not a persistent global banner — too naggy for the minimal aesthetic.
2. **Post-signup redirect** currently lands on `/dashboard` from three places: `app/auth/callback/route.ts`, `app/(auth)/login/page.tsx`, `app/(auth)/signup/page.tsx`. Redirect everyone to `/practice`. The adaptive landing handles new vs returning.

The **WelcomeFlow modal** is already global in `app/(platform)/layout.tsx`, not on the dashboard page. No change needed.

### `/dashboard` link updates required

Eight files reference `/dashboard` and must be updated as part of step 4:
- `app/auth/callback/route.ts` (default redirect)
- `app/(auth)/login/page.tsx` (`redirectTo`)
- `app/(auth)/signup/page.tsx` (`redirectTo`)
- `app/(platform)/layout.tsx` (nav items at lines 144, 198, 210, 506, 671)
- `app/(platform)/not-found.tsx` (404 fallback link)
- `app/(platform)/founding-actor/page.tsx:25` (`router.replace`)
- `app/robots.ts` (sitemap reference, if present)
- Admin page (if it redirects here)

### Monologue curated rows readiness

The monologue schema supports 5 of 6 needed filters. The **Comedic** row is the only one blocked.

Ready to build now (fields populated reliably in sample data):
- **Dramatic** — filter on `tone IN ('dramatic', 'emotional', 'intense')`
- **Contemporary under 2 minutes** — `category='contemporary' AND estimated_duration_seconds <= 120`
- **Classical** — `category='classical'`
- **Recently added** — sort by `created_at DESC`
- **Recently saved** — user's saved monologues

Needs tagging pass:
- **Comedic** — the `tone` field exists but values are inconsistent (`"darkly comic"`, `"wry"`, `"sarcastic"`, etc.). Normalize to a canonical type set (Comedic / Dramatic / Seriocomic) via a `type_category` column populated by an AI classifier pass over ~500 monologues. Estimated 1 to 2 hours.

**Decision:** v1 ships **without** the Comedic row. Tagging pass is a separate follow-up task, not blocking this redesign. v1 curated rows (in order): Recently saved, Dramatic, Contemporary under 2 minutes, Classical, Recently added.

Relevant schema locations:
- `Monologue.tone` (`backend/app/models/actor.py:122`)
- `Monologue.estimated_duration_seconds` (`backend/app/models/actor.py:115`)
- `Monologue.character_gender` (`backend/app/models/actor.py:109`)
- `Monologue.created_at` (`backend/app/models/actor.py:144`)
- `Play.category` (`backend/app/models/actor.py:55`)
- `Play.source_type` (`backend/app/models/actor.py:58`)
- Search filter API: `backend/app/api/.../monologues.py:264-276`

## Out of scope

- iOS app shape (separate design at `docs/plans/2026-05-21-ios-app-design.md`).
- Rehearsal view redesign.
- Monologue detail page redesign.
- Audition room feature design (only its nav placement is decided here).
- Marketing/logged-out routes.
