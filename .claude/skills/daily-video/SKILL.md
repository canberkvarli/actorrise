---
name: daily-video
description: The daily content run. Writes one new Ghost Light / ActorRise story video from real library data, renders it with marketing/content-engine, writes captions, and queues it for Canberk's approval. Never posts on its own.
---

# Daily video

One new 20 to 30 second story video a day, in the house style (paper, ink, one continuous
take, the app redrawn live, synthesized sound). Canberk approves every post. This run never
publishes anything.

## 1. Pick today's scenario

The subject is an actor's daily life and headspace, not the app. The app shows up as the
relief at the end of a real moment actors recognize. Canberk's ideas are seeds to curate
from, never literal specs (2026-11-02): when he mentions an image ("a thinking man at a
pin board"), take the feeling behind it and find the best scene for it.

Read `marketing/content-engine/CONTEXT.md` first and follow it: the ActorRise session
keeps it fed with what is in the app and what actors look for.

Read `marketing/content-engine/log.csv` (create it if missing: `date,id,scenario,hook,cta,status,url,views,likes,saves,shares,notes`).
Do not repeat a scenario within 7 days or a monologue within 30.

Scenario bank (grow it; each line is a moment, not a template):
- The night before: audition at nine, nothing fits.
- The library hunt: aisles of play anthologies, an armful of books, the clock on the wall.
- The jungle of paper: photocopies everywhere, the teacher said "find something contemporary, under two minutes", one page glowing.
- Everyone brings Juliet: the panel has heard the same piece all day.
- Memorizing on the train: lips moving, a stranger staring.
- The 2am self tape: phone on a stack of books, no reader (ScenePartner, CTA actorrise.com).
- The partner who cancelled: rehearsal tonight, alone (ScenePartner, CTA actorrise.com).
- Something funny, under two minutes: the comedic piece nobody has.
- The callback email: "bring something different".
- The dressing room mirror: last read before they call your name.
- The pin board: headshots, sides, crossed out sticky notes.

Build the drawn scenes each moment needs (new scene types in `src/StoryVideo.tsx`, same ink
style, with sounds). Reuse existing scene types only when they truly fit the moment.
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

## 4. Captions (brand voice, not Canberk's personal voice)

These post from the brand accounts (TikTok @actorrise, YouTube @actorrise-app), not from
Canberk's own profile, so they speak as Ghost Light / ActorRise. Never "I built" or "my app".
The credibility line is "built by a working actor" (or "made by an actor"). Canberk, 2026-11-02.
This overrides the first-person rule in actorrise/CLAUDE.md, which is for his emails and
his personal posts. Every other voice rule still applies: no dashes of any kind, no emojis,
no corporate words, plain and warm, peer to peer.

- TikTok: one line, under 150 characters, up to 5 niche hashtags (#actorslife #monologue #audition #actortok #actors).
- YouTube Shorts: `meta.title` under 70 characters ending with #shorts; description two short lines plus 3 or 4 hashtags.
- Instagram Reels: hook line, two short lines, "link in bio", at most 5 hashtags (#actorslife #monologue #audition #actorsofinstagram #actortraining).

Cover frame: pick the single strongest frame (usually the payoff: the audition room with the
speech bubble fully shown, or the marked script page) and set it as `cover_offset_ms` on the
TikTok media item (and Instagram when connected). Check it with
`ffmpeg -ss <seconds> -i out/<id>.mp4 -frames:v 1 cover.png` and look at it. Never let the
cover be a mid camera move or empty paper. YouTube Shorts cannot take a cover through the API.

## 5. Queue for approval

TryPost (app.trypost.it, workspace "ActorRise") is the approval calendar. The connector is
logged in as the "Claude" member, whose posts always need approval.

1. Call `get-workspace-tool` first. If `me.requires_approval` is not `true`, STOP: do not
   create any post. Send Canberk the mp4 and captions in the chat instead and say the
   connector is logged in as an admin and needs reconnecting as canberk+claude@actorrise.com.
2. `scripts/publish.sh out/<id>.mp4` puts the file on the `content-media` branch and prints
   its public URL.
3. `list-social-accounts-tool` for the account ids: TikTok @actorrise, YouTube @actorrise-app,
   Instagram @actorrise.app. Instagram is a priority channel (Canberk, 2026-11-02): every
   video goes there as `content_type: instagram_reel` with `meta.share_to_feed: true`,
   `is_ai_generated: false`, the cover frame as `cover_offset_ms`, and at most 5 hashtags.
   If Instagram is missing or not `connected`, say so in the message to Canberk. For TikTok, call `get-tiktok-creator-info-tool` and use
   `privacy_level: PUBLIC_TO_EVERYONE`, comments on, duet and stitch on unless disabled,
   and always `disclose: true` with `brand_organic_toggle: true` (it promotes our own app;
   TikTok requires the "Your brand" disclosure). Leave `is_aigc` off: the videos are drawn
   by code, not generated by an AI model.
4. `create-posts-tool` with one destination per channel, media by that URL, each with its own
   caption (TikTok caption, YouTube title in `meta.title` plus description), `status: scheduled`
   and `queue: next`. Channels post daily at 7:15pm New York time. If a channel's
   `timezone` is not America/New_York, schedule it with `scheduled_at` at the same instant as
   the queued posts instead of `queue`, and tell Canberk to fix that channel's posting times. Because the member needs
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
