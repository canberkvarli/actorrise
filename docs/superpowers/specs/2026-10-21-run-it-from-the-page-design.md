# Run it from the page: findings and three designs

**REVISED the same day (Canberk, after using it): "i dont like the listen first
thing, i dont want to listen".** The read-aloud and the "your turn" screen are
gone, with their route, events and rate limits. Run it now drops the actor
straight onto the first line with the lines showing (`/work?go=run`; `go=hear`
still works). He also pasted a piece that the run had cut into one tap per
two-word sentence; sentences are now grouped into thoughts of about 8 to 24
words (`lib/runLines.ts`). The first take, the phone tap default, the entry
events and the font fix stay. Everything below about "Hear it" is history.

Status: Design B BUILT 2026-10-21. Canberk: "idk your answers just do it.
default whatever." Defaults taken for the four open decisions:

1. "Hear it" uses the partner-line TTS cache (OpenAI, one synthesis per piece
   line per voice, then cached), with the browser's own voice as a per-line
   fallback when a clip is late or failed.
2. Walled pieces are unchanged: no Run it behind the free-read wall.
3. A first take spends one of the 3 free runs. Metering is unchanged: one
   `/api/monologue-work/start` per run, before any audio is asked for.
4. Android is folded in: phones (iOS and Android) default to tap-to-advance,
   with "Use my voice" in the dock. No deeper Android speech fix.

What shipped:
- `OneSheet` "Run it 0:52" under the billing on lg+; the phone bar and the
  margin button say "Run it". All go to `/monologue/<id>/work?go=hear` through
  `lib/runEntry.ts`, which unlocks audio inside the tap.
- `/work?go=hear`: read the first take aloud (`useHearIt`), "(your turn.)",
  say it back with the lines hidden; tap mode is say, tap to check, tap to go
  on. The first take is `lib/firstTake.ts` (6 lines or 70 words, never stopping
  2 or fewer lines from the end). "Keep going" reads then runs the rest.
- `POST /api/monologue-work/audio`: only stretches of the piece itself are
  synthesised (`services/monologue_audio.py`).
- Events: `run_entry_shown`, `run_entry_tapped`, `run_start_screen_shown`,
  `run_hear_finished`; `monologue_work_finished` gains `take: first|full`.
  `rehearsal_input_mode.reason` gains `phone_default`.
- Fixed on the way: run lines were rendering in Montserrat because
  `--font-typewriter` sits in `@theme inline` and never exists at runtime.

## What the numbers say (prod, read-only, last 14 days, real users)

Funnel by the platform of the first run. "Came back" means any activity a person
makes (a search, an open, a client event) on a later calendar day; emails the
server sent do not count.

| platform | opened | started a run | finished a run | came back another day |
|---|---|---|---|---|
| desktop | 21 | 21 | 9 | 4 |
| iPhone/iPad | 13 | 13 | 4 | 5 |
| Android | 7 | 7 | 0 | 1 |
| never started | 78 | 0 | 0 | 11 |
| **all** | **119** | **41 (34%)** | **13** | **21** |

Per run, not per person: 65 starts. 9 of 33 desktop runs finished, 6 of 20 iOS
runs, 0 of 12 Android runs.

Where the run breaks:

- **iOS speech mostly does not work.** The live recogniser moved a line by voice
  in 3 iOS runs (2 people) against 15 desktop runs. On 12 iOS starts it errored
  and the run fell back to tap-to-advance. The iOS finishes come from tapping.
- **Android finishes zero.** 12 starts, all in voice mode, none finished, none
  logged a voice-advanced line. That is a breakage, not a motivation problem,
  and it has never been looked at.
- **Shorter pieces finish more.** Finished runs had a median of 114 words,
  unfinished runs 137.
- **The read wall hides the entry.** 29 of the 90 free web openers hit the free
  read wall on the piece page. A walled page renders neither the run bar nor the
  margin button, so a third of free openers are never offered a run at all.
- **Runs happen on day one.** 35 of 41 first runs were on the signup day, and 33
  of 41 came within 10 minutes of finishing onboarding.
- **What GA4 cannot say.** `progress_pct` and `mode` are not registered as GA4
  custom dimensions, so line-by-line drop-off cannot be split monologue from
  scene. Nothing records the start screen ("Begin") being seen, so the loss
  between tapping Rehearse and the run starting is invisible today.

## Where the entry point is today (from code; see "Not verified")

- **Phone:** a fixed "Rehearse this" bar sits at the foot of the piece page
  (`components/monologue/v2/RunBar.tsx`). 1 tap to `/work`, then the "(places.)"
  start screen asks for "Begin". iOS Safari always shows that screen because it
  cannot answer the microphone permission query. **2 taps.**
- **Desktop:** "Rehearse this" lives in the margin rail. On Canberk's account at
  1291x723 it sits at y=785, below the fold under the dark one-sheet. Scroll + 1
  tap, then Begin only if the mic was never granted. **2 to 3 actions.**
- **Search result row:** a "Rehearse" link on every result goes straight to
  `/work`. Same Begin screen after.
- **Hear it read:** does not exist on the monologue side. TTS exists for
  ScenePartner (gpt-4o-mini-tts, cached by content hash in the `partner-lines`
  bucket), so the plumbing is there to reuse.
- **Free caps on prod:** 3 monologue runs for life (`monologue_sessions = 3`),
  free reads per month enforced server-side.

## Design A: the page becomes the rehearsal

Tap "Run it" under the title and the read view turns into the run in place. The
piece is read aloud with the words lighting as they go, then the lines blur and
the actor says it back. No route change, no Begin screen, since the tap is the
gesture that unlocks the mic.

- Good: zero navigation. The fewest taps of any option.
- Cost: the largest build. The cueing loop in `MonologueCueing.tsx` (947 lines)
  has to become a hook the 719-line detail page can host, and every page mode
  (Cut, Copy, margin notes) has to step aside while a run is live.
- Risk: two places that run a monologue until `/work` is retired.

## Design B: one "Run it" above the fold, and a short first take (my pick)

1. **Entry.** One primary "Run it · 1:41" button inside the one-sheet, under the
   meta line, on every width. The phone bar stays and reads the same. Desktop no
   longer needs a scroll.
2. **Hear it, then say it.** `/work` opens on two steps, "Hear it" and "Say it
   back". Hear it plays the piece in a cached TTS voice with the lines following
   and needs no mic. Say it back hides the lines and runs the existing cueing
   loop. On iOS and Android it defaults to tap-to-advance, with voice as the
   option, because voice works for almost nobody there.
3. **A first take, not the whole piece.** A first run stops at the first beat,
   about 6 lines or 45 seconds, and ends on "That's the first take. Keep going?"
   Finishing the take counts as a finish. The full piece is one tap on.
4. **Instrument.** `run_entry_shown` and `run_entry_tapped`, both with
   `client_platform`, `monologue_id` and `surface` (sheet, phone bar, search
   row). Also `run_start_screen_shown`, so the drop between tap and start is
   finally visible.

- Good: reuses `/work`, small diffs per file, and it attacks both halves of the
  goal: the start rate and the iPhone finish rate.
- Cost: still one route hop. TTS adds a per-piece synthesis cost, paid once per
  piece and voice, then cached.

## Design C: move it, rename it, measure it

Only steps 1 and 4 of B. No hear-it, no short take.

- Good: ships in a day and isolates whether placement alone moves 34%.
- Weak: it does nothing for the finish rate. iPhone stays at 4 of 13.

## My pick

B, shipped in two commits: C's placement and events first, then hear-it and the
first take. The events from the first commit give a baseline before the second
lands.

## Decisions that are Canberk's (nothing below changes without a yes)

1. **TTS cost for "Hear it".** One OpenAI synthesis per piece per voice, cached.
   The alternative is the browser's built-in voice, which is free but robotic.
2. **The walled third.** 29 of 90 free openers never see a run because the read
   wall hides it. Should a walled piece still offer "Run it"? That changes what
   is free, so it stays as is unless you say so.
3. **Does a first take spend one of the 3 free runs?** Default: yes, metering
   unchanged.
4. **Android.** Zero finishes in 12 runs. Fold a fix into B, or keep it separate.

## Not verified

- No page was rendered as a free user. Signed out, every platform page goes to
  `/login`. The local backend would not start because it reads the production
  database and the permission check refused it. The browser plugins were held by
  another session. The phone layout above comes from the code, not a render.
- The desktop position comes from Canberk's own Pro account, which never shows
  the walls.
