# Monologue Repair — design

**Date:** 2026-06-08
**Problem:** Some stored monologues are not monologues. They contain interleaved
screenplay action lines, scene descriptions, and character introductions mixed
into the spoken text. Example (#?, Verbal — *The Usual Suspects*): the character's
voiceover is broken up by lines like *"OSCAR WHITEHEAD ... comes out of the
international terminal"*, *"Oscar stands on the curb long enough to light a
cigarette."*, *"A VAN follows at a distance."*

These predate / bypassed the extraction-time `assess_monologue_quality` gate
(the film pipeline trusts IMSDb HTML structure and skips it). The existing
`strip_artifacts` only removes `(...)` / `[...]`; it cannot remove plain
narrative sentences, so these land in `needs_review:structural` and are never
fixed.

## Goal

Go through **every** monologue (source_type = play, film, tv), and for anything
that fails the quality gate:

1. **Strip** — conservative `(...)`/`[...]` removal (free). If it passes → apply.
2. **AI repair** — send the original text + context to GPT, which returns ONLY
   the character's continuous spoken monologue (action lines, scene headings,
   other speakers, stage directions removed). If the result passes the gate → apply.
3. **Queue** — if even AI cannot produce a clean monologue, flag it for manual
   review in a new admin queue, storing AI's best attempt as a proposed fix.

Cost/time is not a constraint (user directive). Maximum salvage.

## Acceptance criteria for an auto-applied fix

The cleaned text must pass `assess_monologue_quality` (the existing deterministic
gate). This guarantees we never replace one broken monologue with another.

## Backend

### Model (`app/models/actor.py`)
Add to `Monologue` (deferred columns, ALTER via script — `create_all` does not
add columns to existing tables):
- `review_status` — `None` (fine) | `"pending"` (needs manual review) | resolved by action.
- `review_reasons` — `ARRAY(String)`, residual gate reasons.
- `proposed_text` — `Text`, AI's best attempt awaiting approval.

Migration script `scripts/add_review_columns.py` (mirrors `add_text_segments_column.py`).

### Repair service (`app/services/extraction/monologue_repair.py`)
- `repair_monologue(text, character_name, play_title, author, source_type, *, model=...) -> RepairResult`
- Uses `get_llm()` (LangChain ChatOpenAI). Capable model (gpt-4o) since cost is no object.
- Prompt: extract the single character's continuous spoken lines, drop everything
  else, end on a complete sentence, no ALL-CAPS names, no parentheticals.
- Returns `{cleaned_text, passed_gate, residual_reasons}` after running the gate.
- Pure-ish: the LLM call is injectable so logic is unit-testable without the API.

### Batch script (`scripts/repair_monologues.py`)
Mirrors `clean_monologue_artifacts.py`. Buckets per source_type:
- `clean` / `fixed_by_strip` / `fixed_by_ai` / `needs_review`
- Dry-run by default; `--apply` writes, with JSON backup + `--restore`.
- `--no-ai` to run the cheap strip-only pass; `--source film|play|tv|all`.
- On apply: recompute `word_count` + `estimated_duration_seconds`; for
  `needs_review`, set `review_status='pending'`, `proposed_text`, `review_reasons`.
- Report to `docs/reports/`.

### Admin API (`app/api/admin/monologues.py`)
- `GET /api/admin/monologues/review` — list `review_status='pending'` with
  original text, proposed_text, reasons, title, character, play.
- `POST /api/admin/monologues/{id}/review/approve` — set `text=proposed_text`,
  recompute counts, clear review fields.
- Existing `PATCH` (manual edit) and `DELETE` reused; both clear review fields.

## Frontend (`app/(platform)/admin/monologues/review/page.tsx`)
- Lists flagged monologues: reasons, original vs proposed (side by side),
  buttons **Approve fix** / **Edit** (reuse `EditMonologueModal`) / **Delete**.
- Nav link in `app/(platform)/admin/layout.tsx`.
- Uses `lib/api.ts` + `useAuth()`; protected by existing moderator layout.

## Safety
- Dry-run first, inspect report.
- JSON backup of every original before `--apply`; one-command `--restore`.
- Auto-apply gated on passing `assess_monologue_quality`.
- Nothing auto-deleted; deletion is a manual admin action.
