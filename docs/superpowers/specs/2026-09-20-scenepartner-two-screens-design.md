# ScenePartner: three screens become two

2026-09-20

## The problem

ScenePartner is a shelf, a scene preview, and a 4,018-line edit screen. The
numbers say the middle one is skipped and the last one is unavoidable:

```
scenes                        47
 └ with an edit snapshot      35   74%   a human changed them
 └ ever rehearsed             19   40%
from an uploaded script       38   81%
```

**People edit more scenes than they rehearse.** That is not a compliment to the
editor. 81% of scenes come from user-uploaded PDFs and three in four need fixing
before they can be used, so editing is repair work, not craft. Today that repair
costs a full navigation away from the thing being repaired, into a screen that
also holds cast, voices, rehearsal settings and a PDF export.

Two smaller faults, both real:

- **The preview shows the wrong lines.** `scene.lines.slice(0, 6)` is a fixed
  opening excerpt. The page has a "You play" role picker directly above it, and
  ignores it. Choose a character who first speaks at line 30 and the preview
  shows you none of their lines — on the screen whose whole job is deciding
  whether the part suits you.
- **The shelf stretches.** The page is `max-w-7xl` with a 260px sidebar and
  `gap-10`, so a scene row runs about 950px. The title sits at the far left and
  "BARNARDO & HORATIO · 12 min · 60 lines" lands at the far right, with nothing
  between them. A list you scan should not be wider than you can read.

## The shape

```
SHELF  →  SCENE  →  REHEARSE          (was: SHELF → SCENE → EDIT → REHEARSE)
```

One screen answers all four questions an actor has: what is this, am I right for
it, is the text correct, go.

## 1. The shelf

The reading column caps at `max-w-3xl` rather than filling `max-w-7xl`, so a
scene row's title and its metadata sit together. Acts remain the grouping. The
"On the shelf" script cards tighten into a denser row; each card is currently
mostly empty space.

No behaviour changes here. It is width and spacing only.

## 2. The scene page

### Role-aware excerpt

The excerpt always contains the chosen character's first lines. Rules, in order:

1. No role chosen → the opening of the scene, as today.
2. Role chosen and they speak within the opening → the opening, unchanged.
3. Role chosen and they first speak later → a 6-line window (the same length as
   today's opening) ending no earlier than their first line, with at least one
   preceding line for context, plus a marker that the excerpt has skipped ahead.
4. Role chosen and they never speak → the opening, with a plain line saying that
   character has no lines in this scene. This is possible: a scene's cast comes
   from the scene record, and extraction can list a character who was only
   addressed, never speaking.

### Fix a line where you read it

Tapping a line edits it in place: text, character name, insert, delete, with
undo and reset-to-original. No navigation. The existing endpoints are reused
unchanged — this is a front-end move, not a new API:

```
PUT/DELETE /api/scripts/{scriptId}/scenes/{sceneId}/lines/{lineId}
POST       /api/scripts/{scriptId}/scenes/{sceneId}/lines
POST       /api/scripts/{scriptId}/scenes/{sceneId}/lines/reorder
POST       /api/scripts/{scriptId}/scenes/{sceneId}/lines/bulk-reset
POST       /api/scripts/{scriptId}/scenes/{sceneId}/reset-to-original
```

**They are scoped to a script id, so only scenes from an uploaded script can be
edited.** A scene with no `user_script_id` renders read-only, with no edit
affordance rather than one that fails on save. Today that is 38 of 47 scenes
editable and 0 library scenes, so the read-only path is currently unreachable in
production — which is exactly why it would otherwise ship broken.

### Role, partner voice, and go

Already on this page. They stay.

## 3. What becomes of the 4,018 lines

| Capability | Where it goes |
| --- | --- |
| Edit / add / delete line, rename character | The scene page, inline |
| Undo, redo, reset to original | The scene page, beside the edit |
| Role, partner voice | The scene page, where they already are |
| Pause between lines, continue after my line, mic check, play from here | **Already on the rehearsal screen** (`/scenes/[id]/rehearse`, with its own defaults). The editor holds a second copy; this deletes the duplicate rather than moving anything |
| Per-line emotion | **Cut.** Set on 0 of 894 lines. Never used once |
| Download PDF | **Cut.** Restore it as a scene-menu item if it is missed |
| "Highlight my lines" as a mode | **Cut.** The reader marks your lines anyway once a role is chosen |

`/practice/[id]/scenes/[sceneId]/edit` redirects to the scene page, so links in
the wild and anything bookmarked keep working.

## Architecture

The scene page is 434 lines and is about to absorb editing, so it is split
rather than grown:

- `lib/sceneExcerpt.ts` — which lines to show, given the scene and the chosen
  role. Pure, no React, fully testable. This is where the bug lived.
- `components/scenes/SceneHeader.tsx` — title, cast, duration, description.
- `components/scenes/SceneExcerpt.tsx` — renders the excerpt and hosts inline
  editing.
- `components/scenes/CastAndVoice.tsx` — role and partner voice.

No backend change. No migration. The rehearsal route is `/scenes/[id]/rehearse`
and is not under `/practice`; the scene page already links to it.

## Error handling

- A failed line save leaves the line in its edited state with a retry, never
  silently reverts. Losing a repair someone just typed is worse than showing it
  unsaved.
- A scene with zero lines renders the header and a plain line, not an empty
  excerpt box.
- The redirect from `/edit` is unconditional, so a stale link never 404s.

## Testing

`lib/sceneExcerpt.test.ts`, matching how `lib/*.test.ts` are written here (pure
logic; this repo has no DOM test environment):

- no role → the opening
- role speaking inside the opening → the opening, unchanged
- role first speaking at line 30 → excerpt contains that line
- role who never speaks → the opening, and the flag saying so
- a one-line scene, and a zero-line scene
- the excerpt never exceeds its maximum length

Backend is untouched; its 1,618 tests must stay green.

## Not in this change

**This makes repair cheaper, not rarer.** Three in four scenes still arrive
broken from PDF extraction, and that is the larger prize. It is separate work
and it is not in this spec.

No change to the rehearsal screen beyond receiving the four settings listed
above. No new extraction. No change to how scripts are uploaded.
