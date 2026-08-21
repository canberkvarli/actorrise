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

## H-10 activated_30d is not a meaningful metric

Status: NEW, needs decision (2026-08-20)

Evidence: 86.8 pct activation vs 10.2 pct 30d retention. The day-0-or-1 window
catches nearly every signup, so the metric cannot discriminate.

Proposal: redefine activation as "ran >=1 search AND saved >=1 favorite within 7 days".

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

## H-12 rehearsals_7d has stopped carrying information

Status: STABLE, stop reporting (2026-08-20)

Evidence: flat at 7-8 for 14 consecutive days.

Keep collecting the column in metrics-history.csv so the series stays unbroken, but
drop it from the weekly read until it moves.
