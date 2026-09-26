# Guided first scene

Date: 2026-09-26. Status: approved in conversation, ready for a plan.

## Why

ScenePartner loses people on the hub, before they ever hear a partner.

In the 60 days to 2026-09-26: 783 signups, 482 searched, 458 opened a
monologue, 37 started a scene rehearsal, 30 delivered a line, 9 finished a
scene, 5 rehearsed again on a later day. In the last 30 days 513 users opened
`/practice` and about 25 opened a scene. Every rehearsal in the window ran on
one of the two sample scripts; five people uploaded a script. Of 18 Stripe
payers ever, 5 have rehearsed a scene.

The hub today is a shelf with two samples and an upload control. Someone who
arrived from a "comedic monologue" search has no two-hander to hand and no
reason to pick The Breakup. The old first-run gate was built for scenes and
was repointed at monologues in the pivot; it also fires only on a return
visit. The rehearse page already understands a `firstRun=1` flag on its win
screen.

The transcripts show a second loss for the few who get through: actors deliver
the partner's line instead of their own, and sessions time out after one line
when nothing is heard and nothing on screen says so.

## What

A never-rehearsed actor opening `/practice` gets a scene started at them, not a
description of the product. One tap answers. Six lines, under a minute, on the
existing rehearse engine in a guided mode. The win screen offers one thing:
bring your own sides.

## The actor's path

### 1. The invitation (the hub, never-rehearsed)

Condition: the signed-in user has `has_ever_rehearsed === false` and owns no
scripts. Rendered in place of the library. No redirect anywhere, ever.

The page opens on the partner's first line, already said to you:

```
RILEY
You're late.
```

Cue name in the Courier direction face, the line large in the theatre serif.
Under it one line of house text: "I'll read Riley. You're Alex. Six lines,
under a minute." One control: **Answer**. Below, a small text link: "Bring in
a script instead", which opens the existing upload control.

Not shown on this state: the shelf, the "On the shelf" heading, the
walkthrough auto-open, the ScenePartner tour. The demo user is excluded
(existing `isDemoUser` rule).

Once any rehearsal session exists for the user, or they own a script, the hub
renders the library as it does today.

### 2. The run (rehearse page, guided mode)

Answer calls `POST /api/scenes/rehearse/start-guided`, then navigates to
`/scenes/<guided scene id>/rehearse?session=<id>&guided=1`.

Guided mode differences, all keyed on `guided=1`:

- Casting is pre-decided (ALEX). No countdown. The Begin gate, when the mic
  probe needs it, shows the coaching intro instead of "Ready to rehearse":
  "I'll read Riley. When the dot turns green, say your line." Button: Begin.
- The whole six lines stay on stage (the stage already renders every line).
  Your cue name ALEX carries the theatre accent; Riley's lines sit in the
  muted ink. Your next line is visible while Riley speaks.
- One line of house text above the script, driven by a small pure state
  machine (`lib/guided-coach.ts`):
  - `listen` → "Listen." (partner audio playing)
  - `your_line` → "Your line." (mic open, nothing heard yet)
  - `heard_first` → "That's it. Keep going." (shown once, after the first
    delivered actor line, then `quiet`)
  - `quiet` → nothing
  - `nudge` → "Say it again, or tap it." (mic open, no voice for 6 s; the
    line becomes tappable)
  - `tap_mode` → "Tap each line when you've said it." (mic blocked or
    recognition threw; the run continues with the existing tap-to-advance)
- No score, no percentage, no strengths card.
- The delivery telemetry (`scene_line_delivered`) carries `guided: true`.

Verified existing mechanics the design relies on, not new work: the mic opens
only when nothing is speaking (auto-listen gates on `!anySpeaking`), tap-to-
advance exists and fires `rehearsal_input_mode`, the win screen has a
`firstRun` variant.

### 3. The win

Headline "That was your first scene." Body "That was mine. Now yours." The
upload control inline (PDF or text file; the client has no paste control), and nothing else. The trial offer card
that normally takes this slot yields when `guided=1`. Upload lands on
`/practice?script=<id>` with the new script open, as it does today.

## The script

Title "Late". RILEY (partner) and ALEX (actor). Seeded as a system script.

```
RILEY   You're late.
ALEX    I know. I'm sorry.
RILEY   I waited an hour. I almost left.
ALEX    But you didn't.
RILEY   No. I didn't. Don't make me regret it.
ALEX    I won't. Sit down. I'll tell you everything.
```

ALEX's lines are short and plain so recognition succeeds on take one; the last
line turns, so there is something to play.

## Plumbing

- `user_scripts.is_guided BOOLEAN NOT NULL DEFAULT false`. Additive. Applied
  to Supabase (`ALTER TABLE user_scripts ADD COLUMN IF NOT EXISTS ...`) in the
  same step as the commit, per the deploy-ordering rule.
- The seed lives in `backend/scripts/seed_sample_script.py` alongside The
  Breakup and Hamlet: `is_sample=True, is_guided=True, user_id=NULL`.
  Idempotent on title.
- Every listing that shows sample scripts excludes `is_guided`: the hub's
  scripts list, the community shared list, and the "demo speaks first" rung
  in `scenes.py`.
- `POST /api/scenes/rehearse/start-guided`: no body. Finds the guided scene,
  creates a `RehearsalSession` cast as ALEX, does not go through
  `require_scene_partner`, does not touch the tier check, does not increment
  `scene_partner_sessions`. Burst limiter still applies. Returns the same
  session response as `/rehearse/start`. 404 if no guided script is seeded.
  Repeat calls are allowed: a run that failed on the mic must be retryable,
  and a six-line scene is not worth metering. The rehearse page's in-run
  restart routes to this endpoint when `guided=1`, never to `/rehearse/start`
  (which would charge the meter and run the tier check).
- `has_ever_rehearsed` is computed from `UsageMetrics.scene_partner_sessions`,
  which the guided endpoint does not increment. The endpoint therefore also
  sets a durable marker so the hub stops inviting: it reuses the existing
  `users.has_seen_first_rehearsal` flag (set true on guided start). The hub
  condition becomes: `has_ever_rehearsed === false && has_seen_first_rehearsal
  !== true && no own scripts`. Side effect, intended: the monologue first-run
  gate reads the same flag, so an actor who has had the guided scene is not
  later yanked into a monologue first run.
- The rehearse page's `deliver` and `abandon` endpoints work unchanged; the
  session is real.

## Events

Client events, added to `lib/events.ts` and the server allowlist:

- `guided_scene_shown` — the invitation rendered. `{}`
- `guided_scene_started` — Answer tapped and the session created. `{platform}`
- `guided_scene_finished` — the win screen rendered.
  `{lines_heard, tap_mode, take_ms_total}`
- `scene_line_delivered` gains `guided: true` on guided runs.

Line one to line three survival for guided runs is then one query on
`scene_line_delivered where properties->>'guided' = 'true'`.

## Tests

- `lib/guided-coach.test.ts`: the state machine. Every transition above,
  including "heard_first shows once" and "nudge does not fire while partner
  audio plays".
- `lib/firstRunGate` style pure rule for the invitation:
  `shouldInvite(user, scripts)` with the demo-user, has-script, has-rehearsed
  and has-seen cases.
- Backend pytest: the endpoint creates a session without incrementing the
  meter; a free user past their monthly cap can still start it; a second call
  by the same user succeeds and still does not increment; it sets
  `has_seen_first_rehearsal`; `is_guided` scripts are absent from the three
  listings; the seed is idempotent.
- Manual: one guided run on my laptop through the speaker trick, one on
  Canberk's phone. The `scene_line_delivered` rows for the run are the
  acceptance record.

## Out of scope

Public rehearsable sides without an account. Scene work notes (objective,
obstacle, stakes). Refilling the shelf. Mobile capture fixes beyond the tap
fallback already present. Each is its own spec.
