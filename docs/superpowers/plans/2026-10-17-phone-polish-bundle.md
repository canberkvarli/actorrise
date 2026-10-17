# Phone Polish Bundle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nine small phone fixes from the spec `docs/superpowers/specs/2026-10-17-phone-polish-bundle-design.md`, each its own commit on `main`.

**Architecture:** Phone-only changes live in `@media (max-width: 767.98px)` blocks in `app/globals.css` (unlayered rules beat Tailwind utilities, see memory `unlayered-css-beats-tailwind-utilities`) or behind `useIsPhone()`. Pure logic goes in `lib/*.ts` with vitest tests; the one server change gets a pure helper with a pytest.

**Tech Stack:** Next.js app router, Tailwind v4, framer-motion, Radix dialog, vitest (`npm test`), FastAPI + pytest (`cd backend && .venv/bin/python -m pytest`).

Conventions: no PRs, commit straight to main (memory `no-prs-solo-dev`). Every commit ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Brand colour is never a hex in a component (memory `brand-orange-is-theme-dependent`).

---

### Task 1: Tab bar pill clearance

**Files:**
- Modify: `app/globals.css` (`.t-tabbar` ≈ line 6264, `.t-tabbar__tab` ≈ line 6294)

- [ ] **Step 1: Change the bar padding and the tab size**

In `.t-tabbar` replace
```css
  padding: 6px 8px calc(6px + env(safe-area-inset-bottom, 0px));
```
with
```css
  padding: 10px 10px calc(8px + env(safe-area-inset-bottom, 0px));
```
In `.t-tabbar__tab` replace `min-height: 48px;` with `min-height: 44px;` and `border-radius: 14px;` with `border-radius: 12px;`.

- [ ] **Step 2: Check at phone width**

Run `npm run dev`, open http://localhost:3000/monologues logged in, emulate 390px. The lit pill has 10px of bar above it and no longer touches the border.

- [ ] **Step 3: Commit**
```bash
git add app/globals.css
git commit -m "Tab bar: the active pill clears the bar's top edge"
```

---

### Task 2: Find for me as the first chip in the row

**Files:**
- Modify: `components/search/QuickFilterChips.tsx` (props ≈ line 50, scroll container ≈ line 74)
- Modify: `app/(platform)/monologues/page.tsx` (phone branch ≈ lines 2109–2124)

- [ ] **Step 1: Add a `leading` slot to QuickFilterChips**

In `QuickFilterChipsProps` add:
```ts
  /** Rendered as the first item INSIDE the scroll row (phones put Find for me here). */
  leading?: React.ReactNode;
```
Destructure `leading` in the component signature. In the scroll container (the div with `overflow-x-auto`) render `{leading}` as the first child, before the existing `groups.map(...)`. Add an edge fade to that div's `style`:
```tsx
style={{
  maskImage: "linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent)",
  WebkitMaskImage: "linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent)",
}}
```
and change `pr-6 sm:pr-0` to `px-4 sm:px-0` so the first and last chips are not hidden under the fade.

- [ ] **Step 2: Move the phone button into the slot**

In `app/(platform)/monologues/page.tsx` the phone wrapper is:
```tsx
<div className={isPhone ? "mt-4 flex items-center gap-2" : "mt-5"}>
  {isPhone && (<button id="search-find-for-me" ...>Find for me</button>)}
  <div className="min-w-0 flex-1">
    <QuickFilterChips ... />
  </div>
</div>
```
Change it to:
```tsx
<div className={isPhone ? "mt-4" : "mt-5"}>
  <QuickFilterChips
    leading={isPhone ? (
      <button
        id="search-find-for-me"
        type="button"
        onClick={handleFindForMe}
        disabled={isLoading}
        className="t-find-for-me flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 text-[12px] font-semibold disabled:opacity-50"
        style={{ borderWidth: 1.5 }}
      >
        <IconSparkles className="size-[14px]" />
        Find for me
      </button>
    ) : undefined}
    ...existing props unchanged...
  />
</div>
```
Delete the old `{isPhone && (<button .../>)}` block and the `min-w-0 flex-1` wrapper.

- [ ] **Step 3: Check at 390px**

Scroll the chip row. Find for me scrolls with the row, nothing is cut, both edges fade.

- [ ] **Step 4: Commit**
```bash
git add components/search/QuickFilterChips.tsx "app/(platform)/monologues/page.tsx"
git commit -m "Search: Find for me scrolls with the chips on phones instead of sitting on them"
```

---

### Task 3: Shelf rows stacked on phones

**Files:**
- Modify: `components/monologue/ShelfCard.tsx`
- Modify: `app/globals.css` (`.t-shelf-row*` ≈ line 3450 onward; reduced-motion block ≈ line 3678)

- [ ] **Step 1: Render the source as text inside the meta**

`sourceTagOf(m)` already returns the label (`classical | contemporary | film | tv`). Replace `ShelfCard.tsx` body with:
```tsx
"use client";

import Link from "next/link";
import type { Monologue } from "@/types/actor";
import { MonologueSourceTag, sourceTagOf } from "@/components/search/SourceTag";

export function ShelfCard({ m, rank }: { m: Monologue; rank?: number }) {
  const mins = Math.round((m.estimated_duration_seconds || 0) / 60);
  const meta = [m.character_age_range, m.tone, mins ? `${mins} min` : null].filter(Boolean);
  const kind = sourceTagOf(m);

  /* A play whose title is the character's name ("Hamlet", "Antigone") printed
     both lines identically, which reads as a rendering fault, not two facts. */
  const showPlay =
    m.play_title?.trim().toLowerCase() !== m.character_name?.trim().toLowerCase();

  return (
    <Link prefetch={false} href={`/monologue/${m.id}`} className="t-shelf-row group">
      {typeof rank === "number" && (
        <span aria-hidden className="t-shelf-row__rank">
          {rank}
        </span>
      )}

      <span className="t-shelf-row__main min-w-0 flex-1">
        <span className="t-shelf-row__name">{m.character_name}</span>
        <span className="t-shelf-row__sub">
          {showPlay && <span className="truncate">{m.play_title}</span>}
          {/* The pill on desktop; on phones it is hidden and the source
              rides the meta line as plain text (.t-shelf-row__src). */}
          <MonologueSourceTag monologue={m} />
        </span>
      </span>

      <span className="t-shelf-row__meta">
        {kind && <span className="t-shelf-row__src">{kind} · </span>}
        {meta.join(" · ")}
      </span>
    </Link>
  );
}

export default ShelfCard;
```

- [ ] **Step 2: Phone CSS**

After the `.t-shelf-row__meta` rule in `app/globals.css` add:
```css
/* Phones: the row stacks. Two columns forced play titles into "#V…" because
   the source pill ate the left column. Name, title on its own line, then one
   meta line with the source as text instead of a pill. */
.t-shelf-row__src { display: none; }
@media (max-width: 767.98px) {
  .t-shelf-row {
    flex-wrap: wrap;
    gap: 2px 10px;
    padding: 12px 14px;
  }
  .t-shelf-row:hover { transform: none; }
  .t-shelf-row__name { font-size: 15px; }
  .t-shelf-row__sub .t-src { display: none; }
  .t-shelf-row__sub > .truncate { display: block; min-width: 0; }
  .t-shelf-row__meta {
    flex-basis: 100%;
    text-align: left;
    white-space: normal;
    font-weight: 500;
  }
  .t-shelf-row__rank ~ .t-shelf-row__meta { padding-left: 28px; }
  .t-shelf-row__src { display: inline; }
}
```

- [ ] **Step 3: Check at 390px**

/monologues "Picked for your type" and "Trending this week": full play titles, one meta line reading like `contemporary · 20s · contemplative · 2 min`, no pills. Desktop unchanged (pill still there, no `src` text).

- [ ] **Step 4: Commit**
```bash
git add components/monologue/ShelfCard.tsx app/globals.css
git commit -m "Shelf rows stack on phones: full play titles, source as text on the meta line"
```

---

### Task 4: "Or start somewhere" doors at half height, rose gone

**Files:**
- Modify: `components/monologue/StartingPoints.tsx`
- Modify: `app/globals.css` (`.t-door` ≈ line 3423)

- [ ] **Step 1: Swap the glyph and move sizes into classes**

In `StartingPoints.tsx`: import `TicketSketch` instead of `RoseSketch`; Love's door becomes `{ Sketch: TicketSketch, label: "Love", query: "monologue about love", rot: "-1deg" }`. Change the grid div to `className="t-doors mt-4"` with no inline `style`. Change each `Link` to `className="t-door group flex flex-col gap-2"` (drop `p-4`). Give the label span `className="t-door__label font-bold"` (drop `text-base`) and the query span `className="t-door__query"` (keep its inline font style).

- [ ] **Step 2: CSS**

Next to `.t-door` in `app/globals.css` add / change:
```css
.t-doors {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}
.t-door { padding: 16px; }          /* add to the existing .t-door rule */
.t-door__label { font-size: 16px; }
@media (max-width: 767.98px) {
  .t-doors { grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .t-door {
    padding: 10px 12px;
    border-radius: 14px;
    box-shadow: 3px 3px 0 var(--t-hard-shadow);
  }
  .t-door__glyph { width: 20px; height: 20px; }
  .t-door__label { font-size: 14px; }
  .t-door__query { display: none; }
}
```

- [ ] **Step 3: Check at 390px**

Three doors per row, two rows, no query lines, Love shows a ticket. Desktop identical to before except the ticket.

- [ ] **Step 4: Commit**
```bash
git add components/monologue/StartingPoints.tsx app/globals.css
git commit -m "Start somewhere: half-height doors on phones, the rose becomes a ticket"
```

---

### Task 5: Auditions intro as a capped modal, with a "How it works" toggle

**Files:**
- Modify: `components/auditions/intro/intro.module.css` (`.root`/`.panel` ≈ lines 68–130)
- Modify: `lib/auditionIntro.ts`, `lib/auditionIntro.test.ts`
- Create: `components/auditions/HowItWorks.tsx`
- Modify: `components/auditions/AuditionsShell.tsx` (≈ line 175)

- [ ] **Step 1: Phone dialog becomes a centred modal**

In `intro.module.css` replace the phone `.root` block (the one with `height: calc(100dvh - 12px)` and `animation: sheetIn`) with:
```css
.root {
  left: 16px;
  right: 16px;
  top: 50%;
  translate: 0 -50%;
  max-height: 70dvh;
  border-radius: 20px;
  overflow: hidden;
  animation: dialogIn 0.42s cubic-bezier(0.22, 1, 0.36, 1) both;
}
```
In `.panel` (phone) change `grid-template-rows: minmax(190px, 1fr) auto;` to `grid-template-rows: 160px auto;`, `height: 100%` to `max-height: 70dvh`, and add `border: 1.5px solid var(--i-fg); border-radius: 20px;`. In the desktop `@media (min-width: 768px) .root` add `translate: -50% -50%; max-height: none; border-radius: 0; left: 50%; right: auto;` (left/translate are already there, add the rest). Change `.root[data-state="closed"] { animation: sheetOut ... }` to `animation: dialogOut 0.26s cubic-bezier(0.4, 0, 1, 1) both;` and delete the `sheetIn` / `sheetOut` keyframes and the desktop `animation-name` overrides that are now redundant.

- [ ] **Step 2: Failing test for the loop-open flag**

Append to `lib/auditionIntro.test.ts`:
```ts
import { AUDITION_LOOP_KEY, readLoopOpen, writeLoopOpen } from "./auditionIntro";

describe("how it works loop open flag", () => {
  it("falls back when nothing is stored", () => {
    const s = memory();
    expect(readLoopOpen(true, s)).toBe(true);
    expect(readLoopOpen(false, s)).toBe(false);
  });
  it("remembers a choice", () => {
    const s = memory();
    writeLoopOpen(false, s);
    expect(readLoopOpen(true, s)).toBe(false);
    expect(s().getItem(AUDITION_LOOP_KEY)).toBe("0");
    writeLoopOpen(true, s);
    expect(readLoopOpen(false, s)).toBe(true);
  });
  it("falls back when storage throws", () => {
    expect(readLoopOpen(true, throwing)).toBe(true);
    expect(() => writeLoopOpen(true, throwing)).not.toThrow();
  });
});
```
Run: `npx vitest run lib/auditionIntro.test.ts` → FAIL (`readLoopOpen` is not exported).

- [ ] **Step 3: Implement**

Append to `lib/auditionIntro.ts`:
```ts
export const AUDITION_LOOP_KEY = "arc.auditionsLoopOpen";

/** Whether the small How-it-works loop is open under the paste box. */
export function readLoopOpen(fallback: boolean, storage: GetStorage = local): boolean {
  try {
    const v = storage().getItem(AUDITION_LOOP_KEY);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}

export function writeLoopOpen(open: boolean, storage: GetStorage = local): void {
  try {
    storage().setItem(AUDITION_LOOP_KEY, open ? "1" : "0");
  } catch {
    /* private mode: it just comes back next visit */
  }
}
```
Run: `npx vitest run lib/auditionIntro.test.ts` → PASS.

- [ ] **Step 4: The toggle component**

Create `components/auditions/HowItWorks.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { IconChevronDown } from "@tabler/icons-react";

import { useIsPhone } from "@/hooks/useIsPhone";
import { readIntroSeen, readLoopOpen, writeLoopOpen } from "@/lib/auditionIntro";
import { IntroLoop } from "./IntroLoop";

/**
 * The small looping demo under the paste box, behind a row that opens and
 * closes it. Closed by default on a phone once the intro has been seen (it
 * was taking most of the screen); open by default on desktop. The choice is
 * remembered in the browser.
 */
export function HowItWorks({ onExpand }: { onExpand: (step: number) => void }) {
  const isPhone = useIsPhone();
  // null until mounted: the default depends on the viewport and storage,
  // neither of which the server knows.
  const [open, setOpen] = useState<boolean | null>(null);
  useEffect(() => {
    setOpen(readLoopOpen(!(isPhone && readIntroSeen())));
  }, [isPhone]);

  function toggle() {
    const next = !open;
    setOpen(next);
    writeLoopOpen(next);
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open === true}
        aria-controls="aud-how-it-works"
        className="flex w-full items-center justify-between py-2 text-left"
      >
        <span className="aud-eyebrow">How it works</span>
        <IconChevronDown
          className="size-4 transition-transform duration-300"
          style={{ transform: open ? "rotate(180deg)" : "none" }}
          aria-hidden
        />
      </button>
      {open && (
        <div id="aud-how-it-works" className="mt-2">
          <IntroLoop onExpand={onExpand} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Mount it**

In `AuditionsShell.tsx` replace the import of `IntroLoop` with `import { HowItWorks } from "./HowItWorks";` and the `<IntroLoop onExpand={...} />` element (≈ line 175) with `<HowItWorks onExpand={(step) => { setIntroStep(step); setIntro(true); }} />`. `IntroLoop` already prints its own "How it works" eyebrow; remove that `<p className="aud-eyebrow">How it works</p>` line from `IntroLoop.tsx` so it is not said twice.

- [ ] **Step 6: Check**

Phone, fresh browser, /auditions with no auditions: the intro opens as a centred modal, 160px scene on top, capped at 70% height, scrim around it. Close it: the paste box, then a "How it works" row, closed. Tap: the loop opens. Reload: still open. Desktop: dialog as before, loop open by default.

- [ ] **Step 7: Commit**
```bash
git add components/auditions/intro/intro.module.css lib/auditionIntro.ts lib/auditionIntro.test.ts components/auditions/HowItWorks.tsx components/auditions/AuditionsShell.tsx components/auditions/IntroLoop.tsx
git commit -m "Auditions intro: a capped modal on phones, and the small demo behind a How it works toggle"
```

---

### Task 6: Spotlight tours off on phones

**Files:**
- Create: `lib/viewport.ts`, `lib/viewport.test.ts`
- Modify: `components/onboarding/useTourTrigger.ts` (effect ≈ line 33)

- [ ] **Step 1: Failing test**

`lib/viewport.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { PHONE_QUERY, isPhoneViewport } from "./viewport";

describe("isPhoneViewport", () => {
  it("asks the phone query", () => {
    let asked = "";
    const mm = (q: string) => { asked = q; return { matches: true }; };
    expect(isPhoneViewport(mm)).toBe(true);
    expect(asked).toBe(PHONE_QUERY);
  });
  it("is false without matchMedia", () => {
    expect(isPhoneViewport(undefined)).toBe(false);
  });
});
```
Run: `npx vitest run lib/viewport.test.ts` → FAIL (module not found).

- [ ] **Step 2: Implement**

`lib/viewport.ts`:
```ts
/** The same breakpoint as Tailwind's `md` and hooks/useIsPhone. */
export const PHONE_QUERY = "(max-width: 767.98px)";

type MatchMedia = (q: string) => { matches: boolean };

export function isPhoneViewport(
  mm: MatchMedia | undefined = typeof window !== "undefined" ? window.matchMedia?.bind(window) : undefined,
): boolean {
  return mm ? mm(PHONE_QUERY).matches : false;
}
```
Also change `hooks/useIsPhone.ts` to `import { PHONE_QUERY } from "@/lib/viewport"` and use it as `QUERY` (one breakpoint, two readers). Run the test → PASS.

- [ ] **Step 3: Gate the tours**

In `useTourTrigger.ts` import `isPhoneViewport` from `@/lib/viewport` and `markTourSeen` from `./TourSpotlight`. In the effect, after `if (hasSeenTourThisSession(flag)) return;` add:
```ts
    // A spotlight over a phone screen is chaos: it dims the whole page for a
    // callout that covers half of it. Phones skip the tour and latch it for
    // the session so a later desktop resize does not fire it mid-task.
    if (isPhoneViewport()) {
      markTourSeen(flag);
      return;
    }
```

- [ ] **Step 4: Check**

Phone, new account, open /monologues after onboarding: no spotlight. Desktop: tour still fires.

- [ ] **Step 5: Commit**
```bash
git add lib/viewport.ts lib/viewport.test.ts hooks/useIsPhone.ts components/onboarding/useTourTrigger.ts
git commit -m "Tours: the spotlight walkthroughs stay off on phones"
```

---

### Task 7: Originality filter is Plus

**Files:**
- Create: `backend/app/services/search/originality.py`, `backend/tests/test_originality_cap.py`
- Modify: `backend/app/api/monologues.py` (≈ lines 446–449)
- Modify: `components/search/FreshnessToggle.tsx`
- Modify: `components/search/SearchFiltersSheet.tsx` (≈ line 258), `components/monologue/SearchFiltersPanel.tsx` (≈ line 168)

- [ ] **Step 1: Failing backend test**

`backend/tests/test_originality_cap.py`:
```python
from app.services.search.originality import originality_cap


def test_free_tier_ignores_the_cap():
    assert originality_cap(0.3, False, is_paid=False) is None
    assert originality_cap(None, True, is_paid=False) is None


def test_paid_tier_keeps_the_explicit_cap():
    assert originality_cap(0.3, False, is_paid=True) == 0.3
    assert originality_cap(0.7, True, is_paid=True) == 0.7


def test_paid_tier_exclude_overdone_means_fresh():
    assert originality_cap(None, True, is_paid=True) == 0.3


def test_nothing_asked_is_nothing():
    assert originality_cap(None, False, is_paid=True) is None
```
Run: `cd backend && .venv/bin/python -m pytest tests/test_originality_cap.py -q` → FAIL (no module).

- [ ] **Step 2: Implement the helper**

`backend/app/services/search/originality.py`:
```python
"""Originality (overdone score) is a Plus filter.

The free tier sees every piece; the cap only applies for a paid account, so a
typed URL cannot do what the sheet refuses. 0.3 is "fresh picks", 0.7 is
"popular too", 1.0 / None is everything.
"""

FRESH = 0.3


def originality_cap(max_overdone_score: float | None, exclude_overdone: bool, *, is_paid: bool) -> float | None:
    if not is_paid:
        return None
    if max_overdone_score is not None:
        return max_overdone_score
    if exclude_overdone:
        return FRESH
    return None
```
Run the test → PASS.

- [ ] **Step 3: Use it in the route**

In `backend/app/api/monologues.py` add `from app.services.search.originality import originality_cap` and replace
```python
    if max_overdone_score is not None:
        filters['max_overdone_score'] = max_overdone_score
    elif exclude_overdone:
        filters['max_overdone_score'] = 0.3  # Only show "fresh" pieces (0.0 = fresh, 1.0 = extremely overdone)
```
with
```python
    sub = current_user.subscription
    cap = originality_cap(
        max_overdone_score, exclude_overdone,
        is_paid=bool(sub and sub.is_active and sub.is_paid_tier),
    )
    if cap is not None:
        filters['max_overdone_score'] = cap
```
Run: `cd backend && .venv/bin/python -m pytest tests/ -q -x -k "search or originality"` → PASS.

- [ ] **Step 4: Lock the toggle on the client**

Replace `components/search/FreshnessToggle.tsx` with:
```tsx
"use client";

import { useState } from "react";
import { useSubscription } from "@/hooks/useSubscription";
import { MonologuePaywallModal } from "@/components/monologue-work/MonologuePaywallModal";

interface FreshnessToggleProps {
  value: number;
  onChange: (value: number) => void;
}

const OPTIONS = [
  { label: "Fresh picks", value: 0.3, plus: true },
  { label: "Popular too", value: 0.7, plus: true },
  { label: "Show all", value: 1.0, plus: false },
] as const;

/** Originality is a Plus filter. Free accounts see the options with a Plus
 *  mark; tapping one opens the trial modal and leaves the filter alone. The
 *  server ignores the cap for free accounts either way. Locked only once the
 *  subscription has loaded and says free, so nothing flashes for Plus. */
export function FreshnessToggle({ value, onChange }: FreshnessToggleProps) {
  const { subscription } = useSubscription();
  const locked = subscription?.tier_name === "free";
  const [asking, setAsking] = useState(false);
  const activeValue = value <= 0.3 ? 0.3 : value <= 0.7 ? 0.7 : 1.0;

  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium text-foreground">Originality</p>
        <p className="text-xs text-muted-foreground mt-0.5">Hide commonly used pieces</p>
      </div>
      <div className="inline-flex rounded-lg border border-border/60 overflow-hidden">
        {OPTIONS.map((opt) => {
          const isActive = activeValue === opt.value;
          const gated = locked && opt.plus;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => (gated ? setAsking(true) : onChange(opt.value))}
              aria-disabled={gated || undefined}
              className={`px-4 py-2 text-xs font-medium transition-colors cursor-pointer border-r border-border/60 last:border-r-0 ${
                isActive
                  ? "bg-foreground text-background"
                  : "bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {opt.label}
              {gated && <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-primary">Plus</span>}
            </button>
          );
        })}
      </div>
      <MonologuePaywallModal
        open={asking}
        onOpenChange={setAsking}
        feature="filter_originality"
        title="Fresh picks are a Plus thing."
        description="Plus hides the pieces every panel has heard this season, so what you walk in with is yours. Free to start, card on file, cancel before it renews."
      />
    </div>
  );
}
```
`SearchFiltersSheet.tsx` and `SearchFiltersPanel.tsx` need no change (same props).

- [ ] **Step 5: Check**

Free account: Fresh picks and Popular too carry a Plus mark; tapping opens the modal; the filter stays on Show all. A Plus/comped account: no marks, filter works. `curl`-free check of the server: as a free user, `/api/monologues/search?q=hamlet&max_overdone_score=0.3` returns the same total as without the parameter.

- [ ] **Step 6: Commit**
```bash
git add backend/app/services/search/originality.py backend/tests/test_originality_cap.py backend/app/api/monologues.py components/search/FreshnessToggle.tsx
git commit -m "Originality is a Plus filter: locked in the sheet, ignored by the server for free accounts"
```

---

### Task 8: Free reads: the trial modal first, the wall stays

**Files:**
- Modify: `components/monologue-work/MonologuePaywallModal.tsx` (props ≈ line 14, dir ≈ line 81, quiet button ≈ line 108)
- Create: `components/monologue/ReadWallModal.tsx`
- Modify: `components/monologue/v2/ReadView.tsx` (≈ line 143)
- Modify: `app/(platform)/monologues/page.tsx` (both `<MonologueWall feature="monologue_read_panel" />` sites ≈ lines 2940 and 2953)

- [ ] **Step 1: Two optional props on the modal**

In `MonologuePaywallModalProps` add `dir?: string;` and `quietLabel?: string;`. Destructure both with defaults `dir = "(the house is still open.)"`, `quietLabel = "Maybe later"`. Render `{dir}` in the `t-modal__dir` paragraph and `{quietLabel}` in the quiet button.

- [ ] **Step 2: The read modal**

`components/monologue/ReadWallModal.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { MonologuePaywallModal } from "@/components/monologue-work/MonologuePaywallModal";

const KEY = (id: number | string) => `arc.readModal.${id}`;

/**
 * Pops once per piece per session when the free reads are spent, over the
 * inline wall, so the trial is one tap away instead of a scroll to the
 * bottom of the fragment. Dismissing leaves the wall where it is; the page
 * still says why the text stops. No number in the copy: the cap has moved
 * once already. The CTA names the trial length from the server.
 */
export function ReadWallModal({ monologueId }: { monologueId: number | string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      if (sessionStorage.getItem(KEY(monologueId)) === "1") return;
      sessionStorage.setItem(KEY(monologueId), "1");
    } catch {
      /* private mode: show it anyway, once per mount */
    }
    setOpen(true);
  }, [monologueId]);

  return (
    <MonologuePaywallModal
      open={open}
      onOpenChange={setOpen}
      feature="monologue_read_modal"
      dir="(the rest is behind the curtain.)"
      title="That's your free reads for the month."
      description="Plus opens every piece in the library, start to finish. Anything you've already saved stays open either way."
      quietLabel="not now"
    />
  );
}
```

- [ ] **Step 3: Mount it next to both walls**

`ReadView.tsx`: import `ReadWallModal` and change `{monologue.paywalled && <ReadGate />}` to
```tsx
{monologue.paywalled && (
  <>
    <ReadGate />
    <ReadWallModal monologueId={monologue.id} />
  </>
)}
```
`app/(platform)/monologues/page.tsx`: import `ReadWallModal` from `@/components/monologue/ReadWallModal`; at both `{selectedMonologue.paywalled && (<MonologueWall feature="monologue_read_panel" />)}` sites render `<ReadWallModal monologueId={selectedMonologue.id} />` alongside the wall inside a fragment.

- [ ] **Step 4: Check**

Free account past the cap (or temporarily set `monologue_reads_limit` low on a dev account): open a sixth piece. The modal pops with the read copy and the server-fed CTA; "not now" closes it and the inline wall is still under the fragment. Reopen the same piece in the same tab: no modal. A new piece: modal again. Signed out: nothing.

- [ ] **Step 5: Commit**
```bash
git add components/monologue-work/MonologuePaywallModal.tsx components/monologue/ReadWallModal.tsx components/monologue/v2/ReadView.tsx "app/(platform)/monologues/page.tsx"
git commit -m "Free reads: the trial modal pops first, the inline wall stays under the fragment"
```

---

### Task 9: The login hop shows no words

**Files:**
- Create: `components/rehearse/BenchSkeleton.tsx`
- Modify: `components/rehearse/RehearseHub.tsx` (local `BenchSkeleton` ≈ line 26), `app/(platform)/rehearse/page.tsx` (`RehearseFallback`), `app/(platform)/auditions/next/page.tsx`

- [ ] **Step 1: One skeleton, three readers**

`components/rehearse/BenchSkeleton.tsx`:
```tsx
import { Skeleton } from "@/components/ui/skeleton";

/** Shaped like the bench, because that is what arrives. */
export function BenchSkeleton() {
  return (
    <div className="t-bench">
      <div className="t-bench__grid">
        <Skeleton className="aspect-[2/3] w-[132px] shrink-0 rounded-sm bg-white/10 sm:w-[180px]" />
        <div className="w-full space-y-4">
          <Skeleton className="h-4 w-28 bg-white/10" />
          <Skeleton className="h-11 w-2/3 bg-white/10" />
          <Skeleton className="h-4 w-1/2 bg-white/10" />
          <Skeleton className="h-24 w-full max-w-prose bg-white/10" />
          <Skeleton className="h-[60px] w-44 rounded-full bg-white/10" />
        </div>
      </div>
    </div>
  );
}
```
Delete the local `BenchSkeleton` in `RehearseHub.tsx` and `RehearseFallback` in `rehearse/page.tsx`; import this one in both (drop their now-unused `Skeleton` imports).

- [ ] **Step 2: The hop**

Replace the returned `<p role="status">…</p>` in `app/(platform)/auditions/next/page.tsx` with:
```tsx
    <div
      role="status"
      aria-label="Loading"
      className={`theatre-tokens theatre-collection ${theatreFontVars}`}
    >
      <div className="relative isolate mx-auto w-full max-w-[1160px] px-5 py-8 sm:py-14 md:px-[14px]">
        <BenchSkeleton />
      </div>
    </div>
```
with imports `import { BenchSkeleton } from "@/components/rehearse/BenchSkeleton";` and `import { theatreFontVars } from "@/lib/fonts/theatre";`.

- [ ] **Step 3: Check**

Log out, log in: the hop shows the bench skeleton for a beat, then the Collection. No sentence about auditions. `npm run lint` clean.

- [ ] **Step 4: Commit**
```bash
git add components/rehearse/BenchSkeleton.tsx components/rehearse/RehearseHub.tsx "app/(platform)/rehearse/page.tsx" "app/(platform)/auditions/next/page.tsx"
git commit -m "Login hop: the bench skeleton instead of 'Finding your next audition'"
```

---

### Task 10: Verify and push

- [ ] `npm test` → all green. `npm run lint` → clean. `npx tsc --noEmit` → clean.
- [ ] `cd backend && .venv/bin/python -m pytest tests/ -q` → green.
- [ ] Render main at 390px logged in (memory `mobile-first-run-branch` recipe) and screenshot /monologues, /rehearse, /auditions, the filter sheet, a paywalled piece. Put the shots in the scratchpad and list them in the final message.
- [ ] `git push origin main`.
