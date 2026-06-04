# Rehearsal editor redesign — design

**Date:** 2026-06-04
**Status:** approved, staged implementation

## Problem

`/practice/[id]/scenes/[sceneId]/edit` is a dense two-column editing IDE. Since
every scene now opens it before rehearsing (the `/practice` library → editor
flow), it greets a "I just want to run this scene" actor with the full editing
surface. Rehearsal settings are mixed into scene metadata, the **Rehearse** CTA
competes with everything, and the two-column layout is heavy on mobile (where
Isha hit problems).

## Solution: two modes

Split the screen into **Rehearse mode** (default) and **Edit mode**.

### Rehearse mode (default — calm, mobile-first, polished)
- Scene shown **clean and read-only** (header + lines, user's lines highlighted).
- **"You're playing: [role ▾]"** — the one pre-rehearsal decision (reconnects the
  role pick removed from the library list).
- Primary **Rehearse this scene** button (sticky on mobile).
- Compact **Settings** popover: countdown, pace, auto-advance, highlight — pulled
  out of the metadata clutter.
- Quiet **Edit scene** button → Edit mode.

### Edit mode (all current power, decluttered)
- Everything today: reorder/add/edit/delete lines, voices, AI description,
  tone/emotions/context — reorganized so **Scene details** is separate from
  **script editing**; sections collapsible.
- Undo/Redo/Reset/Download live here (editing tools, not rehearsal ones).
- **Done** returns to Rehearse mode.

## Why this hits all four goals
- Calm pre-rehearsal path → Rehearse mode is the default.
- Keep all power → Edit mode retains every feature.
- Mobile-first → both views designed phone-first; sticky Rehearse bar.
- Visual polish → applied throughout.

## Staged implementation (3,450-line file — stage to avoid breakage)
1. **Mode split + Rehearse view.** Add `mode` state (default `rehearse`). New,
   self-contained read-only Rehearse view; the existing editor renders unchanged
   under `mode === 'edit'` (zero regression risk). Wire role selector, Settings
   popover, and the Rehearse launch into the new view.
2. **Declutter Edit mode** — separate Settings from Scene details; collapsible
   sections.
3. **Mobile pass** — tap targets, sticky Rehearse, simpler line editing.
4. **Visual polish** — typography, parchment, transitions.

## Notes / constraints
- Rehearsal launch already exists (`POST /api/scenes/rehearse/start` →
  `/scenes/:id/rehearse?session=...`). Reuse it.
- iOS audio fix already shipped on the rehearse page.
- Verification needs a real device for the mobile/iOS paths.
