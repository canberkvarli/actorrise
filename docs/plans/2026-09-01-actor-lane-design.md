# The actor lane: making credits earn their keep

**Date:** 2026-09-01
**Status:** design, approved in conversation, not built
**Decisions taken by Canberk:** credits must earn something · "your lane, read back" · generous but true · asked inline on /profile

---

## The problem, in one number

**4 credit rows. 2 users. Out of 724.** Newest credit `2026-07-16`, the day after
the résumé shipped. Nobody has typed one since launch day.

The résumé itself is not the problem, and it is not missing. `/resume` is built:
credits CRUD, drag to reorder across categories, header details pulled from the
profile, a live paper preview, PDF export via WeasyPrint, linked from the avatar
dropdown. It works.

The problem is that it is a closed loop. `ActorCredit` is read by **nothing
outside its own router**. You type credits in, you get a PDF back out. An actor
already has a résumé in Backstage or Actors Access or their agent's file, so a
duplicate copy here is pure admin with no payoff.

Two diagnoses were considered and rejected:

- *"Typing it is brutal, build PDF import."* Maybe, but importing faster into a
  feature nobody opens is a faster road to an empty room. Import is worth doing
  **after** credits are worth having, not before.
- *"Nobody knows it exists."* It is behind a dropdown, which is real, but
  surfacing a thing that gives nothing back just moves the shrug upstream.

So: make credits **do** something, and ask for them where actors already are.

## The idea

A credit is the only thing on the profile that is not a dropdown.

> "Laertes in *Hamlet*"

tells you more than "male · 25-35 · Emerging" ever will: young, aristocratic,
hot blooded, plays verse, dies angry. That is a casting lane, described by the
actor's own history. Read it back to them, then pick in it.

```
FOUR CREDITS IN.

  Laertes    · Hamlet
  Krogstad   · A Doll's House
  Treplev    · The Seagull
  Mercutio   · Romeo & Juliet

(you get cast as the young man who won't sit down.)

sharp, fast, runs hot. four credits and not one of them sits still.

Speeches in that lane:
  Edmund      · King Lear
  Jerry       · Zoo Story
  Konstantin  · The Seagull
```

This is the version an actor screenshots and sends to a friend, which is also
how it spreads.

## Where it lives

**The ask: inline on /profile**, three rows under the call sheet. `/resume`
stays exactly as it is, the full editor plus PDF export, for people who want it.

Four controls per row, not the six `/resume` asks for:

| production | role | year | stage / screen |
|---|---|---|---|

The fourth is a one tap toggle, not a dropdown. `actor_credits.category` is
`NOT NULL`, and defaulting everyone to `theatre` would quietly mislabel every
screen actor's résumé, which they would then export to a PDF. Two values covers
it: `theatre` and `film`. `/resume` can refine to TV / commercial / voiceover.

Writes to the existing `POST /api/resume/credits`. No new write path, so
`/resume` and the PDF keep working untouched.

**The read: the "What this gets you" block already on /profile.** It currently
shows profile based recommendations. With three or more credits it upgrades to
the lane read. Same slot, better answer, so nothing new competes for the space.

## Gate: three credits

Under three, no read. You cannot find a pattern in two jobs, and a confident
line drawn from one credit is a horoscope. Under three the block keeps its
current recruiting state.

## Mechanism

A hybrid. The LLM writes the sentence. It never chooses the monologues.

```
GET /api/resume/lane
  -> load the actor's credits
  -> hash the credit set
  -> hit? return the cached row
  -> miss? one LLM pass, store, return
```

New table:

```sql
create table actor_lane (
  user_id       integer primary key references users(id) on delete cascade,
  credits_hash  text not null,      -- so an edit invalidates, a revisit does not
  line          text not null,      -- "(you get cast as the young man who won't sit down.)"
  blurb         text,               -- "sharp, fast, runs hot. ..."
  tags          jsonb not null,     -- drives the search, see below
  created_at    timestamptz default now()
);
```

One call per actor per credit edit. At ~100 actors that is pennies, and every
re-read is free.

`tags` shape:

```json
{
  "age_skew": "20s",
  "tones": ["dramatic"],
  "eras": ["classical", "contemporary"],
  "archetype": "restless young man",
  "keywords": ["defiance", "grief", "verse", "class"]
}
```

Tags feed the search that already exists: tones and eras become filters,
keywords become the semantic query on the pgvector path. So the picks stay
reproducible and reviewable, and a bad LLM day cannot quietly rewrite what
search returns.

## Two traps this must not walk into

Both are already documented in this repo, in blood.

**1. Vocabulary mismatch.** The profile stores `"Male"` and `"25-35"`. The
corpus stores `"male"` and `"20s"` / `"30s"`. Comparing those strings matches
nothing, silently. The LLM must be constrained to emit **corpus** vocabulary,
and the mapping validated on the way in:

- `character_gender`: `male` | `female` | `any` | `either gender`
- `character_age_range`: `child` | `teens` | `20s` | `30s` | `40s` | `50s` | `60+` | `any`

Anything outside the enum is dropped, not passed through.

**2. Fail open, never closed.** `/api/scenes/first-rehearsal` 404'd for every
user for weeks because its "graceful fallback" filtered on the same column that
was empty. If the tag filtered search returns fewer than three results, widen:
drop era, then tone, then fall back to the plain profile recommender. The block
must never be empty and must never show an error. Worst case it silently
degrades to what /profile shows today.

## Voice

Generous but true. Names the lane in its best light without lying, and **never
says what the actor does not get cast as**. "You play the best friend, never the
lead" is true of a lot of résumés and would be a horrible thing to read on a
Tuesday.

Prompt constraints, non negotiable:

- First person singular if it refers to the app at all. Never "we".
- **No dashes.** No em dash, en dash, or long hyphen.
- No emojis.
- The `line` is a lower case parenthetical aside, matching `.stage-direction`.
  Note that class force lowercases, so the line must not contain a proper noun.
- Never invent a credit, a play, or a role. Only describe what was given.
- If the credits are too thin or too scattered to read, return `null` and show
  nothing rather than reaching for a pattern that is not there.

## Not building

**PDF import.** Deliberately deferred. It only becomes the bottleneck once
credits are worth having; today it would be a faster path into an empty feature.
Revisit when the lane read is live and credits are actually accumulating.

## How we know it worked

Baseline today: 4 credit rows, 2 users, 724 accounts.

- Do actors add three or more credits? (the gate)
- Do they add a fourth after seeing the read? (did the payoff land)
- Do the lane picks get opened at a higher rate than the profile picks they
  replaced? (is the read actually better, or just prettier)

## Open questions

- Does the read belong on `/resume` as well, or only `/profile`? Starting with
  `/profile` only, because that is where the ask is.
- Should a credit whose play we hold link straight to that play's monologues?
  Cheap, obvious, but it is a second feature. Not in this pass.
