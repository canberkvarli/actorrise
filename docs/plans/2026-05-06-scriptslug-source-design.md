# ScriptSlug as a Second Film/TV Source

**Date:** 2026-05-06
**Status:** Design

## Problem

`extract_film_tv_monologues.py` only fetches from IMSDb. Two batch runs over the
top of our untouched `film_tv_references` (200 refs at rating ≥7.0, then 500
refs at ≥6.0) showed 79–83% IMSDb miss rates — IMSDb's catalogue is heavily
skewed to mainstream English-language Hollywood and is effectively exhausted
for our table. The 13,633 untouched refs are mostly films IMSDb does not host.

ScriptSlug carries many of the films IMSDb misses — confirmed by manual
inspection (e.g., *The Social Network* present on ScriptSlug, absent from
IMSDb's untouched-refs run). Adding it as a second source unlocks the catalogue.

## Goal (locked)

Pull as many quality monologues as possible from ScriptSlug to grow the catalog,
biased toward modern (post-2015) English-language Hollywood films. **Skip TV
pilots and indie/international** — out of scope for this iteration.

## Decisions (locked)

| # | Decision |
|---|----------|
| 1 | Extend the existing `extract_film_tv_monologues.py` rather than create a parallel script. Two source branches converge on the same `[{character, dialogue}]` block shape so all downstream pipeline (selector LLM, `ContentAnalyzer`, save, auto-segment hook) is unchanged. |
| 2 | Fetch order per ref: IMSDb HTML first (fast, proven), fall back to ScriptSlug PDF on 404 / "no scrtext". Both sources use the same `--skip-existing` gating. |
| 3 | PDF parsing: `pdfplumber.page.extract_text()` to dump screenplay text, then a heuristic screenplay parser (indentation-aware) to split into character/dialogue blocks. Output shape matches IMSDb's `parse_screenplay()`. No new LLM call for parsing. |
| 4 | URL discovery: try the predictable direct asset URL first (`assets.scriptslug.com/live/pdf/scripts/{slug}-{year}.pdf`). On 404, fetch the metadata page (`scriptslug.com/script/{slug}-{year}`) and extract the canonical PDF link including its `?v=...` cache-buster. |
| 5 | Add a `--source` flag (`imsdb` / `scriptslug` / `both`, default `both`) so each branch can be tested in isolation and so we can mass-process the IMSDb-misses by running `--source scriptslug` over the untouched refs. |
| 6 | Be respectful: 3s delay between ScriptSlug requests (1.5x IMSDb delay), realistic user-agent, retry-with-backoff on 429/503. |
| 7 | Detect malformed/OCR'd PDFs and skip: if parser yields fewer than 5 distinct character names from a 50+ page PDF, treat as garbage and move on. |

## Architecture

```
                  ┌─ build_imsdb_url(title)         ─┐
ref ──────────────┤                                  ├──► [{character, dialogue}] blocks
                  └─ build_scriptslug_pdf_url(...)  ─┘                  │
                                                                        ▼
                                                     merge_consecutive_speeches
                                                                        │
                                                                        ▼
                                                         LLM monologue selector
                                                                        │
                                                                        ▼
                                                            ContentAnalyzer + save
                                                                        │
                                                                        ▼
                                                          auto-segment (post-step)
```

## URL pattern

ScriptSlug PDFs live at `https://assets.scriptslug.com/live/pdf/scripts/{slug}-{year}.pdf`,
where slug is the lowercased title with non-alphanumerics → hyphens. The asset
URL sometimes carries a `?v={hash}` cache-buster, but the un-versioned URL
serves a cached copy and works for our purposes.

Discovery flow:
1. Build slug from title.
2. Try `assets.scriptslug.com/live/pdf/scripts/{slug}-{year}.pdf` directly.
3. On 404: fetch `www.scriptslug.com/script/{slug}-{year}`, extract the PDF
   link from the "Read" button, retry.
4. On 404 there too: give up, log fetch error, continue.

## PDF parsing approach

Per page, `pdfplumber` returns text that preserves approximate spatial layout
through whitespace. Standard screenplay PDFs put character names at column
~35–40 and dialogue at column ~20–25. The parser:

1. Extract all pages → flat text with line breaks preserved.
2. Walk lines. For each line, count leading whitespace.
3. Lines at indent ~30+ that are mostly UPPERCASE alphabetic → character name.
4. Lines following a character name at indent ~15–25 → dialogue for that char.
5. Lines at indent <10 that look like prose → action (skipped — not relevant
   for monologue extraction).
6. Lines starting with INT./EXT. → scene heading (skipped).

Output: `list[{"character": str, "dialogue": str}]` matching IMSDb shape.

The heuristic is loose by design — the downstream `merge_consecutive_speeches`
already handles fragmentation, and the LLM selector already filters obvious
junk.

## Out of scope

- TV pilots / series episodes (different format, not on the priority list).
- OCR'd / image-based PDFs (skipped via the 5-character-names threshold).
- ScriptSlug metadata extraction (genre, themes — we get these from
  `FilmTvReference` already).
- Refactoring to a `data_ingestion/scriptslug_scraper.py` module (deferred until
  we add a third source).

## Testing

- **Unit:** PDF parser tested against 3 known scripts (modern, mid-tier,
  edge-case formatting). Verify ≥10 character/dialogue blocks per script.
- **End-to-end:** small batch run with `--source scriptslug --limit 10`
  against unprocessed mid-rated films. Verify monologues land + auto-segment
  fires.
- **Visual QA:** spot-check 2-3 newly-segmented monologues in the dashboard
  reading mode.

## Rollout

1. Implement parser + URL builder + fetch function.
2. Add `--source` flag + branch logic.
3. Test on 10 known films.
4. Run `--source scriptslug --limit 200 --min-rating 7.0` over the untouched
   refs to gauge real hit rate.
5. If hit rate ≥30%, scale up to a full pass.
