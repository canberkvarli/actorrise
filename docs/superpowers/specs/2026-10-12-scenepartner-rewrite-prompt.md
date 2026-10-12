# ScenePartner v2 — rewrite brief

A prompt to hand to a fresh model with no context on this codebase.
Paste everything below the line.

---

You are rebuilding **ScenePartner**, the rehearsal feature of ActorRise
(actorrise.com), from scratch — backend and frontend. Design it before you
write it. Ask me questions one at a time before proposing architecture.

## What it is

An actor opens a two-person scene, picks their character, and runs the scene
out loud. The app speaks the other character's lines and listens to the
actor's. It should feel like running lines with a competent scene partner in a
room: no buttons between lines, no waiting, no hesitation about whose turn it
is.

## The bar

scenepartner.ai, and the line-learning apps on the iOS App Store. We must be
at least as good as those, and the thing we beat them on is **smoothness**.
Nothing else is the differentiator. A missed beat between lines is the only
bug that matters.

## In scope / out of scope

**In scope:** the rehearsal loop end to end — session lifecycle, speech in,
speech out, line matching, the screen, progress, the win state.

**Out of scope: the script extractor.** `backend/app/services/extraction/*`,
`app/services/scene_map.py`, `app/services/script_structure.py` and the upload
half of `app/api/scripts.py` turn a PDF into scenes and lines. That is a
different subsystem with different problems and it is NOT being rewritten
here. Do not touch it.

But you depend on its output, so **define the contract explicitly** and write
it down: given a `scene_id`, you get an ordered list of lines, each with a
character name, text, and an optional stage direction. Everything rehearsal
needs must come from that shape. If you need a field the extractor does not
produce, say so as a separate request rather than reaching into it.

## Stack (fixed)

- Frontend: Next.js App Router, React, TypeScript, Tailwind v4, framer-motion, vitest
- Backend: FastAPI, SQLAlchemy, Postgres (Supabase), deployed on Render
- Object storage available for audio (Supabase storage or Vercel Blob)

## The latency contract

This is the specification. Everything else serves it.

| Moment | Budget |
|---|---|
| Actor says the last word of their line → partner's first syllable | **< 150ms** |
| Partner finishes → mic live for the actor | **0ms** (already open) |
| Scene open → first line playable | < 1.5s |
| Word highlight behind the actor's voice | < 250ms |

**The partner must never be synthesised while the actor waits.** The entire
script is known the moment the session starts. Synthesise it ahead of time.
By the time a line is needed its audio is already a decoded buffer in memory.
This single decision is what makes the product feel alive, and it is the
opposite of what the current build does.

Concretely:
- On session start, kick off synthesis of every partner line, in order.
- Line 1 blocks the Begin button; everything after it streams in behind the
  actor. By the time they finish speaking line 1, lines 2–5 are already there.
- **Cache by (line text + voice), permanently.** Library scenes are
  public-domain and shared by every user, so the second actor to run a scene
  pays nothing and waits for nothing. Only user-uploaded scripts ever pay.
- A long line is not slower to start than a short one, because nothing is
  generated at play time. Verify this: a 200-word speech and a 2-word speech
  must begin indistinguishably fast.

## Models — current, and cheap enough

Money is tight. The architecture above is what makes quality affordable: the
expensive vendor is only ever hit once per unique line, never in the hot path.
Verify current prices before committing; these are as of October 2026.

**Speech out (TTS).** Because synthesis is pre-computed and cached, you are
buying quality per line, not latency. You do NOT need the sub-100ms TTFB
vendors (Cartesia Sonic 3.5 ~40ms, Inworld TTS-2 Flash <25ms, ElevenLabs Flash
~75ms) — paying their premium for a latency you have already designed away is
the mistake to avoid. Pick on voice quality and price instead. `gpt-4o-mini-tts`
is the cheap baseline and is already wired up; ElevenLabs is better acting and
worth it per unique line given the cache. Benchmark both on the same speech
and let me hear them.

One exception: a user-uploaded script on its very first run has a cold cache.
Prefetch line N+1 while line N plays and this never shows. Do not add a second
vendor for this case.

**Speech in (STT).** Must be streaming, word-level, with keyword priming — we
know what the actor is about to say and telling the transcriber is where most
of the accuracy comes from. Current path is OpenAI `gpt-live-transcribe` over
WebRTC and it works; its weakness is price, reported around $0.017/min of
audio. Mic is only live on the actor's turn, so a 10-minute scene bills ~5
minutes, ~$0.09 a session. If that hurts at volume, the alternatives with
streaming + keyword boosting are Deepgram Nova-3 (~$0.0048–0.0077/min) and
AssemblyAI Universal-Streaming (~$0.0025/min), both far cheaper. Build the
transcriber behind an interface so this is a one-file swap, and tell me the
measured accuracy difference on real takes before we switch.

**No LLM in the rehearsal loop at all.** The partner's lines are in the
script; nothing needs generating. The current build calls a LangGraph agent
per line to write a feedback sentence no screen displays. Delete that idea.

## What exists today, and why it is being thrown away

### Backend

`backend/app/api/scenes.py` is **1,725 lines** and is the whole feature:
library browsing, favourites, uploads, the rehearsal lifecycle, stats and AI
feedback in one router. Endpoints:

```
GET  /scenes/                         GET  /scenes/{id}
POST /scenes/{id}/favorite            GET  /scenes/favorites/my
GET  /scenes/{id}/resumable-session
POST /scenes/rehearse/start           POST /scenes/rehearse/start-guided
POST /scenes/rehearse/deliver         POST /scenes/rehearse/{sid}/abandon
GET  /scenes/rehearse/{sid}/feedback  GET  /scenes/rehearse/stats
GET  /scenes/rehearse/sessions        GET  /scenes/rehearse/sessions/{sid}
POST /scenes/upload
```

Faults to design away, not port:

1. **`POST /rehearse/deliver` is called once per line.** ~240 lines of
   endpoint: a DB read, a write and a commit sitting between the actor
   finishing a line and the partner starting the next. A network round trip in
   the middle of a performance. Nothing it computes needs to be synchronous.
   The rehearsal should run entirely client-side and report afterwards.
2. **A LangGraph agent call in that endpoint** producing feedback no screen
   shows, with a hardcoded string fallback.
3. **TTS synthesised on demand, per partner line.** The reason the partner
   hesitates. See the latency contract.
4. **`RehearsalSession` is a wide flat row with hand-maintained counters**
   (`total_lines_delivered`, `lines_retried`, `completion_percentage`,
   `current_line_index`, `status`, `failure_reason`). Keeping them in sync by
   hand already produced a bug where no session ever counted as completed.
   Prefer an append-only event journal with derived reads.
5. **`Scene` has ~20 mostly-null metadata columns** (`primary_emotions`,
   `relationship_dynamic`, `tone`, `context_before`, `context_after`,
   `difficulty_level`, `quality_score`, `average_rating`…). Keep only what a
   screen renders.
6. **Three transports, no shared clock:** REST for deliver, REST for TTS,
   WebRTC for transcription. Nothing correlates them, so word highlighting
   drifts away from the audio.

### Frontend

`app/(platform)/scenes/[id]/rehearse/page.tsx` is **3,654 lines** with 43
`useState` hooks in one component and 30+ imports. It is unmaintainable and is
why bugs here take days.

### What is good — keep the reasoning, port it faithfully

Read these three files first:

- `hooks/useLiveTranscription.ts` — one transcription session open for the
  whole scene, mic track enabled only on the actor's turn, transcript deltas
  over a data channel. Per-line setup cost is zero. Keep this exactly.
- `lib/live-read.ts` — hand over when the **last word of the line is heard**
  (no wait at all), or when the transcript stops growing for 1400ms and
  something was heard. "Stopped" is decided off transcript progress, never
  microphone level. Seven earlier timers guessed at this and all were deleted;
  do not reintroduce one.
- `lib/word-match.ts` — forward-only fuzzy alignment of transcript to script,
  so a skipped or fluffed middle does not strand the actor.

## Smoothness, specified

"Smooth as fuck no matter how long or short the line is" means all of:

- **Long speeches:** the view keeps the current word in place while text moves
  under it. No jump when a line wraps. An actor who paraphrases the middle and
  lands the last line still hands over on time (forward-only alignment).
- **Short lines:** a one- or two-word line ("Yes." / "Get out.") hands over on
  that word with no perceptible gap, and cannot be triggered by the partner's
  audio bleeding into the mic — the mic is disabled during partner playback,
  which is also what halves the STT bill.
- **Back-to-back partner lines** play as one continuous beat, not two clips
  with a seam.
- **Overlap at the handover** is allowed and desirable: an actor who starts
  early is not cut off, and the partner may come in on the actor's last
  syllable the way a real partner does.
- **Nothing on screen moves that is not the script.** No spinners, no
  "Listening…", no state chips appearing and disappearing mid-scene.

## Hard constraints

- **No fallbacks.** No Web Speech API, no browser `SpeechRecognition`, no
  "degrade to a batch transcript". If the live path breaks it says so and we
  fix it. Non-negotiable, and violated before.
- **Very few indicators.** No confidence meters, no colour-coded scoring.
  Meaningful colours (green/blue/orange) confuse actors. Earn every pixel.
- **Typography:** typewriter/mono is for **script text only**. All chrome,
  headings and titles are sans. The current screen is mono throughout and
  reads as a ransom note.
- **Mobile is first-class.** 75% of rehearsal sessions die at roughly the
  first line, and mobile reaches a spoken line at 30% the rate of desktop.
  It must work one-handed on a phone at reading distance.
- Light and dark both, designed separately — not one palette inverted.
- `lib/` logic stays pure and unit-tested without a browser or a microphone,
  as `live-read.test.ts` is today.

## Deliverables, in order

1. Questions for me — one at a time, until you understand the product.
2. A latency budget showing where every millisecond between the actor's last
   word and the partner's first goes, and what you will measure it with.
3. A data model and API surface, with the reasoning for each boundary, and an
   explicit statement of what crosses the wire between one line and the next.
   (Correct answer: nothing.)
4. A frontend component tree with a stated line budget per file.
5. Only then, code, behind tests.

Do not start writing code until I approve the design.
