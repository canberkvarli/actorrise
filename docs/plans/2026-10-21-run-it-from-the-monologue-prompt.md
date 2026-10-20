# Prompt: "Run it" from the monologue

Paste everything below the line into a fresh Claude Code session in this repo.

---

I want rehearsal to be the obvious next step after an actor finds a monologue, instead of a
separate product (ScenePartner) they have to discover. Start with the brainstorming skill and
show me a design before you build anything.

## Why (numbers from prod, 2026-10-21, last 14 days, real users only)

- 217 signups. 163 were shown the guided first scene, 52 started it, 21 finished it, and
  **0 of those 21 ever rehearsed another scene**.
- 84 of the 111 who skipped the guided scene went straight to monologue search. People come
  from Google looking for a monologue, not a scene partner.
- iPhone is worst: 61 shown, 16 started, 5 finished (desktop 83 / 27 / 14).
- Monologues: 122 people opened one, 41 started a monologue run (`monologue_work_started`),
  13 finished one (`monologue_work_finished`).
- Of the 6 web payers, 5 use the library (search, open, save) and only 1 has ever used
  ScenePartner. The money is on the monologue side, and so is the iOS app (Ghost Light).

## What I want

The moment an actor opens a monologue, the next step on that page is to run it: hear it read,
then say it back with the lines hidden. Rehearsal becomes "what you do with the piece you just
picked". The monologue Work flow (`/monologue/<id>/work`) already exists. This is mostly about
where the entry point sits, what it's called, and making the first run feel short and
finishable on a phone.

## Do this first

1. Read the memories on the monologue page and Work flow before touching anything:
   monologue-v2-design, monologue-work-x, monologue-rehearse-redesign,
   activation-cliff-search-to-rehearse, search-is-no-longer-the-bottleneck,
   mobile-rehearsal-speech-failure, actorrise-has-no-second-day,
   first-run-gate-hijacked-every-exit, onboarding-ends-on-the-first-scene, ui-conventions,
   ui-font-system, brand-orange-is-theme-dependent.
2. Render the monologue page and the Work flow at phone width (390px) and desktop, logged in
   as a FREE user. My own account has Plus, so it never shows the walls. Find where the run
   entry point is today and how many taps it takes.
3. Pull the funnel yourself, read-only (`engine.connect().execution_options(postgresql_readonly=True)`):
   - monologue opened → `monologue_work_started` → `monologue_work_finished` → came back
     another day, split by `properties->>'client_platform'`.
   - Where in the Work flow people drop out.
4. Then propose 2 or 3 designs with the trade-offs and your pick.

## Rules

- Don't change search, ranking or the search algorithm. If a change touches
  `services/search/`, stop and ask me.
- Don't remove ScenePartner or the guided scene. This adds a path, it doesn't delete one.
- Respect the free-read wall and the Plus gates as they are. Ask me before you change what is
  free.
- Use the brand tokens (`bg-primary`, `text-primary-foreground`), never a hard-coded hex. Use
  the existing fonts: typewriter for monologue text only, sans for everything else.
- Instrument it: one event when the entry point is shown and one when it's tapped, both with
  `client_platform`, so we can measure opened → run.
- Success: of the people who open a monologue, the share who start a run goes from 34% to 50%,
  and more of them finish one on iPhone.
- Run the full backend suite (`.venv/bin/python -m pytest tests/ -q`) and check the page at
  phone width before you call it done. You can merge and push to main. Tell me exactly what
  you verified and what you didn't.
