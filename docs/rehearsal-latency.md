# Measuring the handover

How long it takes from the actor's last word to the partner's first sound, how
that number is recorded in production, and how to check it in the lab. The
code this describes: `lib/rehearsal/timeline.ts` (the marks),
`lib/rehearsal/engine.ts` (what is recorded and when), `hooks/useRehearsal.ts`
(what the browser exposes), `backend/app/models/rehearsal.py` (the table).

## 1. The two numbers

Every `actor_line_read` event carries two measurements in its payload, beside
`ended_by`, `matched` and `score`.

### `handover_ms`

`Timeline.handoverMs()`: the `partner_scheduled` mark minus the `delta` mark,
in milliseconds, rounded. Both marks are on the audio clock
(`AudioContext.currentTime`, seconds), never on `performance.now()`.

- `delta` is set on every transcript delta that reaches the engine while the
  actor's mic is open, so it always holds the **last** delta of the turn.
  Deltas that arrive while the partner is sounding, or while paused, are
  dropped and set nothing.
- `partner_scheduled` is set once the next partner beat has taken its first
  line, i.e. `player.play()` returned true. It is set in the same synchronous
  call as the handover decision.

So `handover_ms` is **our** half of the budget only. It starts when the delta
arrives, not when the actor's word ends. The vendor floor (word end, Opus
frames, OpenAI, the delta that contains the last word, typically 150 to 300ms
with `delay: 'low'`) is NOT in this number. The spec's 150ms budget is measured
from delta arrival for exactly this reason.

What it holds per `ended_by`:

| `ended_by` | What `handover_ms` measures |
|---|---|
| `last_word` | The software path: the delta that completed the line arrived, `shouldHandOver` said yes, the mic closed, the next beat was scheduled, all in one call. Under a fake clock this is exactly `0` (the engine test asserts it). On a real `AudioContext` it is `0` or a few ms, because `currentTime` only advances by render quanta (128 samples, about 2.7ms at 48k). Anything above a quantum or two is real software delay. |
| `quiet` | The gap from the last delta to the quiet timer firing (`QUIET_AFTER_WORDS_MS`, 1400ms in `hooks/useLiveTranscription.ts`) plus the scheduling. This is a wait by design, not a latency fault. Do not mix it into the `last_word` percentiles. |
| `skipped` | The gap from the last delta of the turn to the skip tap. Meaningless as a latency; exclude it. |

When it is `null` (the engine comment: "nothing was measured"):

- No delta arrived at all on that turn (a skip before a word was heard), so
  there is no `delta` mark.
- The next partner line was cold (no decoded duration yet) or `play()`
  refused, so `partner_scheduled` was never set. The partner plays later from
  `audioReady`, and that start is not measured.
- There was no next turn (the actor's line was the last of the scene), so
  nothing was scheduled.

The backend already filters on this: `services/rehearsal/journal.py` takes only
numeric `handover_ms` values into `median_handover_ms`.

### `output_latency_ms`

`clock.outputLatency()` at the moment the event is written, rounded to ms. In
the browser that is `AudioContext.outputLatency`, falling back to
`baseLatency` on Safari (which reports `outputLatency` as 0), and `0` if
neither exists. It is the device's own delay between the Web Audio graph and
the speaker, which software cannot shorten. Wired output is typically 10 to
40ms; Bluetooth adds 150 to 250ms. It is logged so a slow report can be
explained, not so it can be fixed.

It is never `null`. `0` means the browser gave no figure, not a zero-latency
device.

## 2. The production query

The journal lands in `rehearsal_events`. Columns that matter here:
`run_id`, `seq`, `type` (the event type), `line_index`, `at_ms` (audio-clock
ms since the run began), `payload` (JSONB), `received_at`. There is no `event_type` column and no
`created_at`.

p50 and p95 of the software path, last 7 days, with `quiet` reported
separately and never mixed in:

```sql
SELECT payload->>'ended_by'                                                   AS ended_by,
       count(*)                                                               AS lines,
       percentile_cont(0.5)  WITHIN GROUP (ORDER BY (payload->>'handover_ms')::int) AS p50_ms,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY (payload->>'handover_ms')::int) AS p95_ms
FROM rehearsal_events
WHERE type = 'actor_line_read'
  AND received_at > now() - interval '7 days'
  AND payload->>'ended_by' IN ('last_word', 'quiet')
  AND jsonb_typeof(payload->'handover_ms') = 'number'
GROUP BY 1
ORDER BY 1;
```

The `jsonb_typeof` guard drops the `null` rows before the cast. Budget:
`last_word` p95 under 50ms on wired output. For `quiet` the p50 should sit at
roughly `QUIET_AFTER_WORDS_MS`; a drift there means the quiet timer changed,
not the handover.

Rows where the device, not the code, is the problem (Bluetooth or similar):

```sql
SELECT count(*)                       AS slow_output_lines,
       count(DISTINCT run_id)         AS runs
FROM rehearsal_events
WHERE type = 'actor_line_read'
  AND received_at > now() - interval '7 days'
  AND (payload->>'output_latency_ms')::int > 100;
```

Read the two together: a bad `last_word` p95 with few slow-output rows is a
software regression; a bad one that disappears after excluding
`output_latency_ms > 100` runs is headphones.

Rows that measured nothing, as a sanity figure (should be a small share):

```sql
SELECT count(*) FILTER (WHERE jsonb_typeof(payload->'handover_ms') = 'null') AS unmeasured,
       count(*)                                                            AS total
FROM rehearsal_events
WHERE type = 'actor_line_read' AND received_at > now() - interval '7 days';
```

## 3. The lab (the vendor floor)

Production measures from delta arrival. The lab is where the other half, word
end to delta, gets a number, and where the long-line check runs.

### The take

1. Record "Out. Twenty-four hours." as `take.wav`, 48k mono, 16-bit PCM
   (Chrome's fake capture reads WAV only). Open it in Audacity and note the
   true end of "hours": `END_S`, seconds from the start of the file.
2. Put at least 2 seconds of silence before the line. Chrome starts playing
   the file the moment the track is acquired and loops it, so the line will
   come round again; the silence keeps the loops apart.
3. Record a second take whose first actor line is about 200 words, with the
   same lead-in. Note its `END_S` too.

### Chrome

```
--use-fake-device-for-media-stream \
--use-file-for-fake-audio-capture=/absolute/path/take.wav \
--use-fake-ui-for-media-stream
```

Run a non-production build (`next dev`); the engine handle below is only
attached when `NODE_ENV !== 'production'`.

### What the browser gives you

`window.__rehearsal` is the `Engine` instance, set in `useRehearsal` when the
run is prepared and deleted on unmount. `window.__rehearsal.snapshot()` returns
`state`, `actor`, `turnIndex`, `lineIndex`, `read`, `sounding` and `heard`.

The `Timeline` is **not** in the snapshot, and reading it off the engine does
not work for this purpose: the engine replaces its `timeline` with a fresh one
the instant the next turn is entered, and the one that carried the handover is
held only by the closure that writes the journal event. By the time you look,
`__rehearsal.timeline` belongs to the partner's turn. The draft's
`timeline.get('partner_scheduled')` step was written against an API that is
not there.

Read the marks from the journal instead. Each `actor_line_read` event is
flushed on a microtask to `POST /api/rehearsal/runs/<run_id>/events` (body
`{ events: [...] }`, each with `seq`, `type`, `line_index`, `at_ms`,
`payload`). In DevTools, Network tab, filter on `events`, open the request
body and find the `actor_line_read` entry for the line. `payload.handover_ms`
and `payload.output_latency_ms` are there; `at_ms` is when the event was
written, on the audio clock, relative to the `started` event.

For the absolute word-end figure you also need to know where in the looping
file the run began. The file starts the moment the track is acquired (the mic
check, before Begin), so log that moment. In the console, before the mic check
runs:

```js
const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
navigator.mediaDevices.getUserMedia = async (c) => { const s = await gum(c); console.log('T0', performance.now()); return s; };
```

Tap Begin and note `performance.now()` as `T1` (a `console.log` from the Begin
handler, or just type it straight after). The run clock starts at Begin, so:

```
pos      = ((T1 - T0) / 1000) mod file_length_s      // where the loop was at Begin
word_end = (END_S - pos) * 1000                      // ms after Begin; wait a loop if negative
```

The partner line after the actor's line gets a `partner_line_played` event
whose `at_ms` is its scheduled start, in ms after Begin. Word end to partner
start is then `partner_line_played.at_ms - word_end`. Subtract the
`handover_ms` from the matching `actor_line_read` and what is left is the
vendor floor for that take.

That anchor is the soft part of the lab measurement (a tap's worth of jitter
either side), which is why the equality check below, not this number, is the
one asserted.

### The check that matters

Run the 2-word take and the 200-word take through the same scene setup and
compare `payload.handover_ms` of the two `actor_line_read` events. Both must be
`last_word` handovers. They must agree within 5ms. Nothing is generated at play
time, and the whole transcript is tokenised and aligned per delta inside the
5ms budget, so line length must not show up in the number. If it does, the
alignment is doing more than one pass per delta; see the spec's note on
aligning incrementally from the last cursor.

Then compare `output_latency_ms` between a wired run and a Bluetooth run on the
same machine: the difference should be the whole story of why the Bluetooth run
feels slower, with `handover_ms` unchanged.

## 4. The latency contract

The four moments and their budgets, from the spec, unchanged.

| Moment | Budget |
|---|---|
| Actor's last word (delta arrival) to partner's first sound | 150ms, with ours at about 20 to 50ms wired: data channel to engine 1ms, tokenise and align 5ms, `shouldHandOver` 0, `source.start` 1ms, render quantum 3ms, `outputLatency` 10 to 40ms |
| Partner finishes to mic live | 0ms. Mic-on is scheduled on the audio clock at `start + duration`, not on `onended`; deltas before that moment are dropped |
| Scene open to first line playable | under 1.5s. One GET for scene, lines and a URL per partner line; then in parallel the STT token and SDP exchange (500 to 900ms, the long pole), mic permission, fetch and decode of line 1 |
| Word highlight after it is spoken | under 250ms: vendor floor plus about 20ms ours |

Two more lines the contract holds: back-to-back partner lines are scheduled
sample-accurately at the first's end plus one breath (`BREATH_S`, 0.3s), and a
long line starts no later than a short one (the lab check above).
