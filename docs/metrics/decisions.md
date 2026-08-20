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

Two defects this surfaced, both still open:

- **Title/author are swapped on some play rows.** `title="Arthur Wing Pinero",
  author="Dandy Dick"` and `title="John Dryden", author="All for Love"`. The
  2026-08 attribution audit fixed 23 of these; more remain.
- **Author transliteration variants block legitimate merges.** "ANTON TCHEKOV"
  vs "Anton Tchekoff" is one author and one play, left as two rows. Harmless,
  but it means the 27 skipped groups are not all genuine distinct works.

## 2026-08-20 — Content-request affordance on the dashboard search surface

`SearchInterface.tsx` had no request affordance on either a weak match or zero
results, and `RequestQueryButton` swallowed POST failures silently. Both fixed.
See H-09.

Should move: `content_requests` up. If it stays flat, the demand is not there.
