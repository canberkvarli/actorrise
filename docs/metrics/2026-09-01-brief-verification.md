# Verification of the 2026-09-01 brief

Checked every claim against prod (`ppvqmbzuqvzpiuqaiqfy`) and the shipped code.

## Confirmed

| Claim | Verified |
|---|---|
| pg_trgm not installed | true |
| result_feedback dead | last row 2026-08-23 18:32 UTC, 21 all time |
| null-cosine share | 65 of 282 searches in 7d (23%) |
| weak share | 70 of 282 (24.8%) |
| one weak row above the strong bar | exactly 1 |

## Wrong, or already shipped

**To-do #2 (search `plays.title`) and #3 (character lookup) are already live.**
`monologues.py:462` calls `detect_catalogue_title(db, q)` which reads real
`plays.title` rows first; `:477` calls `detect_catalogue_character`. Character
routing shipped 2026-08-27 (`4b8c6963`).

**To-do #1 (fuzzy title) largely shipped 2026-08-28** — `990efd96`
"partial/reordered/typo title matching + abbreviation aliases". The named
failures postdate it, so trigram is not what they were missing.

## What actually caused the named failures

Every example in the brief is a **film/TV-only** title, and every weak
occurrence had `source_type: "play"` active:

| Title | Carried as | Monologues |
|---|---|---|
| One Flew Over the Cuckoo's Nest | film | 3 |
| Joker | film | 2 |
| Yellowjackets | tv | 32 |
| August Osage County | film | 7 |
| Sweeney Todd: The Demon Barber… | film | 5 |

The same query, same user, 35 seconds apart:

- `01:00:22` `source_type: "play"` → vector, weak, cos 0.337
- `01:00:58` `source_type: ["film","tv"]` → `title_exact_backfilled`, 22 results, not weak

`prepass_can_honour` is behaving correctly (there is no play row). The failure
is what happens next: the app silently serves 20 unrelated play monologues
instead of saying *"I have this as a film, drop the play filter."*

Aggregate, 14 days:

| filter | strategy | weak / total |
|---|---|---|
| play | vector | 94 / 298 (32%) |
| film+tv | vector | 34 / 64 (53%) |
| any | title_exact* | **0 / 79** |

The title path never produces a weak match. The gap is source-type mismatch.

`find_catalogue_source_types()` (`title_lookup.py:282`) already computes exactly
this, but is only reachable from `compute_content_gap` (`:1021`).

## The 0.748 weak row

"Nora a dollshouse", cos 0.748, `STRONG_COSINE_SIM = 0.38` — so the cosine rule
passed it. `monologues.py:644` then flipped it weak via
`query_is_unservable()` (grounding.py, H-13). False positive: the typo token
"dollshouse" appears nowhere in the library, while *A Doll's House* has 72
monologues. Grounding needs the same normalisation the title path uses.

## Caveat on the weak-query sample

Several weak rows are `user_id = 1` (Canberk's own testing, e.g. "joker" and
"bane" on 08-27 and 08-31). The 41% figure includes them.
