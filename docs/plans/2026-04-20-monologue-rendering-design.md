# Monologue Rendering & Dashboard Card Sizing

**Date:** 2026-04-20
**Status:** Design

## Problem

Two related issues with how ActorRise presents monologues:

1. **Dashboard cards trim synopsis aggressively.** Film & TV cards (`MonologueResultCard`) and Recommendations cards (inline markup on dashboard) both cap the text preview at 2–3 lines, so users can't tell what they're looking at without opening the slide-over. Cards also have variable heights (no fixed size), producing a ragged grid.

2. **Monologues contain other characters' lines baked into `text`.** Examples:
   - **Joker (Joker, 2019):** `text` contains Arthur's lines mixed with responses to Murray ("You're right, uncrossed is better"), and at least one Murray line ("You shouldn't be here. It's not right.").
   - **Michael Corleone (The Godfather):** `text` contains Carlo Rizzi's one-word interjection "Barzini." in the middle of Michael's confrontation speech.

   Actors need to see cue lines (to know what they're responding to) but those lines must be visually distinct from the character's own dialogue. Stage directions have the same problem — they should read differently from dialogue.

## Decisions (locked)

| # | Decision |
|---|----------|
| 1 | Dashboard Film & TV + Recommendations cards: **fixed height**, generous width. Synopsis `line-clamp-4` or higher. |
| 2 | Scope of card sizing change: **dashboard only** (Film & TV row + Recommendations row). `/search`, `/my-monologues`, etc. unchanged. |
| 3 | Other-character interjections rendered as **inline italic speaker tag**: `*CARLO:* Barzini.` in italic + muted color, preceding the line. |
| 4 | Stage directions rendered as **italic + muted, on their own line** with small vertical spacing above/below. |
| 5 | Data model: **structured segments** (new field `text_segments`) populated for new scrapes + **backfill** existing records via LLM. Renderer uses segments when present, falls back to plain `text`. Admin edit modal lets moderators correct mistakes. |
| 6 | Backfill method: **Claude Haiku**, one pass over all existing records. Input: `text + character_name + play_title`. Output: JSON segments. |
| 7 | Scope of segment rendering: **both plays and film/TV**. Same renderer handles both. Plays already have a separate `stage_directions` column — segments unify the model. |

## Data Model

### New field on `monologues` table

```
text_segments: JSONB (nullable)
```

Shape:

```json
[
  { "type": "dialogue", "text": "Barzini is dead. So is Philip Tattaglia..." },
  { "type": "interjection", "speaker": "CARLO", "text": "Barzini." },
  { "type": "dialogue", "text": "Good, good. Leave now..." },
  { "type": "direction", "text": "(Michael picks up the phone)" }
]
```

**Segment types:**
- `dialogue` — the target character's own lines. Default style.
- `interjection` — another character's line. Rendered with italic speaker tag, muted.
- `direction` — stage direction or parenthetical. Italic, muted, own line.

When `text_segments` is `NULL`, renderer falls back to treating the full `text` field as a single dialogue segment. This preserves behavior for any record the backfill misses.

### Why a new column vs parsing at render time

Parsing at render time was considered and rejected: the Joker example has no `NAME:` markers, so regex-based extraction would miss the mixed cues entirely. An LLM pass produces structured data once, then rendering is deterministic and fast.

## Backfill

**Script:** `backend/scripts/segment_monologues.py` (new).

**Flow:**
1. Query all monologues where `text_segments IS NULL`.
2. For each, call Claude Haiku with a prompt containing `text`, `character_name`, `play_title`. Prompt instructs: identify who speaks each line, mark stage directions, return strict JSON array matching the schema above.
3. Validate output (every record produces ≥1 dialogue segment where speaker matches `character_name`). If invalid, log and skip — record stays `NULL`, falls back to plain rendering.
4. Write result to `text_segments`.
5. Re-runnable: `--force` flag re-segments records (for when the prompt improves).

**Cost:** Haiku at ~$1/M tokens × ~N records × ~500 tokens avg ≈ negligible for a few thousand records.

**Idempotency:** script is safe to re-run; records with non-null `text_segments` are skipped unless `--force`.

## Renderer

### New component: `MonologueTextRenderer`

Location: `components/monologue/MonologueTextRenderer.tsx`

Props:
```ts
{
  text: string,            // fallback when segments missing
  segments?: TextSegment[] // preferred when present
}
```

Rendering rules:
- `dialogue` — standard paragraph, default body font.
- `interjection` — `<p className="..."><em className="text-muted-foreground not-italic font-semibold text-sm">CARLO:</em> <em className="text-muted-foreground italic">Barzini.</em></p>`. Inline, clearly different from dialogue.
- `direction` — `<p className="italic text-muted-foreground/70 my-2">(Michael picks up the phone)</p>`. Own line, vertical spacing.

Used in:
- `MonologueDetailContent` (slide-over) — replaces current `<p>{mono.text}</p>`
- Reading mode on dashboard — replaces `{currentMonologue.text}` rendering
- PDF download (`downloadMonologue`) — segments get converted to HTML with equivalent styling

Used in **card previews**: segments not used for the truncated `"text.substring(0,120)..."` preview. Preview stays plain to keep cards scannable.

## Dashboard Card Sizing

### Recommendations row (`app/(platform)/dashboard/page.tsx` lines ~465–531)

Current: inline markup, `min-h-[200px] sm:min-h-[260px]`, synopsis `line-clamp-3`.

Change:
- Fixed height: `h-[340px]` (sm: `h-[380px]`).
- Synopsis: `line-clamp-5` to use the extra vertical space.
- Width already responsive via grid — no change.

### Film & TV row (uses `MonologueResultCard` lines ~602–620)

Current: `min-h-[280px]`, synopsis `line-clamp-2`.

Approach: add a `size` prop to `MonologueResultCard`:
```ts
size?: "default" | "dashboard"
```

- `"default"` (used everywhere else): unchanged.
- `"dashboard"`: `h-[380px]` fixed, synopsis `line-clamp-4`, poster slightly larger.

Dashboard passes `size="dashboard"`. Search results and other consumers remain on `"default"`.

### Grid columns

Grid stays `sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`. With fixed heights, the rows become uniform tiles.

## Admin Edit Flow

`EditMonologueModal` already exists. Add:
- Textarea for the raw `text` (already present).
- New section "Segments" showing parsed segments as editable rows: type dropdown, speaker input (if interjection), text. Moderator can reorder, merge, split.
- Save writes both `text` and `text_segments`.

Out of scope for the initial implementation — can ship segment rendering without admin UI changes, since backfill quality with Haiku should be high. Add admin editing in follow-up if errors accumulate.

## Testing

- **Unit:** `MonologueTextRenderer` — snapshot render for dialogue-only, dialogue+interjection, dialogue+direction, mixed. Fallback when `segments` is undefined.
- **Backfill validation:** on a dev sample of ~10 records (Joker, Michael, one Shakespeare, one Chekhov, one clean modern), manually verify segment output before running production backfill.
- **Visual regression:** screenshot dashboard before/after on `/dashboard` with a seeded user.

## Rollout

1. DB migration: add `text_segments JSONB` column.
2. Ship `MonologueTextRenderer` wired through `MonologueDetailContent`. With `text_segments` NULL everywhere, behavior identical to today — pure refactor.
3. Ship dashboard card size changes (independent — doesn't need segments).
4. Run backfill script on a small batch (50 records). Eyeball.
5. Full backfill.
6. New scraping pipeline emits `text_segments` directly — no more backfill needed for new records.

## Open items (deferred)

- Admin edit UI for segments (see "Admin Edit Flow").
- PDF export styling for segments.
- Whether `scene_description` should also become structured (probably not — it's metadata, not performed text).
