---
name: daily-video
description: The daily content run. Makes one new Ghost Light / ActorRise video (usually a reel built from a real recording of the app plus stock footage and Apple style type, sometimes the drawn paper story), writes captions, and queues it for Canberk's approval. Never posts on its own.
---

# Daily video

One new 18 to 30 second video a day. Canberk approves every post. This run never publishes anything.

Two engines (Canberk, 2026-11-03: "it's the same video again", "it doesn't have to be an
animation", "a nice advertisement, Apple or Anthropic style"):
- **Reel** (the default, at least 3 of every 4 days): the real app recorded live in a phone,
  real stock footage of actor moments, big clean type, built from beats in `src/ReelVideo.tsx`.
- **Story** (at most 1 in 4 days): the drawn paper world in `src/StoryVideo.tsx`.
Never the same engine and beat order two days running. Look at the last 3 specs before you start
and make today's visibly different: a different feature, hook style, opening beat and music style.

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

Then pick a format, so the feed never feels like one template (Canberk, 2026-11-02: "be more
creative"). Not the same format two days running:
- Story: the moment, the search, the payoff (the night before).
- POV: the camera is the actor's eyes ("POV: the panel says 'anything else?'").
- Types of actors: three or four drawn characters at the same audition, each with their tell; the last one is prepared.
- Expectation vs reality: the page splits down the middle, two takes of the same moment.
- Countdown: a clock or a page counter racing to the call time, beats landing on the music.
- Silent comedy: no words for ten seconds, just drawing, sound and timing, then one line.
- The object's view: the crumpled monologue, the highlighter, the phone on the stack of books tells it.

Formats work in both engines. For a reel, think in beats: the hook (one striking line over
footage or on a plain field), the pain (one or two quick beats), the app doing the thing (real
screen recording, zooms on taps), the end card. Hooks that work: a question actors ask themselves,
a POV line, a number from the app's own feature (never users or prices), a "things you did not
know" list, a speedrun ("find a comedic monologue in 9 seconds").

For a story, build the drawn scenes each moment needs (new scene types in `src/StoryVideo.tsx`,
same ink style, with sounds). Reuse existing scene types only when they truly fit the moment.
When the numbers show a winner (see step 6), lean into it, changing one variable at a time.

## 2. Pull real data

Supabase project `ppvqmbzuqvzpiuqaiqfy`. `monologues` joined to `plays` on `play_id`.
Runtime is `estimated_duration_seconds`, overdone is `overdone_score` (0 to 1), tags in
`primary_emotion`, `tone`, `themes`. Pick pieces that genuinely match the query a real actor
would type. Only public domain plays get text on screen (author died before 1956 and published
before 1929). Save the SQL and the rows you used in the spec under a `"source"` key.

## 3. Write the spec and render

### Reel (default)

1. Read the app as it is today, signed in as the demo account (`DEMO_EMAIL`/`DEMO_PASSWORD` in the
   environment): `node recorder/record.mjs explore <path>` for each page the feature touches, and
   look at the screenshots. Bottom nav (2026-11-03): Monologues `/monologues`, ScenePartner
   `/practice`, Collection `/rehearse`, Auditions `/auditions`, Account. Use the real labels.
2. Write `flows/<feature>-<slug>.json` and record it: `node recorder/record.mjs flow flows/<name>.json`.
   Re-record until it is clean (no spinners held, no error card, no empty state, no Ghost Light
   banner: close it first). If the reader plays audio, the events file lists it: use it.
3. Stock footage: `python3 scripts/pexels.py search "<actor moment>"`, then `get <id> public/reel/<id>/<name>.mp4`.
   Real footage only, never AI people; a stock person is never a user, never quoted. Keep the credit in `"source"`.
4. Copy the recording into `public/reel/<id>/` and write `specs/<date>-reel-<slug>.json` with
   `"beats"` (kinds and fields in `src/ReelVideo.tsx`): copy the recording's events into the screen
   beat so the zooms land on the taps. End card: web feature (ScenePartner, auditions, collection) ->
   brand "ActorRise", action "actorrise.com"; monologue search or a Ghost Light feature -> brand
   "Ghost Light", action "Free on the App Store". Line: "built by a working actor".
5. `scripts/render.sh specs/<id>.json` (it picks the reel template and makes the music).

### Story (at most 1 in 4)

Copy `specs/story-night-before.json` as the starting point, write `specs/<date>-<slug>.json`.
Scene types and fields are in `marketing/content-engine/README.md`. If the scenario needs a
drawn scene that does not exist yet (self-tape ring light, dressing room, phone call), add a
scene type to `src/StoryVideo.tsx` in the same ink style, with its sounds, and say so in the summary.

Every video gets a music bed: add `"music": {"style": "<style>"}` to the spec. render.sh
composes it (`scripts/make_music.py`, real instrument samples fetched by
`scripts/get_samples.sh`, synthesized drums) with the drop landing on the payoff scene.
Pick the style by the moment, and follow the current trend list below:
- `sunny`: lofi Rhodes and swung drums. The default under on-screen text.
- `pizzicato`: sneaky plucked strings. Comedy, mischief, anything with a punchline.
- `build`: piano and strings that swell into the payoff. Late nights, then vs now, nerves.
- `festive`: celesta and sleigh bells. November 1 to December 31.
Do not use the same style three days running. Optional keys: `drop` (scene type or index),
`volume` (default 0.42, under the sound effects).

Trending audio can't go on our posts: a brand account can't bake a commercial track into the
file (muted or struck), TikTok's API can't attach a sound, and Instagram's music API needs a
Facebook-linked account, which Canberk's restriction blocks. So the beds follow the trend's
feel, never its melody. Trend list (refresh on Mondays, step 6):
- 2026-11-02: holiday songs took over on Nov 1 (festive beds are timely); nostalgic slow
  guitar builds for then vs now (build); lyric-free sunny instrumentals under text (sunny).

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

## Two runs: maker and poster (2026-11-03)

The demo account and Pexels key live in the actorrise cloud environment, and TryPost only
attaches in the default one, so the day is split across two scheduled tasks:
- **Maker** (10:36 Istanbul, actorrise environment): steps 1 to 4, then publish and hand off.
  Run `scripts/publish.sh out/<id>.mp4` for the public URL, put the captions in the spec under
  `"captions": {"tiktok": "...", "youtube_title": "...", "youtube_description": "...", "instagram": "..."}`
  and the cover frame as `"cover_ms"`, append a log.csv row with status `rendered` and the URL in
  `url`, commit and push. It does not touch TryPost. If it has the TryPost tools anyway, it may do step 5 itself.
- **Poster** (11:36 Istanbul, default environment, has TryPost): finds today's `rendered` row
  (newest if more than one), does step 5 with the spec's captions and cover, flips the row to
  `pending` with the post ids, pushes, and sends Canberk the video. If there is no `rendered` row
  today, it tells Canberk the maker did not finish and stops.

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

Also refresh the trend list in step 3: search "trending Reels audio this week" and "trending
TikTok sounds" (WebSearch), and note the moods and formats in one dated line. If a new feel
keeps showing up that no style covers, add a style to `scripts/make_music.py`.

## Never

- Publish, schedule or upload anything public without Canberk's approval.
- Invent monologues, users, quotes, testimonials or numbers.
- Put in-copyright text on screen.
- Use the Ghost Light icon anywhere except as the app icon on the end card.
