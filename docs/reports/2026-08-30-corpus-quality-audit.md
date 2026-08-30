# Corpus quality: where the ETL actually stands

**Date:** 2026-08-30
**Triggered by:** monologue #9750 (Joker) reading as a stitched-together mess.

---

## The Joker row, diagnosed

#9750 is broken, but not the way it looks. There is **no Murray dialogue in it**.
It is Arthur's own lines, with Murray's removed and the remainder concatenated
**backwards through the scene**:

| fragment | when it happens |
|---|---|
| "Happy?! I'm not happy..." | late in the interview |
| "You wanna hear a joke, Murray? / Knock-knock." | late |
| "I don't know if I should cross or uncross 'em" | **opening** |
| "Thanks for having me on, Murray" | **opening** |
| "You're right, uncrossed is better." | **opening** |

This is a distinct failure class from the interleaved-dialogue bug fixed on
2026-08-29. That one welded in *other characters'* lines. This one flattens a
whole two-person scene into one row — sometimes keeping only one speaker's
lines (Joker), sometimes keeping both.

**None of the existing gates can catch it.** The text is single-speaker-looking,
grammatical, in word range, and artifact-free. It passes everything.

### The fingerprint

Fragments separated by blank lines, where the blank line is exactly where the
other character's lines were cut out. Note this **cannot** have come from
`segment_screenplay` — that path runs `to_display_text`, which collapses all
whitespace to single spaces. So there is a second film ingest path that
preserves `\n\n`, and it is the one producing these.

---

## How widespread

Detector: `>= 4` blank-line fragments AND at least one fragment opening with a
reply word (yeah / yes / no / well / okay / right / thanks / oh / exactly) —
i.e. an answer to a question that is no longer there.

| source | total | ≥4 fragments | **flagged** |
|---|---|---|---|
| film | 4,086 | 222 | **81** |
| play | 7,228 | 7 | 2 |
| tv | 3,104 | 0 | 0 |

**Sampled 6 of the 81 flagged — all 6 broken.** Worst cases:

- **#10774** *10 Things I Hate About You* — **27 fragments**, contains
  "Cameron, I'm a little b…", a different character entirely
- **#11369** *The Mask* — contains "What?", which is Lisa's line
- **#10767** *Five Easy Pieces* — "Yes, that's what's important to me." /
  "No, don't do that." / "No inner feeling." — pure orphaned answers

### The reply-word signal is what matters, not the fragment count

Sampled `n>=4` **without** reply words (145 rows): **all legitimate** — Sling
Blade, Notting Hill, Gladiator, Apocalypse Now, Tony Stark's recording in
Endgame, Beasts of No Nation. Real monologues with paragraph breaks.

Sampled `n = 2–3` (198 rows): **all legitimate** — Taxi Driver, Philadelphia's
closing argument, BlacKkKlansman, Marty.

So the blast radius is genuinely ~81 rows (2% of film), not 420. Do **not**
purge on fragment count alone; it would destroy some of the best pieces in the
corpus.

---

## Honest state of the corpus

**14,418 monologues. The bulk is sound.** The two big buckets — 6,890
public-domain play monologues and 3,104 TV — show no sign of this class. TV has
zero multi-fragment rows at all.

Known defects, in order of size:

| issue | rows | status |
|---|---|---|
| age vocabulary unmatchable by the filter | 8,815 | backfill running 2026-08-30 |
| interleaved co-character dialogue | ~460 | fixed 2026-08-29; 62 queued for review |
| **flattened dialogue scenes (this report)** | **~81** | **open** |
| copyrighted with no recorded rights basis | 296 | guard shipped; excerpted, decision pending |
| no children's material | — | sourcing gap, see below |

That is roughly **0.6% of the corpus** with content defects. The bigger problem
was never dirt, it was reachability: 8,815 rows the age filter could not match
outnumber every text defect combined by 10x.

---

## What to do about the 81

**They cannot be auto-repaired by deletion.** The interleaved-dialogue cleanup
worked because the fix was "remove the intruding lines" and a subsequence guard
could prove the AI only deleted. Here the correct monologue is *one contiguous
run* out of several, and picking which run needs the original screenplay's
ordering, which the row no longer carries.

Options, best first:

1. **Re-extract from source.** These films have screenplays; `segment_screenplay`
   with its contiguity rules produces correct speeches. Re-run those 81 titles
   and replace. Highest quality, moderate cost.
2. **Flag for review** at `/admin/monologues/review` with reason
   `flattened_scene` and let a human keep the best run.
3. **Delete.** 81 rows out of 14,418 is a rounding error, and a broken monologue
   is worse than a missing one for an actor picking audition material.

Recommend 1, falling back to 3 for anything that will not re-extract.

### Preventing recurrence

The gate needs a `flattened_scene` check: `>= 4` blank-line fragments plus a
reply-word opener. It is cheap, deterministic, and validated at 6/6 precision on
this sample. Add it next to the cast-aware checks in `monologue_quality.py`.

---

## Children's material: yes, this needs sourcing

The `child` age bucket now exists (commit f4e68dd2) but will hold roughly **18
monologues**. The vocabulary is fixed; the shelf is empty.

This matters more than the number suggests because educators are an explicit
audience — CLAUDE.md carries a standing free-Plus offer for teachers and their
students. Pointing a teacher at an empty filter is worse than not having it.

Where children's material legitimately exists:

- **Public-domain children's plays and fairy-tale dramatisations** — the same
  Gutenberg/Archive.org path already in use, just a different search. Fully in
  the clear on rights.
- **Youth-theatre PD collections** — early-1900s school and church play
  anthologies are plentiful and out of copyright.
- **Theatre In The Round-style packets** — flagged in the ETL v2 plan as the
  best remaining text source.

Note the aggregators (Daily Actor, AuditionScenes) do carry youth monologues,
but those are contemporary and copyrighted, so they stay metadata-only under the
rights guard shipped in ee5614f8. The children's shelf has to come from the
public domain.
