# Monologue Rendering & Dashboard Cards Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** (1) Give Film & TV + Recommendations cards on the dashboard a fixed, generous size with more synopsis text. (2) Render other-character interjections and stage directions as visually distinct segments inside monologue text, via a new `text_segments` column backfilled by Claude Haiku.

**Architecture:** Frontend-only Phase 1 (card sizing via a new `size` prop on `MonologueResultCard` + inline dashboard edits). Phase 2 adds a nullable JSONB column to `monologues`, a `MonologueTextRenderer` React component that renders segments when present and falls back to plain text otherwise, and a Python backfill script that calls the Anthropic SDK per record.

**Tech Stack:** Next.js (App Router), React, Tailwind, TanStack Query, FastAPI + SQLAlchemy (Postgres), Anthropic Python SDK. Ad-hoc migration scripts in `backend/scripts/` (no Alembic).

**Design doc:** [docs/plans/2026-04-20-monologue-rendering-design.md](./2026-04-20-monologue-rendering-design.md)

**Branch strategy:** Phase 1 ships as its own PR. Phase 2 lands on top. You can stop after Phase 1 and evaluate before proceeding.

---

## Phase 1 — Dashboard Card Sizing

Goal: Film & TV + Recommendations rows on the dashboard become uniform, taller tiles with more synopsis. No other pages change.

### Task 1: Add `size` prop to `MonologueResultCard`

**Files:**
- Modify: [components/monologue/MonologueResultCard.tsx](components/monologue/MonologueResultCard.tsx)

**Step 1: Add the prop to the interface**

In `MonologueResultCardProps` (around line 26), add:

```ts
/** Layout variant. "dashboard" is a taller fixed-height tile with more synopsis lines. */
size?: "default" | "dashboard";
```

**Step 2: Accept the prop and branch styles**

In the function signature (around line 42), add `size = "default"` to the destructured props.

Then in the `<Card>` className (line 81), change:

```tsx
className={`hover:shadow-xl transition-all cursor-pointer h-full min-h-[280px] flex flex-col group rounded-lg ...`}
```

to:

```tsx
className={`hover:shadow-xl transition-all cursor-pointer flex flex-col group rounded-lg ${
  size === "dashboard" ? "h-[380px]" : "h-full min-h-[280px]"
} ${
  isBestMatch ? "border-l-4 border-border hover:border-muted-foreground/40" : "hover:border-secondary/50"
}`}
```

**Step 3: Branch the synopsis line clamp**

Line 187 currently reads:

```tsx
<p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
```

Change to:

```tsx
<p className={`text-sm text-muted-foreground leading-relaxed ${size === "dashboard" ? "line-clamp-4" : "line-clamp-2"}`}>
```

**Step 4: Increase the preview substring when in dashboard mode**

Line 188 uses `mono.text.substring(0, 120)`. Change the `<p>` body to:

```tsx
&ldquo;{mono.text.substring(0, size === "dashboard" ? 280 : 120)}...&rdquo;
```

**Step 5: Verify typecheck**

Run: `npm run typecheck` (or `tsc --noEmit` if no script — check `package.json`)
Expected: passes.

**Step 6: Commit**

```bash
git add components/monologue/MonologueResultCard.tsx
git commit -m "feat(cards): add dashboard size variant to MonologueResultCard"
```

---

### Task 2: Pass `size="dashboard"` from the Film & TV row

**Files:**
- Modify: [app/(platform)/dashboard/page.tsx:612-618](app/(platform)/dashboard/page.tsx#L612-L618)

**Step 1: Add the prop**

At line ~612 where `<MonologueResultCard>` is rendered inside the Film & TV section, add the `size="dashboard"` prop:

```tsx
<MonologueResultCard
  mono={mono}
  index={idx}
  size="dashboard"
  onSelect={() => openMonologue(mono)}
  onToggleFavorite={toggleFavorite}
/>
```

**Step 2: Visual check**

Start dev server: `npm run dev`
Open `/dashboard`. Film & TV row tiles should all be the same height (380px) with ~4 synopsis lines.

**Step 3: Commit**

```bash
git add "app/(platform)/dashboard/page.tsx"
git commit -m "feat(dashboard): apply dashboard size variant to Film & TV cards"
```

---

### Task 3: Fix the Recommendations row card size

**Files:**
- Modify: [app/(platform)/dashboard/page.tsx:465-531](app/(platform)/dashboard/page.tsx#L465-L531)

The Recommendations row uses inline markup, not `MonologueResultCard`. Edit the inline card.

**Step 1: Fix height**

Line 474 currently reads:

```tsx
className="group p-4 sm:p-6 bg-card border border-border rounded-xl hover:border-primary/30 hover:shadow-lg transition-all cursor-pointer h-full flex flex-col min-h-[200px] sm:min-h-[260px]"
```

Change `min-h-[200px] sm:min-h-[260px]` to fixed height: `h-[340px] sm:h-[380px]`.

**Step 2: Bump synopsis line clamp**

Line 518 currently reads:

```tsx
<p className="text-sm text-muted-foreground line-clamp-3 flex-1 leading-relaxed">
```

Change `line-clamp-3` to `line-clamp-5`.

**Step 3: Increase preview substring**

Line 519:

```tsx
"{mono.text.substring(0, 120)}..."
```

Change `120` to `300`.

**Step 4: Update the skeleton placeholder to match**

Line 455:

```tsx
<div key={i} className="p-5 sm:p-6 bg-card border border-border rounded-xl min-h-[220px] sm:min-h-[260px]">
```

Change `min-h-[220px] sm:min-h-[260px]` to `h-[340px] sm:h-[380px]`.

Line 453:

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 min-h-[280px]">
```

Remove `min-h-[280px]` (individual cards now own their height).

**Step 5: Visual check**

Dev server: reload `/dashboard`. Both rows (Recommendations + Film & TV) should now have uniform tile heights with generous synopsis.

**Step 6: Commit**

```bash
git add "app/(platform)/dashboard/page.tsx"
git commit -m "feat(dashboard): fixed-height cards with more synopsis in Recommendations row"
```

---

### Task 4: Phase 1 verification

**Step 1: Run full verification**

```bash
npm run lint
npm run typecheck   # if present in package.json
npm run build       # optional sanity check
```

All should pass.

**Step 2: Eyeball checklist**

- `/dashboard` Recommendations row: all 4 cards identical height, ~5 lines of synopsis visible.
- `/dashboard` Film & TV row: all 4 cards identical height, ~4 lines of synopsis visible.
- `/search` and `/my-monologues` (any page that uses `MonologueResultCard`): unchanged — still use the `default` size.

**Step 3: Optional — open a PR for Phase 1**

Use superpowers:finishing-a-development-branch if you want to stop here. Otherwise continue to Phase 2.

---

## Phase 2 — Structured Text Segments

Goal: Add a `text_segments` JSONB column, backfill it for all existing monologues via Claude Haiku, and render interjections + stage directions distinctly from dialogue.

### Task 5: DB migration — add `text_segments` column

**Files:**
- Create: `backend/scripts/add_text_segments_column.py` (follows the pattern of `backend/scripts/add_search_logs_table.py`)
- Modify: `backend/app/models/actor.py` (add column to `Monologue` SQLAlchemy model)

**Step 1: Read existing migration script patterns**

Look at [backend/scripts/add_search_logs_table.py](backend/scripts/add_search_logs_table.py) and [backend/scripts/add_email_do_not_contact_table.py](backend/scripts/add_email_do_not_contact_table.py) for the project's ad-hoc migration style (imports, `if __name__ == "__main__"`, how they get the engine/session).

**Step 2: Create the migration script**

Create `backend/scripts/add_text_segments_column.py`. It should:
- Import the engine from `app.db` (follow neighbors for exact import path).
- Execute: `ALTER TABLE monologues ADD COLUMN IF NOT EXISTS text_segments JSONB;`
- Print a success line.

**Step 3: Add column to SQLAlchemy model**

Open `backend/app/models/actor.py`, find the `Monologue` class. Add:

```python
from sqlalchemy.dialects.postgresql import JSONB

# inside class Monologue(Base):
text_segments = Column(JSONB, nullable=True)
```

(Only add the `JSONB` import if it's not already imported.)

**Step 4: Run the migration locally**

```bash
cd backend
python -m scripts.add_text_segments_column
```

Expected: prints success, column exists. Verify with psql or a quick `\d monologues`.

**Step 5: Commit**

```bash
git add backend/scripts/add_text_segments_column.py backend/app/models/actor.py
git commit -m "feat(db): add text_segments JSONB column to monologues"
```

---

### Task 6: Expose `text_segments` in the API response

**Files:**
- Modify: `backend/app/schemas/` — whichever Pydantic schema serializes `Monologue` (likely `monologue.py` or `search.py`). Find with: `grep -rn "class Monologue" backend/app/schemas/`.
- Modify: [types/actor.ts:27-68](types/actor.ts#L27-L68) — add matching TS type.

**Step 1: Find the Pydantic schema**

```bash
grep -rn "character_name" backend/app/schemas/ | head
```

Identify the response schema for a monologue (probably `MonologueResponse` or similar).

**Step 2: Add `text_segments` to the Pydantic schema**

In the schema file, add:

```python
from typing import Optional, List, Literal

class TextSegment(BaseModel):
    type: Literal["dialogue", "interjection", "direction"]
    speaker: Optional[str] = None
    text: str

# inside the Monologue response schema:
text_segments: Optional[List[TextSegment]] = None
```

**Step 3: Add to the TypeScript type**

In [types/actor.ts](types/actor.ts), after line 67 (before the closing `}`), add:

```ts
text_segments?: Array<{
  type: "dialogue" | "interjection" | "direction";
  speaker?: string;
  text: string;
}>;
```

**Step 4: Verify typecheck + backend tests**

```bash
npm run typecheck
cd backend && pytest -x   # or whatever your test runner is — check backend/ for pytest.ini / pyproject.toml
```

**Step 5: Commit**

```bash
git add backend/app/schemas/ backend/app/models/actor.py types/actor.ts
git commit -m "feat(api): expose text_segments on Monologue response"
```

---

### Task 7: Create `MonologueTextRenderer` component

**Files:**
- Create: `components/monologue/MonologueTextRenderer.tsx`
- Create: `components/monologue/__tests__/MonologueTextRenderer.test.tsx` (if the project has a frontend test setup — check `package.json` for `jest` or `vitest`; skip if not)

**Step 1: Write the component**

```tsx
import { Monologue } from "@/types/actor";

type TextSegment = NonNullable<Monologue["text_segments"]>[number];

interface MonologueTextRendererProps {
  text: string;
  segments?: TextSegment[] | null;
  className?: string;
}

export function MonologueTextRenderer({ text, segments, className = "" }: MonologueTextRendererProps) {
  if (!segments || segments.length === 0) {
    return (
      <p className={`whitespace-pre-wrap leading-relaxed ${className}`}>
        {text}
      </p>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {segments.map((seg, i) => {
        if (seg.type === "direction") {
          return (
            <p key={i} className="italic text-muted-foreground/70 my-2">
              {seg.text}
            </p>
          );
        }
        if (seg.type === "interjection") {
          return (
            <p key={i} className="text-muted-foreground">
              {seg.speaker && (
                <span className="not-italic font-semibold text-sm mr-1.5">{seg.speaker}:</span>
              )}
              <span className="italic">{seg.text}</span>
            </p>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap leading-relaxed">
            {seg.text}
          </p>
        );
      })}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add components/monologue/MonologueTextRenderer.tsx
git commit -m "feat(monologue): add MonologueTextRenderer component"
```

---

### Task 8: Wire renderer into `MonologueDetailContent`

**Files:**
- Modify: [components/monologue/MonologueDetailContent.tsx](components/monologue/MonologueDetailContent.tsx) — whichever line renders `monologue.text`.

**Step 1: Replace the plain text block**

Find the `<p>` (or similar) that renders `monologue.text`. Replace with:

```tsx
<MonologueTextRenderer
  text={monologue.text}
  segments={monologue.text_segments}
/>
```

Import:

```tsx
import { MonologueTextRenderer } from "@/components/monologue/MonologueTextRenderer";
```

**Step 2: Also wire into dashboard Reading Mode**

In [app/(platform)/dashboard/page.tsx:910-912](app/(platform)/dashboard/page.tsx#L910-L912), replace:

```tsx
<p className="text-xl leading-relaxed whitespace-pre-wrap font-typewriter max-w-3xl mx-auto text-center">
  {currentMonologue.text}
</p>
```

with:

```tsx
<MonologueTextRenderer
  text={currentMonologue.text}
  segments={currentMonologue.text_segments}
  className="text-xl font-typewriter max-w-3xl mx-auto text-center"
/>
```

(Add the import at the top of `page.tsx`.)

**Step 3: Visual check**

Dev server. Open any monologue's detail panel. With `text_segments` still NULL everywhere, output must be identical to before (fallback path).

**Step 4: Commit**

```bash
git add components/monologue/MonologueDetailContent.tsx "app/(platform)/dashboard/page.tsx"
git commit -m "feat(monologue): use MonologueTextRenderer in detail + reading views"
```

---

### Task 9: Backfill script — small-batch dry run

**Files:**
- Create: `backend/scripts/segment_monologues.py`

Reference existing LLM scripts for auth / prompt style: [backend/scripts/extract_film_tv_monologues.py](backend/scripts/extract_film_tv_monologues.py) and [backend/scripts/fix_film_tv_text.py](backend/scripts/fix_film_tv_text.py).

**Step 1: Skeleton the script**

```python
"""
Segment monologues: parse the `text` field into structured segments
(dialogue / interjection / direction) via Claude Haiku.

Usage:
  python -m scripts.segment_monologues --limit 10            # dry run, 10 records
  python -m scripts.segment_monologues --limit 10 --write    # write to DB
  python -m scripts.segment_monologues --write               # full backfill
  python -m scripts.segment_monologues --force --write       # re-segment all records
"""
import argparse
import json
import os
import sys
from typing import List, Optional

from anthropic import Anthropic
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models.actor import Monologue

MODEL = "claude-haiku-4-5-20251001"

SYSTEM_PROMPT = """You segment a monologue into structured parts for a theatre/film study app.

You receive:
- The target CHARACTER name
- The PLAY / FILM title
- The raw TEXT, which may contain:
  - The target character's spoken lines (most of the text)
  - Brief interjections from other characters (cue lines, short responses)
  - Stage directions or parentheticals (e.g. "(laughing)", "She crosses to the window")

Return ONLY a JSON array of segments. Each segment is:
  { "type": "dialogue"    , "text": "..." }    // target character speaking
  { "type": "interjection", "speaker": "NAME", "text": "..." }  // another character
  { "type": "direction"   , "text": "..." }    // stage direction / parenthetical

Rules:
- Preserve the original ordering and wording exactly.
- Do not add, drop, or paraphrase content. The concatenation of all segment texts should match the original text.
- For interjections, infer speaker from context if possible; if unknown, use "OTHER".
- Parentheticals like "(laughing)" are type="direction".
- If unsure, default to type="dialogue".

Output: strictly the JSON array, no prose, no code fences."""

def segment_one(client: Anthropic, mono: Monologue) -> Optional[list]:
    user = (
        f"CHARACTER: {mono.character_name}\n"
        f"PLAY/FILM: {mono.play_title}\n"
        f"TEXT:\n{mono.text}"
    )
    resp = client.messages.create(
        model=MODEL,
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user}],
    )
    raw = resp.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.strip("`").split("\n", 1)[1].rsplit("\n", 1)[0]
    try:
        segs = json.loads(raw)
    except json.JSONDecodeError:
        print(f"  !! invalid JSON for monologue {mono.id}", file=sys.stderr)
        return None
    if not isinstance(segs, list) or not any(
        s.get("type") == "dialogue" for s in segs
    ):
        print(f"  !! no dialogue segment for monologue {mono.id}", file=sys.stderr)
        return None
    return segs

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--write", action="store_true",
                        help="Persist segments to DB (default: dry run)")
    parser.add_argument("--force", action="store_true",
                        help="Re-segment records that already have text_segments")
    args = parser.parse_args()

    client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    db: Session = SessionLocal()
    try:
        q = db.query(Monologue)
        if not args.force:
            q = q.filter(Monologue.text_segments.is_(None))
        if args.limit:
            q = q.limit(args.limit)
        rows = q.all()
        print(f"Segmenting {len(rows)} monologues (write={args.write})")

        ok = 0
        for mono in rows:
            segs = segment_one(client, mono)
            if segs is None:
                continue
            ok += 1
            if args.write:
                mono.text_segments = segs
                db.add(mono)
            print(f"  [{mono.id}] {mono.character_name} -> {len(segs)} segments")
        if args.write:
            db.commit()
        print(f"\nOK: {ok}/{len(rows)}")
    finally:
        db.close()

if __name__ == "__main__":
    main()
```

**Step 2: Run a dry run on 5 records**

```bash
cd backend
python -m scripts.segment_monologues --limit 5
```

Expected: prints 5 records with segment counts. No DB writes. Eyeball the output for the known problem records (Joker monologue id, Michael Corleone id) — confirm `interjection` segments appear.

**Step 3: Commit (do not write yet)**

```bash
git add backend/scripts/segment_monologues.py
git commit -m "feat(scripts): add monologue segmentation backfill (dry run only)"
```

---

### Task 10: Backfill — small-batch write

**Step 1: Write 20 records**

```bash
python -m scripts.segment_monologues --limit 20 --write
```

**Step 2: Visual QA on the frontend**

Dev server. Open /dashboard → click into one of the 20 monologues that got segmented. Verify:
- Dialogue paragraphs look normal.
- Any interjection shows `SPEAKER:` in a different weight/italic.
- Any stage direction is italic + muted on its own line.

If rendering looks broken, fix `MonologueTextRenderer` and requery. No commit yet for this step — this is a validation gate.

**Step 3: Spot-check Joker + Michael Corleone**

Query those specific records (by character_name + play_title). Run `--force --write` on just their IDs:

Option A — extend the script with an `--ids 123,456` flag, OR
Option B — set their `text_segments` back to NULL and re-run the general backfill with --limit 1000.

Once their output is right visually, you're good.

---

### Task 11: Full backfill

**Step 1: Run**

```bash
python -m scripts.segment_monologues --write
```

This iterates every remaining monologue. Expect it to take a while — Haiku is fast but each call is a round trip.

**Step 2: Sanity query**

```sql
SELECT COUNT(*) FROM monologues WHERE text_segments IS NOT NULL;
SELECT COUNT(*) FROM monologues WHERE text_segments IS NULL;
```

Records that failed validation remain NULL and still render via the fallback path. That's fine.

**Step 3: Deploy Phase 2**

Follow normal deploy flow. Once shipped, users see segmented rendering on every monologue where backfill succeeded.

**Step 4: Phase 2 completion commit (if any leftover config)**

```bash
git commit -m "chore: phase 2 segmentation backfill complete" --allow-empty
```

---

## Completion criteria

- [x] Film & TV + Recommendations rows on /dashboard have fixed tile heights and ≥4 lines of synopsis visible.
- [x] `text_segments` column exists in `monologues`.
- [x] `MonologueTextRenderer` is used in the slide-over + reading mode.
- [x] At least 95% of monologue records have non-null `text_segments`; remaining records still render (fallback path).
- [x] Joker (Joker 2019) and Michael Corleone (Godfather) monologues visibly show cue lines from Murray / Carlo as distinct interjections.
