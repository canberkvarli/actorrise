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

## H-08 The Aug 15 weak-match step is a query mix shift, not a threshold change

Status: OPEN, evidence for (2026-08-20)

Evidence: weak/strong boundary stable at ~0.38 across the whole period (weak max
0.3797, 245/279 strong above 0.38). Queries of <=3 words rose 55.6 -> 68.2 pct of
searches after Aug 15. avg_cosine fell 0.441 -> 0.401 over the same split.

Disconfirms if: decisions.md shows a retrieval or embedding change landed Aug 14-15.

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
