# ScenePartner v2 — design

Approved by Canberk 2026-10-12 (verbally, in session; he chose not to read the
written spec). The brief it answers is `2026-10-12-scenepartner-rewrite-prompt.md`.

## What it is

An actor opens a two-person scene, picks their part, and runs the scene out
loud. The app speaks the other parts and listens to the actor. It has to feel
like running lines with a competent partner in a room: no buttons between
lines, no waiting, no doubt about whose turn it is. Smoothness is the only
differentiator; a missed beat between lines is the only bug that matters.

## Decisions (the questions, answered)

1. **Text on screen:** full text always, for v2. Each word is its own element
   with a "heard" state so first-letter and hidden modes can be display modes
   later, not a rewrite.
2. **Controls during a run:** act on the script. Tap or click a line to start
   from it; tap empty space to pause. Desktop keys: Space pause, → skip own
   line, ← take the last exchange again. Phone: the same skip and back as
   swipes on the script. One gesture hint on a person's first run, never
   again. No visible chrome during the run.
3. **Voices:** the actor picks from a short list (3 or 4) with a default per
   character. The default is cached for everyone; a switch pays the cold cost
   once, hidden by N+1 prefetch. A `gender` per character is a separate request
   to the extractor; until then defaults come from a pure function over
   character order.
4. **Delivery:** driven by stage directions only. A line with a direction is
   synthesised with it; a line without is read neutrally. The direction is part
   of the cache key. Admin can regenerate one line.
5. **Ending:** a moment, not a report (A now). The journal records the per-line
   read (which word indices matched) from day one so a word-level replay (B) is
   a screen later, nothing else.
6. **Leaving mid-run:** resume. The page offers "pick up at line N" from the
   journal. Flushes are fire-and-forget per line.
7. **Guided first scene:** a first-class run of the same loop with
   `is_guided: true` on the run so the funnel is still measured. No separate
   code path. It must be as smooth as everything else.
8. **Old data:** `RehearsalSession` kept read-only. New runs write only the
   journal. Stats, sessions list and the "finished a scene earns 14 days" rule
   are rewritten over the journal; the trial rule also honours old completed
   rows.
9. **Scope of `scenes.py`:** rehearsal endpoints are deleted from it and the
   new router owns the loop. Browse, detail, favourites, upload stay. The scene
   detail used by rehearsal gets the explicit line contract.
10. **Third characters:** the partner speaks everyone who isn't the actor, each
    with an auto-assigned voice from the same list. The actor only picks their
    own part.

## Architecture: the client runs the scene

The browser holds the whole scene: every line, every partner line as a decoded
`AudioBuffer`, the matcher, the turn state. One clock, `AudioContext.currentTime`,
times everything. The server has three jobs, none in the loop: hand out the
scene and a URL per partner line (synthesising and caching what's missing),
mint the STT token, accept journal events.

**Nothing crosses the wire between one line and the next.** The events batch
for line N is sent after the partner's audio is already scheduled, without
`await`, and the loop never reads the answer. Audio for N+1 was decoded before
N started. The STT session was opened before Begin.

Rejected: a server-driven WebSocket session (Render in the hot path of every
handover, mic audio through our server) and a client loop with a persistent
socket for audio push (a socket to keep alive through phone locks for no
latency gain).

### Hard constraints, restated

- No fallbacks. No Web Speech API, no batch transcript. If the live path breaks
  the screen says so in one line and the run stops.
- No LLM anywhere in the loop. The LangGraph feedback call is deleted.
- Nothing on screen moves that is not the script. No spinners, no "Listening…",
  no state chips, no confidence meters, no meaningful colours.
- Typewriter (Courier Prime) for script text only. Sans (Instrument) for every
  heading, title and control. Cormorant for the scene title on the Curtain.
- Mobile web is first-class: one-handed, at reading distance, in Safari.
- Light and dark designed separately.
- `lib/` logic pure and unit-tested without a browser or a mic.

## Latency budget

Two halves. The first is the vendor's and is measured. The second is ours and
must be close to nothing.

**Vendor floor (measured, reported beside the budget):** the actor's last word
ends → Opus 20ms frames → OpenAI → the delta containing the last word.
Typically 150–300ms with `delay: 'low'`, and often mid-word, since streaming
models emit before the word finishes. We go the instant the delta matches,
never after the word ends. The 150ms budget is measured **from delta arrival**.

**Ours, delta arrival → sound leaving the speaker:**

| Step | Budget |
|---|---|
| Data channel message → engine (no React between) | 1ms |
| Tokenise + align the whole transcript (200-word line, phone) | 5ms |
| `shouldHandOver` | 0 |
| `track.enabled = false`; `source.start(ctx.currentTime)` on a decoded buffer | 1ms |
| Web Audio render quantum (128 samples @ 48k) | 3ms |
| `ctx.outputLatency`, wired | 10–40ms |
| **Total, wired** | **~20–50ms** |

Bluetooth output adds 150–250ms that software cannot beat; it is logged so a
slow report can be explained. The React state update that repaints happens
after `source.start`, never before. Deltas are coalesced to one render per
animation frame. If alignment ever exceeds 5ms in the CI benchmark, align
incrementally from the last cursor and do a full pass only on a `completed`
revision.

**The other contract lines**

- *Partner finishes → mic live: 0ms.* Buffer durations are known to the
  sample, so mic-on is scheduled on the audio clock at `start + duration`, not
  on `onended`. Deltas before that moment are dropped (the `turnOpen` gate),
  which is what stops partner bleed on short lines. Keywords for the actor's
  next line are sent when the partner's line **starts**, so the session is
  primed when the mic opens.
- *Back-to-back partner lines:* the second buffer is scheduled at the first's
  end plus one breath constant (`BREATH_MS`, start at 300), sample-accurate.
- *Scene open → first line playable < 1.5s:* one GET returns scene, lines and
  a URL per partner line. Then in parallel: STT token + SDP exchange (500–900ms,
  the long pole), mic permission, fetch + decode of line 1 (100–200ms). Begin
  enables when line 1 is decoded and STT is ready. Lines decode in order behind
  the actor, N+1 always ahead.
- *Word highlight < 250ms:* vendor floor + ~20ms ours.
- *Long vs short line:* identical start, because nothing is generated at play
  time. The harness asserts it.

**Measurement**

1. *Production, every line:* the engine keeps a timeline on the audio clock
   (last delta, handover decided, partner scheduled start, partner end, mic
   open, first delta after mic). `handover_ms` and `output_latency_ms` go into
   the journal per actor line.
2. *Lab, vendor floor:* Chrome `--use-file-for-fake-audio-capture` plays an
   annotated take as the mic; the harness reports true word-end → partner-start
   and asserts a 2-word and a 200-word line have the same `handover_ms` within
   a few ms.
3. *Unit, fake clock:* mic-open equals partner end, breath constant, pre-turn
   deltas dropped, overlap allowed.

## Data model

### The line contract (read from the extractor, never changed here)

```
RehearsalLine { index: int, character: str, text: str, direction: str | null }
```

From `SceneLine.line_order`, `character_name`, `text`, `stage_direction`.
Nothing else is read. Any line whose `character` is not the actor's part is a
partner line. Pinned by a test against real rows. Separate request to the
extractor, not a dependency: optional `gender` per character.

### `partner_audio` (new): the permanent cache

| column | |
|---|---|
| `key` | sha256 of `(normalised text, direction or "", vendor, voice)` |
| `storage_path` | private Supabase bucket `partner-lines`, mp3 (the one format `decodeAudioData` takes everywhere, Safari included) |
| `duration_ms` | |
| `status` | `pending` / `ready` / `failed` |
| `created_at`, `vendor`, `voice` | |

Keyed by text, not scene, so a line shared by two scenes is one file. Library
and user-uploaded lines share the table. Synthesis is serialised per key
through `status` so two actors opening the same cold scene do not synthesise it
twice. Library scenes can be warmed by a script before launch.

### `rehearsal_run` + `rehearsal_event` (new): the journal

`rehearsal_run`: `id, user_id, scene_id, character, voices jsonb, is_guided,
started_at, client_id`.

`rehearsal_event`: `run_id, seq, type, line_index, at_ms, payload jsonb`,
unique `(run_id, seq)` so a re-sent batch is a no-op.

Types: `started`, `line_reached`, `actor_line_read` (payload: matched indices,
transcript, `handover_ms`, `output_latency_ms`, `ended_by`: last_word | quiet |
skipped), `partner_line_played`, `paused`, `resumed`, `jumped {from, to}`,
`completed`, `abandoned`.

Derived reads: furthest line = `max(line_index)` of `line_reached`; finished =
has `completed`; resumable = last run with no `completed`/`abandoned` in 24h.

### Removed

`RehearsalSession` writes, every `/scenes/rehearse/*` endpoint, the LangGraph
feedback, `start-guided`, the on-demand TTS path for scenes. Scene metadata
columns are left in place but unread by rehearsal (dropping them is a separate
clean-up).

## API (`backend/app/api/rehearsal.py`)

| | |
|---|---|
| `GET /api/rehearsal/scenes/{id}` | Scene, lines in contract shape, characters, voice list, a signed URL per partner line already cached (null if not), `resume: {run_id, line_index} \| null`. Side effect: background task synthesises every missing partner line for the default voices, in order. |
| `GET /api/rehearsal/audio/{key}` | 200 `{url, duration_ms}` when ready, 202 while pending, 404 unknown. Polled only for lines that were null at open or after a voice switch, ahead of need. |
| `POST /api/rehearsal/runs` | `{scene_id, character, voices, is_guided}` → `{run_id}`. |
| `POST /api/rehearsal/runs/{id}/events` | `{events: [...]}`, idempotent, 204. Accepts `sendBeacon` (text/plain JSON). |
| `GET /api/rehearsal/runs` | Sessions list, derived. |
| `GET /api/rehearsal/stats` | Progress numbers, derived. |
| `POST /api/admin/rehearsal/audio/regenerate` | `{key}`: delete row + file, re-synthesise. |

Kept: `POST /api/speech/live-session` (STT token).

Plus gating (free tier scene cap) happens in `POST /runs`, before the loop, as
today's rule does.

### TTS vendor

Decided by a benchmark Canberk listens to: the same four lines (one short, one
200 words, one with a direction, one with a name) through gpt-4o-mini-tts and
ElevenLabs, priced per 1k characters as of the run. The cache key carries the
vendor so both can coexist and the choice can change per line.

## Frontend

Rule: no file over 300 lines; the two kept files stay as they are. React
renders; it never decides.

### `lib/rehearsal/` — pure, vitest

| file | lines | does |
|---|---|---|
| `contract.ts` | 60 | `RehearsalLine`, `Scene`, `Run`, `Voice` types |
| `script.ts` | 120 | scene + actor's part → turn list; consecutive partner lines become one beat; actor turns carry tokenised words |
| `engine.ts` | 300 | the state machine; ports `clock`, `player`, `mic`, `journal`; inputs `delta`, `completed`, `quiet`, `partnerEnded`, `pause`, `resume`, `skip`, `back`, `jumpTo`; schedules every handover |
| `word-match.ts` | 250 | kept |
| `live-read.ts` | 127 | kept |
| `voices.ts` | 60 | the short list, default per character |
| `timeline.ts` | 60 | per-line marks → `handover_ms`, `output_latency_ms` |
| `journal.ts` | 120 | seq, batching, retry, `sendBeacon` flush; transport injected |

### `lib/rehearsal/browser/` — one browser API each

| file | lines | does |
|---|---|---|
| `audio-player.ts` | 150 | `AudioContext`: decode, schedule at a time, `outputLatency`, iOS unlock on Begin, interruption on lock → pause |
| `line-loader.ts` | 120 | fetch + decode in order, N+1 ahead, polls 202 |
| `gestures.ts` | 100 | tap, swipe, keys → engine commands |

### `hooks/`

| file | lines | does |
|---|---|---|
| `useLiveTranscription.ts` | 325 | kept; `prime(keywords)` split out of `beginTurn` |
| `useRehearsal.ts` | 200 | wires engine + adapters; one snapshot per animation frame; the only hook the screen reads |

### `app/(platform)/scenes/[id]/rehearse/`

| file | lines | does |
|---|---|---|
| `page.tsx` | 60 | fetch, hand off |
| `RehearseScreen.tsx` | 150 | layout, which panel is up, light/dark, binds gestures |
| `Curtain.tsx` | 100 | part picker, voice, Begin (ink when line 1 decoded and STT ready; soft tone until then) |
| `Stage.tsx` | 150 | the script; holds the current word in place, text moves under it |
| `Line.tsx` | 80 | one line; words as spans with a heard state |
| `PauseSheet.tsx` | 80 | Resume, Start over, Leave |
| `Ending.tsx` | 80 | the moment |
| `FirstRunHint.tsx` | 50 | the one gesture hint |

### Engine states

`loading → ready → partner(beat) ⇄ actor(line) → ended`, with `paused`
overlaying any of the two middle states. Transitions:

- `ready --begin--> partner | actor` (whichever line 0 is)
- `partner --partnerEnded--> actor | partner(next beat) | ended`
- `actor --delta/completed--> actor` (read updated); `--handOver--> partner | ended`
- `actor --quiet--> actor` with `turnEnded = true`, then `shouldHandOver`
- `* --pause--> paused` (partner audio stopped at the clock, mic off);
  `paused --resume-->` the same state from the start of the current line
- `actor --skip-->` as handover with `ended_by: skipped`
- `* --back-->` jump to the previous actor line; `* --jumpTo(i)-->` any line

Overlap: an actor who starts early is not cut off because their deltas before
mic-on are dropped but the mic opens on the clock regardless; the partner may
come in on the actor's last syllable because handover fires on the delta.

## Visual direction: the sides, and nothing else

During a run there is no app on screen. Just a page of sides, the live word
held at the actor's eye line, text moving under it like a scroll being read.

- **Light:** a rehearsal room in daylight. `--t-paper` edge to edge, `--t-ink`
  text, nothing framing it. The actor's lines are the darkest thing on the
  page; partner lines sit back a step (`--t-cue-theirs`); directions italic
  and quieter (`--t-direction`). Warmth from the paper, not from colour.
- **Dark:** the house at half-light. `--t-house` for the room; the page is a
  pool of light, warmer at the centre, one lamp on a music stand. Text keeps
  ink/paper contrast (a dark surface overrides paper **and** ink together).
  The pool is the only atmosphere and it is static.
- **The heard word:** changes weight, not colour: soft text tone → full ink,
  120ms ease. No green, no underline, no caret. The current line is marked by
  where it sits, not by a bar.
- **Type:** Courier Prime for every script word including names, 18–19px,
  1.6 leading. Instrument Sans for Curtain, pause sheet, ending. Cormorant for
  the title on the Curtain only.
- **Curtain:** title, the parts as two plain tappable lines, the voice name
  under the partner's, Begin. Begin never spins; it is drawn soft and becomes
  ink when it can be pressed.
- **Pause:** page dims a step; a short sheet rises from the bottom: Resume,
  Start over, Leave. Sans, three lines, no icons.
- **Ending:** the last line holds, the pool widens a touch over a second, then
  one sans line ("Act 2, Scene 1. Full run.") and two choices: Again, Leave.
- **Motion:** exactly two things: text scrolling under the held word
  (`--t-spring`) and the per-word weight change. Everything else is instant
  or still.

## Error handling

- STT fails to open or disconnects: the run stops, the page shows one sans
  line ("The live microphone dropped. Reload to run again.") and an
  `abandoned` event with the reason. No retry loop, no fallback.
- A partner line is still `pending` when needed (cold upload, slow vendor):
  the page holds on the previous line; no spinner. The loader polls at 250ms.
  This is the one case that can wait and it must never happen on a library
  scene after warm-up.
- Journal POST fails: events stay queued and are re-sent with the next batch;
  `sendBeacon` on `pagehide`. Nothing in the loop is affected.
- Phone lock / AudioContext interrupted: engine pauses; on `visibilitychange`
  the context is resumed and the pause sheet is up.
- Mic permission denied: Curtain says so in one line; Begin stays soft.

## Testing

- `lib/rehearsal/*.test.ts`: engine with fake ports and a fake clock (every
  transition above, timing of mic-on, breath, overlap, dropped deltas);
  script turn grouping; journal sequencing and idempotent resend; voices;
  timeline arithmetic. Existing `live-read.test.ts`, `word-match.test.ts` stay.
- Alignment benchmark: 200-word line × 200-word transcript under 5ms, asserted
  in vitest.
- Backend pytest: contract against real `SceneLine` rows; cache key stability;
  synthesis serialisation (two concurrent opens, one synthesis); events
  idempotency; derived reads (furthest, completed, resumable); trial rule over
  journal + old rows; Plus gate on `POST /runs`.
- Lab harness (manual, documented in `docs/rehearsal-latency.md`): fake mic
  file, the vendor floor, short vs long line equality.
- Real device: Canberk on prod, phone and desktop, wired and Bluetooth.

## Out of scope

The extractor (`backend/app/services/extraction/*`, `scene_map.py`,
`script_structure.py`, the upload half of `scripts.py`). Library browsing and
favourites. Hidden-text modes. Word-level replay screen. Actor audio
recording. Dropping the unused `Scene` metadata columns.
