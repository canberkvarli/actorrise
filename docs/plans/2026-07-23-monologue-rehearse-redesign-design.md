# Monologue Rehearse Redesign + Mobile Fix + Meter

Date: 2026-07-23
Owner: Canberk
Branch: redesign/ghost-light-app (new work in an isolated worktree)

## Why (the data)

- 327 signups. 165 (50%) searched. **Only 22 (6.7%) ever rehearsed.** Only 2 humans have ever paid real money; **$96 total revenue all-time.**
- The 33 "active" subscriptions are almost all comps / $0 trials, not paying customers.
- Free tier gives `monologue_sessions: -1` (**unlimited**) — the crown-jewel feature is given away infinitely, to every tier.
- The search -> rehearse cliff is THE problem. This plan attacks it, then arms monetization.

## Scope

IN: the **monologue** rehearse loop (`/work`, solo). Search card CTA, the `/work` Stage, mobile support, Director's notes, bookmark-in-work, and arming the session meter.

OUT: **ScenePartner** (two-person scenes at `/practice` -> `/scenes/[id]/rehearse`). Untouched. Revisit only after monologue conversion is proven. ScenePartner uses paid OpenAI TTS per session (a bigger cost leak) and is a head-on fight with scenepartner.ai — deliberately deferred.

## The positioning

scenepartner.ai's loop is Upload PDF -> Choose reader -> Run scene. Their step one is friction. **We have no upload** — 12k monologue library. Our loop is shorter:

> **Search -> tap -> rehearse.**

Meter the core action the way they do (they gate "auditions": Free 3, Plus 10, Pro 100). Students/educators get a discount, not free-for-all (abuse risk with any .edu).

## Design decisions (validated with Canberk)

### 1. Collapse the CTA sprawl -> one word: "Rehearse"
Today a monologue exposes 3-5 competing buttons with vague verbs (Practice this / Work on this / Rehearse / Memorize), and they're wired backwards ("Practice this" -> memorize; "Work on this" -> the real audio rehearsal; "Rehearse" -> the *video self-tape recorder*).

- **Search result card:** ONE primary button, **"Rehearse"** -> `/monologue/{id}/work`. Keep the bookmark icon. Remove "Practice this" (memorize reachable via Collection).
  - Files: `components/monologue/MonologueResultCard.tsx` (lines ~214-232), `components/search/FilmTvMonologueCard.tsx` (film/TV currently has NO rehearse CTA — decide: add one or keep "reference only").
- **Monologue detail page:** collapse the three buttons (`app/(platform)/monologue/[id]/page.tsx` ~129-148) to the single Rehearse; demote memorize/self-tape to quiet secondary links.

### 2. The `/work` "Stage" gets the Ghost Light look
Reuse the landing design system so rehearse feels like it belongs to the brand.
- Tokens (`app/globals.css` ~L272-284): `--stage`, `--stage-deep`, `--stage-raised`, `--stage-fg`, `--stage-muted`, `--stage-line`, `--stage-glow`. Accent `--primary` (~#CB4B00).
- Primitives to reuse: `.stage-spotlight`, `.stage-wash`, `.stage-grain`, `components/brand/GhostLight.tsx`, `components/brand/SpotlightSurface.tsx`.
- Type: monologue TEXT stays Courier Prime (`.font-typewriter`); title can use `.font-brand` (Playfair). Motion: `animate-stage-rise`, `animate-ghost-flicker` (respect `prefers-reduced-motion`).
- The single glowing "Rehearse/Begin" button = the ghost-light bulb energy.
- Target file: `components/monologue-work/MonologueCueing.tsx` (layout already mobile-aware via `clamp()` + 40/44px tap targets).

### 3. Fix mobile — THE #1 item
Current: `/work` uses Web Speech API (`hooks/useSpeechRecognition.ts`, `webkitSpeechRecognition`). On **iOS it's effectively unsupported** -> `isSupported=false` -> lines never auto-advance -> user must Skip line-by-line -> empty transcript -> end screen shows "I didn't catch any spoken lines" instead of Director's notes. Silent failure on the device most actors use.

**Fix (option A, chosen): first-class tap-to-advance "teleprompter" mode.** No speech recognition, no new API cost.
- In `MonologueCueing.tsx`: when `!isSupported` (or user opts in), enter Tap-to-advance: whole stage is a tap target calling `goToLineAndReset(activeIndex + 1)` (plumbing already exists via the Skip button). Relabel copy from "Say it out loud, I'll follow along" -> "Tap to advance."
- End screen: if transcript is empty (tap mode), **skip `runAnalysis`** and show a "run again / self-rate" curtain instead of the rating-0 dead-end message.
- Fix the buried/misleading "needs Chrome or Edge for voice" copy.
- Speech auto-follow becomes a *bonus* on supported browsers, not a requirement.

Deferred (option B): MediaRecorder + server Whisper. Gives iOS real line-tracking AND real audio for genuine tone/pacing notes (fixes the notes ceiling too), but adds a `/transcribe` endpoint, Whisper cost + latency, loses realtime word highlight. Do only if audio coaching becomes the differentiator.

### 4. Bookmark inside `/work` (clean drop-in)
- Reuse `useToggleFavorite()` (`hooks/useBookmarks.ts:56`) + `BookmarkIcon` (`components/ui/bookmark-icon.tsx`). Endpoints: `POST/DELETE /api/monologues/{id}/favorite`. Live state from `useBookmarks()` cache so the icon updates in-session.
- Place in the playbill header of `MonologueCueing.tsx` (~192-211). Reference impl: `MonologueResultCard.tsx:137-155`.

### 5. Director's notes — leave as-is for now
`gpt-4o-mini`, temp 0.4, JSON mode (`backend/app/services/ai/langchain/monologue_coach.py`). Cost ≈ **$0.0005/rehearsal** (negligible; 1,000 rehearsals ≈ $0.50). Scaffolding is good (compares transcript vs reference + timing). Ceiling: text-only, can't hear prosody, so tone/pacing notes partly guessed. Acceptable now; revisit with option B audio later.

### 6. Arm the meter — LAST, after the experience is solid
- The paywall is already wired: `/start` returns 403 -> paywall modal at the cap. The cap is just set to `-1`.
- Change Free `monologue_sessions` `-1` -> **`3`** (in prod `pricing_tiers` + `backend/.../seed.py`). Plus/Pro stay unlimited.
- Reason to meter is MONETIZATION, not cost. Do NOT arm until mobile + flow are good — never gate a broken experience.
- Consider a reverse-trial later (auto full access ~7-14 days, no card) to maximize activation before the wall. Not in this pass.

## Implementation order

1. **Mobile fix** (tap-to-advance + empty-transcript end screen + copy) — `MonologueCueing.tsx`, maybe `useSpeechRecognition.ts`.
2. **Card + detail CTA simplification** to single "Rehearse" — `MonologueResultCard.tsx`, `FilmTvMonologueCard.tsx`, `monologue/[id]/page.tsx`.
3. **Bookmark inside `/work`** — `MonologueCueing.tsx` + `useBookmarks`.
4. **Ghost Light Stage styling** on `/work`.
5. **Arm the meter** — pricing_tiers + seed.py (separate, reversible, prod DB change).

## Verification

- Drive `/work` on a simulated mobile viewport (no speech API): confirm tap-to-advance works end to end and the end screen is sane.
- Desktop Chrome: confirm speech auto-follow still works and Director's notes still render.
- Card: confirm one "Rehearse" button routes to `/work`; bookmark toggles.
- Meter (when armed): free user hits the cap -> paywall modal; Plus user unlimited.

## Open questions for Canberk

- Film/TV monologues: add a "Rehearse" CTA (BYO-text) or keep "reference only"?
- Meter number: Free = 3 rehearsals total, or 3/week/month? (scenepartner does 3 total free "auditions".)
- Students/educators: discount vs free, and how to verify (.edu / code)?
