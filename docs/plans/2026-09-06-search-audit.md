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

**DONE 2026-09-06.** The floor is now per-source via
`monologue_quality.min_words_for_source`: stage 100, screen 75, unknown sources
get the stricter stage floor. Both the retire and un-gate scripts ask that helper
instead of comparing against the constant, which is load-bearing: retire's flat
comparison would have pulled every freed screen piece straight back out on its
next run. 1,496 screen pieces freed.

| | before | after |
|---|---|---|
| film titles with zero visible pieces | 164 | 3 |
| tv titles with zero visible pieces | 40 | 0 |

Better Call Saul went 0/7 to 7/7 visible. Shawshank 7/7, Joker 2/2, BoJack 2/2,
Black Swan 1/1. Undo lists are in `backend/backups/ungated_*.json`.

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

## Finding 2: WITHDRAWN. Title lookup already handles these.

My first pass said numerals and apostrophes broke the title lookup. Wrong. I had
tested with raw SQL ILIKE instead of calling the lookup. Running the real
`detect_catalogue_title` against the live catalogue:

| Typed | Resolves to | Pieces |
|---|---|---|
| `brooklyn 99` | Brooklyn Nine Nine | 2 |
| `queen's gambit` | The Queens Gambit | 2 |
| `one flew over the cuckoos nest` | One Flew Over the Cuckoo's Nest | 3 |
| `yellow jackets` | Yellowjackets | 12 |
| `better call saul` | Better Call Saul | 7 |

Every one resolves. `_normalise_title` already strips punctuation and
`_squash_title` already handles the digit/word split. Nothing to fix.

What the table actually shows is the real pattern: **every one of these is a
screen title, and every one returns 0 on the Plays tab.** Finding 1c was not one
of several problems. For title searches it is the only problem.

## Finding 2b: the cross-tab redirect also already works

`compute_content_gap` returns `available_in` for all of them, so the UI has been
offering the other tab correctly the whole time.

The bug was never in the search. It was in the **reporting**. The admin summary
counted every `content_gap` object as missing content, including recoveries:

| 30 days to 2026-09-06 | |
|---|---|
| reported as "we don't have it" | 66 |
| actually in the other tab, actor redirected | 57 |
| genuinely missing | 9 |

That headline is what pointed this audit at a scraping backlog. Anastasia, Black
Swan, Sing Street, Mean Girls and Better Call Saul were all on the "missing"
list, and all five are in the library.

Fixed: the summary now splits `content_gap_count` (real gaps, the scrape list)
from `wrong_tab_count` (recoveries, a save). The row flag reads "it's under
film / tv" instead of "we don't have it", and the two are separately filterable.

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
3. DONE. Source-aware word floor, stage 100 and screen 75. This is what was
   actually blanking 164 film/TV titles.
4. DONE. The dashboard no longer reports cross-tab recoveries as missing
   content. "We don't have it" went 60 to 7, which is the real scrape list.
5. WITHDRAWN. Title normalisation was never broken.
6. TODO, and now the only search work left: route bare abstract words to
   attribute filters, and de-duplicate by play so `war` cannot return the same
   title four times.
7. Scrape the titles in Finding 3. It is nine searches, not sixty.
