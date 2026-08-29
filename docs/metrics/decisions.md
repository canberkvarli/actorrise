# Decisions

Changes that could move a number in `metrics-history.csv`, with the date they
landed and what they were meant to do. H-08 exists because a step in the weak
match rate could not be attributed to anything — this file is so the next such
question is answerable. Record retrieval, ranking, embedding, gating and
instrumentation changes here even when they look harmless.

Format: date, what changed, why, and which metric it should move.

## 2026-08-28 — Two snapshot-query measurement bugs corrected (paid_invoices, activation)

The 2026-08-28 brief flagged two metrics measuring the wrong thing. Neither is a
bug in the app — both live in the analytics agent's snapshot SQL, so the fix is
here, as guidance for the next pull. Confirmed against prod before writing:

- **paid_invoices must filter `billing_history.status = 'succeeded'`, not
  `'paid'`.** All 70 billing_history rows are `succeeded`; zero are `paid`. The
  old filter returns 0 forever, which is why every historical `paid_invoices`
  column reads 0 — do NOT trust that column as a trend line. (Cross-checked the
  app: `grep` found no code path filtering `status='paid'`; the admin dashboard
  reads Stripe directly via `stripe_revenue.py` and splits paid/comped by
  `stripe_subscription_id`, so the dashboard was never affected — only the CSV.)
- **activated_30d is not an activation metric.** It counts any usage_metrics row
  on signup day or day+1 and fires for 86% of signups (265/309). Superseded by
  the two-tier definition in H-10 (`activated_search_30d` /
  `activated_save_30d`); the old column stays in the CSV unbroken but is not read.

Also excluded from the weak-match rate going forward (brief task 3): queries
shorter than 3 chars or with no vowel (xx, zx, fdghdr) — ~20% of current weak
matches are test typing and inflate pct_weak.

Moves: paid_invoices (0 -> real, ~2 lifetime payers), pct_weak_7d (down once junk
is filtered), and adds activated_search/save columns.

## 2026-08-29 — Admin search-logs dashboard: fixed a 500, a lying weak-rate, and added the retry signal

- **Page-1 was 500-ing.** `_compute_summary` counted content gaps with
  `content_gap.is_(True)` → `content_gap IS true`, which Postgres rejects on a
  jsonb column, so the whole summary threw on every page-1 load. Rewrote the five
  headline counts as ONE FILTER query (also fewer round trips on a single-worker
  backend) and count a real gap as `jsonb_typeof(content_gap)='object'` (the
  column stores the jsonb literal 'null' on most rows; true gaps = 29, not 262).
- **Weak-rate denominator fixed (H-17).** Now over scoreable (vector) rows only:
  the reported 33.2 pct was 85/256; the real vector rate is 43.8 pct (85/194).
  Added `scoreable_count` + `title_lookup_count` (53) so the lookup path stays
  visible, and `repeat_count`/`repeat_rate` (63 silent retries in 7d, read-time
  LAG window, no stored column — deviates from the brief's stored-column ask on
  purpose: same metric, no migration/backfill/hot-path cost).
- **Misleading error message.** The API client showed "Search is taking longer"
  for any network error on a `/search` URL, including `/api/admin/searches`.
  Narrowed to `/monologues/search`; the admin query now retries so a deploy blip
  self-heals. (commit 8e96ac2d)
- **paid_invoices (brief #1):** confirmed no app code filters `status='paid'`
  (the dashboard reads Stripe directly); it is purely the analytics snapshot SQL.
  Correct filter: `status='succeeded' AND amount_cents>0`. Truth: 10 paid events,
  $120, 2 paying users, last Aug 18.
- **37 subs, 2 payers — NOT a webhook bug.** Breakdown: 12 active comps + 5
  trialing comps (no Stripe, $0) + 20 with a real Stripe sub, of which only 2 have
  ever been charged (the other 18 are on unexpired free trials, card on file).
  Legit; nothing writing subscription rows without payment.

## 2026-08-28 — Shipped: fuzzy title matching, feedback impressions, canon-play gaps

All deployed to prod (main) same day. Expect these to move next pull:

- **Fuzzy/partial/reordered/typo title matching** (990efd96). detect_catalogue_title
  gained a guarded in-memory fuzzy stage (prefix, whole-title reorder, contiguous
  fragment, single-typo) returning the canonical stored title, plus a static
  abbreviation map (tfios, lotr, ...). monologues.py now prefers the real-catalogue
  match over the curated dict. Recovers title-shaped weak matches that exist
  (sweeney todd, corey taylor, tfios). Should lower pct_weak_7d and raise the
  match_strategy=title_exact share.
- **Feedback impression logging** (ab67e8ab). New feedback_impressions table +
  POST /api/feedback/impression; the admin feedback summary now reports
  impressions_30d / votes_30d / response_rate_30d. Makes H-11 (visibility vs
  indifference) finally measurable — watch response_rate_30d.
- **Canon-play content gaps** (7210ef1e). Added the copyrighted 20th-c American
  straight-play canon (Death of a Salesman, Raisin, Long Day's Journey, Virginia
  Woolf, True West, ...) to KNOWN_TITLES so an uncarried one reports an honest gap
  + request CTA instead of 20 unrelated pieces (H-13). Should raise content_requests
  for these and cut confident-wrong results. _normalize now collapses apostrophes.

## 2026-08-28 — Title-lookup hand-check: weak matches are ~half retrieval, ~half content (H-07, H-15)

Ran the brief's gating test before building: hand-checked the 16 most recent
proper-noun weak queries against the catalogue. ~5 EXIST and failed on retrieval
(sing street, sweeney todd, hannah montana, finding corey taylor, bane) because
the title catalogue only matches full-title equality, missing prefixes/fragments;
~10 are genuine content gaps clustering into Bollywood/South Asian (H-15) and
copyrighted contemporary playwrights. Decision: build the pg_trgm lexical
pre-search (fixes the retrieval half); route the content half to an honest "not
carried" response (H-13), not a weak vector tail. Full detail in hypotheses.md
H-07 (2026-08-28) and H-15.

Note on the signup doubling (~8/19 onward, 74 -> 120 wk/wk): cause still
unattributed. If a specific post or outreach push drove it, record it here so
future weak-match and retention reads can separate a real trend from a one-off
acquisition spike.

## 2026-08-27 — Character-name searches route to a lookup, not the vector path (H-07)

The title pre-pass only matched `plays.title`, so a query naming a CHARACTER had
nowhere to go and scored weak (a character's name rarely appears in their own
dialogue). 27 of 91 weak vector searches (7d) had a direct catalogue match,
dominated by character names: hamlet (67 pieces), joan clarke (4), anne frank
(1). Added a character sibling to the pre-pass in `title_lookup.py`
(`detect_catalogue_character` + `find_character_monologues`), same filter
cascade/review gate/quality order, same precision guards (whole-query equality;
multi-word names always eligible; single-word names need a >=5-piece body and
must clear generic-role + ambiguous-descriptor lists). The endpoint runs both
pre-passes and prefers whichever returns more pieces, so bare "hamlet" gets the
character's 67, not the 1-shell title row. New `match_strategy` values
`character_exact` / `character_exact_backfilled`. 9 tests, 601 pass. Commit
4b8c6963. Should move: pct_weak_7d (38.1 -> down), and add a visible
`character_exact` slice to the match_strategy mix. Watch: that the new mass is
real character lookups, not thematic queries wrongly routed (the guards are
tested against exactly that).

## 2026-08-27 — query_type classifier is now catalogue-aware (analytics)

`classify_query` only knew the ~90-title curated dictionary, so every real
catalogue title ("brooklyn 99", "medea") and character ("hamlet", "joan clarke",
"anne frank") fell to `query_type='other'` — the reason the 2026-08-27 brief
measured only 9 of 260 as `title` and 142 as `other`. Added an optional
catalogue pass (reuses `detect_catalogue_title` / `detect_catalogue_character`,
title wins over character so a word that is both does not inflate `multi`).
STILL LOG-ONLY: it feeds nothing in ranking or the response, so it cannot change
a result set — only the analytics label. **Attribution note (à la H-08): the
query_type distribution will shift starting 2026-08-27 from a classifier change,
NOT a change in what actors type.** Uncarried names ("erin gruwell", "marvel")
stay `other` on purpose — the catalogue can only label what we hold; those are
handled by grounding.py (unservable) and the content-gap banner. Verified live +
30 tests. H-13's confident-wrong-answer guard (`query_is_unservable`) was found
already shipped and working for person-name queries; not rebuilt.

## 2026-08-27 — Admin search diagnostics + retry signal instrumented (H-13)

`/admin/searches` now surfaces the columns that were logged but never shown:
weak-match rate, avg best_cosine, match_strategy and query_type distributions,
per-row match signals, and a `retry_signal` (users who retried one normalised
query 3+ times within 30 min — the strongest dissatisfaction indicator, per the
2026-08-27 brief). No metric definition changed; this makes the existing
`search_logs` columns auditable without re-running SQL. Ties H-13's rephrase-loop
test to a live number.

## 2026-08-26 — Day-1 saved-piece reminder is now AUTOMATED (H-14)

The re-engagement email now sends itself. An hourly in-process daemon thread in
the API (app/main.py `_start_saved_piece_reminder_scheduler`) runs
`services/email/saved_piece_reminder.run_reminders(send=True, active_hour=<hour>)`.
In-process on purpose: reuses the API's env/secrets, so no separate Render service
and no dashboard step. Sends to a free, opted-in user who saved a monologue 24-72h
ago with no activity since, at the UTC hour they saved it (timezone-free proxy for
their waking window, since we store no timezone). Dedup is DB-backed:
`monologue_favorites.reminder_sent_at`, CLAIMED atomically before send, so a
redeploy/restart/second worker can never re-email anyone. Cap 200/run. Kill switch:
SAVED_PIECE_REMINDER_ENABLED=false. Copy is deliberately lowercase/human (not a
SaaS blast). Migration `add_reminder_sent_at_to_monologue_favorites` applied to
prod first. Should move: returned_2plus for savers. Watch for over-send in logs
(the atomic claim should make it impossible) and unsubscribe spikes.

## 2026-08-26 — Save gets a next step; collection button elevated (retention)

The keeping half of H-14. Detail page (app/(platform)/monologue/[id]/page.tsx):
on save, an inline panel now offers the next step — Cut it to time (scrolls to
CutEditor), Add a note (scrolls + focuses the notes field), Rehearse it — instead
of a silent bookmark. The collection button moved to second place, next to
Rehearse, out from behind Memorize/Self-tape/the bulb. Additive, no API/data
change. Should move: open->save (5 pct now), favs_with_cut / favs_with_notes
(~2 each), and downstream returned_2plus. Watch open->save first; return is the
slower, noisier signal. If save rises but return does not, saving is a marker of
intent not a cause, and the next lever is landing/return nudges, not save UX.

## 2026-08-26 — Distinctive one-word titles honoured under attribute filters

prepass_can_honour stood down on EVERY single-word title when an attribute filter
was active (guard against descriptor-titles like "Awkward" hijacking a search),
which also sent filtered "hamlet"/"macbeth"/"fleabag" to the vector path and back
as weak. Inverted: honour a single-word title under supported filters by default,
stand down only for a curated set of one-word titles that are also ordinary
descriptors (_AMBIGUOUS_SINGLE_WORD_TITLES in title_lookup.py). "hamlet" + male +
20s + <=2min now returns 9 real Hamlet pieces via title_exact instead of weak
vector padding. Also set match_strategy='vector' on the demo-search log insert
(last path leaving it null; the 319 historical nulls are all pre-2026-08-20 and
age out). Should move: pct_weak down, title_exact share up. NOTE the brief's
paid_invoices=0 is not a bug here — billing_history only writes status='succeeded';
the 'paid' query lives in the external snapshot task, not this repo (see below).

## 2026-08-24 — Descriptive-query vocabulary (surface what we already hold)

The higher-leverage half of the demand gap: actors search by description
("sexy flirty comedy", "queer roles", "quirky teenage male") and got GOOD
results flagged weak, because a short abstract phrase scores low cosine against
monologue text and the optimizer didn't recognise the words, so it fell to raw
vector with the discouraging soft-fail banner. Three fixes in query_optimizer:
(1) "comedy" the noun (and quirky/hilarious/goofy/snarky/sardonic) now resolve
the comedic tone — it was absent, so "a comedy monologue" got no tone;
(2) flirty/sexy/seductive/sensual map to the love THEME not a tone, so
"sexy flirty comedy" keeps comedic AND adds love; (3) descriptor and identity
words (queer/gay/lesbian/trans, energetic, sarcastic, "roles") join _FILTER_WORDS
so is_filter_only_query recognises them — suppressing the wrong banner and
letting the relevance floor pass the filter-validated results.

Verified live: "sexy flirty comedy" now returns female comedic pieces (was
all-male, weak); "queer roles" -> Milk/Philadelphia/Tootsie; "quirky teenage
male" -> Superbad/10 Things/Perks; "sultry seductive woman" -> all-female
romantic. Helps every existing female/comedic row at once, not just new
content. Should cut the weak-match rate (was 14% of searches, descriptor-heavy)
and lift rehearse-from-search on those queries. Golden 132/133, no regressions.

## 2026-08-24 — Female/comedic PD plays (demand-driven) + footnote gate

The search_logs said the live gaps are not missing titles but missing KINDS of
monologue: the corpus is 74% male, 7% comedic, thin on teen/queer/Latino, while
actors search "women struggles", "sexy flirty comedy", "20s girl". Public-domain
drama has huge female roles the corpus had skipped, so added six via Gutenberg:
Mrs Warren's Profession, Pygmalion, Candida (Shaw), The Sea-Gull (Chekhov),
Lysistrata (Aristophanes — female comedy). 91 monologues kept, 42 female (46%),
each play now findable by name.

Caveat recorded honestly: against a 14.4k corpus this moved the aggregate female
share only 25.7% -> 25.8%. Rebalancing toward demand needs many more such plays,
or a search-side fix that surfaces the female/comedic content already held.

Two extractor weaknesses surfaced and were handled: scholarly footnotes
("2. 110. We retain here the stage direction...") got re-inserted from an empty
Measure for Measure scholarly-edition row, and Shaw's novelistic stage
directions polluted 3 Pygmalion/Candida rows — all purged. assess_monologue_quality
now rejects a footnote-citation opening, so the notes can never be inserted
again. Corpus 14,418.

## 2026-08-24 — 215 unscraped ScriptSlug TV episodes + garbage sweep

The one clean vein left after ScriptSlug films were exhausted and 8FLiX proved
off-limits (its robots.txt disallows the screenplay-download path). 215 TV
episodes in the sitemap had never been ingested; ran them through the same
pipeline (now with the (CONT'D) merge), adding 651 monologues and deepening the
popular shows actors search by name: Euphoria 108, Breaking Bad 99, Big Little
Lies 91, Twin Peaks 86, The Night Manager 75, Midnight Mass 68, plus Succession,
Fargo, Cobra Kai, Black Mirror, True Detective, Yellowstone. TV 2,462 -> 3,099.

Quality swept in the same pass: a no-vowel-token / hard-corrupt-char detector
found 15 genuinely garbled extractions (a corrupted-font Mad Men episode, some
JFK/Leftovers rows) and purged them, while deliberately keeping readable
false-positives (X-Files, Reds). Reversible backups. Golden 132/133, no
regressions. Corpus 14,328 (play 7,137 / film 4,092 / tv 3,099).

Should move by-name TV retrieval depth (a search for a popular show now returns
a full page, not one piece).

## 2026-08-23 — Numbered-title search + (CONT'D) extraction + glyph repair

Three things landed together, all from working the search_logs demand signal
(weak/zero-result queries were dominated by titles the library already held).

1. Number-insensitive title lookup. "brooklyn 99" now resolves to the stored
   "Brooklyn Nine Nine" (14 monologues), likewise Catch 22, 21/22 Jump Street,
   Se7en typed the other way. Single-token number words fold to digits before
   the space-insensitive squash; fires only when the query carries a number.
   Should move the by-name findability rate / cut the weak-match share (was 14%
   of searches, heavily numbered/named titles). Golden guard: named-brooklyn-99.

2. Screenplay (CONT'D) stitching + glyph de-doubling in the extractor. Modern
   scripts split one speech into stacked "CHARACTER (CONT'D)" blocks broken by
   action lines; the segmenter lost the whole speech under the word floor. It
   now resumes on a same-speaker (CONT'D)/(MORE) re-cue (curly apostrophe
   included — matching only the straight one had disabled it everywhere), and
   de-doubles double-struck glyphs up front. The Whale 0 -> 4 monologues (incl.
   the Ishmael/Moby Dick speech), Hunger Games 0 -> 2. Barbie's Ferrera speech
   assembles but is held out by the caps_residue gate, deliberately not
   weakened (it also catches two-speaker garbage). Should move film retrieval
   coverage for modern titles.

3. Repaired 39 double-struck rows already in the corpus (34 cues like
   "Gglloorriiaa", 5 whole bodies incl. Hannibal Lecter's speech + 4 Vertigo),
   and purged 32 OCR-garbled film rows. Net film corpus quality up; findability
   for those specific titles restored.

## 2026-08-23 — Film corpus crossed 4,000 (ScriptSlug + OMDb backfill)

The film scraping cycle finished. `backfill_refs_for_slugs.py` resolved the
films the ingest had dropped for missing `film_tv_references` (no director =
unreachable), and the re-ingest of those 101 slugs kept 202 more monologues
across 79 clean films. Film is now 4,118 monologues over 1,393 titles, up from
~2,000 at the start of the cycle; total corpus 13,738 (plays 7,158, tv 2,462).
Post-ingest cleanup: 0 title/year merges and 0 in-play dupes (the
punctuation-stripped title+year keying held), 45 word-counts resynced (none
crossing the 50-word gate), `corpus_terms` rebuilt to 23,629 terms. Golden
harness 130/131, no regressions vs baseline (the one FAIL, dear-evan-hansen, is
a genuine missing-musical gap, not a regression). Should move film-source
retrieval coverage and the by-name film findability rate.

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

### FIXED later the same day — 1,690 duplicate rows down to 227

`backend/scripts/fix_collapsed_anthologies.py` (dry-run default, full
reversible backup including text at
`backups/collapsed_anthologies_20260821T121346Z.json`).

What made it safe was finding that neither group needed a judgement call.

**Group 1 turned out to be pure redundancy.** Their `full_text` is 176–2,359
characters — front matter only — while ids 123–136 hold the *same plays*
correctly: real full text, proper titles and authors, and their own
already-attributed monologues. Id 93's front matter is byte-identical to id
126 "Monsieur Lamblin"; id 133's to id 134 "The Baby Carriage". Checked before
writing anything: **all 53 shell texts already exist under 123–136 and 0 are
shell-only**, so the 13 shells carried nothing unique. Deleted outright, with
favourites and views repointed onto the surviving twin first.

**Group 2 was decided from the source, not from recall.** Each row's front
matter ends in a cast list, so a monologue belongs to the play whose cast
contains its character. Every play already held a copy of every text, so the
repair was pure deletion: keep the copy under the matching play, drop the
other 17. 43 of 59 texts attributed; 16 left exactly as they are.

The parsing is where the danger was, and it is worth recording why. The volume
is inconsistent about the heading — TRADITION says "THE PEOPLE", THE LAST STRAW
and WHERE BUT IN AMERICA say "CAST". Missing those two did not fail loudly: it
emptied six plays' casts, which silently converts "this character is not in
that play" into "this character is in no play". With TRADITION unparsed, Mary
looked like it belonged unambiguously to WHITE DRESSES. Recognising the extra
headings **turned 4 confident misattributions into honest ambiguities** — Jim
and Mary now match two casts each and are left alone. A cast parser that
half-works is more dangerous than one that does not run.

Also added a whole-name fallback for casts made entirely of titles and
initials: THE STRONGER lists "Mrs. X. , an actress", and token matching drops
"mrs" as a courtesy title and "x" as too short, so the single most obvious
attribution in the anthology matched nothing.

Result: monologues 12,435 → 11,015, plays 1,742 → 1,729, duplicate rows 1,690
→ 227 (86% gone), distinct duplicated texts 136 → 40. No orphaned monologues.
The 7 orphaned `monologue_favorites` rows are **pre-existing** (ids 7615–11582,
Feb–Jun 2026); today's deletions were ids 15653–18323. That table still has no
FK to `monologues`, which is why orphans accumulate silently.

Still duplicated and deliberately untouched: 16 texts whose character is a bare
pronoun ("He", "She", "The Voice", "The Figure"), is absent from every parsed
cast ("Mollie"), or is genuinely in two casts ("Jim", "Mary" ×3). MANIKIN AND
MINIKIN has no cast block in its front matter at all, so nothing in the source
can place its pieces.

## 2026-08-22 — The film ingest was throwing away servable monologues

127 film rows had a play record and zero monologues — Alien, Toy Story,
Indiana Jones, Dead Poets Society, Aladdin. They are inert for search
(`find_catalogue_source_types` requires >=1 monologue, so the content-gap
banner still fires correctly), but they are titles actors are searching for:
`toy story` appears 3 times in 30 days.

A first attempt to fill them returned **zero** monologues, dominated by
`no_monologues` (53 of 75). That reading was wrong, and the reason is worth
recording:

**`ingest_film_monologues.DEFAULT_MIN_WORDS` is 90, while
`semantic_search.FILM_TV_MIN_WORDS` is 50.** Every 50-89 word speech in those
scripts was discarded at ingest as too short, despite search being perfectly
willing to serve it. Re-running the same 83 slugs at `--min-words 50` dropped
`no_monologues` from 53 to 9 and produced 221 candidates across 64 of the 127
shells. **Two bars for the same question, 40 words apart, and the stricter one
was silently deciding what the library contains.**

Worth knowing for future runs: the audition-worthiness selector is an LLM call
and is NOT deterministic. Indiana Jones, Aladdin and Moonrise Kingdom each
showed keeps in the dry run and zero on apply, from identical candidate counts.
76 rows landed from a 221-candidate dry run. A re-run picks up different
pieces; that is variance, not a bug, but it means a single pass does not
exhaust a slug.

### The shells were never getting filled anyway

`build_play` was called unconditionally, keyed on the ScriptSlug `source_url`.
The same film reached from IMSDb (the original pass) and ScriptSlug (now) has
two different URLs, so it became two rows — and filling a shell landed the
monologues on a NEW row beside it while the shell stayed at zero. Hence
"Dawn of the Dead" x3, "The Apartment" x3, "Punch-Drunk Love" / "Punch Drunk
Love".

Replaced with `get_or_create_play`, keyed on normalised title **and year**.
Year is essential here in a way it is not for TV: films reuse titles
constantly, and the pairs in this corpus are genuinely different works —
Dawn of the Dead 1978/2004, The Apartment 1960/1996, Godzilla 1954/2014, The
Little Mermaid 1989/2023, True Grit 1969/2010. Merging on title alone would
fold a remake into its original, which is the collapsed-anthology mistake
approached from the other direction.

`backend/scripts/merge_film_title_year.py` cleaned up the existing damage: 9
groups merged, and **16 same-title groups correctly kept apart by year**.

Result: film shells 127 -> 99, film rows 1,013 -> 1,004, zero duplicate
(title, year) pairs remaining. Corpus 12,003.

Still unfillable and genuinely so: Alien, Toy Story and Dead Poets Society ship
as scanned images (`no_text_layer` / `needs_ocr`), so there is no text layer to
parse. Those need OCR or nothing.

**Open question worth a decision: should `DEFAULT_MIN_WORDS` just be 50?**
Keeping it at 90 means every future ingest discards material search would
serve.

## 2026-08-21 — The volume text answers what the cast lists could not

The morning's anthology repair placed 43 of 59 texts from each play's
front-matter cast list and left 16 alone, and this file recorded them as
unresolvable from the source. **That was wrong, and specifically wrong about
the method.** Cast lists cannot place a speaker called "He", "She" or "The
Voice". The volume can: Gutenberg 37970 contains all 18 plays in sequence, so a
speech's byte offset in the book says which play it belongs to. No name
matching, no guessing. All three volumes were already sitting in
`backups/gutenberg_cache/`.

`backend/scripts/attribute_from_volume.py`. Results read as obviously correct
once seen: **MANIKIN AND MINIKIN** takes "He" and "She" — it is a two-doll
bisque play whose characters *are* He and She; **SAM AVERAGE** takes "The
Figure" and "The Voice" — Sam Average is an allegorical figure. 15 speeches
placed, 162 surplus copies deleted.

Two volumes needed hand-verified boundaries, and both would have failed
*confidently* rather than loudly:

- **pg31 (Sophocles)** — "ANTIGONE" occurs 120 times as a SPEAKER label inside
  Oedipus at Colonus. Title matching put **Theseus into the Antigone**, a play
  he does not appear in. The reliable marker is each play's own ARGUMENT block.
- **pg27458 (Aeschylus)** — the volume prints Prometheus Bound as "PROMETHEUS
  CHAINED", so the stored title matched nothing and the book yielded 0
  sections.

Also `dedupe_within_play.py` for 11 groups where the same text sat twice under
one play (`ATTICUS`/`Atticus`, `MARK`/`Mark`). The survivor is the row with the
embedding, but it adopts the readable speaker name off the row being dropped.

**Duplicates: 1,690 this morning -> 8.**

## 2026-08-21 — The extractor needed four guards, not one

Getting the remaining extraction safe took four, each catching what the
previous one could not see. Worth keeping in this order, because each was found
only after the one before it was in place:

1. **Shared source_url** — 80 rows across 7 Gutenberg volume URLs. Re-fetching
   mines the whole book once per row. 719 -> 231 candidates.
2. **The row's own full_text is a volume** — invisible to (1) because no URL is
   shared. Two signals: byte-identical full_text on two rows (6 pairs — Peer
   Gynt/Brand, Antigone/Oedipus, The Critic/A Trip to Scarborough,
   Prometheus/Seven), and size (195 of 201 rows under 250 kB; "The Rising of
   the Moon", a ONE-ACT play, is stored as 3.6 MB). 231 -> 88.
3. **The text does not match the play** — and this one matters most, because it
   revealed that **`source_url` itself is wrong on several rows**. Clearing a
   bad `full_text` only made those rows re-fetch the same wrong book. "The Well
   of the Saints" (Synge) points at gutenberg.org/ebooks/36, which *is* The War
   of the Worlds; "The Way of the World" fetches Poe's Arthur Gordon Pym.
   Neither (1) nor (2) can see this — no URL is shared, the book is a normal
   size. 88 -> 55, catching 12 rows including the Complete Works collection.
   The bar is ONE of title-or-author in the head, not both: translations credit
   a translator instead of the playwright, and demanding both rejects 10 of 32
   real plays.
4. **Foreign body text** — `looks_foreign` sampled only the first 8k
   characters, which on Gutenberg is an English licence header whatever
   language follows. A Swedish *Orestes* and a German *Salome* both read as
   English.

Plus the Folger fallback fix: it only ran when the plain parser returned fewer
than 3, and Doctor Faustus and The Jew of Malta each scrape exactly 4 junk
matches from their front matter, clear the bar, and lose 34/43 real speeches.

**Inserted: 51 Marlowe + 55 verified (The Imaginary Invalid +7, A Midsummer
Night's Dream +4, Hamlet +3, Richard II +3).** Corpus 10,918 monologues across
1,507 titles. Golden 130/131, no regressions.

**Standing rule: `plays.source_url` is not trustworthy.** Anything that fetches
from it must verify the result against the play before using it.

## 2026-08-21 — 295 dead "view the original script" links

ActorRise is a monologue library, not a play library: where a piece comes from a
full script we carry the excerpt and link out. That link is `plays.source_url`,
and the UI already renders it — "View full play" / "View script" in the detail
footer, plus a "View source" fallback on the card.

On **295 of 1,729 plays (17%, all film) the link was dead.** The scraper
collected candidate URLs as a list and the whole Postgres array literal was
stringified into the varchar column:

    {https://imsdb.com/scripts/The-Italian-Job.html,"https://imsdb.com/scripts/Italian-Job,-The.html",...}

which reaches the browser as `href="{https://imsdb.com/..."` and goes nowhere.
Nothing errored, because a varchar accepts any string — the column simply
stopped meaning what it says. **A typed column would have caught this; a
`String` column silently accepted a serialised array.**

Fixed by `backend/scripts/fix_source_urls.py`: takes the first well-formed
http(s) URL out of the literal. All 295 were repairable, none ambiguous. The
alternates are the same script under different title spellings, and the schema
has no column for alternates. Parsing goes through `csv` rather than
`split(",")` because the alternates contain commas — splitting produces a URL
that looks valid and points nowhere, which is worse than the original bug.

Now: 1,709 of 1,709 non-user plays have a working http link, 0 broken, 0
missing. The remaining 20 without one are all `user_uploaded` — an actor's own
script, which correctly has no external source.

Two related things checked while in here:

- **`isBibliographicText()` now matches nothing.** That guard replaces the
  monologue with "Text not available — this entry appears to contain catalog
  data" and offers the source link. It existed for the scraped-boilerplate
  rows; after today's cleanup 0 of 10,995 rows trip it. Dead but harmless, and
  worth keeping as a net.
- **`plays.full_text` still holds 31 MB across 206 rows** (194 public-domain,
  12 user-uploaded). Nothing user-facing reads it — search defers it and no API
  returns it — so on the "monologues only, link to the source" principle it
  could go. **Not cleared, because `scripts/extract_scenes.py` reads
  `plays.full_text` as its only input**, and the scene library is in flight.
  Clearing it is a real trade-off, not a tidy-up: it would end scene extraction
  from the stored copy and force a re-fetch from `source_url`. Canberk's call.

## 2026-08-21 — word_count had drifted from the text on 876 rows

`word_count` is a stored column, not a derived one, so every pass that edits
monologue text without touching it leaves the two disagreeing. Found while
trying to apply the 50-word rule to the boilerplate leftovers and discovering
the purge could not see them: their text had dropped to ~45 words while the
stored count still read ~130.

Not cosmetic. Three things read the column rather than the text:
`film_tv_word_gate_hides()` (so a stale high count keeps a fragment visible and
a stale low count hides a real speech), the duration filters via
`estimated_duration_seconds`, and `purge_sub_50_word_monologues.py`.

876 rows had drifted, worst case 378 → 64, total 9,876 words. Resynced by
`backend/scripts/resync_word_counts.py` using `app.utils.duration.
estimate_duration_seconds` — the same helper the admin edit path uses, which
accounts for breath pauses rather than assuming a flat words/150.

20 rows then crossed under the 50-word bar and were purged under the
2026-08-20 rule (1 spared as favourited). Several were broken extractions with
the speaker prefix still embedded — "Hale. I wish you'd seen Minnie Foster…".

**Any future pass that edits monologue text must re-run this script**, or the
gates quietly stop matching what is actually stored.

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
