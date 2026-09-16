# Workspace Not Search Engine — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stop search from returning noise as answers, make stated constraints actually filter, and turn a found monologue into an object the user owns — so second-day return rate moves off 9.2%.

**Architecture:** Almost none of this is greenfield. The relevance-floor machinery, the constraint parser, the graceful-relaxation order, the `content_requests` write path, and the whole cut/notes/memorized API all already exist and are already tested. They are inert for specific, findable reasons documented below. This plan mostly **connects existing parts** and adds one genuinely new frontend surface (My Book).

**Tech Stack:** FastAPI + SQLAlchemy + pgvector (Postgres 17 on Supabase), Next.js App Router + React Query + Tailwind, pytest.

---

## READ THIS FIRST: where the brief and the codebase disagree

The brief was written from analytics, not from the code. Four premises are wrong, and two of them change the work substantially. Verified against `ppvqmbzuqvzpiuqaiqfy` (prod) on 2026-08-19 and against the source tree.

### 1. The relevance floor already exists — it is just fed the wrong number

`backend/app/services/search/semantic_search.py:100` — `WEAK_MATCH_FLOOR = 0.30`, exactly the value the brief asks for. `classify_relevance()` (`semantic_search.py:210-233`) already drops per-result below the floor and already returns `[]` when the best match is under it. `backend/tests/test_relevance_bands.py` already covers it.

It never fires. Here is why, at `semantic_search.py:1289-1292`:

```python
# from rank position instead (rank 0 = best match → 1.0, decreasing).
for rank, mono in enumerate(semantic_candidates):
    similarity = max(0.0, 1.0 - (rank / max(total, 1)) * 0.4)
```

On the primary pgvector path, per-result scores are derived **from rank position only** and span 1.0 → 0.6. The best result therefore always scores 1.0 no matter how bad the actual match is. So:

- `best < WEAK_MATCH_FLOOR` (0.30) → can never be true.
- `best < MIN_RELEVANCE_TO_SHOW` (0.48) → can never be true.
- The per-result filter `ms[1] >= WEAK_MATCH_FLOOR` → passes everything.

The whole band system is dead code on the path that serves real traffic. That is precisely why "Mexican" returns 20 results at best cosine 0.176.

The real cosine **is** already computed and stashed (`semantic_search.py:1235`, `self._best_cosine_sim = 1.0 - float(_d)`), but it is only read in the API layer to set the `weak_match` **flag** (`monologues.py:480-484`, against `STRONG_COSINE_SIM = 0.38`). It never removes a result.

**So Work Item 1 is not "add a floor." It is "carry real per-result cosine through so the floor that already exists starts biting."** That is a much smaller and much safer change than the brief assumes, and it is Task 1.

### 2. The `content_requests` write path already exists and is already wired to admin

`POST /api/monologues/content-request` is live at `monologues.py:595`. `components/search/ContentGapBanner.tsx:76` calls it. The admin queue exists at `app/(platform)/admin/searches/page.tsx:145` reading `/api/admin/content-requests`.

The reason there is 1 row against 118 weak searches is the **gating**, not the plumbing: `ContentGapBanner.tsx:47` returns `null` unless `play || author` — i.e. unless `compute_content_gap` identified a specific missing *title or author*. "Mexican", "sarcastic", "two hander" never name a title, so the button is never rendered. Task 4 fixes the trigger, not the endpoint.

### 3. Work Item 3's premise is false, and the real problem is the opposite shape

The brief says "zero monologues extracted from any of them." Prod says otherwise:

| | count |
|---|---|
| monologues total | 12,143 |
| **film/TV monologues** | **3,419** |
| film/TV passing the 75-word gate | 1,515 |
| `film_tv_references` rows | 14,271 |

3,419 exist. But `FILM_TV_MIN_WORDS = 75` (`semantic_search.py:112`) hides **1,904 of them** as sub-monologue fragments, because the original extraction cut them too short. The comment at `semantic_search.py:109` says so explicitly: "rows stay in the DB for later re-extraction."

So the job is **re-extraction of 1,904 known-bad rows**, not greenfield extraction from 14,271 scripts. Different, smaller, and it needs no new scraper. It still needs the copyright decision the brief correctly flags. See "Work Item 3 — blocked" at the bottom; no tasks are written for it here.

### 4. Work Item 4's backend is 100% built. It is a pure frontend gap.

All of these already exist in `monologues.py`: `POST /{id}/cut` (:1178), `POST /{id}/notes` (:1114), `POST /{id}/studied` (:1144), `POST /{id}/memorized` (:1218), `GET /favorites/my` (:998). Prod confirms the brief's usage numbers exactly (97 favorites / 8 memorized / 2 notes / 2 cuts). Nothing is missing server-side. Do not rebuild it. Tasks 8-12 are frontend only.

### What the brief got right

Everything else. Weak-match rate is 118/362 = **32.6%** in 30 days, matching the stated 33%. Scenes = 37. Stuck `in_progress` sessions = 38. `search_logs.filters_used` already exists and is already written (`monologues.py:537`), so Work Item 2 point 6 is done.

### Revised sequencing

1. **Task 1** — real cosine through the bands. One file, high impact, kills the "rubbish" complaint class.
2. **Tasks 2-4** — tunable floor, looser-matches divider, request-this on any weak result.
3. **Tasks 5-7** — era hard filter + constraint chips + relaxation notice.
4. **Tasks 8-12** — My Book.
5. **Tasks 13-15** — rehearsal instrumentation + stuck-session cleanup + resume.
6. Work Item 3 — after Canberk's copyright call.

---

## Setup

**Step 1: The worktree already exists — work inside it**

Created 2026-08-19 off `main` at `f50dc6a2`, following this repo's existing worktree convention:

```
/Users/canberkvarli/.config/superpowers/worktrees/actorrise/workspace-not-search-engine
```

Branch: `feat/workspace-not-search-engine`. This plan doc is already copied in at `docs/plans/`, untracked. Do not create a second worktree.

Note: `main` has a lot of untracked files at repo root (audit reports, screenshots). They are deliberately not committed and are not in this worktree. Do not add them.

Per memory `no-prs-solo-dev`: **no PRs.** Commit and push to the branch.

**Step 2: Confirm the backend test suite runs green before you touch anything**

```bash
cd backend && ./.venv/bin/pytest tests/ -q
```

Expected: all pass. If something is already red, stop and report it — do not build on a broken baseline.

---

## Task 1: Make the relevance floor operate on real cosine

This is the highest-value change in the plan. Everything in Work Item 1 depends on it.

**Files:**
- Modify: `backend/app/services/search/semantic_search.py:1220-1295` (score assignment)
- Test: `backend/tests/test_relevance_bands.py` (extend existing)

**Step 1: Read the existing test file first**

Run: `cat backend/tests/test_relevance_bands.py`

You must match its existing style and helpers. It already tests `classify_relevance` directly; you are adding tests that prove the *scores fed into it* are cosine-derived.

**Step 2: Write the failing test**

Append to `backend/tests/test_relevance_bands.py`:

```python
def test_pgvector_scores_are_cosine_not_rank():
    """The pgvector path must hand classify_relevance real cosine similarity.

    Regression: scores used to come from rank position alone (1.0 - rank/total*0.4),
    so the best result always scored 1.0 and the 0.30 floor could never fire. A
    search for "Mexican" (best cosine 0.176) returned 20 results as if they fit.
    """
    from app.services.search.semantic_search import _scores_from_distances

    # pgvector returns cosine DISTANCE; similarity = 1 - distance.
    distances = [0.824, 0.850, 0.910]  # → 0.176, 0.150, 0.090, all under the floor
    scores = _scores_from_distances(distances)

    assert scores[0] == pytest.approx(0.176, abs=1e-3)
    assert max(scores) < 0.30, "a 0.176-cosine best hit must not score above the floor"


def test_below_floor_query_returns_nothing(monkeypatch):
    """End of the chain: bad cosine in, empty result set out."""
    from app.services.search.semantic_search import classify_relevance

    weak = [(object(), 0.176), (object(), 0.150), (object(), 0.090)]
    results, is_weak = classify_relevance(weak, limit=20)

    assert results == []
    assert is_weak is False
```

**Step 3: Run it to verify it fails**

Run: `cd backend && ./.venv/bin/pytest tests/test_relevance_bands.py -v -k "cosine_not_rank or below_floor"`
Expected: FAIL — `ImportError: cannot import name '_scores_from_distances'`

(The second test may already pass; `classify_relevance` is correct. That is fine and expected — the bug is upstream of it.)

**Step 4: Extract the helper**

Add near `classify_relevance` in `backend/app/services/search/semantic_search.py`:

```python
def _scores_from_distances(distances: List[float]) -> List[float]:
    """Convert pgvector cosine DISTANCES to similarity scores in [0, 1].

    Ranking is already handled by the ORDER BY in the pgvector query, so these
    scores exist purely to gauge match QUALITY for the relevance bands. Deriving
    them from rank position (the pre-2026-08 behaviour) made the best hit score
    1.0 regardless of quality, which silently disabled WEAK_MATCH_FLOOR entirely.
    """
    return [max(0.0, min(1.0, 1.0 - float(d))) for d in distances]
```

**Step 5: Run to verify the first test passes**

Run: `cd backend && ./.venv/bin/pytest tests/test_relevance_bands.py -v -k "cosine_not_rank"`
Expected: PASS

**Step 6: Commit the helper**

```bash
git add backend/app/services/search/semantic_search.py backend/tests/test_relevance_bands.py
git commit -m "feat(search): derive relevance scores from real cosine, not rank position"
```

**Step 7: Wire the helper into the pgvector path**

In `semantic_search.py`, the pgvector query around line 1224-1295 currently discards per-row distance and keeps only the best (`self._best_cosine_sim`). Change it to retain every row's distance.

Replace the rank-based loop at **:1289-1292**:

```python
            # from rank position instead (rank 0 = best match → 1.0, decreasing).
            for rank, mono in enumerate(semantic_candidates):
                similarity = max(0.0, 1.0 - (rank / max(total, 1)) * 0.4)
```

with:

```python
            # Real cosine per row. Ranking already comes from the SQL ORDER BY;
            # these scores exist to let the relevance bands judge QUALITY.
            similarities = _scores_from_distances(candidate_distances)
            for mono, similarity in zip(semantic_candidates, similarities):
```

You must also capture `candidate_distances` where the pgvector rows are read (near :1235, where `_best_cosine_sim` is set from `1.0 - float(_d)`). Keep `self._best_cosine_sim = max(similarities)` so the existing `weak_match` flag logic at `monologues.py:480` keeps working unchanged.

**Step 8: Run the full search suite**

Run: `cd backend && ./.venv/bin/pytest tests/test_relevance_bands.py tests/test_golden_harness.py tests/test_search_cache_cosine.py tests/test_filter_only_query.py -v`
Expected: all PASS.

`test_golden_harness.py` is the safety net here — it holds the 2026-07 baseline. **If it regresses, that is real signal, not a test to update.** Stop and report which golden queries changed and by how much before proceeding.

**Step 9: Bump the search cache version**

Scores are cached. Stale rank-based scores would mask the fix. Find `CACHE_VERSION` in `backend/app/services/search/cache_manager.py` and increment it (memory says it was last at 7).

**Step 10: Verify against the real complaint queries**

Run the golden harness against a local backend and confirm "Mexican" now returns 0 results rather than 20:

```bash
cd backend && ./.venv/bin/python -m scripts.run_golden_harness --query "Mexican" --explain
```

If that script does not accept those flags, read `backend/tests/test_golden_harness.py` and drive the search service directly in a `python -c`. Record the before/after result count in the commit message.

**Step 11: Commit**

```bash
git add backend/app/services/search/semantic_search.py backend/app/services/search/cache_manager.py
git commit -m "fix(search): stop returning sub-floor matches as answers

The 0.30 relevance floor has existed since the soft-fail work but never fired:
per-result scores on the pgvector path came from rank position, so the best hit
always scored 1.0. 'Mexican' (best cosine 0.176) returned 20 results. Now scores
carry real cosine and the floor bites. CACHE_VERSION bumped."
```

---

## Task 2: Make the floor tunable through app_settings

**Files:**
- Modify: `backend/app/services/app_settings.py`
- Modify: `backend/app/services/search/semantic_search.py:93-100`
- Test: `backend/tests/test_app_settings.py`

**Step 1: Write the failing test**

Append to `backend/tests/test_app_settings.py`, matching the existing class-based style:

```python
    def test_get_float_returns_default_when_missing(self):
        self.assertEqual(
            app_settings.get_float(self.db, "search_relevance_floor", default=0.30),
            0.30,
        )

    def test_get_float_roundtrips(self):
        app_settings.set_float(self.db, "search_relevance_floor", 0.34)
        self.assertAlmostEqual(
            app_settings.get_float(self.db, "search_relevance_floor", default=0.30),
            0.34,
        )

    def test_get_float_falls_back_on_garbage(self):
        app_settings.set_value(self.db, "search_relevance_floor", "not-a-number")
        self.assertEqual(
            app_settings.get_float(self.db, "search_relevance_floor", default=0.30),
            0.30,
        )
```

**Step 2: Run to verify it fails**

Run: `cd backend && ./.venv/bin/pytest tests/test_app_settings.py -v`
Expected: FAIL — `AttributeError: module 'app.services.app_settings' has no attribute 'get_float'`

**Step 3: Implement**

Add to `backend/app/services/app_settings.py`, mirroring `get_bool`/`set_bool`:

```python
SEARCH_RELEVANCE_FLOOR = "search_relevance_floor"


def get_float(db: Session, key: str, default: float = 0.0) -> float:
    """Return a stored float setting, or `default` if missing or unparseable.

    Never raises: a typo in the admin console must not take search down.
    """
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    if row is None or row.value is None:
        return default
    try:
        return float(row.value.strip())
    except (TypeError, ValueError):
        return default


def set_float(db: Session, key: str, value: float) -> float:
    """Upsert a float setting and return the stored value. Commits."""
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    if row is None:
        db.add(AppSetting(key=key, value=str(value)))
    else:
        row.value = str(value)
    db.commit()
    return value
```

Add `set_value` too if the test above needs it (a raw string setter), or drop that third test if a raw setter is out of scope.

**Step 4: Run to verify it passes**

Run: `cd backend && ./.venv/bin/pytest tests/test_app_settings.py -v`
Expected: PASS

**Step 5: Read the setting at search time**

`WEAK_MATCH_FLOOR` is a module constant read by `classify_relevance`, which has no db handle. Do **not** thread a Session into it. Instead pass the floor in as an argument with the constant as default:

```python
def classify_relevance(top_results, limit, floor: float = WEAK_MATCH_FLOOR):
```

and have the caller in `SemanticSearch.search()` resolve it once per request via `app_settings.get_float(db, SEARCH_RELEVANCE_FLOOR, default=WEAK_MATCH_FLOOR)`.

**Step 6: Run the search suite**

Run: `cd backend && ./.venv/bin/pytest tests/test_relevance_bands.py tests/test_golden_harness.py -v`
Expected: PASS

**Step 7: Commit**

```bash
git add backend/app/services/app_settings.py backend/app/services/search/semantic_search.py backend/tests/test_app_settings.py
git commit -m "feat(search): make the relevance floor tunable without a deploy"
```

---

## Task 3: "Looser matches" divider

**Files:**
- Modify: `backend/app/api/monologues.py:95-105` (SearchResponse)
- Modify: `components/search/SearchInterface.tsx:748-765`

The response already carries `weak_match`. Add a per-result band label so the frontend can draw one divider rather than guess from scores.

**Step 1:** Add `band: Optional[str] = None` to `MonologueResponse` — `"strong"` or `"looser"` — set in `_monologue_to_response` (`monologues.py:178`) by comparing the result's score against `MIN_RELEVANCE_TO_SHOW`.

**Step 2:** In `SearchInterface.tsx`, render results in two groups. Above the divider, strong. Below it, a plain sharp-cornered label reading `Looser matches` and nothing else.

Per Canberk's UI rules in memory: **sharp corners** (this is not clickable), no icon, no explanatory sentence under it. One short line. Do not caption the divider with "these may be less relevant" — the label is the caption.

**Step 3:** Verify in the browser at `/monologues`, searching something mid-band. Screenshot before/after.

**Step 4: Commit**

```bash
git commit -m "feat(search): separate looser matches from strong ones with a divider"
```

---

## Task 4: Offer "Request this" on any weak or empty result, not just named titles

This is the fix that turns `content_requests` from 1 row into a content roadmap.

**Files:**
- Modify: `components/search/SearchInterface.tsx`
- Modify: `components/search/ContentGapBanner.tsx` (or add a sibling component)
- Modify: `backend/app/api/monologues.py:595-622` (accept a raw query with no play/author)

**Step 1:** Read `monologues.py:595-622` and confirm whether `POST /content-request` requires `play`/`author`. If it does, relax it to accept `{ "query": "<raw search string>" }` and store that. Increment `request_count` and stamp `last_requested_at` on repeat — check `backend/app/models/content_request.py` first, this may already be implemented.

**Step 2:** Write a backend test at `backend/tests/test_content_requests.py`:

```python
def test_raw_query_request_creates_row():
    ...

def test_repeat_request_increments_count_not_rows():
    """Second request for the same query bumps request_count and last_requested_at."""
    ...
```

Run it, watch it fail, implement, watch it pass.

**Step 3:** Frontend — render the request affordance whenever `results.length === 0` **or** `weak_match` is true, independent of `content_gap`. Keep the existing title-specific banner when `content_gap` names a play; it is a better message and it is already correct.

The empty state shows: what was searched, one plain line that there is no strong match, and one button. One primary action per screen.

**Step 4:** Verify end-to-end — search something absent, click the button, then confirm the row landed:

```sql
select query, request_count, last_requested_at from content_requests order by id desc limit 5;
```

**Step 5: Commit**

```bash
git commit -m "feat(search): let users request content from any empty or weak result"
```

---

## Task 5: Make era a hard filter (the "contemporary → Shakespeare" bug)

**Files:**
- Modify: `backend/app/services/search/semantic_search.py:800-1030`
- Test: `backend/tests/test_era_hard_filter.py` (new)

Duration, gender, and age are already hard SQL filters (`semantic_search.py:968-1027`). **Era is not.** There is no `year_written` filter anywhere in the file — only a `category: 'classical'` boost. That is the exact mechanism behind "wanted contemporary and from plays, got classical and from film and tv."

**Step 1: Write the failing test**

```python
def test_contemporary_is_a_hard_filter_not_a_boost():
    """'contemporary' must exclude pre-1980 plays, not merely down-rank them."""
    ...
    assert all(r.play.year_written >= 1980 for r in results)
```

**Step 2:** Run it, confirm FAIL with Shakespeare present in results.

**Step 3:** Implement. In the hard-filter block, add:

```python
            if hard_filters.get("era") == "contemporary":
                base_query = base_query.filter(Play.year_written >= 1980)
            elif hard_filters.get("era") == "classical":
                base_query = base_query.filter(Play.year_written < 1980)
```

Confirm `era` is not in `BOOST_ONLY_KEYS` (`semantic_search.py:800-819`) — if it is, remove it, since that set is what demotes a key to boost-only.

Confirm the parser emits `era` at all: check `QueryOptimizer.extract` (`query_optimizer.py:427`). If it does not, add contemporary/modern/classical/period vocabulary there first, with the IT/ES/FR/PT synonyms the existing vocab already carries.

**Step 4:** Run. Expect PASS.

**Step 5:** Add `"era"` to `RELAX_ORDER` (`semantic_search.py:134`) between `category` and `max_duration`, so a zero-candidate contemporary query relaxes era before it touches the user's explicit duration. Update `backend/tests/test_relax_order.py`.

**Step 6:** Run the golden harness. Contemporary queries should shift materially; nothing else should.

**Step 7: Commit**

```bash
git commit -m "fix(search): make 'contemporary' exclude pre-1980, not just down-rank it"
```

---

## Task 6: Show parsed constraints back as removable chips

The single change most likely to have prevented every negative comment received.

**Files:**
- Modify: `backend/app/api/monologues.py` (add `parsed_constraints` to SearchResponse)
- Modify: `components/search/SearchInterface.tsx`

**Step 1:** The parsed filters are already computed and already logged to `search_logs.filters_used` (`monologues.py:537`). Return that same dict on the response as `parsed_constraints`.

**Step 2:** Render above results as chips: `Contemporary ×` `Female ×` `20s ×` `~2 min ×`. Sharp corners (not clickable containers — the × is the control). Removing a chip re-runs the search without that constraint.

**Step 3:** Verify with `"contemporary monologue for a woman in her 20s, about 2 minutes"` — four chips, and results are post-1980, female, 90-150s.

**Step 4: Commit**

---

## Task 7: Say which constraint was relaxed

`RELAX_ORDER` already exists and `SearchResponse.broadened` already carries `{"relaxed": [...]}`. Check whether `SearchInterface.tsx` renders it — if not, this is a display-only task.

One line above results: `No 2-minute matches, showing 1-3 minute instead.` Never silently relax.

**Commit.**

---

## Task 8: My Book — list surface

**Files:**
- Create: `app/(platform)/book/page.tsx`
- Modify: the platform nav component (find it under `components/layout/`)

Backend is done. `GET /api/monologues/favorites/my` returns everything needed.

Per row: title, character, source, duration, memorized state, last worked. Plain text with `·` separators — no icons, no cards with redundant repeats. Follow `components/rehearse/CollectionRow.tsx` for the established row pattern.

Three surfaces total in nav: Search, My Book, Rehearse.

**Commit.**

---

## Task 9: Rename "Favorite" to "Add to my book"

Frontend copy only. Make it the single most prominent control on the monologue detail page (`app/(platform)/monologue/[id]/page.tsx`). Every other action on that page drops to secondary.

**Commit.**

---

## Task 10: Cut editor

**Files:**
- Create: `components/book/CutEditor.tsx`
- Modify: `app/(platform)/monologue/[id]/page.tsx`

`POST /api/monologues/{id}/cut` already exists (`monologues.py:1178`) and takes start/end line. Read it first to confirm the payload shape.

Select start and end line, live duration recomputed as you drag. Duration math must match `estimated_duration_seconds`' own words-per-minute assumption — find that constant in the extraction service and reuse it rather than inventing a second one.

This is the highest-value single feature in the plan. Every actor cuts to fit an audition limit and currently does it in a Google Doc.

**Commit.**

---

## Task 11: Notes + memorized toggle

Both endpoints exist (`:1114`, `:1218`). `POST /{id}/studied` (`:1144`) stamps `last_studied_at` — call it when the toggle flips on.

Free-text notes for beats, objective, given circumstances. One text area, no field labels beyond a single word.

**Commit.**

---

## Task 12: Audition-ready export

**Files:**
- Create: `components/book/ExportSheet.tsx`
- Possibly: `backend/app/api/monologues.py` export endpoint

The user's cut only, formatted clean, printable. Plain text first — ship that, then decide whether PDF earns its dependency. Title, character, source, then the cut text in the typewriter face (`--font-typewriter`, Courier Prime) since this is monologue text, not chrome.

**Commit.**

---

## Task 13: Instrument the rehearsal session start path

**Ship instrumentation before redesigning anything.** 51 abandoned at ~2.1 lines / 57s is a symptom with no diagnosis attached.

Record: time to first line delivered, mic permission prompt shown + outcome, first AI response latency, any client error. Write to `community_events` or a dedicated table — check `backend/app/models/community.py` for what fits.

**Commit. Then stop and let data accumulate before touching the flow.**

---

## Task 14: Auto-close stuck sessions

38 rows sit in `in_progress` in prod, which makes the status column meaningless and poisons the completion math that was already fixed once (see memory: rehearsal-completion-and-sessions-dashboard).

Backfill the existing 38, then add the timeout sweep so it stays clean. **Take a reversible backup before the backfill** — this repo's convention is `backend/backups/`.

**Commit.**

---

## Task 15: Resume an incomplete session

`RehearsalSession.current_line_index` already exists (`backend/app/models/actor.py:328`). Mostly plumbing: offer resume instead of restart when a session ended incomplete.

**Commit.**

---

## Work Item 3 — BLOCKED, needs Canberk's decision

Do not start this without an explicit call. Two questions:

1. **Copyright.** Screen material is almost entirely in copyright. Full text, or excerpt plus source pointer? The brief says flag it, do not decide it in code. Agreed — this is a legal-exposure question, not an engineering one.
2. **Scope, given the corrected facts.** The real work is re-extracting **1,904 existing film/TV rows** that were cut too short to clear `FILM_TV_MIN_WORDS = 75`, not extracting from 14,271 scripts. Prioritize by titles appearing in `search_logs` weak matches.

Route everything through `review_status='pending'` and the existing moderation queue at `/admin/monologues/review` either way.

---

## Work Item 6 — small things

- **Referral source, 97.6% blank.** Make it a required single-tap at signup with fixed options including ChatGPT (6 of 12 write-ins named it), or delete the field. Free text collected six spellings of ChatGPT.
- **Profile collects what it does not repay.** 211 profiles, 62 locations, 45 training, 35 headshots, 4 credit rows. Users fill in what biases search and skip the rest, which is rational. Either give it an output (résumé export makes credits worth entering — `backend/app/api/resume.py` already exists) or cut it to the search-biasing fields. Do not leave it half-built.
- **Self-tape:** out of scope. `user_tapes` stays unpublished.

---

## Success metrics

Baseline today, 2026-08-19: second-day return **9.2%**, weak-match rate **32.6%** (118/362 over 30 days).

Targets: second-day return above **25%**, weak-match rate below **10%**.

Note that Task 1 will make the weak-match rate *look* worse before it looks better — searches that used to return 20 wrong results now correctly return none, which is the honest number finally becoming visible. Judge Task 1 on the request-queue filling up and on repeat-identical-query rate falling, not on the weak-match percentage.

---

## Implementation status (branch `feat/workspace-not-search-engine`)

All 15 tasks implemented. Backend suite 359 passing; frontend `tsc` clean; golden replay had **0 regressions vs baseline** (130/131; the 1 remaining fail is pre-existing dear-evan-hansen content_gap, which Task 4 addresses).

- **Task 1** (2 commits) — real cosine through the bands. Two recalibrations surfaced by the golden replay and approved: strong band shows down to the floor (0.48 only picks the banner), and filter-only queries bypass the floor. Verified on prod: `quantum tensor calculus` 20→0, `hamlet` unchanged. `CACHE_VERSION` 14→15. NB: `Mexican` now measures cosine **0.345** (not the brief's 0.176 — embeddings were regenerated since), so it lands weak with 1 result, not 0.
- **Task 2** — floor tunable via `app_settings.search_relevance_floor` (same default; no behavior change until set).
- **Task 3/4/7** — retargeted to the **live** `app/(platform)/monologues/page.tsx`; `components/search/SearchInterface.tsx` was dead code (reverted). Looser-matches divider folds into the Related tail; `RequestQueryButton` files a raw-query content request from empty/weak states; relaxation notice names what was loosened.
- **Task 5** — era correction. `plays.category` IS the era field (only contemporary/classical) but dirty: `era_year_clause` layers `year_written` on top, keeping NULL-year rows. Prod: `contemporary` 20/20 pre-1980 leakage → 0.
- **Task 6** — `parsed_constraints` on the response, rendered as removable chips; dismissing one re-runs with `?ignore=`.
- **Tasks 8–12** — My Book = the **existing** `/rehearse` Collection surface (not a new `/book` route). Added the ownership depth: cut editor (live duration via a 1:1 TS port of `duration.py`), audition export (Copy + Print), memorized bulb toggle, richer collection rows. `GET /{id}` now returns the user's collection meta so notes/cut pre-populate.
- **Task 13** — the run path already tracked mic_status / seconds_to_first_line / progress; added the missing **client-error** signal (`trackRehearsalError`). First-AI-latency left as a follow-up (needs deeper run-screen wiring).
- **Task 14** — stuck sessions self-clean on new-session start; `scripts/close_stuck_sessions.py` (dry-run default, reversible backup) confirmed **exactly 38** stuck rows in prod. **`--apply` NOT run** — left for Canberk (prod mutation).
- **Task 15** — `GET /scenes/{id}/resumable-session`; Rehearse modal offers "Resume where you left off" reusing the existing `start_from_line_index` path.
- **Work Item 3** — untouched, still BLOCKED on the copyright call.

**Open follow-ups for Canberk:** run `close_stuck_sessions.py --apply` on prod (with the pre-deploy Supabase migration ordering in mind); browser-verify the new search/book UI; decide the "My Book" vs "Collection" naming (kept "Collection" to respect the recent nav consolidation); first-AI-latency instrumentation.
