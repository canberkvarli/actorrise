# Memorization Mode (+ Monologue Rehearsal, Cold-read) — Design

Date: 2026-06-05
Branch: `feat/rehearse-hub`

## Goal
Give actors a way to get *off-book*, not just *run* a scene. The AI partner handles
performance; memorization handles the grind of learning lines. Decided UX:
**progressive reveal** (chosen over flashcards / mic-check).

## Phase 1 — Memorization mode (this build)

### UX
- One screen showing the scene/monologue. A segmented **level control**:
  1. **Full** — all text visible.
  2. **Hints** — each of *your* words becomes first-letter + middots (`To be,` → `T· b·,`), preserving length + punctuation.
  3. **Blank** — your lines render as blanks.
- **Tap any hidden line to peek** (reveal, tap again to re-hide) at any level.
- **Scenes:** only the chosen character's lines transform; the other character's lines stay full as cues. **Monologues:** every line is yours.
- Calm, readable, mobile-first. No mic, no AI calls.

### Data (no backend changes)
- Scene: `GET /api/scenes/{id}` → `lines: [{ line_order, character_name, text, stage_direction }]` + `character_1_name`/`character_2_name`.
- Monologue: `GET /api/monologues/{id}` → `{ title, character_name, text, text_segments? }`. Split `text` into lines (newlines, else sentence chunks).

### Routes / components
- `app/(platform)/scenes/[id]/memorize/page.tsx` — fetch scene, pick character (`?character=` or inline picker), render `MemorizeView`.
- `app/(platform)/monologue/[id]/memorize/page.tsx` — fetch monologue, render `MemorizeView` with all lines owned.
- `components/memorize/MemorizeView.tsx` — reusable: props `{ lines: {speaker, text, mine}[], title, subtitle }`. Owns level state + per-line peek state. Pure presentation.
- `lib/memorize.ts` — `maskFirstLetters(text)` and `splitMonologue(text)` helpers (unit-friendly).

### Entry points
- Library `SceneCard`: add a secondary **Memorize** action next to Rehearse.
- Monologue detail page: add a **Memorize** button.
- Scene editor (`…/scenes/[id]/edit`): add **Memorize** next to Start rehearsal (editor stays the launcher per current decision).

## Phase 2 — Monologue rehearsal (later)
Monologues are browse-only today. Add **Rehearse**/**Memorize** to the monologue page.
"Rehearse" for a solo piece = perform with cueing + (reuse) self-tape/audition feedback;
memorize falls out of Phase 1. Scope TBD.

## Phase 3 — Cold-read / audition mode (later)
A variant of the existing scene rehearse session: short timed prep (~60s), then run with
no restarts — audition-room pressure. Likely a `?mode=cold` flag on the rehearse start +
a prep timer overlay.

## Testing
- Unit: `maskFirstLetters` (punctuation, contractions, length), `splitMonologue`.
- tsc + build clean; manual: scene memorize (both roles), monologue memorize, level steps, peek.

## Out of scope (now)
- Off-book *tracking* (not selected).
- Speech/mic checking (chose visual progressive reveal).
