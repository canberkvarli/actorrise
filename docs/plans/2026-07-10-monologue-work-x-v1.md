# Monologue Work ("X") v1 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give monologue-searchers a place to *work on the piece they just found* — an audio-first flow where the AI cues you off-book and gives spoken-delivery notes — so the 89% who search stop dead-ending and start using the product.

**Architecture:** A new product pillar ("X", name TBD) parallel to ScenePartner. Entry is a single `monologue_id` from search. It reuses the orphaned `audition` teleprompter/feedback UI and ScenePartner's audio stack (SpeechRecognition + Whisper + word-matching), adds a single-speaker off-book cueing loop, and mirrors ScenePartner's session-counter paywall. Audio-first; no camera in v1 (the video `audition` flow got 0 uses).

**Tech Stack:** Next.js App Router (client components), TypeScript, `@/lib/api` client, TanStack Query (used by memorize page), Tailwind, FastAPI backend (`backend/`), OpenAI Whisper via `/api/speech/transcribe`.

**Strategy context:** see `docs/plans/2026-07-10-search-to-scenepartner-activation-plan.md` (in `main`'s working tree).

**Verification note (important):** this frontend has **no unit-test harness** (only `next build` + `eslint`). So classic red-green TDD does not apply to the UI tasks. Verification per task = `npx tsc --noEmit` clean + browser-drive the flow with the Playwright/chrome-devtools MCP (confirm the observable behavior) before commit. Where we add backend logic (Increments 2–3) we add pytest coverage in `backend/`.

---

## Increment 1 — Bridge + skeleton route (EXECUTION-READY)

Ships a real, measurable entry point: a "Work on this monologue" CTA on search results and the monologue page, landing on a new full-bleed route that loads the piece and shows the teleprompter. **No AI yet** — this is the safe, demoable slice. Non-destructive: existing "Practice this" / "Rehearse" / "Memorize" entries stay untouched for now.

### Task 1.1: New route renders the monologue

**Files:**
- Create: `app/(platform)/monologue/[id]/work/page.tsx`

**Step 1 — Write the page.** Client component. Read id via `useParams()`, fetch with `api.get<Monologue>`, reuse `MonologueReference` for the teleprompter. Handle loading + 404. Include a visible placeholder where the cueing UI will go (so the page is coherent on its own).

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { IconArrowLeft } from "@tabler/icons-react";
import api from "@/lib/api";
import type { Monologue } from "@/types/actor";
import { MonologueReference } from "@/components/audition/MonologueReference";

export default function MonologueWorkPage() {
  const id = useParams().id as string;
  const router = useRouter();
  const [monologue, setMonologue] = useState<Monologue | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "notfound" | "error">("loading");
  const [refOpen, setRefOpen] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await api.get<Monologue>(`/api/monologues/${id}`);
        if (!active) return;
        setMonologue(res.data);
        setStatus("ready");
      } catch (error) {
        if (!active) return;
        const code = (error as Error & { response?: { status?: number } })?.response?.status;
        setStatus(code === 404 ? "notfound" : "error");
      }
    })();
    return () => { active = false; };
  }, [id]);

  if (status === "loading") {
    return <div className="flex h-dvh items-center justify-center text-muted-foreground">Loading…</div>;
  }
  if (status === "notfound" || status === "error" || !monologue) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">
          {status === "notfound" ? "This monologue no longer exists." : "Something went wrong loading this piece."}
        </p>
        <button onClick={() => router.back()} className="text-[#CB4B00] hover:underline">Go back</button>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <button onClick={() => router.back()} aria-label="Back" className="text-muted-foreground hover:text-foreground">
          <IconArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">{monologue.title}</h1>
          <p className="truncate text-xs text-muted-foreground">{monologue.character_name}</p>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
        {/* Placeholder for the off-book cueing UI (Increment 2). */}
        <div className="rounded-md border border-dashed px-6 py-10 text-center text-muted-foreground">
          <p className="font-medium text-foreground">Off-book coaching is coming next.</p>
          <p className="mt-1 text-sm">For now, open the script below and run the piece.</p>
        </div>
      </main>

      <MonologueReference monologue={monologue} open={refOpen} onToggle={() => setRefOpen((o) => !o)} />
    </div>
  );
}
```

**Step 2 — Typecheck.** Run: `npx tsc --noEmit`. Expected: clean (no new errors vs baseline in `/tmp/x-baseline-tsc.log`).

**Step 3 — Commit.**
```bash
git add "app/(platform)/monologue/[id]/work/page.tsx"
git commit -m "feat(monologue-work): skeleton /monologue/[id]/work route"
```

### Task 1.2: Register the route as immersive (full-bleed, no bottom nav)

**Files:**
- Modify: `app/(platform)/layout.tsx:191`

**Step 1 — Edit the `isImmersive` regex.** Add the new route branch:

```tsx
// before
const isImmersive = /^\/scenes\/[^/]+\/rehearse$|^\/practice\/[^/]+\/scenes\/[^/]+\/edit$|^\/audition$|^\/first-scene$/.test(pathname || "");
// after — add |^\/monologue\/[^/]+\/work$
const isImmersive = /^\/scenes\/[^/]+\/rehearse$|^\/practice\/[^/]+\/scenes\/[^/]+\/edit$|^\/audition$|^\/first-scene$|^\/monologue\/[^/]+\/work$/.test(pathname || "");
```

**Step 2 — Typecheck.** `npx tsc --noEmit` → clean.

**Step 3 — Commit.**
```bash
git add "app/(platform)/layout.tsx"
git commit -m "feat(monologue-work): register /work route as immersive"
```

### Task 1.3: "Work on this monologue" CTA on the search result card

**Files:**
- Modify: `components/search/MonologueCard.tsx:116-158` (the `<CardFooter>` action row)

**Step 1 — Add a sibling `<Link>`** next to the existing "Practice this" link (keep both for now). Match the existing button styling but as the outline/secondary variant so "Practice this" stays primary and this reads as the new option:

```tsx
<Link
  href={`/monologue/${monologue.id}/work`}
  onClick={(e) => e.stopPropagation()}
  className="inline-flex items-center gap-1.5 rounded-md border border-[#CB4B00] px-3 py-1.5 text-sm font-semibold text-[#CB4B00] transition-colors hover:bg-[#CB4B00]/10"
>
  Work on this
</Link>
```

Place it inside the `<CardFooter>` so the footer holds both actions (adjust the flex container so the two primary actions sit together on the left; leave the source/full-text links on the right).

**Step 2 — Typecheck.** `npx tsc --noEmit` → clean.

**Step 3 — Browser-verify.** Drive to a search result (chrome-devtools/Playwright MCP), confirm "Work on this" appears and navigates to `/monologue/<id>/work`, which shows the title + teleprompter.

**Step 4 — Commit.**
```bash
git add "components/search/MonologueCard.tsx"
git commit -m "feat(monologue-work): add 'Work on this' CTA to search result card"
```

### Task 1.4: "Work on this monologue" action on the monologue detail page

**Files:**
- Modify: `app/(platform)/monologue/[id]/page.tsx:128-141` (the `headerActions` buttons block)

**Step 1 — Add a primary action button** alongside the existing Rehearse/Memorize buttons:

```tsx
<Button
  onClick={() => router.push(`/monologue/${monologue.id}/work`)}
  className="flex-shrink-0"
>
  Work on this
</Button>
```

Note: the existing **"Rehearse" button currently points at `/audition`** (the dead video flow). Do NOT remove it in this increment — repointing/retiring `/audition` happens once X v1 is functional (tracked as a follow-up, not here).

**Step 2 — Typecheck.** `npx tsc --noEmit` → clean.

**Step 3 — Commit.**
```bash
git add "app/(platform)/monologue/[id]/page.tsx"
git commit -m "feat(monologue-work): add 'Work on this' action to monologue detail"
```

### Increment 1 acceptance
- From a search result AND the monologue detail page, "Work on this" navigates to `/monologue/[id]/work`.
- The route renders full-bleed (no bottom nav), shows title/character + the teleprompter, and handles loading/404.
- `npx tsc --noEmit` clean; existing entries (Practice/Rehearse/Memorize) still work.
- **Checkpoint: review with Canberk before Increment 2.**

---

## Increment 2 — Off-book cueing loop (OUTLINE — expand before building)

**Goal:** You run the monologue out loud; the AI listens and feeds the next line only when you stall.

**Approach:** Adapt the single-speaker case from `app/(platform)/scenes/[id]/rehearse/page.tsx`. Reuse: browser `SpeechRecognition` for live highlight, `wordMatchScore`/`wordsMatch` for progress, `POST /api/speech/transcribe` (Whisper, accepts an expected-line `prompt`) for accuracy, and `monologue.text_segments` (filter to `type: "dialogue"`) as the line list. Net-new: a "stall/blank" detector (no confident match within a timeout) → reveal/speak the next segment; progress state over segments; a cueing-mode teleprompter (hide upcoming lines until reached).

**Open questions to resolve first:** (1) how the next line is delivered — text reveal only, or TTS voice? (2) stall timeout + what counts as "stalled" vs "paused for a beat"? (3) do we persist a session row yet, or wait for Increment 4?

**Files (expected):** new `components/monologue-work/*` (cueing UI), possibly a small hook extracted from the rehearse page. Backend: reuse `/api/speech/transcribe` as-is.

---

## Increment 3 — Transcript-aware performance notes (OUTLINE — expand before building)

**Goal:** After a run, spoken-delivery feedback (pacing, emotion, line accuracy) from the transcript — NOT the video-frame-only feedback the current coach gives.

**Approach:** New feedback path that takes the Whisper transcript + the monologue text (+ metadata: tone, primary_emotion) and returns structured notes. Extend `backend/app/services/ai/langchain/audition_coach.py` with a text/transcript analyzer (sibling to `analyze_with_frames`), or a new service. Reuse the audition Director-Notes sidebar UI for display.

**Testing:** add pytest coverage in `backend/` for the new analyzer (deterministic assertions on structure + that line-accuracy reflects the transcript vs source).

**Open questions:** feedback schema (reuse audition's `{rating, overall_notes, line_accuracy, pacing, emotional_tone, tips[]}` minus `framing`?); cost per run; free vs paid gating of notes.

---

## Increment 4 — Session counter + paywall (OUTLINE — expand before building)

**Goal:** Mirror ScenePartner's free cap; hitting it triggers the FOUNDER3 conversion modal.

**Approach:** Add `UsageMetrics.monologue_sessions` (new column + migration), a `require_monologue_work(increment=True)` gate mirroring `require_scene_partner` in `backend/app/middleware/rate_limiting.py`, seed per-tier limits in `backend/app/core/seed.py` + `backend/app/models/billing.py`, and increment once at session start. Frontend gates on 403 and shows the founder-coupon modal (FOUNDER3, 3mo Plus, card-on-file — self-serve coupon already exists).

**Open questions:** the free-tier number (how many monologue sessions/month); whether performance notes are a separate paid gate; per-tier limits table.

---

## Deferred / follow-ups (not in v1)
- Retire or repoint the dead `/audition` route once X covers the "work on it" job.
- Character/objective/beat analysis ("prepare a role" deeper layer).
- Optional video self-tape step-up (reuse audition recorder + Vision coach).
- Smart search (strategy Phase 0) — separate track; must land before X is pushed to real users, since monologue search is X's front door.
