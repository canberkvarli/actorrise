# Phone polish bundle (design)

Date: 2026-10-17. Nine independent fixes Canberk asked for from his phone, each
small on its own. One spec so they ship as one pass and one commit series.
All measurements are at phone width (under 768px, Tailwind `md`) unless said.

## 1. Tab bar: the active pill touches the bar's top edge

`.t-tabbar` pads 6px top; `.t-tabbar__tab` is 48px tall with a 14px radius, so
the lit pill sits flush against the 1px border-top. Change: bar padding
`10px 10px calc(8px + env(safe-area-inset-bottom, 0px))`, tab `min-height: 44px`,
`border-radius: 12px`. Every surface that clears the bar adds the same env() on
top of its own offset, so nothing else moves. Files: `app/globals.css` only.

## 2. Find for me as the first chip in the row

On phones Find for me is a fixed chip in front of a horizontally scrolling
`QuickFilterChips` row, so chips slide under it and get cut ("dic"). Change:
`QuickFilterChips` accepts a `leading` node rendered as the first item inside
its scroll container; the phone branch in `app/(platform)/monologues/page.tsx`
passes the Find for me chip there and drops the wrapper flex. The scroll
container gets a mask-image edge fade of 16px on both sides. Desktop unchanged.

## 3. Shelf rows stacked on phones

`ShelfCard` (`.t-shelf-row`) is a two-column row: name + play title + source
pill on the left, "20s · defiant · 1 min" on the right. The pill eats the
left column, so play titles collapse to "#V…". On phones the row stacks:

```
Anna                                  (name, 15px)
#VeryGoodGirl                         (play title, one line, full width, truncate)
contemporary · 20s · contemplative · 2 min   (one meta line, 12px, muted)
```

The source becomes plain text in the meta line (the first segment), not a
pill. Padding 12px 14px, gap between rows 8px. Above 768px nothing changes.
CSS in `app/globals.css` under a `@media (max-width: 767.98px)` block;
`ShelfCard.tsx` renders the source text via a small `sourceLabel(m)` helper
next to the existing `MonologueSourceTag` so desktop keeps the pill.

## 4. "Or start somewhere" doors at half height, rose gone

`StartingPoints` renders five tilted doors in `minmax(150px,1fr)`, two per
phone row, each with a 28px glyph, 16px label, 12px query line. Change on
phones: three columns (`minmax(96px,1fr)`), glyph 20px, label 14px, query line
hidden, padding 10px 12px, hard shadow 3px, tilt kept. Love's glyph changes
from `RoseSketch` to `TicketSketch` at every width (the rose does not read as
a rose). Desktop sizes otherwise unchanged.

## 5. Auditions intro: a capped modal, and a "How it works" toggle

`AuditionsIntro` on phones is a full-height sheet. Change: on phones the
dialog is a centred modal, max-height 70vh, width calc(100vw - 32px), radius
20px, scrim around it. The `IntroStage` is fixed at 160px tall on top, copy
below, dots and Next at the foot. Desktop layout unchanged.

Under the paste box, `IntroLoop` runs the three scenes on a loop and takes a
lot of the phone. Change: a header row "How it works" with a chevron that
opens and closes the loop. Closed by default on phones once the intro has
been seen (`readIntroSeen()`), open by default on desktop. The open/closed
choice is remembered in localStorage (`arc.auditionsLoopOpen`), read inside
try/catch. When closed, the loop unmounts (no animation cost).

## 6. Spotlight tours off on phones

`useTourTrigger` returns `show: false` when `window.matchMedia("(max-width: 767.98px)")`
matches, and marks the tour seen so it does not fire later on desktop for the
same session. Covers SearchTour, ProfileTour, CollectionTour, ScenePartnerTour.
The corner `ProfileBackfillCard` is NOT touched (Canberk meant the spotlight).

## 7. Originality filter is Plus

"Originality: Fresh picks / Popular too / Show all" in `SearchFiltersSheet`
and `SearchFiltersPanel` is free for everyone today, and the API applies
`max_overdone_score` for any tier.

Client: `FreshnessToggle` takes `locked: boolean`. When locked, Fresh picks
and Popular too show a small "Plus" mark; tapping either opens
`MonologuePaywallModal` with `feature="filter_originality"`, title "Fresh
picks are a Plus thing.", and does not change the filter. Show all stays
free. `locked` comes from `useSubscription()` (`is_paid_tier` false).

Server: in `GET /api/monologues/search`, when the caller is not on a paid tier,
`max_overdone_score` and `exclude_overdone` are ignored (treated as 1.0 / false).
A `paywall_hit` with `feature: "filter_originality"` is recorded client side
when the modal opens, via the existing `trackUpgradeModalViewed` path.
Comped and trialing accounts count as paid, same as every other gate.

## 8. Free reads: the trial modal first, the wall stays

When a paywalled piece opens (detail page `ReadView` and the search panel's
read view), `MonologuePaywallModal` opens once per piece per session with:
dir "(the rest is behind the curtain.)", title "That's your free reads for
the month.", body "Plus opens every piece in the library, start to finish.
Anything you've already saved stays open either way.", CTA `words.cta` (the
server names the length, never the copy), quiet link "not now". Dismissing
leaves `ReadGate` / `MonologueWall` under the fragment exactly as today, so
the page still explains why the text stops. The modal logs the existing
`upgrade_modal_viewed` with `feature: "monologue_read_modal"`. Sign-out
readers have no allowance and never see it.

## 9. The login hop shows no words

`app/(platform)/auditions/next/page.tsx` prints "Finding your next audition"
while it decides where login lands. Most people have no audition and land on
the Collection, so the sentence reads as a bug. Change: the hop renders the
Collection's own `BenchSkeleton` look (export it from `RehearseHub`), no
text, with `role="status"` and `aria-label="Loading"`.

## Out of scope

Search result cards, desktop layouts, the tab bar's hide-on-scroll, the
onboarding ending (its own spec, same date).

## Testing

- Unit: `QuickFilterChips` renders `leading` first; `useTourTrigger` returns
  false under 768px; `sourceLabel(m)` for play / film / tv / contemporary.
- Backend: search ignores `max_overdone_score` for a free user and applies it
  for Plus (pytest, `tests/test_monologues_search.py` or the nearest file).
- Visual: render main at 390px with a real login (recipe in memory
  `mobile-first-run-branch`) and screenshot /monologues, /rehearse,
  /auditions, the filter sheet, and a paywalled piece.
