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

## Finding 1: the gate is mostly correct. I got this wrong first time.

**Correction.** My first pass claimed 5,795 monologues were hidden by an expired
gate, reading a 75-word floor from this script's docstring and from memory. The
actual constant is `DEFAULT_MIN_WORDS = 100`, raised from 75 on **2026-09-05**
(a40b42f0), the day before this audit. Against the real floor the picture is:

| Gated rows | Verdict |
|---|---|
| 185 | at or above the 100 floor, genuinely mis-gated |
| 5,610 | 75-99 words, below today's floor |
| 38 | under 75, correctly gated under any floor |

The 185 were freed by `scripts/ungate_above_floor.py`, which reads the constant
rather than hardcoding a number. They restored **zero** blank titles, so this was
tidying, not a fix.

The other 5,610 are below a floor that was deliberately raised one day earlier.
Clearing them is not a data repair, it is reversing that decision, so it is left
alone.

### The real question underneath it

The floor is calibrated for stage, and it is being applied to film and TV, whose
pieces are naturally shorter.

| Source | Median piece | Under the 100 floor |
|---|---|---|
| play | 128w | 24% |
| film | 124w | 22% |
| tv | **106w** | **43%** |

TV's median piece is 106 words. The floor sits within six words of the middle of
the entire TV corpus, which is why 43% of it is gated and why **164 of 1,436**
film/TV titles return nothing when an actor names them, with 611 more returning
only one or two.

At ~150wpm the 100-word floor is a 40-second piece. That is a defensible bar for
a stage audition and a harsh one for a self-tape. A source-aware floor, stage at
100 and screen nearer 75, would return most of those 164 titles without putting
clip-length fragments back in front of anyone.

That is Canberk's call, not a cleanup. Nothing here presumes it.

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

1. DONE. Mode toggle no longer counts as an actor-chosen filter, so the AI parse
   and the spell-corrector run again after being dark on 96% of searches.
2. DONE, and smaller than advertised. 185 mis-gated rows freed.
3. DECIDE: a source-aware word floor. Stage at 100, screen nearer 75. This is
   what actually blanks 164 film/TV titles, and it is a product call.
4. When a filtered search comes back thin, look in the other tab and say so.
5. Normalise numerals and apostrophes in title lookup.
6. Route bare abstract words to attribute filters, and de-duplicate by play so
   `war` cannot return the same title four times.
7. Scrape the titles in Finding 3. Last, not first.
