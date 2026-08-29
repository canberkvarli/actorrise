# Hypotheses

Running list of claims about why the numbers look the way they do, each with the
evidence that produced it and the observation that would kill it. A hypothesis is
only useful if it can be wrong, so every OPEN entry carries a `Disconfirms if`
line. Numbers come from `metrics-history.csv`; the decisions that acted on them
belong in `decisions.md`.

Status vocabulary:

- `OPEN` — stated, evidence gathered, not yet resolved.
- `NEW` — stated this session, no test run yet.
- `CONFIRMED` / `DISCONFIRMED` — resolved; keep the entry, do not delete it.
- `STABLE, stop reporting` — the metric stopped moving and is no longer worth a row.

H-01 through H-06 predate this file and were never written down. The numbering
starts at H-07 rather than renumbering, so references in older notes still land.

## H-07 Weak matches are a retrieval gap, not a content gap

Status: OPEN, strong evidence for (2026-08-20)

Evidence: 13 of 41 weak matches in trailing 7d are searches for source titles that
exist in the corpus. "the night manager" has 39 monologues, "fleabag" 6, "bottoms" 4,
"newsies" 4, "avengers" 3, "beautiful boy" 2, "rising seniors" 2, "the fault in our
stars" 1. All returned weak. Fixing title lookup alone projects weak match 36.0 -> 24.6 pct.

Disconfirms if: title pre-pass ships and weak match does not drop below 28 pct.

**Measured 2026-08-20 by replaying all 41 weak searches through the shipped
pre-pass: 8 are caught, not 13. Projected weak rate 36.0 -> 28.9 pct, which sits
just the wrong side of the disconfirming line.** Treat H-07 as on the edge of
disconfirmed, and do not claim the 24.6 number — it was never achievable.

The original count of 13 was optimistic in two distinct ways:

- **4 of them were tab problems, not retrieval problems.** Three "fleabag"
  searches and one "newsies" ran with a `source_type` filter that excluded the
  medium the show is filed under. The pieces exist; the actor's own tab hid
  them. The content-gap banner already says "available in TV" for this, so the
  pre-pass correctly stands down. Fixing it means changing the tab UX, not
  retrieval.
- **2 were titles we do not carry at all.** "hunger games" / "the hunger games"
  and "normal people" match the curated dictionary but return zero pieces.
  Those are content gaps, and they belong to H-09, not here.

What remains is a genuine retrieval gap of 8 searches out of 41. Worth having,
much smaller than advertised. The honest read: **most weak matches are not a
title-lookup problem.** 15 of the 41 have no detectable title at all
("Serious topics", "dramedy", "crazy", "Kenny Omega") and 13 more are attribute
searches. The next move on weak matches is not more title work.

**2026-08-27 — the retrieval gap was CHARACTER names, and it was bigger than
the title slice.** Brief re-count: 27 of 91 weak vector searches (7d) had a
direct catalogue match, dominated by character names the title pre-pass could
not see (it only matched `plays.title`): hamlet (67 pieces; the "Hamlet" play
row is a 1-shell), joan clarke (4), anne frank (1), lila, barry, anastasia.
13 distinct users hit this, several retyping the same string 3-5x before
quitting. Fix shipped (commit 4b8c6963, decisions.md): a character sibling to
the title pre-pass (`detect_catalogue_character` + `find_character_monologues`),
same precision guards, new `match_strategy=character_exact`. This is the
concrete retrieval move H-07 kept pointing at without naming. Watch pct_weak_7d
(38.1 now) and the share of `match_strategy=character_exact` next pull.
Disconfirms if character_exact volume is real but pct_weak does not fall below
~30, which would move the remaining weak mass to attribute/multi-constraint
NL queries (the growing `other` type) and off titles/characters entirely.

**2026-08-28 hand-check — the split is roughly even, and both halves are now
named.** Took the 16 most recent proper-noun (title/character/author-shaped)
weak queries and checked by hand whether the piece exists in the 14,418-row
catalogue (ILIKE across `monologues.title`, `character_name`, `plays.title`,
`plays.author`, then verified the "exists" hits were real, not substring noise):

- **Retrieval bugs (piece EXISTS, search failed) — ~5:** `sing street`
  (=Sing Street), `sweeney todd` (=Sweeney Todd: The Demon Barber of Fleet
  Street), `hannah montana` (=Hannah Montana), `corey taylor finding`
  (=Finding Corey Taylor), `bane`. These are lexical/partial-title failures the
  vector path mishandles. Root cause found: the title catalogue matches on
  **full normalised-title equality** (plus squashed/numeric variants), so a user
  who types a PREFIX or reordered fragment of a long title ("sweeney todd" for
  the full "…Demon Barber…", "corey taylor finding" for "Finding Corey Taylor")
  never matches. This is exactly what brief-task-4 (pg_trgm partial/trigram
  lexical pre-search) fixes.
- **Catalog gaps (piece ABSENT, no search change helps) — ~10:** and they
  cluster, which is the real content signal: (a) a **South Asian / Bollywood
  cluster** — ddlj, dilwale dulhania le jayenge, veer zaara, dil se, shah rukh
  khan, srk — ALL zero supply, appearing together (see H-15); (b) **contemporary
  copyrighted playwrights** — Del Shores ("yellow del shores"), Christopher
  Durang — not in a public-domain-anchored corpus; (c) recent screen the corpus
  never carried — the Netflix show "Adolescence" (only unrelated "Big Time
  Adolescence" is present), "mia dolan" (La La Land), "bad habits".

Verdict for the brief's gating question ("search vs content for the next two
weeks"): **both, and separable.** Ship the pg_trgm lexical pre-search — it is a
confirmed fix for ~1/3 of proper-noun weak matches — but do NOT expect it to
move the Bollywood or copyrighted-playwright clusters; those are H-15 content
decisions, and the honest response there is H-13 ("we don't carry this"), not a
weak vector tail.

## H-15 There is an unmet South Asian / Bollywood content demand

Status: NEW, needs decision (2026-08-28)

Evidence: in one week of weak matches, ddlj, dilwale dulhania le jayenge, veer
zaara, dil se, shah rukh khan, and srk all appear and all return ZERO catalogue
matches (2026-08-28 hand-check, H-07). They co-occur, which suggests either one
determined actor or an audience segment the corpus (public-domain Western plays +
English-language film/TV) does not serve at all. Separately "in hindi" was
searched as a bare language filter.

Why it matters: this is the one weak-match cluster that is a clean, nameable
content gap with zero supply, not a retrieval artifact. If it is an audience
Canberk wants (South Asian actors are a large, underserved slice of the
English-language audition market), it is a content-sourcing call, not a code one.

Test / next step: classify the trailing 200 weak queries for a South-Asian
signal (Hindi/Bollywood titles, Devanagari, named Bollywood actors) and count
distinct users. Disconfirms if it is <3 distinct users over 30 days — then it is
one persistent searcher, not a segment, and not worth sourcing for.

## H-08 The Aug 15 weak-match step is a query mix shift, not a threshold change

Status: OPEN, evidence for (2026-08-20)

Evidence: weak/strong boundary stable at ~0.38 across the whole period (weak max
0.3797, 245/279 strong above 0.38). Queries of <=3 words rose 55.6 -> 68.2 pct of
searches after Aug 15. avg_cosine fell 0.441 -> 0.401 over the same split.

Disconfirms if: decisions.md shows a retrieval or embedding change landed Aug 14-15.

Checked 2026-08-20 and still standing. There IS an untracked threshold change —
`search_relevance_floor` 0.30 -> 0.35 in `app_settings` — but its `updated_at`
is 2026-08-20 02:00 UTC, five days after the step, so it cannot explain it. Note
for whoever tests this next: `app_settings` is the place threshold changes hide,
since they leave no git trace. It holds one row and no history, so if the floor
was moved before and moved back, that is now unrecoverable.

## H-09 The content-request funnel does not capture failed-search demand

Status: OPEN, partly explained (2026-08-20)

Evidence: 2 content_requests rows lifetime, one from March. 4 distinct titles with
zero corpus matches were searched this week (Normal People, Hunger Games, Broad City,
Queen's Gambit) and none produced a request.

What the code check found. The affordance already existed on /monologues
(`RequestQueryButton`, rendered on `weakMatch && !contentGap`), and
`upsert_content_request` already deduped by (title, author) and bumped
`request_count`. So the original framing was wrong: the funnel was built. Three
real holes, all now closed:

1. The dashboard search surface (`components/search/SearchInterface.tsx`) had no
   request affordance at all, on either a weak match or zero results. Zero
   results — the strongest demand signal there is — told the actor to rephrase
   and recorded nothing.
2. `RequestQueryButton` swallowed POST failures in a bare `catch {}`, so a
   failing request was visually identical to a working one. "Nobody clicked" and
   "every click failed" were indistinguishable in the data.
3. Named titles we do not carry route to `ContentGapBanner` instead, so the
   `RequestQueryButton` branch never saw them. Not a bug, but it means the 2
   lifetime rows were never going to include the 4 titles cited above.

Test: measure content_requests rows/week. If it stays at ~0 with the affordance
now on every dead-end surface and failures visible, the demand is not there and
the hypothesis is wrong.

**2026-08-21, first real case since the fix, and it reframes the problem.** User
1402 ran three searches in two minutes: "Erin Gruwell" (20 results, **not**
flagged weak), then "Hillary Swank", then "Hilary Swank" (both weak). They were
hunting a *Freedom Writers* monologue. We carry zero. No request was filed and
they left.

The affordance was not the binding constraint — it rendered on two of the three
searches. The binding constraint is that **the first search returned 20 results
and claimed confidence.** Nothing ever told them we do not have Freedom Writers,
so they assumed they were searching wrong and tried a different phrasing rather
than asking for the piece.

This makes H-09 a symptom rather than a cause. The real hypothesis is **H-13**
below. Do not spend more effort on the request affordance until that is settled;
a request button is useless on a screen that says everything is fine.

Checked and ruled out while investigating: resolving actor names to titles. Only
**3 of 1,186 searches (0.3%)** are exactly an actor's name, despite 99% cast
coverage in `film_tv_references`. Not a pattern. Not worth building.

## H-13 Confident wrong answers are worse than empty ones

Status: NEW, needs test (2026-08-21)

Evidence: "Erin Gruwell" returned 20 monologues, `weak_match=false`, for a film
we do not carry. weak_match keys off best_cosine alone, so a query that matches
*something* thematically clears the bar regardless of whether it matches what
was actually asked for. A named person or title we do not hold is exactly the
case where 20 plausible-looking results are most misleading.

Why it matters more than the request funnel: an actor who is told "we don't have
this" can ask for it or move on. An actor handed 20 wrong results concludes the
library is bad, or that they are searching wrong, and neither leads back.

Test: when a query names a person or title (`query_type` in title/named_lookup)
and the pre-pass finds nothing we carry, say so explicitly instead of returning
the vector tail. Measure content_requests/week and repeat-search-within-2-min
rate — the "Erin Gruwell -> Hillary Swank -> Hilary Swank" rephrase loop is the
signature of this failure and should fall.

Disconfirms if: the rephrase-loop rate does not drop, i.e. actors were rephrasing
for reasons unrelated to being misled about coverage.

**2026-08-27 — the retry loop is the clearest dissatisfaction signal in the data
and it was not being measured.** The brief re-flagged it (its H4): 13 users
retyped the same string 3-5x before quitting this week, driven by the
character-name miss H-07 now fixes. Instrumented two ways: (1) a live
`retry_signal` on the admin search diagnostics (`/admin/searches`) so it is
watched, not just pulled; (2) the weekly-pull query below. search_logs has no
session_id, so a "session" is approximated as the same normalised query by the
same user inside a 30-minute window.

```sql
-- users who retried one normalised query 3+ times within 30 min, last 7 days
with tagged as (
  select user_id, lower(btrim(query)) q, created_at,
         floor(extract(epoch from created_at)/1800) win
  from search_logs
  where created_at >= now() - interval '7 days' and user_id is not null
)
select count(*) retry_events,
       count(distinct user_id) retry_users
from (
  select user_id, q, win from tagged
  group by user_id, q, win having count(*) >= 3
) r;
```

Cross-check after the character fix lands: retry_users should fall, and
high-retry users' 7d return should be lower than the base rate (if it is not,
retries are not the abandonment driver we think). Ties to H-14's return metric.

## H-10 activated_30d is not a meaningful metric

Status: NEW, needs decision (2026-08-20)

Evidence: 86.8 pct activation vs 10.2 pct 30d retention. The day-0-or-1 window
catches nearly every signup, so the metric cannot discriminate. 2026-08-27
re-confirmed: activated_30d reads 251/289 (87%) because it counts any
usage_metrics row on day 0 or 1, which is nearly free.

Proposal (2026-08-20): redefine activation as "ran >=1 search AND saved >=1
favorite within 7 days".

**Decision (2026-08-27): adopt a two-tier definition, do not overwrite the
column.** The old day-0/1 definition stays in metrics-history.csv as-is so the
series is unbroken; a new column is added going forward rather than rewriting
history.

- `activated_search_30d` (search floor, matches the 2026-08-27 brief): in the
  first 7 days after signup, ran >=1 search that returned a NON-weak result AND
  opened >=1 monologue. This is "the product worked once."
- `activated_save_30d` (value floor, the 2026-08-20 proposal): also saved >=1
  favorite in the first 7 days. This is the retention-correlated behaviour from
  H-14 (savers return 2.1x).

SQL for the search floor (re-baseline over the current cohort before trusting a
week-over-week move):

```sql
with cohort as (
  select id uid, date(created_at) d0 from users
  where created_at >= now() - interval '30 days'
)
select count(*) cohort,
  count(*) filter (where uid in (
    select s.user_id from search_logs s join cohort c on c.uid=s.user_id
    where s.created_at < c.d0 + interval '7 days' and coalesce(s.weak_match,false)=false
    intersect
    select v.user_id from monologue_views v join cohort c on c.uid=v.user_id
    where v.created_at < c.d0 + interval '7 days'
  )) activated_search_30d
from cohort;
```

## H-11 The result_feedback widget may be broken or invisible

Status: DISCONFIRMED as "broken". Reopened as "invisible" (2026-08-20)

Evidence: zero commented feedback since 2026-07-29. fb_pos_30d = 0, fb_neg_30d = 2,
against 114 searches in the trailing 7 days.

Not broken. The control renders (`ResultsFeedbackPrompt`, mounted twice in
`app/(platform)/monologues/page.tsx` — `context="search"` on the plays tab,
`context="film_tv_search"` on the film/TV tab), `resultsViewCount` is set to 1
after a search so the prompt is not gated off, both contexts are in the server's
`ALLOWED_CONTEXTS`, and a thumbs-up with no comment is accepted and committed.
Pinned by `backend/tests/test_result_feedback_contract.py`.

Two things the numbers mean that are not "it is broken":

- **fb_neg systematically undercounts.** A bare thumbs-down records nothing, by
  design on both sides: the widget opens a reason box first and the endpoint
  400s a negative with no comment. fb_neg counts actors who typed a sentence,
  not actors who were unhappy. Do not read it as dissatisfaction.
- **The dashboard search surface never asks.** `SearchInterface.tsx` renders no
  feedback prompt at all, so every search from the dashboard is invisible to
  this metric. Unresolved — deciding whether to ask there is a product call, not
  a bug fix.

fb_pos has no such barrier, so 0 positives against 114 searches is a real
signal — of a prompt nobody notices or cares to answer, not a broken POST.

Disconfirms the "invisible" reading if: the prompt is made more prominent (or
added to the dashboard surface) and fb_pos stays at 0.

**2026-08-21 — confirmed "invisible" by looking at it.** Loaded a real results
page on prod and found the control present and correctly wired, exactly as the
contract test says. It was also `text-xs` at 70% opacity with 14px icons,
parked in the results toolbar between the result count and the collection
button — visually a caption, not a question. That is the whole of the 0-rows
mystery.

The bigger error was timing, not contrast: it asked "Helpful?" **above** the
results, before the actor had read a single card. The honest answer at that
moment is "I don't know yet", and the observed answer was silence.

Changed: moved below the result list, `text-sm` at full muted-foreground,
larger tap targets, and reworded to "Did this find what you needed?". The
prompt is now rendered once per tab rather than in the toolbar.

This is the prominence test the hypothesis asked for. If fb_pos is still 0 in a
week, the reading flips: actors do not want to rate searches, and the widget
should be removed rather than tuned again.

## H-12 rehearsals_7d has stopped carrying information

Status: STABLE, stop reporting (2026-08-20)

Evidence: flat at 7-8 for 14 consecutive days.

Keep collecting the column in metrics-history.csv so the series stays unbroken, but
drop it from the weekly read until it moves.

## H-14 The second session fails because the first keeps nothing

Status: OPEN, intervention shipped (2026-08-26)

The retention gap the brief flagged (2nd-day return 9.7%) is a *keeping* problem,
not an activation one. Activation is solved: 275 of 294 usage_metrics rows have
nonzero searches.

Evidence:
- 30d cohort funnel: 281 signups -> 152 searched -> 173 opened a monologue ->
  24 saved -> 20 rehearsed. Reading is healthy (889 opens, ~5 per opener); the
  leak is open -> save (5%, 45 saves on 889 opens).
- Savers return at 21.6 pct vs 10.1 pct for non-savers (2.1x), and average 2.68
  active days vs 1.16. Keeping a piece is the strongest retention correlate we
  have. (Correlation, not proof of cause — savers may just be keener.)
- Code read: saving was a silent bookmark with no next step, and the tools that
  make a save a *working* piece — cut, notes — sat two scrolls down the detail
  page (favs_with_cut / favs_with_notes ~= 2 each, ever). The Collection is a tab
  users must self-navigate to; signup/login lands on /practice (ScenePartner),
  not their saved monologues. No automated day-1 re-engagement exists.

Intervention (shipped 91db015c): on save, an inline panel offers the next step
(Cut / Add a note / Rehearse) and the collection button was elevated to second
place beside Rehearse. See decisions.md.

Disconfirms if: open->save does not rise above ~10 pct within 3 weeks, OR it
rises but 2nd-day return stays flat (would mean saving is a marker of intent, not
a cause of it — then the lever is landing/return nudges, H-14b, not the save UX).

Not yet shipped (need Canberk): land returning users on their Collection instead
of /practice; one automated day-1 "your saved piece is ready" email (no scheduler
exists yet, and sends are never automatic).

## H-16 Retention is falling because the new traffic is lower-intent, not because the product got worse

Status: OPEN, strong evidence for (2026-08-29)

The 2+day return rate fell three cohorts running (14.3 -> 10.3 -> 8.5 pct) while
weekly signups nearly tripled (39 -> 109). The brief's hypothesis was a mix shift,
and the referral split confirms it. 30d cohort, 2+ distinct-day return by
`referral_source`:

- organic **search: 3.0 pct** (67 signups) — the fastest-growing source (+194 pct
  wk/wk) and the LOWEST-retaining named one
- chatgpt: 6.5 pct (31), friend: 6.7 pct (15), other: 2.1 pct (47)
- unknown (no source recorded): 7.6 pct (157) — the biggest bucket

So the marginal new user is an organic-search visitor who returns at ~3 pct, and
their share is growing fastest. The blended cohort rate falls not because
existing users churn harder but because the intake is diluting. This is discovery
traffic (organic + ChatGPT tripling), which reads as SEO/LLM-surface arrival, not
a launch.

Disconfirms if: the per-source return rates rise over the next cohorts while the
blend keeps falling (would mean the product IS decaying under everyone), OR
organic-search return climbs toward the friend/chatgpt rate on its own (would mean
it was a cold-start artifact, not a durable intent gap).

Implication, not yet acted on: the retention lever for this traffic is the FIRST
session for a low-intent arrival — landing them somewhere sticky and giving the
first search a real answer — not another nudge aimed at already-engaged users.

## H-17 The weak-match rate understated failure (FIXED at source)

Status: CONFIRMED + fixed (2026-08-29)

pct_weak was computed over ALL searches, but title/character pre-pass hits never
set weak_match or best_cosine (they are lookups, not vector scores). With 53 such
`title_exact`/`character_exact` rows in the 7d window, the reported rate was
33.2 pct (85/256) while the real VECTOR weak rate is 43.8 pct (85/194 scoreable) —
verified live, and `title_lookup`=53 matches the brief exactly. Also invisible:
silent retries — 63 searches in 7d re-ran an identical (user, query) within 10 min
(the brief counted 81 identical repeats, 41 within 2 min). weak_match captures
none of it.

Fixed in `_compute_summary` (admin `/searches`): weak-rate denominator is now the
scoreable set only, and two metrics were added — `scoreable_count` /
`title_lookup_count` (keeps the lookup path visible) and `repeat_count` /
`repeat_rate` (the silent-retry signal, computed at read time via a LAG window, no
stored column). See decisions.md.

Disconfirms if: nothing — this was a definitional error, now corrected. Watch
repeat_rate as the retry signal going forward.

## H-18 Screen-title demand is real and unmet, but it is a minority of weak volume

Status: OPEN, sized (2026-08-29)

Of 145 weak searches (14d, junk-filtered), 36 name a title we can recognize, and
among those it is **33 screen vs 3 stage (92 pct screen)** — matched against
`film_tv_references` (known screen titles) and carried `plays`. Confirms screen
demand (Severance, Better Call Saul, La La Land, Sing Street, Hannah Montana, ...),
but the other 109 of 145 are not title-shaped at all (attribute / NL / typo). So a
screen library would address ~23 pct of weak searches (33/145) — real, worth
sizing, NOT the majority. Do not scope catalog work as if it fixes most weak
matches.

Disconfirms if: with the fuzzy title match now live (2026-08-28), the recognized
screen share falls because more of them resolve via title_exact — i.e. some of the
33 were retrieval misses, not true content gaps. Re-run this split after a week.

Related content gap: H-15 (South Asian / Bollywood) is a subset of this screen
demand with zero supply.
