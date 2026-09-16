# Growing the library — plan, 2026-09-02

Searchable today: **8,597** across 1,574 titles. The gaps that matter are
comedic (536), women (2,061 vs 5,870 men), and the intersection everyone
actually auditions with: **female + comedic + 1-2 minutes = 44 pieces.**

## Phase 0 — the scraper does not use the pipeline (blocker)

`scripts/scrape_all_sources.py` orchestrates Gutenberg, Archive.org, Wikisource
and Perseus. It imports **none** of these:

| step | consequence of it being missing |
|---|---|
| `assess_monologue_quality` | interleaved dialogue, scene headings, footnotes all enter |
| `to_display_text` | stage directions handled wrong |
| `find_duplicate` | same speech re-added per source |
| `ContentAnalyzer` | no gender/age/tone/emotion → invisible to every filter |
| `generate_embeddings_batch` | **no embedding → invisible to semantic search** |
| `looks_non_english` | foreign-language rows, the bug we already fixed once |

It also computes duration as `word_count/150*60` on the wrong text, and stores
`word_count=mono['word_count']` (now the SPOKEN count) alongside
`text=mono['text']` (the display text). Those disagree the moment a play has a
stage direction, and `resync_word_counts.py` will rewrite it on its next run.

**Scraping anything before this is fixed produces rows no actor can find.**

The fix is one function, not four scripts. Extract what the four good ingest
scripts (`ingest_shakespeare_gaps`, `ingest_titlecase_pd_plays`,
`ingest_folio_plays`, `ingest_childrens_plays`) already do in near-identical
form into `app/services/data_ingestion/pipeline.py`:

    ingest_play(db, *, title, author, source_url, copyright_status,
                license_type, full_text, source_type="play") -> IngestReport

doing, in order: language check → parse → `to_display_text` + spoken copy →
quality gate on the SPOKEN text → cast-aware interleave check → `find_duplicate`
→ `ContentAnalyzer` → `resolve_metadata` → embeddings (`text-embedding-3-large`,
1536 dims — the default `-small` is a different vector space) → insert with
`word_count = len(display.split())` and duration from the spoken copy →
incremental backup for `--purge`.

Then have every scraper call it, and delete the bespoke insert loops.

Two things to enforce there, both learned the hard way:
- `license_type` must be a required argument. 267 rows arrived
  `copyrighted`/NULL, which `may_store_text` refuses, and we only noticed months
  later. No basis, no ingest.
- Anything that writes `text` must clear `text_segments` in the same statement.

Post-ingest, run `segment_monologues.py --write` (not wired into any ingest
today, which is why 2,427 rows sat unsegmented).

## Phase 1 — re-extract what we already hold (small, cheap, do it second)

We hold full text for 172 public-domain plays. Measured: the current parser
would extract **3,551** against the **4,064** already searchable — so a blanket
re-extraction LOSES rows and must not be run. The win is concentrated:

| play | now | current parser |
|---|---|---|
| Oedipus at Colonus | 10 | 80 |
| Every Man in His Humour | 31 | 77 |
| The Father (Strindberg) | 31 | 69 |
| Seven Against Thebes | 11 | 40 |
| Antigone | 70 | 80 |

Roughly **+300** from the top ~20, on text we already have and rights we already
hold. Do it per-play with a diff, never as a sweep.

Separately, some large stored texts yield nothing at all — Henry IV is 974 KB
and extracts 0, Wycherley's *Love in a Wood* 340 KB and 0, Dryden's *Marriage à
la Mode* 383 KB and 0. Those are parser gaps against a format we have not met
yet, and each one is a comedy with strong female roles. Worth one session of
reading the actual files before writing a pattern — that is what turned the
Title Case work from a guess into 800 monologues.

## Phase 2 — bulk public domain, aimed at the gaps

PD is the only source with unlimited storage AND serving rights, so it is where
volume comes from. But PD effectively ends ~1930, so it cannot fix
"contemporary". Aim it at what it CAN fix — comedic and female:

1. **Restoration and 18th-century comedy** — Behn, Centlivre, Cowley, Inchbald,
   Congreve, Sheridan, Goldsmith, Wycherley. Comedy, and unusually strong female
   parts. We hold several of these already with 0-1 monologues extracted.
2. **Early 20th-century one-acts** — Glaspell, Gerstenberg, Lady Gregory,
   Helburn, Millay. Already in the corpus in ones and twos, all PD, women-heavy,
   and naturally 1-2 minutes, which is the exact duration band we are short of.
3. **Gutenberg's drama shelf generally** — we have 480 play rows and full text
   for 172. The shelf runs to thousands.

Do a dry-run yield count per author before ingesting any of them, the way the
Shakespeare gap-fill was measured (884 candidates → 800 kept) before it ran.

Watch for [[shared-source-url-collapse]]: 80 play rows share 7 Gutenberg volume
URLs. Two of the 172 stored texts already look like multi-play volumes.

## Phase 3 — the contemporary gap needs permission, not scraping

Nothing in PD is a contemporary comedic monologue for a woman in her twenties,
and that is what actors ask for. The only legal routes are `licensed` or
`cc_by`, which means asking:

- **Indie playwrights direct.** They want the exposure and Canberk is a working
  actor with a peer network. One email, a named credit, a link to buy the
  script. `license_type='licensed'` on the play row.
- **New-play platforms** publishing under Creative Commons.
- **Publishers** (Concord/Samuel French, Dramatists Play Service, Playscripts) —
  slow, but the prize is the whole gap.

Until one of those lands, contemporary stays a pointer library: title, author,
character, link to buy. Which is what `/sources` already promises and what the
StageAgent rows now are.

## Order

0. Fix the ingest path. Nothing else counts until this is done.
1. Targeted re-extraction, per play, with diffs (+~300).
2. PD bulk scrape at comedy and women, dry-run first.
3. Start the permission conversations in parallel — they have the longest lead
   time and the biggest payoff.
