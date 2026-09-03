# Monologue detail: the piece first

2026-09-03

## What was wrong

**The saved bookmark was invisible in both themes.** `app/(platform)/monologue/[id]/page.tsx`
painted it `text-accent`. `--accent` is a *surface* token — the colour a panel is
filled with, meant to pair with `--accent-foreground`. In light it is
`oklch(0.94 0.03 215)`, a pale blue; in dark it is `oklch(0.26 0.02 52)`, a
near-black warm grey. Either way it is a background being used as a foreground,
so the icon disappeared against the page. Not a contrast oversight — a token
category error.

**The orange button was legible and still wrong.** Measured: dark `#f27626` with
a near-black label at **6.41:1**, light `#CB4B00` with a near-white label at
**4.50:1**. Both pass AA. But the dark pairing reads as a black word stamped into
an orange pill, and light was sitting exactly on the 4.5 threshold with no room.

The cause is that `--primary` does two jobs. It is brightened in dark so orange
*text* — links, "Rehearse" as a text link, accents — carries on a near-black
page. Fill a button with that brightness and no light label survives: white
measures 2.3:1 against `#f27626`, so the label is forced dark.

**The header buried the piece.** On a 390px phone the header stack ran 268px
before a word of the monologue: source line, a 4xl name, six facts wrapping to
two lines, then a scene note. You scrolled to reach the thing you opened the page
for. Of the six facts, `36 words` sat beside `0:19` saying the same thing twice,
and only one of those answers a question an actor is ever asked.

**The toolbar carried three grammars.** Ways to *view* the piece (Read/Cut/Copy
tabs), things that are *true* of it (off book, saved), and the one thing to *do*
with it, all in a single strip. On a phone the action was the part pushed off the
right edge.

## The design

### The room, not the ink

New token pair, `--primary-solid` / `--primary-solid-foreground`. Both themes get
the brand orange with a white label. A filled button does not need the dark-mode
lift that orange text does, because it is a large block rather than 14px type:
`#CB4B00` sits at 4.21:1 against the dark page, past the 3:1 a UI component
needs, and carries white at 4.5:1. `--primary` is untouched, so every orange
link and label keeps the brightness it needs.

### Saved is teal

Teal already means Collection everywhere else — the collection toggle on
`/monologues`, the `your lane` mark on a result row. Using it here keeps orange
for the single primary action instead of having two oranges compete in one
toolbar.

### The piece first

Header compresses: name to 3xl on mobile, poster to 74px wide, spacing to
`space-y-3`, word count dropped. 268px → 113px, so the monologue starts on the
first screen.

### One action, always in reach

Rehearse leaves the sticky strip and becomes a floating pill above the platform
bottom nav — `bottom-[88px]` clears the 65px tab strip, `lg:bottom-6` where there
is no strip. The strip keeps the tabs and the status toggles, which are the two
things that belong together: how you are looking at it, and what is true of it.
The page gets `pb-40` so the last panel can scroll clear of the pill.

## Measured after

| | light | dark |
|---|---|---|
| pill label on fill | 4.50 | 4.50 |
| pill vs page | 4.22 | 4.21 |
| saved bookmark vs page | 3.35 | — |
| header height @390 | 113px (was 268) | |
| elements past viewport @390 | 0 | 0 |
