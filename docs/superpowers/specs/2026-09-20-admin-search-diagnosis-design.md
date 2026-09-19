# Admin Search diagnosis

2026-09-20

## The problem

`/admin/searches` opens on five stat tiles that count the same searches five
different ways. `zero`, `weak`, `repeat`, `gap` and `wrong_tab` overlap, so none
of them adds up to any other, and the headline above them reads **382** by
adding 33 empty to 349 poor when a search can be both. The real figure is 347.
`searches.py` already warns about exactly this double count in a comment, and
the page does it anyway.

Underneath sit four more panels and a table, across four tabs. Nine panels, and
not one of them answers the only question that changes what gets done next:

> Is this search failing because we do not have the piece, or because we have it
> and search could not find it?

Measured on the 30 days to 2026-09-20, over 1,250 real searches with staff
excluded: 347 came up short, and of the 209 in the worst-performing bucket,
**66% were content we do not hold and 34% were pieces we do**. That split is not
on the page.

The nav badge has the same fault. Search reads `99+`, which is every new failure
including the content gaps already known about. A number that large is one you
learn to ignore.

## Structure

Four tabs become two.

| Today | Becomes |
| --- | --- |
| What's broken | **Diagnosis** — the funnel and the two lists |
| What they want | folded into Diagnosis |
| Who's searching | folded into Searches as a filter |
| Recent activity | **Searches** — the raw feed |

## The Diagnosis tab

One funnel, in which every number is a share of the one above it:

```
1,250 searches · last 30 days
████████████████████  903 found something   72%
▓▓▓▓▓▓▓                347 came up short    28%
                        │
        ┌───────────────┴───────────────┐
  WE DON'T HAVE IT               WE HAVE IT
  138 · content to add           71 · search to fix
```

`came up short` is `results_count = 0 OR weak_match IS TRUE` — one count, the
same predicate `_compute_summary` and `unseen_bad_searches` already use. Not the
sum of two overlapping sets.

Each side is a list of queries ranked by how many searches they cost, and
clicking a row opens Searches filtered to that query. Below the funnel, two single lines: the most-asked queries overall (top 8), and
the actors having the worst time of it — *"14 actors searched three or more
times and mostly came up short"*, linking to Searches filtered to them. That
second line is the whole of PeopleTab worth keeping: a ranked table of every
actor is browsing, but knowing which ones are quietly failing is something to
act on before they go quiet. That is what survives of Demand:
the two lists already are the demand signal, and a leaderboard of searches that
worked is not something to act on.

## The classifier

Both lists need one answer per failing query: **would search find this now?**

It is answered by running the same detection the live search runs —
`detect_catalogue_title`, then `detect_catalogue_character`, then
`term_is_in_catalogue` — and never by a second rule written for this page.

Three consequences, and they are the point:

- Accurate by construction. If search cannot find it, neither can the
  classifier, because it is the same code.
- **The list self-cleans.** `kill bill` left the "we have it" side the moment the
  subtitle-head fix shipped (5fbdf392), with nothing to run and nothing to
  remember, the same way `resolve_finished_requests` closes a content request.
- No second definition of "missing" to drift from search's own.

### `GET /api/admin/searches/diagnosis`

Query params `from` / `to`, defaulting to the last 30 days, matching
`/searches/summary`.

```json
{
  "total": 1250,
  "found": 903,
  "short": 347,
  "have_it":   { "searches": 71,  "queries": [{"query": "potter", "count": 2, "resolves_to": "Harry Potter And The Chamber of Secrets"}] },
  "missing":   { "searches": 138, "queries": [{"query": "lila", "count": 5}] },
  "most_asked": [{"query": "comedic monologue", "count": 23}],
  "struggling_actors": 14
}
```

Staff are excluded through `admin_filters.test_user_filter`, as every other
admin number is. Anonymous rows (`user_id IS NULL`) count: a logged-out actor is
a real actor.

Classification runs over DISTINCT failing queries, not every row, so the work is
bounded by vocabulary rather than traffic — roughly 250 distinct queries per 30
days against an in-process catalogue cache that search has already warmed.
Moderators only.

## Badges

The Search badge counts **only the actionable side**: new failures since
`admin_seen.searches` where the classifier says we hold the piece. That is the
difference between `7` and `99+`.

Content gaps are deliberately not badged. A backlog is not an event, and badging
one is how a badge stops meaning anything.

`unseen_bad_searches` in `app/api/admin/pulse.py` narrows accordingly, and
classifies **only the failing queries newer than `seen_at`** — a handful, not the
window. The pulse endpoint is polled every 60 seconds by every open admin tab,
so it must never re-run the full classification; that belongs to the diagnosis
endpoint, which is fetched when the page opens. On
arriving at the page, one line states what was counted and since when: *"7
searches since Fri 18:40 found nothing, and we hold the piece."* It reads from
the same `admin_seen` timestamp the badge does, so the two can never disagree.

## What is deleted

- The five overlapping `StatTile`s and the 382 headline.
- "How searches are being answered" (`match_strategy` counts) and "What kind of
  thing they're asking for" (`query_type` counts). Both describe the machine
  rather than the actor. The data stays in `search_logs` for a query when a
  question needs it.
- `DemandTab.tsx` and `PeopleTab.tsx` as tabs. The per-actor view becomes a
  filter on Searches, which is where an actor's searches were always read.

`ProblemsTab.tsx` becomes `DiagnosisTab.tsx`. `StatTile` stays in `shared.tsx`:
the Sessions page uses it.

## Error handling

- The diagnosis endpoint failing leaves the page with its heading and an inline
  "couldn't load" line, never a blank screen or a crashed tab.
- A query the classifier cannot judge counts as **missing**, not as "we have
  it". Overstating a content gap costs a name on a list; understating one hides
  a real search bug.
- Zero searches in the window renders the funnel empty with a plain line rather
  than dividing by zero.

## Testing

Backend (`backend/tests/test_search_diagnosis.py`):

- `found + short == total`, on seeded rows
- a row that is both `results_count = 0` and `weak_match` counts once
- a query naming a title we hold classifies as have-it; one naming nothing
  classifies as missing
- a query the classifier cannot judge falls to missing
- staff searches are excluded, anonymous searches are not
- the badge count covers only the have-it side

Frontend (`lib/searchDiagnosis.test.ts`, pure, matching how `lib/*.test.ts` are
written in this repo — there is no DOM environment):

- funnel percentages from a fixture, including the zero-search case
- a row builds the right filter for the Searches tab

## Not in this change

No new charting library: the funnel is two divs and a border. No date-range
picker beyond the `from`/`to` that `/searches/summary` already accepts. No
export.
