# Onboarding ending: the scene for everyone (design)

Date: 2026-10-17.

## Why

Since the per-question skip shipped (2026-10-02), 170 actors finished the
card. 22 skipped both casting and playing age, and 20 ended with neither
gender nor age on the profile. For them the payoff ran the search with no
filters at all and still said "six pieces for you", which is a lie.

The guided first scene ("Late", RILEY and ALEX, six lines) is already on
/practice right behind the card. In the hour after finishing onboarding
(187 actors since 2026-09-29): 179 saw "You're late. Answer", 129 searched
instead, 35 tapped Answer, 9 finished. The card's own exits (Keep them all,
Open my collection, browse the library, bring your own sides) never mention
the scene, so the card trains people to think in monologues and then hands
them a scene they did not ask for. Canberk, 2026-10-17: the scene for
everyone, kept short enough that nobody gets bored and wanders off.

## What changes

### The ending screen

After the last question (or its skip), `ProfileOnboardingFlow` goes
`settling` then `ending` (the `payoff` phase is removed for `variant="new"`;
the backfill variant keeps today's payoff because those actors have already
rehearsed or chosen not to).

The ending screen is one card:

```
(✦)
Before anything, say one line.
RILEY is waiting. Six lines, under a minute.
[ Answer ]
skip, take me to the library
```

Answer starts the guided scene directly: it calls the same mic-priming
helpers the hub's `GuidedInvitation` uses (`lib/guided-handoff.ts`,
`lib/primed-audio.ts`), posts `/api/scenes/rehearse/start-guided`, then
`endFlow()` and `router.push` to the rehearse route with `?guided=1`. The
card closes on the tap; the Begin gate only appears on a reload, as today.
Extract the hub's start logic into `lib/guided-start.ts` so both callers
share it.

"skip, take me to the library" runs `endFlow()` and pushes `/monologues`.
The hub's invitation stays for anyone who skipped, unchanged.

### Picks become a side effect

`fetchPicks` runs during `settling` only when `answers.casting` or
`answers.ageRange` is set. The six results are favourited without awaiting
(same fire-and-forget as `keepPicks`), and the ending card does not list
them. When neither lever is set, nothing is fetched and nothing is kept.
`buildPayoffParams` is unchanged; the guard lives in the flow.

### The win screen

`SceneWin` gets a third line, shown only when picks were kept this session
(a sessionStorage flag `arc.onboardingPicksKept=<n>` set by the flow, read
and cleared by SceneWin): "N pieces are on your shelf." linking to
`/rehearse`. The upload and find-a-monologue doors stay.

### Events

- `onboarding_ending_shown`
- `onboarding_ending_answer` (starts the scene)
- `onboarding_ending_skip`
- `onboarding_picks_kept { count }` (0 is not logged)
`guided_scene_started` keeps firing from the rehearse page as now, with
`platform`; add `from: "onboarding" | "hub"` so the two doors can be read
apart.

### What does not change

The seven questions, their skips, `persist()`, the backfill variant, the
hub's `shouldInvite` rule, the first-run curtain, the rehearse page.

## Testing

- Unit: the lever guard (`shouldFetchPicks(answers)`) for casting only, age
  only, both, neither.
- Unit: `lib/guided-start.ts` posts start-guided and returns the route.
- Manual on a real phone: new account, answer the questions, tap Answer,
  speak the six lines, see the shelf line on the win screen. Then a second
  account skipping everything: no shelf line, no favourites.
