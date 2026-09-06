# Search audit, 30 days to 2026-09-06

932 page-1 searches, 272 weak or empty (29%).

## The hypotheses the data kills

Neither of the obvious culprits is real. Ranked by weak rate:

| Cut | Weak rate |
|---|---|
| 0 filters | 29% |
| 3-4 filters | 36% |
| 7+ filters | 25% |
| 1-word query | 45% |
| 9-20 word query | 9% |

Over-constraint is not the problem. Long, filter-heavy queries are the
**healthiest** searches on the platform. Short ones fail.

By retrieval branch:

| Branch | Searches | Weak |
|---|---|---|
| `title_exact` | 27 | 0% |
| `title_exact_backfilled` | 84 | 0% |
| `vector` | 643 | 34% |

The title branch is perfect when it fires. It just does not fire often enough.

## Finding 1: 5,795 monologues are hidden by a gate that expired

`review_status='too_short'` covers 5,833 rows, 25% of the corpus. Their stored
word counts average 89. The floor is 75.

- 5,795 of 5,833 now have `word_count >= 75`.
- A 400-row sample recounted from `text`: **100%** are genuinely over the floor,
  and the stored count is accurate in every case.
- All 5,833 were last written on **2026-09-01**, the stage-directions restore.

The pieces were gated while the play parser was stripping stage directions and
making them look short. The restore put the text back and resynced
`word_count`. Nothing ever cleared `review_status`. They have been invisible
since, and all 5,833 are already embedded, so un-gating costs nothing.

What it unlocks:

- **164 of 1,436** film/TV titles currently return zero pieces when named.
- **611** more return only 1-2, so the title branch backfills with vector junk.
- Clearing the stale gate makes **121 film, 40 TV, 20 play** titles findable by
  name again.

Directly explains searched-and-failed: Better Call Saul (7 pieces, 0 visible),
Joker (2, 0), BoJack Horseman (2, 0), Black Swan (1, 0).

Proposed: clear `review_status` where it is `too_short` and `word_count >= 75`.
Reversible, no re-embedding, no scraping. Re-run the real gate afterwards if a
floor is still wanted, and consider a lower floor for film/TV, whose pieces are
naturally shorter than stage work.

## Finding 1b: the mode toggle silently switches the AI off

In `SemanticSearch.search`:

```python
if explicit_filters:
    # If the user provided explicit filters, skip AI parsing entirely to save cost.
```

The Plays / Film & TV tab always sends `source_type`, and `source_type` lands in
the same `filters` dict that becomes `explicit_filters`. So the branch is taken
on **894 of 932** searches, 96%.

Skipping that block skips two things, not one: the AI filter parse, and
`corrected_query`, which is the spell-corrector. Neither has run in production
for any actor who had a tab selected, which is everyone.

Measured on the live corpus, same query, same mode, only difference being
whether a filter dict was passed:

| Query | AI skipped (what actors get) | AI allowed |
|---|---|---|
| `vilian` | Othello, Coriolanus, Much Ado | corrects to **villain** → First Blood, Despicable Me 2, Hot Fuzz |

The misspelling embeds to something vaguely Shakespearean and returns confident
nonsense. The corrector that would have caught it was switched off by a tab the
actor never thought of as a filter.

Fix: judge the skip on *actor-chosen* filters only. `source_type` coming from
the mode toggle should not count as an explicit filter.

## Finding 1c: actors search the wrong tab, and the tab is silent

Harry Potter is filed `source_type='film'`. In Film & TV mode `garry potter`
returns Harry Potter pieces correctly. In Plays mode it returns nothing, because
the filter removed them before scoring.

From the logs, the same actor, minutes apart:

- `Sing street`, source_type `play` → 2 results, flagged "we don't have it"
- `Sing street`, source_type `film,tv` → 20 results

Nothing tells them the piece exists one tab over. This is what most of the
"we don't have it" flags actually are.

Fix: when a filtered search comes back thin, re-run it without the mode filter
and, if the other tab has results, say so instead of showing an empty stage.

## Finding 2: title lookup does not normalise punctuation or numerals

The corpus has these. Actors searched them and got nothing.

| Typed | In corpus as |
|---|---|
| `brooklyn 99` | Brooklyn Nine Nine |
| `queen's gambit` | The Queens Gambit |
| `one flew over the cuckoos nest` | One Flew Over the Cuckoo's Nest, 5x |
| `yellow jackets` | Yellowjackets |

Numerals spelled out vs digits, and apostrophe present vs absent. A fold on both
sides of the title comparison fixes all four.

(`garry potter` is NOT one of these. Verified: it resolves correctly in Film &
TV mode. It failed only because the actor was in Plays mode. See Finding 1c.)

## Finding 3: the genuine scrape list is short

Verified absent, and asked for by name:

- **The Humans**, Stephen Karam. Searched 3x. Major contemporary play.
- **Normal People**, Sally Rooney.
- Del Shores catalogue (`yellow del shores`, `del shores`), Elaine May.
- Steven Universe, La Casa de Papel, Dragon Ball, Big Bang Theory, Animal Farm.

That is the whole confirmed gap from 30 days of traffic. The scraping backlog is
not what is driving the 29%.

## Finding 4: single abstract words have no answer

`war`, `crazy`, `hopeful`, `power dynamics`, `fantasy setting`, `sarcastic`.
Cosine 0.27-0.35, 20 results, no click. `query_type='other'` is 369 searches and
**175 of the 272 weak ones, 64% of all failure**. One word carries too little
signal for a vector query, and there is no fallback that turns it into an
attribute filter.

`war` is the sharp case: 19 plays and 105 visible pieces match the word, and the
actor still got a 0.33 shrug seven times.

## Finding 5: the track button is a complaint button

`content_requests` holds "Power dynamics", "High stakes", "Emotional and big
changes", "monologues for women", plus Heathers, Mean Girls and Better Call
Saul, all of which are in the corpus. Actors press it to say "this search
failed", not "you lack this title". Read it that way.

## Order of work

1. Clear the stale `too_short` gate. One statement, unlocks 25% of the corpus
   and 181 titles. No scraping, no re-embedding, reversible.
2. Stop the mode toggle counting as an explicit filter, so the AI parse and the
   spell-corrector run again. One condition, restores a feature that has been
   dark on 96% of searches.
3. When a filtered search comes back thin, look in the other tab and say so.
4. Normalise numerals and apostrophes in title lookup.
5. Route bare abstract words to attribute filters, and de-duplicate by play so
   `war` cannot return the same title four times.
6. Scrape the titles in Finding 3. Last, not first.
