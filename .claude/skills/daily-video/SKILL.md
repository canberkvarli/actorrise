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

TryPost (app.trypost.it, workspace "ActorRise") is the approval calendar. The connector is
logged in as the "Claude" member, whose posts always need approval.

1. Call `get-workspace-tool` first. If `me.requires_approval` is not `true`, STOP: do not
   create any post. Send Canberk the mp4 and captions in the chat instead and say the
   connector is logged in as an admin and needs reconnecting as canberk+claude@actorrise.com.
2. `scripts/publish.sh out/<id>.mp4` puts the file on the `content-media` branch and prints
   its public URL.
3. `list-social-accounts-tool` for the account ids (TikTok @actorrise, YouTube @actorrise-app;
   Instagram once it is connected). For TikTok, call `get-tiktok-creator-info-tool` and use
   `privacy_level: PUBLIC_TO_EVERYONE`, comments on, duet and stitch on unless disabled.
4. `create-posts-tool` with one destination per channel, media by that URL, each with its own
   caption (TikTok caption, YouTube title in `meta.title` plus description), `status: scheduled`
   and `queue: next`. Channels post daily at 7:15pm New York time. Because the member needs
   approval, the posts land in Canberk's Approvals tab, not on the platforms.
5. Append a `pending` row to `log.csv` with the TryPost post ids.
6. Send Canberk one short message: the video, the scenario and hook, and "it's in Approvals".
   Never call `approve-post-tool` or `publish-post-tool`. Approval is his.

## 6. Learn (Mondays)

Pull last week's metrics from TryPost insights into `log.csv`. A hook or scenario with 5+
posts in the bottom quartile of views gets dropped. Report in 3 lines: what won, what lost,
what changes this week.

## Never

- Publish, schedule or upload anything public without Canberk's approval.
- Invent monologues, users, quotes, testimonials or numbers.
- Put in-copyright text on screen.
- Use the Ghost Light icon anywhere except as the app icon on the end card.
