# Uploading a whole play — design

2026-09-04. Why Hamlet fails today, and the scene picker that replaces the
quick/full dialog.

---

## What actually broke

"Failed to fetch" is not one of our errors. It is what the browser throws when
the request dies without a response, so nothing in our code raised it and no
status code came back.

Every upload over 50KB calls `/api/scripts/scan` first, and scan opens the whole
PDF with pdfplumber, synchronously, inside the request. Measured on a synthetic
170-page play (`scratchpad/scan_bench.py`):

```
pdfplumber: 170 pages in 15.6s (92 ms/page), 234k chars, peak RSS 295 MB
structure:  9 chunks, 9 with dialogue, 0.2s
```

That is a *clean* generated PDF. A real Hamlet with embedded fonts is worse on
both axes. Render runs the $7 Starter box at 512 MB. A 16-second request holding
~300 MB is a strong candidate for the worker dying underneath it, which presents
exactly as this does. NOT CONFIRMED — the Render CLI token is expired, so the
logs have not been read. `render login` first, then check for an OOM around the
upload.

The same file is then parsed a second time by `upload-stream`, which never reads
the `ExtractionCache` that scan could have filled. We pay for Hamlet twice.

### pypdf changes the arithmetic

```
pdfplumber: 170 pages in 15.6s, peak 295 MB
pypdf:      170 pages in  0.4s, peak  81 MB   (238k chars — same text)
```

40x faster, 3.6x lighter, same output on this file. Do **not** swap wholesale:
`pdf_page_text` does layout work that matters on real sides, and undoing it
would bring back the watermarked-studio-side bug. But finding act and scene
boundaries needs line starts, not layout. pypdf is right for the map, pdfplumber
stays for the pages actually being extracted.

## The shape

Two passes that have been conflated. Separating them is the whole design.

**1. The map — always complete, always free.** Every act, every scene, nothing
skipped. `detect_structure` already handles `ACT III` / `ACT 3` / `ACT THREE`,
the same for scenes, screenplay `INT.`/`EXT.` slugs, and
`PROLOGUE`/`EPILOGUE`/`COLD OPEN`/`TEASER`/`TAG`. On the 170-page test it found
all 9 acts in 0.2s.

Then gpt-4o-mini makes the map smart, which regex cannot do: merge chunks the
splitter broke apart, name scenes the way an actor would recognise them, resolve
`HAMLET` / `Ham.` / `HAMLET (CONT'D)` to one character, and segment a modern
play that never writes "SCENE" at all. Send it the detected boundaries plus the
opening of each chunk and the character names found — not the whole play. That
is a few thousand tokens, a fraction of a cent, and gpt-4o-mini is already the
workhorse in `script_parser.py`.

**2. The dialogue pass — metered.** The AI call per scene that turns it into
rehearsable lines. This is what costs money, and this is what the quota counts.

Because we know which scenes were picked, pdfplumber only ever runs on those
pages. Hamlet becomes a 12-page parse instead of 170. The picker saves the AI
spend and the PDF spend at once — the cheap path and the good product are the
same path here.

## What the actor sees

Upload Hamlet → under a second later, the play's spine:

```
ACT 1
  Scene 1   Elsinore, the guard   Barnardo, Francisco, Horatio, Marcellus   112 lines
  Scene 2   The court             Claudius, Gertrude, Hamlet, Laertes...    286 lines
  Scene 3   Polonius' advice      Laertes, Ophelia, Polonius   ·  two-hander  94 lines
ACT 2
  ...
```

Tick what you want. The quota sits under it: *"1 scene this month. Plus does the
whole play."* The picker is the upgrade surface, not a wall at the door — a
blocked upload is indistinguishable from a broken one, which is how this
started.

## Decisions taken (Canberk, 2026-09-04)

- **Meter: scenes extracted.** Not scripts. "5 scripts" charges the same for a
  two-page side and a full play, maybe 50x apart in real cost.
- **Free: 1 scene, whole play visible.** They see all 20 of Hamlet's scenes and
  build one, properly, end to end. Greyed rows sell the rest.
- **Paid, monthly: Solo 10, Plus 40, Pro unlimited.** Resets, so a working actor
  with an audition a week never thinks about it, and nobody extracts a library
  in month one and cancels.
- **The map may use AI.** Cheap model, make it smarter than regex can be.

## Traps

- `MAX_CHUNK_CHARS = 60000` splits long chunks, so one scene can arrive as
  three. The map must merge them back or Act 1 Scene 2 appears three times.
- Page ranges are **not tracked today** — text is concatenated with no page
  markers. Record a char offset per page during extraction and map chunk offsets
  back. Without this there is no "only parse the picked pages", and that is the
  point of the whole design.
- Client says max 15MB, backend says 10MB. A 12MB file gets accepted by the UI
  and rejected by the server.
- Chunks with no act or scene label at all (front matter, dramatis personae)
  must not become pickable scenes.
- `scene_partner_scripts` (free 1 / plus 5) and `scene_partner_trial_only` still
  exist in `pricing_tiers.features`. Decide whether the scene meter replaces the
  script count or sits beside it before shipping either.

## Order

1. pypdf for the structure pass, and scan writes `ExtractionCache`. This alone
   makes Hamlet uploadable and stops the double parse. Ships on its own.
2. Track page offsets through extraction.
3. `/scan` returns the merged, AI-labelled map instead of `num_sections: N`.
4. The picker replaces the quick/full dialog in `UploadProvider`.
5. Extraction takes a scene list; only those pages hit pdfplumber.
6. The scene meter, and the Free/Solo/Plus/Pro numbers above.

---

# Shipped, and what is left — 2026-09-04

## Shipped

**`9ec6add1`** — the outage, and the map.

The cause was not memory. `scan_script` was `async def` and parsed inline, which
blocks the event loop: the worker serves nothing at all, health checks included,
until it finishes. Render concluded the service was dead and restarted it, and
the restart killed the upload. Confirmed in the logs, then confirmed fixed —
8 health checks served through a real scan, no restart, where the failing run
served zero.

Also: pypdf for the map (15.6s → 0.4s), `app/services/scene_map.py`, and
`/api/scripts/scan` now returns the full scene list. 26 tests.

**`96b54b1f`** — the fifth blocking parse, and Cancel.

The same fix had to be applied to `upload-background`, which read the PDF inline
before handing off. It took the API down a second time, the same way, an hour
later. Cancel on that path was decoration: the button is wired to
`abortControllerRef` and only `startExtraction` ever set it, so on precisely the
scripts long enough to want cancelling, it did nothing. There is now a server-side
registry and `POST /api/scripts/{id}/cancel-extraction`, which stops the parse,
deletes the row, and gives back the upload count.

**Lesson worth keeping:** four of five blocking handlers is not a fix. When the
defect is a *shape* — blocking work inside `async def` — the audit has to be
exhaustive or the bug just moves to whichever endpoint you missed.

## What is left

### 1. The picker (the next real build)

`/scan` returns the map; nothing displays it. `UploadProvider` still shows the
old quick/full dialog, and `ScanResult` in that file has no `scenes` field.

The screen replaces `showModeChoice`. Grouped by act, one row per scene: label,
title, cast, line count, page range. Ticked rows get built. Underneath, what the
tier allows.

States that decide whether this is any good:

- **the ordinary case** — Hamlet, 20 rows under 5 act headings
- **one scene** — a side. No picker at all, just extract it. The picker must not
  appear for the thing most people upload.
- **unlabelled** — no acts, no scene numbers, only titles the model gave. Rows
  need to stay distinguishable without an `Act 2 · Scene 1` to lean on.
- **out of quota** — Free ticks a second scene. This is the paywall, and it has
  to read as an offer rather than a wall.
- **the model found nothing extra** — regex map only, no titles. Rows show
  `Act 1 · Scene 2` and a cast list. Must still be usable, because this is what
  every well-marked play gets.

### 2. Extraction by scene list

`upload-background` takes the whole file and reads everything. It should take the
picked `char_start`/`char_end` ranges and read only those.

`page_start`/`page_end` already ride on every scene in the scan response and are
currently unused. They are the point: pdfplumber over twelve pages of Hamlet
instead of a hundred and seventy.

Needs the scan's extracted text cached by file hash so the picker's choice does
not re-read the PDF — `ExtractionCache` exists and scan still does not write it.

### 3. The meter

Free 1 · Solo 10 · Plus 40 · Pro unlimited, monthly, counted in scenes extracted.

**Open, and it blocks this step:** `pricing_tiers.features` still carries
`scene_partner_scripts` (free 1 / plus 5) and `scene_partner_trial_only`. Does
the scene meter replace the script count or sit beside it? Two meters on one
action is how a paywall becomes unexplainable.

Cancel already returns the upload count. The scene meter will need the same, or
cancelling a Hamlet costs a month of quota for nothing.

### Not yet verified

The map has never been checked against a real play PDF. Every measurement here is
from a generated file with clean headers. Real Hamlet has front matter, line
numbers and footnotes, and the honest test is whether it comes back with twenty
scenes or three.
