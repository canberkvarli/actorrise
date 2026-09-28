# Contemporary content: what to actually go get

Built from 156 "contemporary"/"modern" searches in the 60 days to 2026-09-28,
plus the 8 negative feedback notes in the last 30 days (6 of which say
"contemporary"). Numbers are queries, one count per query.

## The shape of the demand

| Dimension | Ranked demand |
|---|---|
| Gender | **female-coded 65** vs male-coded 33 — roughly 2:1 |
| Age | **teen/13-19: 43** · 20s: 26 · 30s-40s: 14 · child: 3 |
| Tone | **comedic 45** · dramatic 25 · vulnerable 18 · dark/edgy 16 |
| Length | ~1 min: 15 · **2 min+: 14** · ~90 sec: 10 · just "long": 7 |
| Medium | play-specified 15 · screen-specified 6 (most say neither) |
| Accent | 8 asked for British / northern / Yorkshire |

## Priority order for scraping

1. **Contemporary comedic pieces for teen girls, 60–120 seconds.** This is the
   single densest cell in the data: teen (43) x female (65) x comedic (45).
2. **Women in their 20s, comedic, ~1 minute.** Second densest.
3. **Anything contemporary that runs past two minutes.** Length is a separate
   gap from era, see below. Currently only 1,277 pieces of ~19,000 exceed 150s.
4. **Contemporary men 18–25, dramatic, naturalistic, grounded.** Smaller volume
   but consistently weak results.
5. **British / northern English voices.** 8 queries, currently near-zero supply.

## Two gaps, not one

**Era.** Stage corpus by `plays.year_written`:

| Bucket | Plays | Monologues |
|---|---|---|
| pre-1950 | 563 | 11,871 |
| unknown (mostly Gutenberg, so also old) | 167 | 2,074 |
| 2000+ | 12 | **13** |

**Length.** Duration buckets across the visible corpus:

| Bucket | Count |
|---|---|
| <45s | 518 |
| 45–75s | 9,606 |
| 75–105s | 5,224 |
| 105–150s (~2 min) | 2,715 |
| 150s+ | 1,277 |

Of the ~2-minute pieces, only **56 are TV**. This is why the 2026-09-28
complaint happened: the actor asked for "Shauna's two minute dramatic monologue
from Yellowjackets", search found the show fine (12 results, title_exact), but
the longest Yellowjackets piece we hold is 74 seconds.

## The part scraping will not fix

**111 of the 156 contemporary searches returned a full page of results.** Only
one returned zero. The corpus is 85% pre-1950, so semantic search confidently
serves Ibsen and Chekhov to someone who typed "modern teen girl under 90
seconds" and never says it is doing so. The actor reads three of them, realises
they are a century old, and leaves a note saying "these arent contemporary".

So alongside the content work there is a truth-telling fix: when a query asks
for contemporary and the era filter would leave almost nothing, say that
plainly rather than silently relaxing it. `search/era_guard.py` already does
this for `source_type`; the same shape applies to era.

## Rights

Per `ingest-pipeline-and-skip-list`: anything new goes through `ingest_play()`,
and rights are required. Contemporary means in copyright, so a source is only
usable if it is (a) licensed to us in writing, (b) published by the author for
audition use, or (c) genuinely public domain. Put any written permission in
`docs/licensing/` so the `license_type` column can say `licensed` honestly.
The 11 Stage Partners rows stay `fair_use` until that reply exists.
