# Content engine

Daily 20 to 30 second vertical story videos for Ghost Light and ActorRise, in one house style:
warm paper, hand-drawn ink, one continuous camera take, the app redrawn live, synthesized sound.

A video is a JSON spec in `specs/`. The template in `src/StoryVideo.tsx` turns it into a film.
New videos mean new specs, not new React, unless a scenario needs a new drawn scene type.

## Commands

```bash
npm ci
scripts/render.sh specs/<id>.json              # -> out/<id>.mp4 + out/<id>_strip.png (6 frame check)
scripts/render.sh specs/<id>.json still 300    # one frame, for layout checks
npm run studio                                 # live preview in the browser (local machine)
npm run sfx                                    # regenerate public/sfx/*.wav (all synthesized, no samples)
python3 scripts/make_music.py specs/<id>.json   # music bed -> public/music/<id>.wav (render.sh runs it when the spec has "music")
scripts/get_samples.sh                         # instrument samples for the beds (FluidR3 GM, MIT), auto-fetched
scripts/publish.sh out/<id>.mp4                # approved videos only: public URL for the scheduler
```

## Scene types (see `StoryScene` in `src/StoryVideo.tsx`)

| type | what it draws | key fields |
|---|---|---|
| `night` | window, moon, clock racing | `time`, `cue` |
| `books` | a stack of plays, a crumpled page tossed | `line1`, `line2`, `accent` |
| `thinking` | an actor at a desk, pencil tapping the chin, pin board of headshots, sides and sticky notes, one note crossed out | `line1`, `line2`, `accent`, `notes[3]`, `strike` |
| `email` | an email card draws on, From and subject rise, the body types in, one phrase underlined orange, a cue below | `line`, `accent`, `from`, `subject`, `body` (\n lines), `mark`, `cue` |
| `phone` mode `search` | ink phone, camera pushes in, query types, finger taps, chips light, results slide in | `query`, `chips`, `tap`, `results[]` |
| `phone` mode `read` | the chosen page lifts out of the phone, highlighted, margin note | `read{title,titleItalic,meta,text,mark,note}` |
| `stage` | audition room: actor under a spotlight, casting table from behind, speech bubble | `time`, `cue`, `quote`, `accent` |
| `end` | theater ticket with the real app icon and a FREE stamp | `brand`, `tagline`, `action`, `kicker` |

Music: `"music": {"style": "sunny|pizzicato|build|festive", "drop": "stage", "volume": 0.42}`. The tempo bends so the drop lands on the drop scene; the intro is filtered and opens on the first camera move.

`accent` is the word set in orange italic. Consecutive `phone` scenes share one camera position.

## Rules

1. Real data only. Every title, character, runtime, tag and line comes from the database in the
   same run. Never invent a monologue, stat, user or quote.
2. Monologue text on screen only from public domain plays. Contemporary and film/TV: title only.
3. Light paper look always. Dark appears only inside the app screen.
4. The Ghost Light icon appears only as the app icon (end card), never as stage decoration.
5. Copy voice: first person, plain, no dashes, no emojis, no corporate words.
