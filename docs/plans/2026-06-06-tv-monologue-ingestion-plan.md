# TV Monologue Ingestion Plan

**Date:** 2026-06-06
**Author:** Canberk (with Claude)
**Status:** Draft / not started

## Problem

The search "Plays / Film & TV" toggle implies TV content exists. It does not.

Live DB counts (Supabase `ppvqmbzuqvzpiuqaiqfy`, 2026-06-06):

| source_type | titles | monologues |
|-------------|--------|------------|
| `play`      | 566    | 7,072      |
| `film` (all `type=movie`) | 698 | 1,424 |
| `tv`        | **0**  | **0**      |

`film_tv_references` holds **2,270 `tvSeries`** rows (IMDb IDs + 3072-dim embeddings, posters), but:

- **0 of them have a script URL** (`imsdb_url` empty for all TV — and, notably, for all movies too).
- **None are linked to any `plays` row.** Every `plays.film_tv_reference_id` points at a `movie`.

So TV titles were imported as **catalog/reference metadata only**. No TV script was ever scraped, no TV monologue was ever extracted. A `source_type:["film","tv"]` search is really just searching the 1,424 movie monologues; the `tv` filter token matches nothing.

## Existing film pipeline (what we'd mirror)

Three scripts in `backend/scripts/`:

1. `seed_film_tv_references.py` — IMDb datasets → OMDb enrichment → embeddings → upsert into `film_tv_references` (movie + tvSeries). **Already run for TV** (2,270 rows exist).
2. `extract_film_tv_monologues.py` — the core extractor. For each ref **that has an IMSDb URL**: scrape script HTML → parse screenplay format → GPT-4o-mini selects audition-worthy monologues → `ContentAnalyzer` (emotion/theme/embeddings) → store as `Play` (`source_type='film'`) + `Monologue`, fair-use excerpt only (100–400 words), full script never stored.
3. `seed_film_tv_monologues.py` — small hand-curated metadata seed (no script text).

**Open question to resolve first:** the extractor keys on "refs that have an IMSDb URL," yet the `imsdb_url` column is empty for *all* refs including the 698 movies that DID get monologues. So film script URLs were sourced some other way (likely on-the-fly discovery in `scrape_all_sources.py` / a title→IMSDb URL builder, not the stored column). **Before planning TV, confirm how film scripts were actually located.** That mechanism is what we extend.

## The real blocker: TV script sourcing

IMSDb is movie-heavy; TV episode coverage is sparse and inconsistent. TV transcripts also differ structurally from screenplays (fan transcripts, sitcom formats), so the existing IMSDb screenplay parser likely won't handle them cleanly.

### Source scouting verdict (2026-06-07)
- **ScriptSlug `/scripts/series` — RECOMMENDED.** Hosts real TV **teleplay PDFs**
  (The White Lotus, Euphoria, Fargo, Mr. Robot, …); each TV script page exposes a
  direct `assets.scriptslug.com/...pdf`. Same format as the movie scripts, and the
  **film pipeline already downloads + parses ScriptSlug PDFs** (`fetch_script_pdf`,
  `discover_scriptslug_pdf_url`, `pdf_parser.py`). Lowest friction, highest quality.
  The `/scripts/series` index renders its catalog via JS, so enumerating the full
  list needs a headless crawl (firecrawl) — a spike task.
- **IMSDb** — already supported by the pipeline; carries a minority of TV pilots. Use as a secondary.
- **Springfield! Springfield!** — REJECTED. Transcripts have **no speaker labels**
  (raw continuous dialogue), so single-speaker attribution is impossible. Fails the gate by design.
- **subslikescript.com** — JS-rendered fan subtitles, no reliable speaker labels. Skip.
- **Forever Dreaming** — community transcripts behind a JS/Cloudflare forum; messy, variable labels. Skip unless ScriptSlug+IMSDb coverage proves too thin.

**Implication:** the plan simplifies dramatically — instead of building a new
transcript parser (Phase 2), we mostly **reuse the existing ScriptSlug PDF path
pointed at TV titles**, with every candidate passing the quality gate.

## Quality gate (BUILT — `app/services/extraction/monologue_quality.py`)

Quality is the non-negotiable condition for doing the scraping at all. A
deterministic gate now runs at extraction time (before GPT selection / DB
storage) and HARD-rejects anything that isn't a clean single-speaker monologue.
`assess_monologue_quality(text)` returns `ok` + `reasons`, rejecting on:

- `interleaved_speaker` — a `NAME:` line, a bare ALL-CAPS name line, or a
  screenplay `(CONT'D)/(V.O.)/(O.S.)` marker (another character splitting the speech)
- `bracket_cue` — `[LAUGHTER]`, `[APPLAUSE]`, `[MUSIC]`
- `parenthetical_direction` — `(beat)`, `(softly)`, `(turns to the band)`
- `scene_heading` — `INT./EXT.` slugs
- `html_residue` — leftover tags / `&#39;` entities
- `weird_chars` — unicode replacement char, control chars (mojibake)
- `truncated_end` — no terminal `.?!` (mid-sentence cutoff)
- `too_short` / `too_long` — outside 40–400 words

Unit-tested in `backend/tests/test_monologue_quality.py` (15 tests, incl. realistic
dirty-TV samples). GPT selection remains a second layer for "is this
audition-worthy"; the gate is the mechanical guarantee.

**Empirically validated against the live DB (2026-06-06):**
- **Plays: 96.8% pass** (400 sampled). The ~3% rejected are genuine artifacts —
  appended source citations, italic-markup residue, bracketed stage directions.
- **Film: 66.5% pass.** `parenthetical_direction` flags ~25% — confirmed real
  defects: embedded stage directions AND other characters' lines inside the
  monologue text (e.g. `(Nicole: And you're not.)`). The gate catches exactly the
  "other characters splitting the monologue" failure mode.

**Bonus / side-quest:** the same gate can audit and clean the EXISTING film
library, where ~1 in 4 monologues currently carries cue/cross-talk residue.

## Proposed phases

### Phase 0 — Spike RESULT (done 2026-06-07)
Ran 11 marquee shows through `scripts/spike_tv_scriptslug.py` (download → existing
`MonologueExtractor` PDF path → quality gate). Verdict:
- **Sourcing + download: solved.** ScriptSlug sitemap + `assets.scriptslug.com` PDFs work.
- **The existing PDF parser is NOT screenplay-aware — this is the real blocker.**
  It mislabels `INT.`/`EXT.`/stray words as characters and merges action +
  multiple speakers into one "monologue." ~6/11 PDFs yielded 0 candidates
  (likely image-only PDFs needing OCR); the rest produced garbage.
- **Quality gate works as the backstop.** After hardening (scene headings anywhere
  + `caps_residue`), it rejected 36/37 garbage candidates (the 1 survivor still had
  a leading cue + trailing action line). The gate can reject junk but cannot
  reconstruct clean dialogue — that's the parser's job.
- **Conclusion:** TV ingestion is viable but gated on building a **screenplay-aware
  PDF parser** (segment by CHARACTER cue, drop scene headings/action/parentheticals,
  OCR fallback for image PDFs). Not a quick win.

### Phase 0 (original feasibility outline)
- Confirm the film URL-discovery mechanism (resolve the open question above).
- Pick 10 well-known, dialogue-rich TV titles already in `film_tv_references` (e.g. *Breaking Bad*, *Mad Men*, *Fleabag*, *The Crown*, *Succession*).
- Manually locate transcripts on 1–2 candidate sources; eyeball format quality.
- **Decision gate:** is automated parsing viable, or is curation cheaper at our scale?

### Phase 1 — Script URL discovery for TV refs
- Add/populate a `script_url` (or reuse `imsdb_url`) on `tvSeries` refs via a discovery script that searches the chosen source(s) by title (+ optionally per-episode).
- Store provenance (source name) for attribution.
- Idempotent, rate-limited, resumable (mirror `seed_film_tv_references.py`'s "skip existing, take next N" pattern).

### Phase 2 — TV-aware parser
- Extend the screenplay parser (or add a transcript parser) to handle the chosen source's format: speaker labels, scene markers, removing recap/credits noise.
- **Only use sources with explicit per-line speaker attribution** — without it we can't prove single-speaker continuity, so such sources are rejected outright.
- Every candidate must pass `assess_monologue_quality()` before GPT selection. Anything flagged is dropped and logged with its reasons (gives a per-source quality readout to compare sources).
- Reuse the GPT-4o-mini monologue-selection + `ContentAnalyzer` steps unchanged.

### Phase 3 — Extraction run
- Run the extended extractor against TV refs that now have a script URL.
- Write `Play` rows with a real TV `source_type`. **Decision:** introduce `source_type='tv'` (cleanest; matches the existing filter token) vs. fold into `'film'`. Recommend `'tv'` so the toggle is honest and analytics separate.
- Same fair-use constraints: short excerpt only, full transcript never stored, attribution + source link required.
- Start small (high-rating, high-vote titles), QA a sample, then scale.

### Phase 4 — Wire-up + cleanup
- Verify the `source_type:["film","tv"]` filter now returns TV results (already supported in `semantic_search.py` via `source_type.in_(...)`).
- Remove the soft-fail "Film & TV is thin" caveat once coverage is real.
- Backfill the admin "Content Gaps" view to confirm TV zero-results drop.

## Cost (rough, mirrors film estimate)
GPT-4o-mini selection ~$0.001/script + analysis ~$0.002/monologue + embeddings ~$0.0001/monologue. ~1,000 TV titles → ~3,000 monologues ≈ **$10–15** in model spend, plus scraping time. The expensive part is **engineering the per-source parser**, not tokens.

## Risks / notes
- **Legal:** TV transcripts' ToS vary; confirm fair-use posture per source before scraping. Keep excerpt-only + attribution, as with film.
- **Quality:** fan transcripts are noisier than teleplays → expect more garbage-monologue filtering (`remove_garbage_monologues.py`, `recover_truncated_monologues.py` already exist for this).
- **Scope:** start with ~50–100 marquee shows, not all 2,270. Coverage of recognizable titles matters more than volume for audition users.

## Immediate, near-zero-cost honesty fix (independent of this plan)
If TV ingestion is deferred, relabel the toggle "Film" and drop the dead `tv` filter token until real TV monologues exist, so the UI stops promising content that isn't there. (Not doing this now per decision to plan full ingestion instead.)
