# Next-session continuation

> Updated 2026-08-20. Everything below is SHIPPED and on `origin/main`
> (`171d2fdd`). No branch to resume, nothing half-finished.

## What shipped

**Search** — named titles are now findable. `detect_catalogue_title()` matches
queries against real `plays.title` values instead of a ~90-entry curated dict,
so "queen's gambit" promotes its pieces rather than returning Hamlet. Guarded
against one-word titles that are ordinary words (Big, Audition, The), verified
by golden replay: 130/131, 0 regressions.

**Content-gap honesty** — a play row with zero monologues no longer counts as
"we carry this". Beetlejuice (film row, 0 monologues) was silently suppressing
its own gap banner. Fixed both at the search end
(`find_catalogue_source_types`) and at the source: both ingest scripts now
create the Play lazily, on the first monologue actually ready to insert.

**Telemetry** — `search_logs.query_type` (title / named_lookup / occupation /
attribute / multi / other). Migration already applied to prod. Referral source
is now a required first tap for new signups.

**Film ingest** — `scripts/ingest_film_monologues.py`, run over all 1,790
ScriptSlug film slugs.

## Film corpus: 1,243 -> 2,344 monologues (+1,101, +89%)

Library is now plays 8,724 / film 2,344 / tv 2,176.

Quality after the repair pass (`scripts/repair_film_ingest.py`): 97.7% clean.
Median 116 words, quartiles 102-143 — real audition lengths. Zero empty play
rows, zero missing authors, zero missing embeddings, zero duplicates across
461 new plays.

Reversal: `backups/ingest_film_watermark.json` — anything above
`monologue_id 18460` / `play_id 1643` is this run. Repair diffs in
`backups/repair_film_ingest_20260820T015238Z.json`.

## Open, in priority order

1. **~248 recoverable films (~250 monologues).** 158 skipped as `no_metadata`
   (absent from `film_tv_references` — backfill it, then re-run with `--slugs`)
   and 90 that returned 403 (just retry). Neither needs a re-scrape.
2. **Gender skew 74/26** (783 male / 279 female). Screenplay reality, but the
   ingest passes it straight through. Fix with targeted `--slugs` top-ups on
   female-led films at a lower `min_words`, not a re-run.
3. **25 rows with minor text defects** — 12 encoding oddities, 13 opening
   mid-sentence. Identifiable by query; the latter need re-extraction.
4. **118 films need OCR or an unindented-script parser** (`no_text_layer` 48,
   `needs_ocr` 23, `not_screenplay_layout` 22). Correctly reported, not
   silently dropped.
5. **TV is a poor source for auditions** — 0.1 audition-length monologues per
   episode vs 1.2 for film; existing TV median is 56 words vs 125 for film.
   Do not invest in TV scraping expecting audition pieces.
6. **BBC Writers Room untested** — officially published, free, best legal
   standing, covers Phoebe Waller-Bridge. The one source worth trying next.

## Watch out for

- **`content_gap` data was polluted before this shipped** (Fleabag showed as
  "missing" 5x while carried; Beetlejuice logged zero while absent). Demand
  ranking only becomes trustworthy from 2026-08-19 onward — let it accumulate
  before prioritising a scrape by it.
- **Golden replay takes ~10 min and is I/O-bound.** Run it in the background
  with `python -u`, or output stays buffered at 0 bytes and looks hung. Wrap it
  in a launcher that eagerly imports `openai.resources.embeddings`/`chat`.
- **The harness omits `db` from `compute_content_gap`** while the endpoint
  passes it, so it cannot see the "we already carry this" branch. Passing it
  flips `named-beetlejuice` and `named-heathers` — that is a stale golden
  expectation, not a regression. Fix fidelity and re-record together.
- **Do not reintroduce a keyword hard-filter floor** in
  `KeywordExtractor.extract()`. Tried, golden caught it over-constraining,
  reverted.

## Deleted branches (recoverable)

5 local-only branches were deleted 2026-08-20, bundled first to
`backups/local-only-branches-20260820T095242Z.bundle`:
`audit/search-perfection`, `feat/scene-library`,
`feat/first-rehearsal-activation`, `feat/feedback-email-queue`,
`fix/plus-scenepartner-cap`. Two held live work (scene-library extractor,
first-rehearsal activation). Restore with
`git fetch <bundle> <branch>:<branch>`. An untracked plan doc from the
feedback-email-queue worktree is at
`backups/2026-05-26-first-search-feedback-email-plan.md`.

## How to run things

- Backend tests: `cd backend && DATABASE_URL="postgresql://localhost:5432/dummy" JWT_SECRET=test ENVIRONMENT=development ./.venv/bin/python -m pytest tests/ -q` — must be `python -m pytest`. Baseline **400 pass**.
- Frontend typecheck: `./node_modules/.bin/tsc --noEmit` at repo root.
- Golden: `backend/scripts/run_golden_search.py --compare scripts/golden_baseline.json`, needs `source backend/.env`. 0 regressions is the bar.
- Deploy: pushing `main` auto-deploys Render. Run any DB migration FIRST.
