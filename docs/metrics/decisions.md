# Decisions

Changes that could move a number in `metrics-history.csv`, with the date they
landed and what they were meant to do. H-08 exists because a step in the weak
match rate could not be attributed to anything — this file is so the next such
question is answerable. Record retrieval, ranking, embedding, gating and
instrumentation changes here even when they look harmless.

Format: date, what changed, why, and which metric it should move.

## 2026-08-20 — Title pre-pass before vector search

Naming a show is a lookup, not a similarity question. Before the vector query,
the normalised query is matched against `plays.title` (lowercase, punctuation
stripped, leading article dropped, whitespace collapsed, both sides). On a hit
the show's monologues are returned ranked by `quality_score` desc, and the
search is marked not-weak.

- Fires only when no attribute filter is active (source_type is the exception,
  since it narrows plays). With gender/tone/duration/era on, the query falls
  through to the vector path, which already promoted title matches. The
  hard-filter cascade lives inside `SemanticSearch.search`; duplicating it for
  the pre-pass would guarantee drift.
- Matching is exact. pg_trgm is not installed on this project, so there is no
  fuzzy branch — near misses behave exactly as they did before. **Follow-up:**
  if `match_strategy` shows the title branch firing on far fewer searches than
  the ~15% of queries that name a show, install pg_trgm and revisit.
- Shows with fewer pieces than a page keep their pieces at the top and backfill
  the rest from the vector path, rather than returning a one-result page.

Should move: `pct_weak_7d` down (H-07 projects 36.0 -> 24.6). Watch
`search_logs.match_strategy` for the split.

Knock-on: fewer weak matches means the "request this" affordance shows less
often, and shows it on genuinely-missing titles rather than on carried ones.
That is the intended direction, but it means H-09's row count and H-07's weak
rate move together and cannot be read independently.

Verification: backend suite 439 pass (400 baseline + 39 new). Golden harness
129/131, one regression — `legacy-zero-queen-warrior::min_results` — reproduced
on a clean tree with the change stashed, so it predates this work. Cause found
and it was NOT data drift from the film ingest as first guessed: see the
relevance-floor entry below.

## 2026-08-20 — search_logs.match_strategy added

Records which branch answered a search: `title_exact`, `title_exact_backfilled`,
`vector`. Log-only. Without it the pre-pass above is unmeasurable and H-07
cannot be disconfirmed.

Migration: `backend/scripts/add_search_match_strategy.py`, run before deploy.

## 2026-08-20 — query_type backfilled and sealed NOT NULL

The column landed 2026-08-19 and classified 44 of 1,170 rows, which is a week of
traffic rather than an analytics column. `backend/scripts/backfill_search_query_type.py`
classifies the history through the same `classify_query` the live path uses,
then sets `DEFAULT 'other'` + `NOT NULL` so a future insert site cannot silently
reopen the hole.

Caveat that affects reading the split: the live path passes three extra signals
(`parsed_constraints`, `intended_play`, `intended_author`) that were never
stored. The backfill recovers intended_play/author from `content_gap` and leaves
parsed_constraints null, so backfilled rows lean slightly toward `title`/`other`
and away from `attribute`/`multi`. **Compare within an era, not across the
2026-08-19 boundary.**

## 2026-08-20 02:00 UTC — search_relevance_floor raised 0.30 -> 0.35

**Not a code change. It lives in the `app_settings` table, so it has no git
trace and no deploy.** Found while investigating a golden regression; recorded
here because it is exactly the class of metric-moving change this file exists to
make attributable. `app_settings.updated_at` is the only timestamp.

What it does: `classify_relevance` drops every result scoring below the floor.
Raising it to 0.35 removes the 0.30-0.35 tail from every result set.

Measured effect, not estimated:

- 66 distinct queries in the trailing 30 days scored in the 0.30-0.35 band
  (33 searches in 7d, 28.9% of scored traffic).
- **15 of those 66 now return zero results**, where before they returned a
  "closest matches" set. The other 51 are unaffected: filter-vocabulary queries
  ("sad", "funny", "comedic", "girls") are served by the hard-filter fallback
  regardless of cosine, so they still return 20.
- The 15 are almost all titles we do not carry — broad city, hunger games,
  normal people, next to normal, lalaland, coach cartet, maze, playground —
  plus a few genuinely vague ones (crazy, ego, travelling).

This is arguably an improvement rather than a regression: a title we do not
carry now gets the content-gap banner and a request CTA instead of 20
unrelated monologues. It does partially reverse the soft-fail design (weak
matches show closest results rather than a blank screen), so it is a real
product trade and worth making on purpose rather than by accident.

Caused the golden failure `legacy-zero-queen-warrior::min_results`. Verified by
running the query at both floors in-process: **2 results at 0.35, 14 at 0.30**.
`scripts/golden_baseline.json` was captured 2026-07-20 under the old floor, so
the baseline and the live config now disagree. **Open decision:** either accept
the new floor and re-baseline the golden set, or revert the floor to 0.30. Until
one or the other, the golden harness will keep reporting a regression that is
really a config difference.

## 2026-08-21 — Unservable-query check (H-13)

When a short, name-shaped query contains a word the library has never heard of,
search now says so instead of returning 20 confident results. Backed by a new
`corpus_terms` table: every word the corpus can answer for, built from monologue
text, titles, authors, character names, tones, emotions, themes and tags.

**This deliberately RAISES `pct_weak_7d`.** It converts silent wrong answers into
visible ones, which is the point. `pct_weak` is therefore NOT comparable across
2026-08-21 — do not read the rise as a regression, and do not compare it to the
H-07 target, which was measured under the old definition.

Validated by replaying all 427 distinct queries of the last 60 days: 4.7% flagged,
**0 false positives and 1 conservative miss** on a hand-checked set. Three earlier
designs were tried and rejected on that same replay, and are pinned in the tests
so they are not reinvented:

1. **"Does any RESULT contain a query word?"** Flagged "female monologue ambition
   overlooked" and "angry young man confronting his father". Thematic search is
   answered by meaning, not literal overlap.
2. **A hand-written stopword list.** Flagged "ambition", "confession",
   "overlooked". No list of ordinary English is ever complete.
3. **Corpus vocabulary from monologue TEXT only.** Flagged "sarcastic",
   "manipulative", "heartfelt" — words actors search with that characters never
   say. "sarcastic" is the tone of 540 pieces and appears in no speech. The
   vocabulary has to include metadata, not just dialogue.

Two guards, both from that replay: queries over 3 words are exempt (every false
positive was 4+ words, every true positive 3 or fewer), and EVERY distinctive
word must be unknown — "any one unknown" let "Erin Gruwell" through, since
"erin" appears in the corpus and "gruwell" does not.

`corpus_terms` frequency rules differ by source on purpose: text needs >= 3
monologues (once is a typo or a proper noun inside one speech), identity and
metadata qualify at 1 (a play with one monologue is still a play we carry —
at a >= 3 bar "Rising Seniors", which has 2, was reported as unservable).

**Rebuild `corpus_terms` after any bulk ingest**:
`uv run python scripts/build_corpus_terms.py --apply`. Staleness costs precision,
never correctness: a newly-ingested word missing from the table can only cause a
servable query to be called unservable.

### Found while building this: the typo corrector rewrites "rising" to "raisin"

`correct_query_typos("rising seniors monologue")` returns "raisin seniors
monologue" — it fuzzy-matches "rising" onto *A Raisin in the Sun*. This is a
live bug on the normal search path, not something this change introduced, and it
means an actor searching for the play *Rising Seniors* has their query silently
rewritten to something else. The grounding check works around it by accepting
the query as typed OR as corrected, but **the corrector itself is still wrong**
and should be looked at. Untouched here.

## 2026-08-20 — Duplicate `plays` rows merged (327 deleted)

Ingest creates a play row per run without checking for an existing one, so a
show scraped five times became five plays. The audit found 231 duplicate groups
over 358 redundant rows: "The X Files" was 16 rows holding 79 monologues,
"Hamlet" 14 rows, "The Night Manager" 5 rows / 39 pieces.

`scripts/dedupe_play_rows.py --apply`. Result: 1,023 monologues and 16 scenes
reparented, 327 rows deleted, plays 2,069 -> 1,742. **Monologue count unchanged
at 13,244 and zero orphans** — nothing was destroyed, only rows that had already
been emptied. Reversible: `backups/dedupe_play_rows_20260820T120916Z.json` holds
every deleted row plus every reparent mapping.

The grouping key is (normalised title, source_type, normalised author), never
title alone, because two different works share a title more often than you would
think. **27 groups were skipped for exactly this reason and are correct to
skip**: Batman (Reeves / Burton), Insomnia (Nolan / Skjoldbjærg), The Girl with
the Dragon Tattoo (Fincher / Oplev), Dawn of the Dead (Romero / Snyder), Belle
(Asante / Hosoda). Merging on title would have collapsed distinct films into one
— the same failure the 2026-08 play-attribution audit had to undo by hand.

Direct effect on the title pre-pass: "the night manager" now resolves to one row
holding all 39 pieces rather than an arbitrary one of five fragments, and
`detect_catalogue_title`'s "first matching row wins" is no longer a coin flip.

One defect this surfaced is still open: **author transliteration variants block
legitimate merges.** "ANTON TCHEKOV" vs "Anton Tchekoff" is one author and one
play, left as two rows. Harmless, but it means the 27 skipped groups are not all
genuine distinct works.

## 2026-08-20 — 6 play rows had title and author swapped (174 monologues)

Surfaced by the dedupe run. Six rows carried a playwright's name in `title` and
one of their plays in `author`, so 174 monologues were attributed to a "play"
named after their own author:

| was | now | monologues |
|---|---|---|
| title="William Congreve", author="Love for Love" | Love for Love by William Congreve | 74 |
| title="John Millington Synge", author="Deirdre of the Sorrows" | Deirdre of the Sorrows by Synge | 73 |
| title="Arthur Wing Pinero", author="Dandy Dick" | Dandy Dick by Pinero | 19 |
| title="John Millington Synge", author="Riders to the Sea" | Riders to the Sea by Synge | 8 |
| title="Arthur Wing Pinero", author="Trelawny of the Wells" | Trelawny of the Wells by Pinero | 0 |
| title="Richard Brinsley Sheridan", author="St. Patrick's Day" | St. Patrick's Day by Sheridan | 0 |

`scripts/fix_play_title_author_swaps.py --apply`. Reversible from
`backups/fix_play_swaps_20260820T121800Z.json`.

Detection is evidence-based rather than a name heuristic: a row qualifies only
when its `title` value appears as an `author` on other rows — the corpus itself
saying that string is a person. That is why it finds exactly 6 and not a pile of
false positives. Each swapped form was checked for collisions first; none
collided.

Effect: searching "Love for Love", "Deirdre of the Sorrows", "Riders to the Sea"
or "Dandy Dick" returned nothing before and now returns 74/73/8/19 pieces. Same
class of defect the 2026-08 attribution audit fixed 23 of; this is the tail.

**Do not "clean" empty play rows without checking what they are.** Two heuristics
were tried and both were wrong. 252 plays have zero monologues, but 31 are
referenced by `scenes.play_id` and the rest are largely legitimate public-domain
works awaiting extraction (Cymbeline, Ivanov, Salome, Tartuffe, Doctor Faustus).
A second pass at "junk-looking titles" flagged Alien, Juno, X-Men, Elvis and 8½.
Only `test` (#175) and `sadg` (#176) are real debris.

A second round found 2 more swaps the automatic rule provably cannot reach:
`title='J.M. Barrie', author='What Every Woman Knows'` (19 monologues) and
`title='John Dryden', author='Marriage à la Mode'`. The rule needs the person's
name to appear as an `author` on some other row, and each of these has only its
own swapped row. They are pinned as hand-checked ids in the script, with a note
against replacing that with a "title looks like a person" heuristic — that was
tried and flags `Henry VIII` (136 monologues) and `Richard II` (130), real plays
whose titles are also people.

## 2026-08-20 — Why the empty public-domain plays are empty: the stored text is the wrong book

Chasing "35 empty plays already have full_text, just extract from them" turned
up the actual cause. `plays.full_text` on those rows is not the play:

| row | stored text actually is |
|---|---|
| #24 Cymbeline | *Hamlet* editorial notes / a Shakespeare volume preface |
| #32 Ivanov (Chekhov) | *Reminiscences of Anton Chekhov* by Gorky — a memoir |
| #42 The Lady from the Sea (Ibsen) | *Diaries of Sir Moses and Lady Montefiore*, 927 KB |
| #51 Salome (Wilde) | the **German** translation, while `language='en'` |
| #57 Tartuffe | correct — but verse speeches fall under the 75-word floor |

The Gutenberg fetch matched too loosely and stored whatever it got. So the
content gap is not "extraction never ran", it is "there was never usable text".
`extract_pd_monologues.py --only-empty` (flag added today) scans 76 rows and
yields 0 candidates: 41 no-text, 20 non-dramatic, 5 foreign. **The extraction
guards are working correctly** — they are rejecting garbage, and the run is
evidence the guards hold, not evidence of a bug.

Recovering these ~35 canonical works means re-fetching from Gutenberg with a
verification step (does the fetched text actually name this title and these
characters?), not re-running extraction. Not attempted — a fetch that silently
stores the wrong book is exactly how this state was reached.

Related smells found in the same sweep, all still open:

- **Oversized full_text = collected volumes, not single plays.** "Every Man in
  His Humour" carries 3.4 MB, "The Rising of the Moon" 3.7 MB, "Henry IV"
  974 KB. Monologues extracted from a volume may be attributed to the wrong
  play inside it. This is the collapsed-collection failure the 2026-08
  attribution audit hit, and these look like more of it.
- **Collection rows treated as plays.** `#212 "Complete Works of William
  Shakespeare" by "Oxford 1911"` holds 36 monologues; `#1638 "Untitled" by
  "Unknown"` holds 4.
- **Titles mangled by a bad parse.** `#90 "A Play in VerseBy Hugo Von
  Hofmannst"`, `#91 "A ComedyBy Arthur SchnitzlerTranslat"`, `#172
  "(p. 261)EPILOGUE"` — scrape artifacts stored as titles, with the translator
  in the author field.

## 2026-08-20 — Content-request affordance on the dashboard search surface

`SearchInterface.tsx` had no request affordance on either a weak match or zero
results, and `RequestQueryButton` swallowed POST failures silently. Both fixed.
See H-09.

Should move: `content_requests` up. If it stays flat, the demand is not there.

## 2026-08-21 — The daily brief's "12 of 36 recoverable" was measuring the bug

The 2026-08-21 scheduled brief opened with "a third of your weak-match searches
are retrieval failures" and proposed building lexical title retrieval. That work
already shipped on 2026-08-20. The brief's 7-day window simply straddles the
deploy: the first `match_strategy` row is 2026-08-20 16:54, and every search
before it logs `(null)`. It was grading pre-fix traffic.

**Read `match_strategy` before trusting any weak-match aggregate that spans
2026-08-20.** `(null)` means the search predates the title pre-pass.

### What the remaining title failures actually are

Not retrieval. A stale `source_type=play` filter.

`Big Fish` was logged weak at 04:05 and 04:06 today with `filters_used:
{"source_type": "play"}` — Big Fish is a film. The pre-pass honoured the filter,
found nothing under plays, and correctly logged `content_gap: {"play": "Big
Fish", "available_in": ["film"]}`. At 04:06:31 the same user switched to Film &
TV and got 20 results via `title_exact_backfilled`. Same story for `Pen 15` and
`the night manager`.

The tab defaults to **Plays**, so any film/TV title typed from a fresh page load
lands filtered. `ContentGapBanner` already renders "X lives in Film & TV / Take
me there →" and is wired to `setSearchMode`, so the recovery path exists and
works end to end. This is the falsifier H-search-title wrote for itself: a UI
problem, not an embedding one.

### Billing is not broken

`billing_history` holds 64 rows, all `status='succeeded'`. The brief queried
`status='paid'`, which this schema never writes. No webhook bug. Do not
re-investigate on a future `paid_invoices = 0`.

## 2026-08-21 — Scraped boilerplate was poisoning search ranking

Found by loading a results page rather than by querying: searching "comedic
female monologue" on prod returned, at positions 2 and 3 and both badged "Best
pick", cards whose body text read *"Note: We are not able to display the full
text for this monologue... Please visit our monologue database..."*.

100 monologues (0.8% of 12,435) stored a disclaimer scraped from the source
site's page furniture as the monologue body. Two harms:

- It advertised a competitor, on the results page, in the product's own voice.
- It poisoned ranking. Embeddings are built from `m.text` alone, and the
  passage says "monologue" three times plus "text", "script", "users". All 100
  rows therefore sat close to any query phrased as "... monologue" — which is
  how actors phrase nearly everything. They also all carried a flat
  `quality_score` of 0.85, so nothing downstream held them back.

**A 0.8% data defect took two of the top three slots on a flagship query.**
Corpus-wide artifact counts are the wrong instrument for this class of bug; the
count was never the damage, the ranking was.

Fixed by `backend/scripts/strip_scraped_boilerplate.py` (dry-run default,
reversible backup at `backups/scraped_boilerplate_20260821T075950Z.json`).
Stripping text without re-embedding would have fixed the display and left the
ranking exactly as broken, so `--apply` re-embeds every row it edits; all 100
done. Verified after: 0 rows contain the header, the competitor ad, or the
editorial tail, and the same query now returns real monologues.

The rest of the corpus is clean — a sweep for html tags, entities, mojibake,
cookie banners, all-caps residue and copyright notices found zero of each. The
earlier cleanup passes did their job.

Left deliberately undone:

- **3 rows keep a visible citation** because removing it would drop them under
  the 40-word floor the stripper refuses to cross. Conservative by design.
- **14 rows fall under 50 words once the padding is gone** (Eurydice 34, The
  Wolves 21, The Humans 42, Amadeus 46...). By the 2026-08-20 rule these are
  not monologues and `purge_sub_50_word_monologues.py` would delete them — but
  deleting 14 named-play entries is a content decision, not a side effect of a
  text cleanup. Canberk's call.
- **Copyright exposure is untouched and worth a look.** These rows are
  contemporary in-copyright works (Dear Evan Hansen, Venus in Fur, God of
  Carnage). The source site published start/end lines only, deliberately. 58 of
  the 100 carry what looks like a full speech rather than an excerpt.

## 2026-08-21 — OPEN, and the largest content defect: two collapsed anthologies

Found while sweeping for more of the boilerplate class. **1,690 of 12,435 rows
(13.6%) share just 136 distinct texts.** Not near-duplicates — byte-identical.

The cause is the collapsed-collection failure from the 2026-08 attribution
audit, but far larger than the six suspects logged then. Two public-domain
one-act anthologies were ingested so that *every play row in the volume
received every monologue in the volume*:

- **Play ids 93–104 and 133 — 13 rows, 53 identical monologues each.** Titles
  are raw parse artifacts (`"A ComedyBy George AnceyTranslated from the
  French"`, `"A PlayBy Giuseppe GiacosaTranslated"`, `"THE BA"` / author
  `"CARRIAGE"`), and the `author` column holds the volume's *translator or
  editor* ("Barrett H. Clark.", "Benjamin F. Glazer.") rather than the
  playwright. Same family as the mangled titles at #90/#91.
- **Play ids 105–113+ — 52 identical monologues each.** These rows have
  *correct* titles and authors (THE TWELVE-POUND LOOK / Barrie, THE BOOR /
  Chekhov, HYACINTH HALVEY / Lady Gregory, SAM AVERAGE / MacKaye). Only the
  monologue-to-play mapping is wrong.

So Chekhov's Smirnov and Strindberg's Mrs X are both currently filed under a
play row titled "A DOLLAR". A search can return the same speech up to 18 times
under 18 different play names, every one of them misattributed.

**Not fixed, deliberately.** The mechanical part (delete duplicates) is
unsafe on its own: for any given text at most one of the 18 rows is correct,
and choosing wrong silently locks in a misattribution. Group 2 is genuinely
recoverable because character names map onto the real titles that already
exist in the same anthology (Hyacinth → HYACINTH HALVEY, Smirnov → THE BOOR),
which is a per-monologue judgement across ~105 pieces, not a query. Group 1
needs the source volumes re-identified first, since the stored titles are
parse debris.

This is the same shape as the 252 "empty shell" plays: a mass edit that looks
mechanical and is not. Wants a session with Canberk reviewing, not an
autonomous pass. It is now the biggest single quality item on the board —
larger than the boilerplate by a factor of seventeen.

## 2026-08-21 — "Pen 15" could not find "Pen15"

`_normalise_title` strips punctuation but not spaces, so a query never matched a
stored title that disagreed about where the space goes. "Pen 15" normalised to
`pen 15`, the catalogue held `pen15`, and the actor was told we had never heard
of a show we carry 3 monologues from — then tried "Maya Pen 15" and left. Same
shape as "Se7en" or "Ocean's 11".

Spaces cannot simply be dropped from `_normalise_title`: the phrase matching in
`detect_catalogue_title` needs word boundaries to tell a title inside a sentence
from a coincidental run of letters. Added `_squash_title` as a separate,
secondary index instead — consulted only after every spaced form has failed,
floored at 5 characters, and a key that two different titles squash onto is
dropped rather than resolved arbitrarily. `find_catalogue_source_types` learned
the same comparison, which is what made `Pen 15` report no content gap at all.
