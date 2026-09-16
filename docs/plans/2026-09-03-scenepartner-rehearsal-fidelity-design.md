# ScenePartner rehearsal fidelity — design

2026-09-03. Covers: word matching, turn handoff, highlight rendering, theme, review screen.

All of it lives in `app/(platform)/scenes/[id]/rehearse/page.tsx` (3,056 lines) unless noted.

---

## The problem, stated precisely

Three separate complaints, one shared root: **the browser `SpeechRecognition` API drives
both the live highlight and the decision to advance, and it is being trusted for a job it
is bad at.**

| Symptom | Actual cause | Line |
|---|---|---|
| "special words" never highlight | `wordsMatch` is `exact \|\| soundex`. Soundex is coarse, single-token, and mangles proper nouns. SR also splits unfamiliar words ("Anita" → "a nita"), which no single-token matcher can catch. Whisper *does* accept a `prompt` for biasing and isn't being given one. | 388 |
| "won't let me finish the word" | `score >= 0.70 \|\| (lastWordMatched && score >= 0.5)` then a 400 ms timer then `cancelTranscription`. Hit 70% of the tokens and it fires **while sound is still coming into the mic**. It is a word-count race, not an "are they done" check. | 1568 |
| gap after the AI's line | Mic arms only after TTS `onended`, plus `pauseBetweenLinesSeconds: 0.3`. "How old are you?" ends, then dead air, then arming — the front of "Twenty-four" is eaten. | 637, 1490 |

The review screen is a fourth, unrelated problem: `overallAccuracy` (1980) is
`wordMatchScore` against the STT transcript. It grades the microphone and shows the
number to the actor as if it graded the performance.

---

## 1. Word matching

New pure module `lib/word-match.ts`, replacing `wordsMatch` / `fuzzyIndexOf` /
`wordMatchScore` (362–406). Layered, cheapest test first:

1. exact normalized equality
2. contraction and possessive expansion (`I've` ↔ `I have`, `don't` ↔ `do not`)
3. numeral ↔ word (`24` ↔ `twenty-four` ↔ `twenty four`)
4. Double Metaphone, primary **and** secondary codes — materially better than soundex on
   names, which is precisely the failing case
5. Levenshtein ratio ≥ 0.8, gated to words of 4+ characters so short words don't collide

Then the part soundex structurally cannot do — **span matching**. Match a window, not a
token:

- one expected word ↔ 1–2 transcript tokens (`Anita` ↔ `a nita`)
- one transcript token ↔ 1–2 expected words (`twentyfour` ↔ `twenty four`)

Alignment stays monotonic (a cursor that only moves forward), which preserves the existing
fix for repeated common words highlighting out of order.

Separately: pass `stripStageDirections(currentUserLineText)` into `useWhisperSTT`'s
existing `prompt` option. Whisper biased toward the expected line recovers proper nouns
that SR will never get. Costs nothing — the parameter is already plumbed (`promptRef`,
`useWhisperSTT.ts:73`).

## 2. Advance rule — "hear my last word, then jump"

Canberk's constraint: jump on the last spoken word, do not sit waiting.

Extract the decision into a pure `shouldAdvance(state)` in `lib/advance-rule.ts` so it can
be unit tested without a browser. `useWhisperSTT` exposes `msSinceVoice`, read off the
`SilenceDetector` analyser loop that already runs (`lib/silence-detector.ts` tracks
`silenceStartedAt`).

**Invariant: never advance while `msSinceVoice < 180`.** That single rule is the whole
"stop cutting me off" fix.

Advance when:

| Condition | Window | Case |
|---|---|---|
| last expected word matched **and** ≥50% of earlier words matched | `msSinceVoice ≥ 180` | normal — you finished, it jumps |
| score ≥ 0.75 | `msSinceVoice ≥ 900` | SR dropped your tail |
| any speech heard at all | `msSinceVoice ≥ 2500` | you trailed off, don't trap them |

Matching runs against **interim** results, not `isFinal` — SR takes 500–800 ms to
finalize, which is most of the perceived lag. The 400 ms `srAdvanceTimerRef` delay (1571)
is deleted. Net: roughly 180 ms from your last syllable to the next line, versus ~1 s now,
and it can no longer fire mid-sentence.

The ≥50%-of-earlier-words gate keeps the old bug fixed: a line ending on "you" won't
advance the moment you say "you" one word in.

## 3. Turn handoff — zero gap

Pre-arm the mic **during** the AI's last words instead of after them:

- `useOpenAITTS` plays through an `<audio>` element, so `currentTime`/`duration` are
  available. Arm the recognizer and recorder when ≤600 ms of audio remain.
- Browser `useSpeechSynthesis` path: arm on the `onboundary` event for the final word.
- **Discard everything heard until TTS `onended` fires.** This is what makes pre-arming
  safe on speakers — the recognizer is warm but deaf to the AI's own voice.
- `pauseBetweenLinesSeconds` drops to `0` for the AI→user transition; the setting stays
  for user→AI, where a beat is wanted.

At "How old are you?" the mic is already hot, so "Twenty-four" lands whole.

## 4. Highlight rendering

**Your line** — three states per word instead of two:

- pending: `text-muted-foreground`
- matched: `text-primary`
- heard but wrong: foreground with a dotted underline

The third state matters. Right now a miss is invisible — indistinguishable from a word you
haven't reached yet — so you can't tell whether the app is behind you or lost.

**AI line** — karaoke sweep. New `lib/speech-timing.ts` distributes audio duration across
words weighted by syllable count, driven by `requestAnimationFrame` against
`audio.currentTime`. Spoken words dim, the current word sits at full weight. Browser TTS
uses real `onboundary` charIndex instead of the estimate.

Both paths render through one extended `renderLineWithWordHighlights` (418) so the AI's
line and yours read as the same system.

## 5. Theme

`ThemeToggle` (`components/ui/theme-toggle.tsx`) goes in the rehearsal top bar and on the
pre-rehearsal preview. It's a class swap on `<html>`, so it cannot interrupt audio or SR —
verify no remount of the rehearsal tree.

Then audit the hardcoded neutrals. The review screen alone has `text-neutral-500`,
`text-neutral-700` (2233, 2364) — invisible or wrong in one theme. Sweep the rehearse page
to semantic tokens (`text-muted-foreground`, `bg-card`, `text-primary`,
`text-primary-foreground`). Never the brand hex directly; that silently opts an element out
of dark mode.

## 6. Review screen

Cut every number the actor sees.

**Remove:** the stats bar (2271–2282), per-line accuracy percentages (2341–2353), the
`skipped` italic label (2364), and the `overallAccuracy` memo (1980).

**Keep:** scene title, the scene rendered line by line, `LineWaveformPlayer` on each
delivered line, and `Run it again` / `Back to scene`.

```
SCENE COMPLETE
The Weight of Water · Scene 4

  ANITA
  How old are you?
  ▸ ────────────────

  YOU
  Twenty-four.
  ▸ ▁▃▇█▇▃▁──────  0:02   ⟲

      [ Run it again ]  [ Back to scene ]
```

**Backend is untouched.** `trackRehearsalCompleted` and the session PATCH keep sending
`completion_percentage` and accuracy. The data still lands in `/admin/sessions`; the actor
just stops being shown a score that measures the microphone.

## 7. Skip line

Already exists — button at 2743, `Enter` shortcut at 1934, listed in the shortcuts sheet
at 3038. No work. Worth checking it's discoverable enough on mobile, where the shortcut
sheet is useless.

---

## Testing

Pure modules, so most of this is unit-testable with no browser:

- `lib/word-match.ts` — proper nouns, SR word splits, numerals, contractions. Seed the
  fixtures from real failures ("Anita" → "a nita", "Twenty-four" → "24").
- `lib/advance-rule.ts` — table-driven over `shouldAdvance` state. The important assertion
  is the negative one: no state with `msSinceVoice < 180` returns true.
- `lib/speech-timing.ts` — syllable distribution sums to duration.

Manual, unavoidable: real mic on desktop Chrome and iOS Safari. iOS is where SR has failed
silently before (see `memory/mobile-rehearsal-speech-failure.md`), and pre-arming touches
exactly that path.

## Order

1. `lib/word-match.ts` + tests, swap in. Standalone, immediately better highlighting.
2. Whisper `prompt` bias. One line.
3. `lib/advance-rule.ts` + `msSinceVoice` from `useWhisperSTT`. The "don't cut me off" fix.
4. Pre-arm handoff. Riskiest — echo behaviour needs real-hardware checking.
5. Highlight states + AI karaoke sweep.
6. Review screen strip-down. Independent of everything above; could ship first.
7. Theme toggle + neutral-token sweep.

---

## Built — 2026-09-03

All seven, with three corrections to the plan found on contact with the code.

**Step 2 was already done.** `useWhisperSTT` was being passed the expected line as
`prompt` (`page.tsx:731`) and forwarding it to the transcribe endpoint. No change needed;
the diagnosis above was wrong on that one point.

**Two bugs the plan didn't predict, both found while implementing:**

- `normWords` stripped hyphens *without* inserting a space, so `"Twenty-four."` became the
  single token `twentyfour` while every microphone on earth hears `twenty four`. Soundex
  cannot bridge that. The line in the screenshot that started this work could never have
  highlighted, under any threshold. Fixed in `normWords`; pinned by a test.
- The rehearsal root carried a hardcoded `dark` class (`page.tsx:2456`), pinning the whole
  screen to the dark theme no matter what the actor had chosen. That — not missing
  controls — is why the theme "didn't reflect" in here.

**Deliberately not done: the full neutral-token sweep.** The floating control pill and the
full-screen overlays keep a scoped `dark` class (`CHROME_DARK`) rather than being re-themed.
They sit over the scene the way a video player's controls sit over a film, and re-tuning
~50 muted greys for a light background, blind, would have been a large uninspectable diff.
The room and the script page are themed; the chrome over them is not.

New: `lib/word-match.ts`, `lib/advance-rule.ts`, `lib/speech-timing.ts`, all with tests.
The project had no test runner, so vitest was added along with `npm test`.

Accuracy is still computed and now rides on `rehearsal_completed` as
`transcript_match_pct` — analytics only, never shown.

**Unverified: none of this has been run against a real microphone.** The pure logic is
covered by 45 tests, but the advance timing, the pre-armed handoff, and the karaoke sweep
are all things you can only judge by rehearsing a scene. iOS Safari especially — pre-arming
touches the same path as the silent failure in `memory/mobile-rehearsal-speech-failure.md`.
