# Monologue ETL v2 — quality gates + new sources

**Date:** 2026-08-30
**Status:** steps 1–3 BUILT (uncommitted, unmigrated). 700 backend tests pass.

Built:
- `app/services/licensing.py` — fail-closed rights vocabulary + guards
- `app/api/monologues.py` — guard wired into `_monologue_to_response` (the one
  choke point every served monologue passes through); trims 297 of 14,418 rows
- `app/services/extraction/monologue_quality.py` — cast-aware `interleaved_dialogue`
  + `stage_direction_residue` gates, promoted out of the repair script
- `app/services/extraction/source_adapter.py` — printed-metadata precedence,
  provenance, and normalisers onto the vocabulary the filters actually query
- `tests/test_etl_v2.py` (51 tests), `tests/test_script_tags.py` (20 tests)

Also built (separate ask): owner-authored / community-upvoted tags on shared
scripts — `app/services/script_tags.py`, `ScriptTag` + `ScriptTagVote` models,
`PUT /scripts/{id}/tags`, `POST /scripts/{id}/tags/{tag_id}/vote`, and
`scripts/add_script_tags_tables.sql` (**run before deploying**).

---

## Where the pipeline is today

```
fetch (Gutenberg / Archive.org / Wikisource / Perseus / StageAgent)
  → parse (plain_text | tei | pdf | screenplay_pdf → monologue_extractor)
  → gate (assess_monologue_quality: 40–400 words, caps-cue, weird chars, narration)
  → enrich (ContentAnalyzer: tone/age/gender/overdone + pgvector embedding)
  → dedupe (deduplicator.py)
  → insert (+ plays.source_url, rendered on card + detail + /sources)
```

Cleanup is **not** a stage. It is a pile of retroactive repair scripts
(`repair_monologues`, `clean_monologue_artifacts`, `strip_scraped_boilerplate`,
`purge_broken_monologues`, `repair_doubled_glyphs`, `recover_truncated_monologues`,
`clean_interleaved_dialogue`). Each was written after a problem was spotted in prod.

**Corpus:** 14,418 monologues / 2,154 titles.
498 public-domain plays (7,228 monologues) + 1,656 film/TV titles (7,190 monologues).

---

## The constraint nobody has written down

`/sources` makes a public promise, three times on the page:

> "Every piece links back to its source and original publication. We never host
> full scripts of copyrighted works."

That promise is currently enforced **by convention only**. There is no column
recording rights status, and nothing in the API stops `text` being served for a
copyrighted work. 7,190 film/TV monologues already ship with full text. A
monologue is not a "full script," so the claim is narrowly true today, but the
margin is thin and every source below makes it thinner.

**Fix this before adding sources, not after.** See A1.

---

## Part 1 — Pipeline quality (do this regardless of sources)

### A1. `license_status` as a first-class column (do first)

Add to `plays`:

| value           | meaning                                | may we store `text`? |
|-----------------|----------------------------------------|----------------------|
| `public_domain` | pre-1928, or renewal lapsed            | yes                  |
| `licensed`      | written permission on file             | yes                  |
| `metadata_only` | known copyrighted, we hold pointer only| **no**               |
| `unknown`       | not yet assessed                       | **no** (fail closed)  |

Then:
- Backfill: the 498 PD plays → `public_domain`. The 1,656 film/TV → decide
  explicitly rather than inheriting the status quo.
- Enforce in the serializer, not the caller: a single guard that strips `text`
  when status is not `public_domain`/`licensed`. Convention becomes code.
- Ingest refuses to write `text` for `unknown`.

This is the highest-value change on the list. It makes /sources enforceable,
and it makes every source below safe to add because the pipeline itself
knows what it's allowed to keep.

### A2. Move dialogue detection into the gate

The #7521 class (other characters' lines welded in) passes every current check:
grammatical prose, right word count, no `(...)` artifacts. That is why it needed
a repair script.

Promote the detection already written in `clean_interleaved_dialogue.py`
(cast-name cue matching, `_is_speaker_label`, `Enter|Exit|Exeunt` regex) into
`monologue_quality.py` as a real gate. Same logic, moved one stage earlier, so
the next ingest can't reintroduce the problem.

### A3. Trust printed metadata over inferred metadata

ContentAnalyzer currently *infers* tone / age range / gender with an LLM.
AuditionScenes, NYCastings and StageAgent **print** those fields. `scrape_stageagent.py`
already proves the pattern ("no LLM extraction needed since the data is already structured").

Formalise it: a `SourceAdapter` with an optional `provided_metadata` dict that
takes precedence over inference, plus a `metadata_provenance` field recording
which fields were given vs. guessed. More accurate, and it cuts LLM spend on
every structured source.

### A4. Cross-source near-duplicate detection

With 11 sources you will get the same Hamlet from six of them. `deduplicator.py`
handles exact-ish matches; add a cosine check against existing embeddings
(threshold to be tuned on a labelled sample) plus normalized-text hashing.
Cheap, because the embeddings already exist.

### A5. Extraction golden harness in CI

The search audit already built a golden harness (`golden*.log`). Extend the idea
to extraction: a frozen set of known-good and known-bad raw texts with expected
outputs, run on every parser change. Today a parser regression is invisible
until someone reads a monologue in prod.

---

## Part 2 — The eleven sources, triaged

Sorted by what we can actually do with each. The recurring problem: nearly all
of them host **contemporary copyrighted work**. The value is real, but it is
mostly *metadata and curation signal*, not text.

### Ingest text — after per-item verification

| Source | Note |
|---|---|
| **Theatre In The Round** (classical/Shakespeare packets) | Underlying text is PD, so the text is free to use. The packet's *arrangement* is theirs; take the plays, not the compilation. Best text-yield source on the list. |
| **SimplyScripts** — unproduced indie subset only | Many amateur scripts are posted by their own authors with explicit read/produce terms. Needs a per-script permission check; the produced-Hollywood section does **not** qualify. |

### Metadata + link only (no text stored)

| Source | Why it still matters |
|---|---|
| **AuditionScenes** | ~1,000 pieces with playing age, tone, accent, length printed as clean headers. Excellent structured metadata; the underlying plays are copyrighted. |
| **Daily Actor** | Human-categorised (men/women, comedic/dramatic). Categories are facts about the work; the excerpts are not ours. |
| **NYCastings** | Prints age range, character, play, runtime above every post. Same shape as AuditionScenes. |
| **The Script Lab / IMSDb** | Full Hollywood screenplays, all in copyright. IMSDb's own footing is grey. Useful to confirm a character/title exists; not a text source. |
| **Flinders / The Lir** | Compilations of copyrighted contemporary monologues. The compilation being freely downloadable does not grant redistribution. |

**This is not a consolation prize.** Metadata-only entries still power search,
still appear in results, still link out, and still tell an actor the piece
exists and where to get it. That is exactly how the 1,656 film/TV titles
already work.

And the university packets carry something no scrape can produce:
**what drama schools actually assign.** A piece appearing in the Lir's and
Flinders' portfolios is a strong signal for `overdone_score` and for ranking,
without copying a word. Highest-leverage use of those three sources.

### Ask, don't scrape

| Source | Why |
|---|---|
| **StageMilk** | Their monologues are **original works they own** — one rights holder, one email, hundreds of short uniform contemporary pieces written expressly for actors to perform. That is the single best licensing conversation available here, and scraping it burns the relationship. Contemporary original material is exactly the corpus gap; a deal gets it legitimately and exclusively. |

---

## Suggested order

1. **A1** `license_status` + fail-closed serializer guard ← unblocks everything
2. **A2** dialogue detection into the gate ← stops the bug class recurring
3. **A3** `SourceAdapter` + `provided_metadata`
4. Metadata-only adapters: AuditionScenes → NYCastings → Daily Actor
5. **A4** cross-source dedupe (needed before volume arrives)
6. Theatre In The Round text ingest
7. **A5** extraction golden harness
8. Email StageMilk
9. SimplyScripts indie subset (slowest — per-script permission)

Steps 1–3 are a contained chunk and make every later step safer.

---

## Open questions for Canberk

- Are the 7,190 existing film/TV full texts a deliberate risk you've accepted,
  or should A1's backfill trim them to excerpt + link?
- Want me to draft the StageMilk licensing email? (marketing skill, your voice)
- Is `overdone_score` from drama-school packet frequency worth building, or
  is the AI scoring good enough already?
