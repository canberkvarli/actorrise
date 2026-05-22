# App Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Replace the dashboard-centric app shell with a two-pillar nav (Practice + Monologues) that spotlights ScenePartner and consolidates monologue search.

**Architecture:** Two new top-level routes (`/practice`, `/monologues`) absorb scattered functionality from `/dashboard`, `/my-scripts`, `/my-monologues`, `/search`, `/my-submissions`, `/my-tapes`. Top nav and avatar menu both get pruned. Each phase ships independently and is reversible until Phase 5 (deletions).

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind, shadcn/ui, lucide-react, Supabase auth, TanStack Query.

**Design doc:** `docs/plans/2026-05-21-app-redesign-design.md` (main branch).

**Repo facts that shape the plan:**
- Top nav is **inline JSX** inside `app/(platform)/layout.tsx` (not a separate component). The `navItems` array lives at lines 143-148.
- `/dashboard` is referenced in `layout.tsx` at lines 144, 198, 210, 506, 671 (5 spots).
- `/scenes/page.tsx` is already just a 20-line redirect to `/my-scripts`. The real scripts list lives at `/my-scripts/page.tsx`.
- `/search/page.tsx` is 2,541 lines and contains rich filter/result infrastructure we will partially reuse for `/monologues`.
- Reusable components: `SearchFiltersSheet`, `ActiveFilterChips`, `MonologueResultCard`, `Button`, `Card`, `Badge`, `WelcomeFlow`.
- No test suite is configured. Baseline verification = `npm run lint` + `npm run build` + manual smoke in dev.

---

## Phase 1 — Two-pillar nav skeleton

Goal: replace the 4-item nav with 2 spotlighted items. Avatar menu prunes to 5 items + admin (conditional). Old routes still work; this is additive at first.

### Task 1.1 — Update the `navItems` array

**Files:** Modify `app/(platform)/layout.tsx:143-148`

**Step 1:** Replace the existing 4-item `navItems` array with a 2-item version:

```tsx
const navItems = [
  { href: "/practice", label: "Practice", icon: IconMasksTheater },
  { href: "/monologues", label: "Monologues", icon: IconMicrophone },
];
```

(Pick lucide/tabler icons that match the codebase's existing icon set — confirm imports work.)

**Step 2:** Style Practice visually heavier than Monologues. Add a class or prop to make its label bolder / slightly larger. Inline conditional on `index === 0` is fine.

**Step 3:** Verify with `npm run lint`.

### Task 1.2 — Update logo link

**Files:** Modify `app/(platform)/layout.tsx:198`

The logo currently links to `/dashboard`. Change to `/practice`.

### Task 1.3 — Prune the avatar menu

**Files:** Modify `app/(platform)/layout.tsx:275-445`

Keep only:
- Profile (edit profile)
- Founding actor (conditional — only if `user.is_founding_actor`)
- Settings
- Billing
- Admin (conditional — only if `user.is_moderator`)
- Sign out

Remove from the dropdown:
- Saved monologues (moves into `/monologues` page)
- Your scripts (moves into `/practice` page)
- Submissions
- My tapes
- Help
- Changelog

(Help and Changelog can be relocated to `/settings` later, out of scope for this phase.)

### Task 1.4 — Update mobile menu to mirror desktop

**Files:** Modify `app/(platform)/layout.tsx:485-530`

Mobile hamburger menu maps over `navItems` separately. Since `navItems` already changed in Task 1.1, this should auto-update — but verify the rendering, plus update line 506 (`/dashboard` active state check) and line 671 (search bar hint that references `/dashboard`). Both should change to `/practice`.

### Task 1.5 — Smoke test and commit

**Step 1:** `npm run lint` — expect clean.
**Step 2:** `npm run build` — expect success.
**Step 3:** `npm run dev`, log in, verify the new nav renders, "Practice" links to `/practice` (404 expected for now), "Monologues" links to `/monologues` (404 expected). Old routes (`/dashboard`, `/my-scripts`, `/search`) still load directly.
**Step 4:** Commit.

```bash
git add app/\(platform\)/layout.tsx
git commit -m "feat(nav): replace dashboard nav with two-pillar Practice/Monologues shell"
```

---

## Phase 2 — Build `/practice` adaptive landing

Goal: working `/practice` route with new-user and returning-user views. Old `/my-scripts` and `/scenes` continue to function in parallel.

### Task 2.1 — Create the route file

**Files:** Create `app/(platform)/practice/page.tsx`

**Step 1:** Stub the page as a server component (or client, depending on the data-fetch pattern used in `/my-scripts`). Read `app/(platform)/my-scripts/page.tsx` first to mirror its auth + data-fetching approach.

**Step 2:** Branch on `userHasScripts`:
- `false` → render `<PracticeEmptyState />` (Task 2.2)
- `true` → render the returning-user view (Task 2.3)

### Task 2.2 — New-user empty state

**Files:** Create `components/practice/PracticeEmptyState.tsx`

Render:
- Hero copy: "Practice scenes with an AI scene partner"
- Subline: "Upload a script and rehearse with an AI partner reading every other role."
- Primary CTA button (brand orange `#CB4B00`): "Upload your first script" → opens existing upload flow (find the upload trigger used in `/my-scripts`)
- Secondary CTA: "Try the demo script →" → links to the existing demo script's `/scenes/[id]` route

Sharp corners on non-clickable elements, rounded corners only on buttons. `max-w-3xl` single-column layout per project memory.

### Task 2.3 — Returning-user view

**Files:** Create `components/practice/ContinuePracticingRow.tsx` and `components/practice/YourScriptsList.tsx`. Update `app/(platform)/practice/page.tsx` to compose them.

**ContinuePracticingRow:**
- Fetches the user's 1-3 most recently rehearsed scenes (whatever existing endpoint or query powers "recent activity" — check the dashboard's data fetching for the source).
- Renders horizontal scroll of cards: scene title · script title · your character · Resume button.
- If no scenes have been rehearsed yet, the component returns `null`.

**YourScriptsList:**
- Reuses the existing script list rendering from `/my-scripts/page.tsx`. Lift the list into this component if needed.
- Demo script pinned at the bottom with a small "Demo" tag (sharp-cornered text badge).
- Top-right "+ Upload script" button reuses the existing upload trigger.

### Task 2.4 — Profile completion card

**Files:** Create `components/practice/ProfileCompletionCard.tsx`

Replicate the dashboard's profile progress nudge as a small dismissible inline card at the top of `/practice` (above ContinuePracticingRow). Only renders if profile completion is below 100%. Local `dismissed` state via `localStorage` — non-blocking.

Source the dashboard's profile-completion logic from `app/(platform)/dashboard/page.tsx:368-400` (per the audit) and extract just the percentage + link to `/profile`.

### Task 2.5 — Smoke test and commit

**Step 1:** `npm run build` — expect success.
**Step 2:** `npm run dev`, hit `/practice` as: (a) brand-new user with no scripts → empty state, (b) user with scripts but no rehearsals → scripts list + no Continue row, (c) user with scripts + recent rehearsal → Continue row + scripts list.
**Step 3:** Commit.

```bash
git add app/\(platform\)/practice components/practice
git commit -m "feat(practice): adaptive landing page replacing dashboard for ScenePartner"
```

---

## Phase 3 — Build `/monologues` landing

Goal: single-page Monologues home with search header + curated rows + inline saved monologues. `/search` and `/my-monologues` still work in parallel.

### Task 3.1 — Create the route shell

**Files:** Create `app/(platform)/monologues/page.tsx`

**Step 1:** Mirror the auth and data-fetch approach used by `app/(platform)/search/page.tsx` (client component, TanStack Query for results).

**Step 2:** Layout skeleton:
```tsx
<PageShell>
  <MonologuesHeader />        {/* search bar + filter chips + contribute link */}
  {query || filtersActive
    ? <MonologuesResultsGrid />
    : <MonologuesBrowse />}    {/* curated rows */}
</PageShell>
```

### Task 3.2 — Header with search + filters

**Files:** Create `components/monologues/MonologuesHeader.tsx`

Reuse the existing `SearchFiltersSheet`, `ActiveFilterChips`, and `QuickFilterChips` from `components/search/`. Wire them to local state in MonologuesHeader.

Above the chips, a prominent search input (full-width-ish, centered) with placeholder "Search by character, play, mood, length…". On the right of the header strip, a small text link "Contribute a monologue →" → `/submit-monologue`.

### Task 3.3 — Curated rows (no query active)

**Files:** Create `components/monologues/MonologuesBrowse.tsx` and `components/monologues/CuratedRow.tsx`

CuratedRow is a generic component:
- Props: `title`, `monologues[]`, `seeAllHref`
- Renders title left, "See all →" link right, horizontal-scroll row of monologue cards below.
- Reuse `MonologueResultCard` for each card.

MonologuesBrowse fetches and renders these rows in order:
1. **Recently saved** — only renders if user has saved monologues. `useQuery` for saved list (~6 most recent). "See all saved" expands the full saved list inline (toggle state).
2. **Dramatic** — `tone IN ('dramatic', 'emotional', 'intense')` filter, ~6 picks.
3. **Contemporary under 2 minutes** — `category='contemporary' AND estimated_duration_seconds <= 120`.
4. **Classical** — `category='classical'`.
5. **Recently added** — sort by `created_at DESC`.

Each row uses the existing search/list API with appropriate filter params. The Comedic row is intentionally absent in v1 (see design doc, deferred to tone-tagging pass).

### Task 3.4 — Results grid (query active)

**Files:** Create `components/monologues/MonologuesResultsGrid.tsx`

Effectively a slimmed-down version of `/search/page.tsx`'s results section. Reuse `MonologueResultCard`. Sort dropdown top-right (Relevance / Length / Recently added). Empty state: "No monologues match. Try widening filters, or contribute one."

### Task 3.5 — Smoke test and commit

**Step 1:** `npm run build` — expect success.
**Step 2:** `npm run dev`, hit `/monologues`:
- No saved monologues → "Recently saved" row hidden, 4 curated rows visible.
- With saved monologues → "Recently saved" appears first.
- Type into search → curated rows replaced by results grid live.
- Apply filters → results update.
- Empty result → empty state copy.
**Step 3:** Commit.

```bash
git add app/\(platform\)/monologues components/monologues
git commit -m "feat(monologues): landing page with curated rows + inline saved + search"
```

---

## Phase 4 — Redirects + dashboard link updates

Goal: every internal reference to old routes points at the new ones. External bookmarks redirect cleanly.

### Task 4.1 — Add server-side redirects

**Files:** Modify `next.config.ts` (or `next.config.mjs` — confirm which extension is used)

Add to the `redirects()` async function:

```ts
async redirects() {
  return [
    { source: "/dashboard", destination: "/practice", permanent: true },
    { source: "/search", destination: "/monologues", permanent: true },
    { source: "/my-scripts", destination: "/practice", permanent: true },
    { source: "/my-monologues", destination: "/monologues", permanent: true },
    { source: "/scenes", destination: "/practice", permanent: true },
  ];
},
```

Note: `/scenes/[id]` is NOT redirected — it's the live script detail page.

### Task 4.2 — Update auth callbacks

**Files:**
- `app/auth/callback/route.ts:9` — change default redirect from `/dashboard` to `/practice`
- `app/(auth)/login/page.tsx:37` — change `redirectTo="/dashboard"` to `redirectTo="/practice"`
- `app/(auth)/signup/page.tsx:37` — change `redirectTo="/dashboard"` to `redirectTo="/practice"`

### Task 4.3 — Update remaining stragglers

**Files:**
- `app/(platform)/not-found.tsx:16` — change `/dashboard` to `/practice`
- `app/(platform)/founding-actor/page.tsx:25` — change `router.replace("/dashboard")` to `router.replace("/practice")`
- `app/robots.ts` — search for `/dashboard`, remove or replace if present

Search the repo one more time before committing: `grep -rn "/dashboard" app/ components/ lib/ --include="*.tsx" --include="*.ts"` and resolve any remaining hits.

### Task 4.4 — Smoke test and commit

**Step 1:** `npm run build`.
**Step 2:** `npm run dev`. Visit `/dashboard` → expect 308 redirect to `/practice`. Same for `/search`, `/my-scripts`, `/my-monologues`, `/scenes`. Visit `/scenes/[some-id]` → expect it to still load.
**Step 3:** Log out and log back in → expect to land on `/practice`.
**Step 4:** Commit.

```bash
git add next.config.* app/auth app/\(auth\) app/\(platform\)/not-found.tsx app/\(platform\)/founding-actor app/robots.ts
git commit -m "feat(routes): redirect old routes and update auth landings to /practice"
```

---

## Phase 5 — Delete obsolete pages

Goal: remove dead code. **Point of no return** — once committed, the deleted pages would need to be restored from git history to revive.

### Task 5.1 — Delete page folders

**Files to delete:**
- `app/(platform)/dashboard/` (entire folder)
- `app/(platform)/my-tapes/`
- `app/(platform)/my-submissions/`
- `app/(platform)/my-monologues/`
- `app/(platform)/my-scripts/`
- `app/(platform)/search/`
- `app/(platform)/scenes/page.tsx` (only the index file — keep the `[id]/` subfolder)

```bash
rm -rf "app/(platform)/dashboard" \
       "app/(platform)/my-tapes" \
       "app/(platform)/my-submissions" \
       "app/(platform)/my-monologues" \
       "app/(platform)/my-scripts" \
       "app/(platform)/search"
rm "app/(platform)/scenes/page.tsx"
```

### Task 5.2 — Hunt for broken imports

After deletion, run `npm run build`. Any imports that pulled from deleted folders will fail. Most likely candidates: components inside deleted folders that other pages still reference. Move shared components into `components/` proper, leave deleted folders truly empty.

Also re-grep for the deleted route paths in case any code still links to them: `grep -rn "/my-scripts\|/my-monologues\|/my-tapes\|/my-submissions\|/dashboard\|app/(platform)/search" app/ components/ lib/`.

### Task 5.3 — Smoke test and commit

**Step 1:** `npm run build` — must pass.
**Step 2:** `npm run dev`. Click around every nav item, avatar menu item, and footer link. Hit every redirect from Phase 4. Verify no 500s.
**Step 3:** Commit.

```bash
git add -A
git commit -m "chore: remove dashboard, my-* pages, and /search now that /practice and /monologues replace them"
```

---

## Phase 6 — Polish pass

Goal: bring everything in line with the project's UI memory rules.

### Task 6.1 — Apply visual rules

Walk every new component and confirm:
- Brand orange `#CB4B00` for primary actions; `#B03000` on hover.
- Sharp corners on non-clickable elements (tags, badges, "Demo" indicator). Rounded corners only on buttons and clickable cards.
- Plain text with `·` separators in card metadata (no decorative icons).
- Card hover: `shadow-md` (not `shadow-lg`).
- `max-w-3xl` single-column layouts where applicable.
- No redundant info on cards (e.g., don't list characters twice).

### Task 6.2 — Responsive check

Test mobile widths (375px, 414px). The horizontal-scroll curated rows must scroll smoothly. The Practice landing's vertical script list must stack cleanly. The Monologues search header must not crowd on small screens.

### Task 6.3 — Commit

```bash
git add -A
git commit -m "polish: apply brand color, sharp corners, and spacing rules across new shell"
```

---

## Out of scope (deliberately deferred)

- **Tone tagging pass** to enable the Comedic row in `/monologues`. Separate task; the design doc has the spec.
- **Audition room** scaffold (`/audition`). Already exists; no changes here.
- **Rehearsal view** redesign. Untouched.
- **Monologue detail page** redesign. Untouched.
- **Marketing routes**. Untouched.
- **iOS app**. Separate plan at `docs/plans/2026-05-21-ios-app-design.md`.

---

## Verification checklist before merge

- [ ] `npm run lint` clean
- [ ] `npm run build` succeeds
- [ ] `npm run dev` — nav renders, both pillars work, avatar menu lean
- [ ] All five redirects function (308 to new routes)
- [ ] New user (no scripts) sees Practice empty state with demo CTA
- [ ] Returning user sees Continue row + scripts list
- [ ] `/monologues` shows curated rows when no query, results grid when query active
- [ ] Profile completion card appears for incomplete profiles, dismissible
- [ ] Mobile widths render without horizontal overflow
- [ ] No references to deleted routes remain (`grep` clean)
