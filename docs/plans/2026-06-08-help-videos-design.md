# In-app Help / tutorial videos — design

**Date:** 2026-06-08
**Goal:** Help users (many non-tech-savvy, e.g. Lily) navigate and understand ActorRise via short tutorial videos. Purely in-app onboarding/navigation help — NOT marketing/social.

## Decisions

- **Central surface:** a real page at `/help` with a grid of short video cards. Each ready card opens the video in a popup player.
- **Nav entry:** a `?` icon in the desktop top nav (after Monologues) + a "Help" row in the mobile hamburger menu. Nothing added to the 3-tab mobile bottom bar.
- **Unfilmed videos:** show "Coming soon" cards (greyed, not clickable) so the page looks full and signals what's coming.
- **Contextual embed:** a quiet "Watch how it works (1 min)" link in the Practice empty state that opens the same player with the ScenePartner demo.

## Architecture

No backend, no DB. Videos are YouTube IDs in a config file.

### Data — `lib/help-videos.ts`
Ordered array of:
```ts
{ slug: string; title: string; description: string; durationLabel: string; youtubeId?: string }
```
`youtubeId` present → ready/clickable. Absent → "Coming soon".

Initial list:
1. Run your first scene — `youtubeId: "TTZxo3bZPI4"` (existing ScenePartner demo) — READY
2. Upload a script — coming soon
3. Pick your character + pacing — coming soon
4. Claim your founding spot (FOUNDER3) — coming soon
5. Getting started tour — coming soon

Adding a video later = paste its ID into this file. Card flips from greyed to playable automatically.

### Player — `components/help/HelpVideoDialog.tsx`
Reuses the existing YouTube-in-Dialog pattern from `components/landing/LandingVideoShowcase.tsx` (YouTube iframe inside the `Dialog` primitive). Takes a `youtubeId`. One player, reused by the Help page and the empty-state embed. No new dependency, no Sheet/Drawer.

### Help page — `app/(platform)/help/page.tsx`
Client component, inherits platform auth + layout. Heading in Canberk's voice + responsive grid (2-up desktop, 1 col mobile) mapped from the config.
- **Ready card:** YouTube thumbnail (`img.youtube.com/vi/<id>/hqdefault.jpg`) + brand `#CB4B00` play overlay + title + one-line description + duration. Rounded (clickable). Light hover (`shadow-md`). Opens `HelpVideoDialog`.
- **Coming-soon card:** greyed, not clickable, sharp-cornered "Coming soon" tag (non-interactive badge = sharp corners).

### Nav — `app/(platform)/layout.tsx`
- Desktop: `?` icon (`IconHelpCircle`) → `/help`, after Monologues.
- Mobile hamburger: "Help" row near "Contact & feedback".

### Contextual embed — `components/practice/PracticeLibrary.tsx` (EmptyState)
Add a low-key "Watch how it works (1 min)" text-button next to the existing Upload / Open the demo actions. Opens `HelpVideoDialog` with `TTZxo3bZPI4`. "Upload a script" stays primary.

## Out of scope (YAGNI)
- No Billing-page embed yet (FOUNDER3 video not filmed).
- No watched/progress tracking, no backend.
- No autoplay / forced onboarding modal.

## Verification
- Frontend typecheck.
- Run the app, screenshot `/help` (one playable + greyed cards) and the updated empty state for review before commit.
