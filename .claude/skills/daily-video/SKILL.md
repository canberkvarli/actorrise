---
name: daily-video
description: The daily content run. Writes one new Ghost Light / ActorRise story video from real library data, renders it with marketing/content-engine, writes captions, and queues it for Canberk's approval. Never posts on its own.
---

# Daily video

One new 20 to 30 second story video a day, in the house style (paper, ink, one continuous
take, the app redrawn live, synthesized sound). Canberk approves every post. This run never
publishes anything.

## 1. Pick today's scenario

Read `marketing/content-engine/log.csv` (create it if missing: `date,id,scenario,hook,cta,status,url,views,likes,saves,shares,notes`).
Do not repeat a scenario within 7 days or a monologue within 30. Rotate:

| scenario | hook (first 2 seconds) | CTA |
|---|---|---|
| The night before | "11:47 pm. Audition at nine." | App Store |
| Everyone brings Juliet | the overdone piece the panel has heard ten times today | App Store |
| Nothing fits | type, age, length, and every book is wrong | App Store |
| The 2am self-tape | no reader, ScenePartner reads the other part | actorrise.com |
| The partner who cancelled | rehearsal tonight, your scene partner bails | actorrise.com |
| Something funny, under two minutes | the comedic piece nobody has | App Store |
| Callback tomorrow | they want "something different" | App Store |

When the numbers show a winner (see step 6), lean into it, changing one variable at a time.

## 2. Pull real data

Supabase project `ppvqmbzuqvzpiuqaiqfy`. `monologues` joined to `plays` on `play_id`.
Runtime is `estimated_duration_seconds`, overdone is `overdone_score` (0 to 1), tags in
`primary_emotion`, `tone`, `themes`. Pick pieces that genuinely match the query a real actor
would type. Only public domain plays get text on screen (author died before 1956 and published
before 1929). Save the SQL and the rows you used in the spec under a `"source"` key.

## 3. Write the spec and render

Copy `specs/story-night-before.json` as the starting point, write `specs/<date>-<slug>.json`.
Scene types and fields are in `marketing/content-engine/README.md`. If the scenario needs a
drawn scene that does not exist yet (self-tape ring light, dressing room, phone call), add a
scene type to `src/StoryVideo.tsx` in the same ink style, with its sounds, and say so in the summary.

```bash
cd marketing/content-engine && npm ci
scripts/render.sh specs/<id>.json
```

Read `out/<id>_strip.png`. Fix overlaps, clipped text, empty frames, text in the bottom 25% or
the right 140px (platform UI). Re-render until clean. Target 20 to 25 seconds, every scene ends
just after its last animation lands.

## 4. Captions (Canberk's voice, see actorrise/CLAUDE.md)

- TikTok: one line, under 150 characters, up to 5 niche hashtags (#actorslife #monologue #audition #actortok #selftape).
- Instagram Reels: hook line, two short lines, "link in bio", up to 8 hashtags.
- YouTube Shorts title: under 70 characters, ends with #shorts.
First person, no dashes of any kind, no emojis, no corporate words, never "we".

## 5. Queue for approval

Until the scheduler is connected: send Canberk the mp4 and the three captions in the chat,
and append a `pending` row to `log.csv`.

Once TryPost is connected (custom connector), and only for a video Canberk approved:
run `scripts/publish.sh out/<id>.mp4` for the public URL, then create the posts in TryPost
from that URL as the "Claude" member, so every post lands as pending approval. Posting times:
US evening, 7 to 9pm Eastern.

## 6. Learn (Mondays)

Pull last week's metrics from TryPost insights into `log.csv`. A hook or scenario with 5+
posts in the bottom quartile of views gets dropped. Report in 3 lines: what won, what lost,
what changes this week.

## Never

- Publish, schedule or upload anything public without Canberk's approval.
- Invent monologues, users, quotes, testimonials or numbers.
- Put in-copyright text on screen.
- Use the Ghost Light icon anywhere except as the app icon on the end card.
