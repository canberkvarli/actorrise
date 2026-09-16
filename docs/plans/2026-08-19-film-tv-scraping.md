# Film & TV scraping: plan

Written 2026-08-19. Goal: materially increase film/TV monologue coverage.

## Where we actually stand

Not zero. The library already holds:

| source | monologues | titles |
|---|---|---|
| play | 8,724 | 432 |
| tv | 2,176 | 355 |
| film | 1,243 | 569 |

3,419 film/TV monologues over 924 titles, 3,371 with real text (>=200 chars).

The reason it feels empty is **discoverability, not absence**. Until commit
`ce55640d` (committed, NOT yet pushed), a query naming a show we carry often
failed to reach it — "queen's gambit" returned Hamlet while its 5 pieces sat in
the DB. The August audit found the same class of bug: the 75-word gate made 162
of 355 TV titles unfindable by name.

**Ship the pending search fixes before judging coverage by feel.** A chunk of
the perceived gap is already fixed and unpushed.

## The real coverage gap

- `film_tv_references`: **14,271 titles** with full OMDb metadata
  (12,001 movies, 2,270 tvSeries).
- Only **924** have monologues.
- `imsdb_url` is **0 non-null across all 14,271 rows** — the film extractor's
  entry condition is "references that have an IMSDb URL", so it currently has
  zero work to do. This is the single biggest blocker on the film path.

## Demand data is not yet usable for prioritisation

Only 13 search_logs rows carry a content_gap. The top entries are *Fleabag*
(5x) and *10 Things I Hate About You* (2x) — both titles we **do** carry, i.e.
false gaps from the bugs above. Beetlejuice, which we genuinely lack, logged
**zero**, because its empty play row suppressed the gap.

So: scrape for breadth now; revisit demand-ranking once the fixes have been
live long enough to produce honest gap data.

## Existing tooling (do not rebuild)

| script | path | status |
|---|---|---|
| `extract_film_tv_monologues.py` | IMSDb -> parse -> GPT select -> analyse -> store | built, starved of URLs |
| `spike_tv_scriptslug.py` | ScriptSlug teleplay PDFs, read-only yield spike | proven phase-0 |
| `spike_tv_v2.py` | second TV spike | — |
| `audit_film_tv_quality.py` | quality audit | — |
| `fix_film_tv_text.py` | text repair | — |

Legal posture is already set and should not be widened: short excerpts only
(100–400 words), full scripts never stored, `copyright_status=copyrighted`,
`license_type=fair_use`, attribution + source link required.

## Additional sources for the missing titles (researched 2026-08-19)

IMSDb alone will not cover the gap — it is film-heavy, and the titles actors
keep naming are TV. Candidate sources, ordered by how defensible they are:

**Tier 1 — publisher-sanctioned (use first).**
- **BBC Writers Room** — https://www.bbc.co.uk/writersroom/scripts — the BBC
  publishes these itself, free, for study. Covers exactly the British TV
  actors ask for, including Phoebe Waller-Bridge (*Fleabag* — our most
  "requested" title, even in polluted data). Best legal standing available.
- **Studio FYC / awards screenplays** — studios publish official PDFs during
  awards season (A24, Netflix, Sony Pictures Classics, WB). Sanctioned, high
  quality, but seasonal and film-weighted.
- **Writers Guild Foundation index** —
  https://www.wgfoundation.org/web-resources-where-to-find-scripts-online —
  a curated map of where scripts are legitimately readable. Use as the
  source-of-sources rather than scraping it.

**Tier 2 — aggregators (proven, but mixed provenance).**
- **Script Slug** — already spiked and working (`spike_tv_scriptslug.py`).
- **8FLiX** — https://8flix.com/scripts/tv/ — teleplay library, free downloads.
- **SimplyScripts** — https://www.simplyscripts.com/tv.html
- **Daily Script**, **The Script Lab**, **TV Calling** script library,
  **TV Writing** (Javier Grillo-Marxuach's produced-TV collection).

These aggregators host material of varying provenance. Our posture already
handles this correctly — extract a short excerpt, never store the full script,
mark `fair_use`, attribute the writer and link the source. Keep to that
regardless of source, and prefer Tier 1 where a title exists in both.

Operational manners: rate-limit, identify the crawler, respect robots.txt, and
cache fetched scripts locally so a re-run never re-hits the origin.

## Phase 0 RESULT (run 2026-08-19) — ScriptSlug is viable

Measured on 10 marquee TV episodes, re-gated independently:

**112 clean of 113 candidates (99%)**, ~12.4 clean monologues per episode.

| show | candidates | clean |
|---|---|---|
| succession | 23 | 23 |
| mr-robot | 22 | 22 |
| better-call-saul | 21 | 20 |
| breaking-bad | 12 | 12 |
| mad-men | 12 | 12 |
| game-of-thrones | 10 | 10 |
| severance | 7 | 7 |
| fleabag | 5 | 5 |
| the-bear | 1 | 1 |
| euphoria | 0 | 0 (cid-garbage, needs OCR) |

**The parser choice is everything.** `spike_tv_scriptslug.py` calls
`MonologueExtractor.extract_from_source(path, "pdf")`, which routes through the
generic `pdf_parser.py` (`page.extract_text()`). That flattens the page and
destroys the indentation separating cue / dialogue / action, so character names
and INT./EXT. lines land inside the dialogue: 37 candidates, 3% clean,
`caps_residue` on 36 and `scene_heading` on 29.

`screenplay_pdf_parser.extract_screenplay_monologues()` uses word x0 positions
and indentation bands instead. Same PDFs: 113 candidates, 99% clean,
`caps_residue` and `scene_heading` **both zero**. It also gates internally, so
its output is already clean, and it has a `cid_ratio` guard that flags PDFs
with broken font maps.

**Action: the spike script points at the wrong parser. Any bulk ingest must use
`extract_screenplay_monologues()`.** This one substitution is the difference
between viable and unusable, and it likely explains the quality of the existing
TV corpus (99.6% missing authors, caps/punctuation damage).

### The real constraint is LENGTH, not cleanliness

Word counts: **min 40, median 49, max 183**. An audition monologue wants
roughly 100–350 words (1–2 min). So most of what this yields is short beats,
not audition pieces. Mechanical cleanliness is solved; audition-worthiness is
not. The production pipeline's GPT selection step exists for exactly this and
must not be skipped — expect the usable fraction to be well below 99%.

Raise `min_words` from 40 toward ~90 and re-measure before estimating real
yield. Do not extrapolate 12.4/episode as usable monologues.

### Yield curve: FILM beats TV ~9x at audition length

Same parser, same gate. Per script, by `min_words`:

| min words | ~duration | TV (9 eps) | FILM (11 scripts) |
|---|---|---|---|
| 40 | 20s | 12.6 | 25.1 |
| 60 | 30s | 3.1 | 8.0 |
| 90 | 45s | 1.0 | 2.5 |
| 120 | 1min | **0.1** | **0.9** |
| 150 | 75s | 0.1 | 0.6 |

TV teleplays essentially do not contain audition-length speeches — 1 hit across
9 episodes at 120 words. That is the medium, not the parser: TV dialogue is
rapid exchange. It matches the library's own data, where the existing TV corpus
has a **median of 56 words** versus **125 for film** and 90 for plays.

**So: prioritise FILM.** It yields ~9x the audition-length material per script,
and it is the under-served half (569 film titles carried out of 12,001
catalogued).

### This kills the `imsdb_url` blocker

ScriptSlug carries film scripts, not just teleplays, and the positional parser
works on them. So the film path does **not** need the IMSDb URL-mapping project
(Phase 2 below) — it can run through ScriptSlug immediately. Drop that work
unless IMSDb turns out to cover titles ScriptSlug lacks.

Rough sizing at `min_words=90` (2.5/script): if even a quarter of the 12,001
film references are on ScriptSlug, that is ~3,000 scripts -> ~7,500 monologues,
several times the current film corpus of 1,243. At 120 words, ~2,700.

### Silent-zero diagnosis (run 2026-08-19) — three causes, one real bug

| film | lines | words | cue band | dlg lines | monos |
|---|---|---|---|---|---|
| Moonlight | 0 | 0 | — | 0 | 0 |
| 12 Angry Men | 10,527 | 35,840 | 18 | 0 | 0 |
| Good Will Hunting | 4,885 | 23,579 | 306 | 255 | 0 |
| network (control) | 8,778 | 37,706 | 324 | 4,362 | 31 |
| a-few-good-men (control) | 6,635 | 27,571 | 252 | 3,961 | 65 |

**1. Empty text layer defeats the OCR guard (real bug).** Moonlight is a 5 MB
scanned PDF with no extractable text. `cid_ratio()` computes
`count("(cid:") / max(len(tokens), 1)` = `0/1` = **0.0**, which passes the
`> 0.05` check. The guard detects broken *font maps*, not missing *text*, so an
image-only PDF is indistinguishable from a perfect one and silently yields
nothing.
*Fix:* before segmenting, require a plausible text layer (e.g. >= 500 words and
>= 200 lines). Below that, mark `needs_ocr` and log it — never return `[]`
silently.

**2. Unindented scripts produce a negative dialogue band.** 12 Angry Men's cue
band lands at x0=18 (left margin), so `dlg_lo, dlg_hi = band-110, band-20`
becomes **-92 … -2** — a range no x0 can satisfy. Controls sit at 252-324.
*Fix:* reject when the detected cue band is implausibly small (< ~100) or when
`dlg_lo` <= 0. That is "not a formatted screenplay PDF", not "no monologues".

**3. Cue and dialogue at near-identical indents.** Good Will Hunting detects a
band (306) but finds only 255 dialogue lines vs ~4,000 in controls; its cue and
dialogue indents nearly coincide, so the fixed -110/-20 offsets miss.
*Fix:* derive the dialogue band from the actual x0 histogram rather than fixed
offsets from the cue band.

### FIXED in `9f4b8297` — re-measured

All three guards implemented, plus `extract_with_status()` returning
`(monologues, status)`. Re-run of the same 11 films:

| film | before | after |
|---|---|---|
| Good Will Hunting | 0 / 0 / 0 / 0 | **43 / 16 / 4 / 1** |
| 12 Angry Men | silent 0 | `SKIPPED: not_screenplay_layout` |
| Moonlight | silent 0 | `SKIPPED: no_text_layer` |

Per-script yield, now over 9 genuinely-parsed scripts rather than 11 with 3
phantom zeros:

| min words | before | after |
|---|---|---|
| 40 | 25.1 | **35.6** |
| 60 | 8.0 | **11.6** |
| 90 | 2.5 | **3.7** |
| 120 | 0.9 | **1.2** |

Revised sizing at `min_words=90` (3.7/script): a quarter of the 12,001 film
references -> ~3,000 scripts -> **~11,000 monologues**. Treat as an upper
bound: it is before dedupe and before audition-worthiness selection, and some
share will be `no_text_layer` / `not_screenplay_layout`.

Remaining: 12 Angry Men and Moonlight are correctly *reported* but still not
*extracted*. Recovering them needs OCR (Moonlight) and an unindented-script
parsing mode (12 Angry Men). Neither blocks a bulk run — they are now counted.

**Before the fix, all three failed silently.** At ~27% of scripts, a bulk run would
skip roughly a quarter of the catalogue with no record. Add the validity checks
and per-script status logging BEFORE any bulk ingest — that is the difference
between "3,000 scripts processed" and "3,000 scripts processed, 800 of which
produced nothing and nobody noticed".

### Not every script parses

3 of 11 films (12 Angry Men, Good Will Hunting, Moonlight) returned zero at
every threshold with no error — parsed, but no speech found. Likely a wrong or
short document behind the slug, or cue-band detection failing on an unusual
layout. ~27% silent-failure rate; diagnose before a bulk run so failures are
logged rather than silently skipped.

### Other operational findings

- **OCR needed for some titles.** Euphoria scored `cid_ratio=1.147` (broken
  font map). A slice of the catalogue will need OCR or must be skipped.
- **Some assets 403.** The Crown returned 403 Forbidden. Needs backoff and
  graceful skip; do not hammer.

## Live run, 2026-08-19 (in progress)

`ingest_film_monologues.py --apply --delay 2` over all 1,790 ScriptSlug film
slugs. Watermark for reversal: `backups/ingest_film_watermark.json`
(max_play_id 1643, max_monologue_id 18460, 698 film plays / 1,243 film
monologues before).

At 407/1,790: +228 monologues, +93 plays. Guards holding — 0 empty shells,
0 missing authors, 0 missing embeddings. Word counts p25/median/p75 =
102/117/142, i.e. real audition lengths.

Status mix: ok 185, no_monologues 133, no_metadata 48, http_403 27,
needs_ocr 4, not_screenplay_layout 3. Running ~0.56 monologues/film, so expect
**~1,000** rather than the ~2,700 the pre-selector dry run implied — the
audition-worthiness selector is stricter in practice.

### OPEN: the ingest skews male, ~74/26

At 407 films the new monologues split 160 male / 56 female / 12 any. That is
screenplay reality (male characters get the long speeches), but the ingest
passes it straight into the library. Canberk chose to let the run finish
as-is (2026-08-19).

Worth revisiting afterwards, since a large share of actors search for women's
roles. Options: re-run female-led films with a higher MAX_PER_FILM or a lower
min_words; or bias the selector prompt toward female-character speeches when
the candidate pool holds them. Neither needs a re-scrape — `--slugs` allows
targeted top-ups.

### Recoverable losses

`no_metadata` (~12%) and `http_403` (~7%) are both recoverable without redoing
the run: backfill `film_tv_references` for the former, retry for the latter,
then re-run those slugs with `--slugs`.

## Plan

**Phase 0 — size the ceiling (cheap, do first).**
The limit is not 14,271, it is how many titles have a *published* script.
Run `spike_tv_scriptslug.py` for current yield (candidates / passed / reject
reasons) and count IMSDb's catalogue. Without this we are guessing at cost and
outcome.

**Phase 1 — fix the empty-shell bug (prerequisite, not follow-up).**
`find_catalogue_source_types()` counts a `plays` row as carried even with zero
monologues. Ingest creates the row before monologues land, so a bulk scrape
manufactures empty shells at scale — each one silently suppressing the
content-gap banner for that title. Already 129 film + 123 play shells exist.
Fix: require >=1 monologue. Then consciously re-record the `named-heathers`
golden expectation (we hold 2 Heathers monologues, so "we don't have Heathers"
is false).

**Phase 2 — unblock the film path.**
Populate `imsdb_url` by matching the 12,001 film references against IMSDb's
index (fuzzy title+year). This is a matching job, not a scraping job.

**Phase 3 — batch scrape with dedupe.**
TV via ScriptSlug (proven), film via IMSDb. Dedupe is mandatory: the existing
TV ingest produced duplicate rows ("The X Files" is 16 rows) and 99.6%
missing authors. Run the quality gate and `audit_film_tv_quality.py` per batch
rather than at the end.

**Phase 4 — re-rank by real demand** once honest content_gap data exists.

## Recommended start

TV first via ScriptSlug: the spike already proved mechanical extraction works,
and the titles actors keep naming (Queen's Gambit, Big Bang Theory, Fleabag)
are TV. Film needs the Phase-2 URL mapping before it can move at all.
