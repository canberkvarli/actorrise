# StageAgent Scraper

**Date:** 2026-05-23
**Status:** Implementation plan

## Goal

Scrape ~420 curated monologues from StageAgent — primarily plays, all
human-edited with pre-tagged metadata (gender, age, style, length, time
period, show type). Wins are quality + metadata richness, not raw volume.
Musicals coverage on StageAgent is shallow; deferred to a separate source.

## Source verification

- `robots.txt`: `User-agent: * / Disallow:` — full access allowed.
- Sitemap: `https://stageagent.com/sitemaps/monologues` returns 14 paginated
  child sitemaps. Each child has ~30 URLs. Total ~419 monologue URLs.
- Per-monologue page is fully open (Text section), only the "Context"
  section is paywalled — we don't need it.

## Architecture

New script `backend/scripts/scrape_stageagent.py`. No reuse of
`extract_film_tv_monologues.py` because:
- No LLM monologue-selection step needed (StageAgent already curated).
- Data fields are pre-structured (gender, age, style, etc.) — direct
  mapping, not heuristic extraction.
- Different fetcher (HTML page parse vs PDF/HTML screenplay parse).

Pipeline per monologue URL:

```
sitemap → URL list → fetch HTML → BeautifulSoup parse →
  StageAgentMonologue dataclass → upsert Play (dedupe by title+author)
  → create Monologue (skip if dupe) → end
```

At end of script: invoke `segment_monologues --write` via subprocess
(same auto-segment hook the other scrapers use).

## Field mapping

| StageAgent field           | DB column                            | Notes |
|----------------------------|--------------------------------------|-------|
| Show (link text)           | `Play.title`                         | dedup key |
| Show URL slug              | `Play.source_url` (stageagent link)  | attribution |
| Character (link text)      | `Monologue.character_name`           | |
| Gender                     | `Monologue.character_gender`         | "Male" / "Female" / "Any" |
| Playing Age                | `Monologue.character_age_range`      | "Young Adult, Adult" → keep verbatim or first label |
| Style                      | `Monologue.category` + `tone`        | "Comedic" / "Dramatic" → lowercase |
| Act/Scene                  | `Monologue.act`, `Monologue.scene`   | parse "Act 1" / "Act 1, Scene 2" |
| Time & Place               | `Monologue.scene_description`        | free text |
| Length                     | (derived from text word_count)       | StageAgent's "Short/Medium/Long" is a hint |
| Time Period                | `Monologue.themes` (one tag)         | "Contemporary" / "Period" |
| Show Type                  | `Play.source_type`                   | "Play" → "play", "Musical" → "musical" (new value, add to allowed) |
| Age Guidance               | (skip)                               | not in our model |
| Text                       | `Monologue.text`                     | full text, includes inline `[stage directions]` |

Auto-segment converts `[stage directions]` → `direction` segments.

## Dedupe strategy

**Play-level:** match existing `plays` row by case-insensitive title
equality. If a Play exists with the same title and matching author (or any
author when StageAgent doesn't list one), reuse it. Otherwise create new.

**Monologue-level:** within a Play, match by `character_name` (case-
insensitive) + first 100 chars of text. Skip if exact dupe; otherwise
insert as a new Monologue (some plays have multiple monologues per
character).

## Discovery

```python
SITEMAP_INDEX = "https://stageagent.com/sitemaps/monologues"
# Returns 14 sub-sitemap URLs.
# Each sub-sitemap returns ~30 monologue page URLs.
# Iterate all 14 to build the master URL list (~420 URLs).
```

## Polite scraping

- 2.0s delay between page fetches.
- User-Agent: `ActorRise/1.0 (audition-prep; monologue-curation)`.
- Single-threaded — no parallel fetches.
- 30-second timeout per request.
- Retry once on 429/503 with 5s backoff.

## Tasks

### Task 1: Sitemap discovery

`build_url_list()` function. Fetch the sitemap index, then fetch all 14
child sitemaps, concatenate `<loc>` entries. Print total count. No DB
side effects.

### Task 2: Page parser

`parse_monologue_page(html) -> StageAgentMonologue` dataclass. Use
BeautifulSoup. Field extraction from the structured `<h2>` / `<h3>`
sidebar layout. Handle missing fields gracefully (return Optional).

### Task 3: Save logic

`upsert_play(db, parsed) -> Play` and `create_monologue(db, play, parsed)`.
Implements the dedupe described above.

### Task 4: Main loop + auto-segment hook

CLI: `--limit N`, `--dry-run`, `--start-from URL`. Iterate URL list,
print progress every record, batch-commit every 20. End with subprocess
call to `segment_monologues --write`.

### Task 5: First test — 10 URLs dry run

`uv run python -m scripts.scrape_stageagent --limit 10 --dry-run`

Verify: 10 parses succeed, fields look right, no DB writes.

### Task 6: Real batch — 50 records with --write

Eyeball a few in the admin UI. Confirm auto-segment fired.

### Task 7: Full run — all 420 URLs

Run unguarded. ~20 minutes wall time. Should yield ~300-400 new
monologues (some dupes of records we already have).

## Completion criteria

- [ ] All 14 sitemap pages parsed into a 420-ish URL list.
- [ ] Page parser extracts all required fields with <10% gracefully-null entries.
- [ ] Full batch landed; auto-segment hook fired without crashing.
- [ ] ≥300 new unique monologues vs pre-run DB state.
- [ ] Visual QA: 3 random new monologues display cleanly in the dashboard
      reading mode (text + segmented directions + character metadata
      shown correctly).
