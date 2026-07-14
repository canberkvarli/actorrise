# Profile-First Onboarding + Personalization (and Résumé fast-follow)

**Date:** 2026-07-14
**Author:** Canberk (design via brainstorming session)
**Status:** Design approved — building Phase 1
**Related:** `docs/plans/2026-07-10-search-to-scenepartner-activation-plan.md`, memory `activation-cliff-search-to-rehearse`

## Problem (measured, prod, test/admin filtered)

288 real users. Funnel:

| Step | Users | % |
|---|---|---|
| Signed up | 288 | 100% |
| "Completed" onboarding | 283 | 98% |
| Ran a search | 259 | 90% |
| Touched ScenePartner | 16 | 5.5% |
| Actually rehearsed (delivered a line) | 13 | 4.5% |
| Active last 7d | 14 | 4.9% |

Three findings:
1. **The cliff is ~90% search → ~5% rehearse.** Getting users to *stay and play* means getting them past search into *doing*.
2. **Current onboarding captures nothing.** `OnboardingWizard.tsx` is a 3-step goal picker (audition/class/fun → scene-vs-monologue → done). 98% "complete" it, giving us **zero** data to personalize with. This is the real gap.
3. **Rehearse is content-starved on scenes** — only **31 scenes across 15 plays** exist, vs thousands of searchable monologues. So the abundant, rehearsable asset is **monologues** (via the `/work` audio flow), *not* scenes. Onboarding should point new actors at a **monologue picked for them**, ready to rehearse. Scenes are the deeper second-session hook.

## The flywheel

- **Day-1 carrot:** 5 quick taps → personalized monologues ("it knows me").
- **Recurring/monetizable carrot (Phase 2):** fill the deep profile → a real, downloadable **actor résumé**.
- **Same data feeds both.** Every résumé field (age range, height, union, training, headshot, credits) also sharpens personalization. Gives an honest answer to "why fill this out?"

Honesty note: personalization is **real filtering**, not fake. The 5 answers write to fields the search **already reads** (`actor_profiles.gender/age_range/type/preferred_genres`, plus `profile_bias_enabled` and `overdone_alert_sensitivity`) — today those fields are empty. We are *populating the levers that already exist*, not building a new engine.

---

## Phase 1 — Profile-First Onboarding (activation fix) — BUILD NOW

### Capture: 5 taps (+ optional name)

Every question maps to a real monologue filter. No résumé/vanity fields here.

| # | Question | Writes to | Filter effect |
|---|---|---|---|
| 1 | How you're cast (man / woman / non-binary / any) | `actor_profiles.gender` | `Monologue.character_gender` |
| 2 | Age range (18–24, 25–34, 35–44, 45–54, 55+) | `actor_profiles.age_range` | `Monologue.character_age_range` |
| 3 | What you want to work on — multi-select (dramatic / comedic / classical / contemporary) | `actor_profiles.type` + `preferred_genres` | `Monologue.tone` + `Play.category` |
| 4 | Medium — multi-select toggle (theatre / film / TV) | **NEW** `actor_profiles.preferred_mediums` | `Play.source_type` (play/film/tv) |
| 5 | Where you are (just starting / actively auditioning / working pro) | `actor_profiles.experience_level` + sets `overdone_alert_sensitivity` | `Monologue.difficulty_level` + overdone bias |

Career-stage → overdone mapping: *just starting* = tolerate recognizable/approachable; *auditioning* = balanced; *pro* = prefer fresh, avoid warhorses. Also flips `profile_bias_enabled = true`.

Everything else the profile can hold (ethnicity, height, build, training, union, headshot) stays **out of onboarding** — nudge later from the profile page / résumé flow.

### Payoff screen (the "wow")

After tap 5: land on a results screen headed by the plain-language profile, e.g. *"3 dramatic monologues for a woman, 25–34, actively auditioning."* Each card has a **Rehearse** button → `/work`. This is the bridge across the cliff: onboarding ends *inside a rehearsable monologue*, not on an empty search box.

- If the profile is narrow and matches are thin, fall back to the existing soft-fail behavior (closest results + banner) rather than a blank screen.

### Existing users (~227 already "onboarded")

**Soft backfill** (decided): a dismissible-but-persistent card/banner on next app open — "make your results yours, 5 taps" — runs the same flow and writes to their profile. Not a hard gate (avoids feeling like a regression), but stays until completed or explicitly dismissed. Track with a new flag (e.g. `has_completed_profile_onboarding` distinct from the legacy `has_completed_onboarding`).

### Skip behavior

Onboarding is skippable; skipping just leaves fields empty (search behaves as today). No dark patterns.

### Success metric

Move **searched → rehearsed** meaningfully above 4.5%, and lift 7-day active. Watch onboarding completion of the *new* 5-tap flow separately from the legacy flag.

---

## Phase 2 — Actor Résumé (monetization flywheel) — FAST-FOLLOW, documented only

Three pieces:
1. **Credits data model (new):** a real actor résumé is mostly *credits* — Production · Role · Theatre/Company · Director — grouped by Theatre / Film / TV / Commercial, plus training and special skills. `actor_profiles` has none of this today. New `actor_credits` table + entry UI.
2. **Résumé template → downloadable PDF:** industry-standard one-pager, headshot alongside. Free tier renders with a **watermark**.
3. **Gating (use all 4 tiers):** Free = 1 résumé, watermarked · Solo = 3 · Plus = 5 · Pro = unlimited-ish. (Exact caps TBD — numbers still being decided.)

Not built in Phase 1, but written here so the flywheel isn't lost.

---

## Build order

1. **Backend:** add `preferred_mediums` (+ new onboarding flag) to `actor_profiles`/`users`; migration; ensure onboarding write path populates gender/age_range/type/preferred_genres/preferred_mediums + sets `profile_bias_enabled` and `overdone_alert_sensitivity`.
2. **Frontend:** new 5-tap onboarding wizard (extend/replace `components/onboarding/OnboardingWizard.tsx`); payoff results screen wired to profile-filtered monologue query with Rehearse → `/work`.
3. **Backfill:** soft dismissible card for existing users.
4. Ship to a feature branch → staging preview.
```
