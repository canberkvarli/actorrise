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
