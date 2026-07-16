# Turning searchers into ScenePartner users

**Date:** 2026-07-10
**Goal:** Get more of the 89% who search to actually *work with the AI on a piece*, and keep them.

## The architecture (decided 2026-07-10): two parallel products

Instead of forcing monologues into the scene model, each piece type gets its own home. Same skeleton, two bodies:

```
                 DISCOVERY          →   WORK WITH AI        →   PAYWALL
ScenePartner  →  scene search       →   rehearse a SCENE    →   session cap → convert
   X          →  monologue search   →   work on a MONOLOGUE →   session cap → convert
```

- **ScenePartner** = existing scene product (2-character dialogue, AI reads the other role).
- **X** (name TBD) = new monologue product. Its front door is the **monologue search 89% of users already do**, so it monetizes traffic we already have rather than needing new traffic.
- **X v1 = get off book + performance notes** (decided). Character/objective/beat analysis is a later addition, not v1.

---

## The problem, in one funnel (282 users, all-time)

| Step | Users | % |
|---|---|---|
| Searched | 250 | 89% |
| Favorited a monologue | 16 | 5.7% |
| Started ScenePartner | 16 | 5.7% |
| **Completed** a ScenePartner rehearsal | 6 | 2.1% |
| Memorized anything | 3 | 1.1% |
| Made an audition tape | 0 | 0% |

**Two facts that decide the strategy:**

1. **People search, then leave.** The drop from 89% → 6% is the whole business problem.
2. **ScenePartner is sticky for the few who reach it.** 16 users ran **61 sessions** (~3.8 each). The product works. It's *undiscovered / unreached*, not broken.

**Dead ends (do not invest):** audition (0 tapes), memorize (3 users). ScenePartner is the horse.

---

## Root cause: it's not a missing button, it's a broken path

The path from "I searched" to "I'm preparing a role" is blocked at **three** points, in order:

### Block 1 — Search hands people junk (the real leak)
Evidence from real logs:
- `"…auditioning for Zoe and Alana in Dear Evan Hansen NOT FROM THE SHOW"` → #1 result was a **male** character literally named **"Sings"** from an obscure play.
- `"quiet manipulative woman"` → all female (ok) but tones were *anguished / defiant / dark*. "Quiet" ignored entirely.
- Users re-search the same thing 2–3x, reworded ("manipulative" → "manipulative woman" → "quiet manipulative woman"). That reword loop = dissatisfaction.

**Why:** search is a **pure vector / semantic** pipeline. It embeds the whole query and returns nearest neighbors, with:
- **No query understanding** — implied gender/age/tone and negation ("NOT from the show") are dropped.
- **No quality gate** — 96% of monologues have no quality score, only 4% verified, so junk (mis-parsed "Sings"/"Voice" entries, 46 of them) ranks at the top.

**Good news:** gender/tone/age are already populated on ~93% of the 9,671 monologues. Smart search is a **query-understanding + ranking** problem, NOT a re-tag-everything problem.

### Block 2 — A monologue can't be rehearsed
Search returns **monologues** (one person). ScenePartner (`app/(platform)/scenes/[id]/rehearse/page.tsx`) rehearses **scenes** (2+ characters, AI reads the other role, hard 2-character validation). Only **31 scenes exist**. So even a user who finds a great monologue has **nowhere to take it** — there's no "prepare this role" path for a single-character piece.

### Block 3 — No bridge, and a cold first run
`MonologueCard` links only to memorize/audition (both dead). New users land on an empty `/practice`. Nothing says "prepare this role with ScenePartner."

---

## The plan (in leverage order)

### Phase 0 — Make search trustworthy *(highest leverage, unblocks everything)*
Nothing downstream matters if result #1 is "Sings." Two workstreams:

- **0a. Query understanding layer.** Before vector search, parse the free-text query into structured intent + a clean semantic query:
  - Extract constraints: gender, age range, comedic/dramatic, classical/contemporary, length, and **negation** ("not from X", "not overdone").
  - Apply the constraints as real filters/boosts against existing metadata (gender/tone/age already exist), then rank semantically within them.
  - This is an LLM call on the query. It's the "super smart" part.
- **0b. Quality gate + data hygiene.** Stop junk from surfacing:
  - Purge/quarantine the 46 obvious junk entries (character_name = "Sings"/"Voice"/"Chorus"/etc.).
  - Backfill quality_score (currently 96% null) or at minimum down-rank unscored/unverified + null-gender (662) monologues so they can't outrank good ones.

**Effort:** medium–high (0a is a real build; 0b is mostly scripts). **Impact:** the difference between "search once and leave" and "find something I'd actually prepare."

### Phase 1 — Build X: the monologue product *(the product gap)*
A monologue product keyed off `monologue_id`. **Modality (decided): audio-first** — headphones in, run it out loud. No camera. (The video self-tape already existed as `audition` and got **0 uses** — the camera was likely the friction that killed it. Video becomes an optional step-up later, reusing the existing recorder + Vision coach.)

**v1 scope (decided):**
- **Get off book** — AI cues you in and prompts the next line when you stall/blank.
- **Performance notes** — spoken-delivery feedback (pacing, emotion, line accuracy) from the transcript.
- **Later (not v1):** character/objective/beat analysis (we store context/themes/emotion on monologues); optional video self-tape.

**Reuse audit result: ~60-65% of v1 already exists.**
- *Reuse:* monologue-by-id load + teleprompter + feedback sidebar (`app/(platform)/audition/page.tsx`, orphaned); the **ScenePartner audio stack** — browser SpeechRecognition + Whisper (`backend/app/api/speech.py`), word-matching (`wordMatchScore`/`wordsMatch` in `scenes/[id]/rehearse/page.tsx`), `monologues.text_segments`; the paywall pattern (FeatureGate + `usage_metrics.scene_partner_sessions` counter).
- *Net-new (~35%):*
  1. **Off-book cueing loop** for a single speaker (stall detection → feed next line). Adapt the scene engine; primitives reuse.
  2. **Transcript-aware notes** — the existing coach is video-frame-only and never hears the words; feed Whisper transcript + monologue text into a new feedback path.
  3. **X route + its own usage counter** (new `UsageMetrics` field, gate wiring, seed limits) + a sessions table mirroring `rehearsal_sessions`.
  4. **Monologue-segmented teleprompter** in cueing mode.
  5. **Search-result CTA** ("Work on this monologue").

This turns **all ~9,671 monologues** into workable content, no fabricated text.
**Effort:** highest of the phases, but bounded — mostly reconnection. **Impact:** removes Block 2 permanently.

### Phase 2 — The bridge (search result → "prepare this role")
- Prominent CTA on `MonologueCard` + monologue detail page: **"Prepare this role with ScenePartner."**
- Deep-links into the Phase-1 role-prep mode with the monologue pre-loaded.
- Position it as the obvious next step after finding a piece.
**Effort:** small (once Phase 1 exists). **Impact:** removes Block 3.

### Phase 3 — First-run activation
- A new user who searches and opens a piece gets nudged to *prepare it*, not dumped on empty `/practice`.
- Use existing `has_seen_first_rehearsal` flag to drive a guided first role-prep.
**Effort:** small–medium.

### Phase 4 — Monetize the now-larger engaged pool (Canberk's coupon-modal idea)
- At the free limit (scene-partner sessions / searches), show a modal offering **FOUNDER3** (3 months free Plus, card-on-file — coupon already exists self-serve).
- Deliberately **last**: a paywall only helps once meaningfully more than 16 people reach it.
**Effort:** small.

---

## Key decisions Canberk needs to make

1. **Sequencing.** I strongly recommend **Phase 0 first** (smart search) — it's X's front door too, so junk results sink X the same way they sink ScenePartner. Alternative: build X in parallel as a separate track. Which?
2. ~~X interaction model~~ **DECIDED:** v1 = get off book + performance notes.
3. **Scope of the smart-search build** (Phase 0a): full LLM query-understanding, or a lighter first pass (extract gender/comedic-dramatic/classical-contemporary + negation only)?
4. **X naming** — deferred.

## Metrics to watch (define success up front)
- Search → *any* rehearse start rate (today ~6%).
- Rehearse start → complete rate (today 6/16 ≈ 38%).
- Reword-loop rate (same user, near-identical query within a session) — should fall as search gets smart.
- Free → paid conversion at the Phase 4 modal.

## Reference (files / data)
- Search UI: `components/search/MonologueCard.tsx`, `components/search/SearchInterface.tsx`
- ScenePartner: `app/(platform)/scenes/[id]/rehearse/page.tsx` (scene-based, 2-char)
- Dead ends: `app/(platform)/audition/page.tsx`
- Data: `monologues` (9,671; 382 verified; 96% no quality_score; ~93% have gender/tone/age), `search_logs`, `rehearsal_sessions`, `usage_metrics.scene_partner_sessions`
- Coupon: FOUNDER3 (3mo Plus, card-on-file, self-serve)
