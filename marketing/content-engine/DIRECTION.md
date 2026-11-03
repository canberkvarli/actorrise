# Creative direction (Canberk's, read this before anything else)

Canberk gives direction in the Content Studio session; it lands here. Newest first. When a line
here disagrees with SKILL.md, this file wins.

## 2026-11-03, evening (wins over everything below)

Canberk, after the curtain film: "it's good, we need more like that."
- **More real one-shot films.** Next idea to film: the empty chair story from the drawn films, as
  live action. A wide shot from the house, someone alone on the stage, waiting for their partner
  who has not come. Same rules as Real films below: one shot, wide, no closeups, lines over it.
- **Endings are happy, not dark.** Close on one bright chime (sfx `chime`, a single bell ping
  with a fifth after it, about 0.9s into the end beat), not the low piano and timpani `reveal`.
  The end card can stay on the dark stage, but the sound lifts.
- **Drawn films: sound effects, not music.** Little to no music bed. Ping, pong, toing, boing,
  clicks, taps, pops on every move, so the drawing feels alive. Add those sounds to
  `public/sfx` when a drawn film needs one that does not exist.

## 2026-11-03, evening (wins over everything below)

- The real one-shot film worked. Make more like it: a wide shot from the audience, someone alone
  on a stage or in a rehearsal room, waiting for a partner who does not come, running lines to an
  empty chair, checking the time. The same moments as the drawn films, as live action.
- Real films use the **cinema** look by default (Canberk liked it on "from the house" and rejected
  "curtain at seven" for the midnight font). Rotate looks mainly across drawn films.
- Endings are happy, not dark: the end card lands with the bright `chime` (celesta and glockenspiel,
  the default now). Use `reveal` (the deep piano hit) only if a film truly needs weight.
- Drawn films: sound effects, not music. Playful and alive: `ping`, `pong`, `toing`, `plink`,
  `click`, `tap` (public/sfx/cine) plus the existing boops and pops, each on a real action
  (a note lands, a tap, a page flips, an idea arrives). No music bed in drawn films unless one
  moment truly needs it, and then quiet.

## 2026-11-03, looks (wins over everything below)

Canberk: "like ElevenLabs or a startup: different styles, different captions, different colours,
not just what I said." So every video picks a **look** (reel spec `"look"`): paper, noir, mono,
bold, marker, cinema, midnight (see LOOKS in `src/ReelVideo.tsx`: colours, serif or sans, caps,
how words arrive, how the key word is marked). Never the same look two days running, and not the
same look as the last video of the same kind. Captions on the posts vary too: a question one day, a
one-liner the next, a short list another. Drawn films can vary their palette the same way (ink
colour, paper tone, accent). The Ghost Light icon and name on the end card stay the same; everything
around them can change. Add new looks when a video needs one that does not exist.

## 2026-11-03, later (wins over the block below)

Two kinds of film, alternating, plus the occasional walkthrough:

**1. Drawn films (hand drawn, animated, the paper and ink world).**
- About the product and what it lets an actor do: bring your sides, rehearse a scene with the
  reader, find the piece by describing it, run lines, the nightly speech. Told as a little story.
- Always new drawings. Never reuse an image or a scene from an earlier film: no more actor at a
  pin board, no more night window, no more stack of books, unless the drawing is genuinely new.
  Every drawn film adds at least one new scene type to `src/StoryVideo.tsx` (or a new drawn
  component) and records its motifs in the log notes as `motifs=a,b,c`; before drawing, read the
  last 30 days of motifs and pick different ones.
- Show the app very little. The drawings are the point: people should be curious enough to go and
  look. At most a glimpse of a drawn screen, never a tour.

**2. Real films (live footage, one continuous scene).**
- ONE unbroken shot, about 10 seconds (8 to 14). No cuts, no closeups (closeups read as AI). Wide,
  from the audience: the camera sits in the house seats looking at the stage.
- Example: an actor on a chair on an empty stage, script in hand, checking the time; an empty chair
  facing them. Two or three short lines of text arrive over that same shot (broll beat `lines`), then
  the slow Ghost Light ending dissolves in. Nothing else.
- Build it as exactly two beats: one `broll` beat with `lines` (and `push` 0.03 to 0.06), then the
  `end` beat (`"bg": "ink"`, `"store": true`). Keep the footage's room sound low (`sound` 0.3) if it has any.
- Pexels searches that fit: "empty theater stage chair", "actor waiting stage", "theater rehearsal
  wide", "audience view stage". Reject a clip that cuts inside itself, is a closeup, or looks generated.

**3. Walkthroughs (now and then).** Only from the real Ghost Light app (`ghostlight-web/serve.sh`,
then the recorder with `APP=ghostlight`), never actorrise.com on a phone, which looks wrong.

## 2026-11-03

- Three engines, rotate them. Never the same engine two days running.
  1. **Cinematic** (the main one): one meaningful real life scene from stock footage, like a short
     film or an Apple / Anthropic ad. An actor waiting in an empty rehearsal room for a partner who
     is not coming. Lips moving over a script on a night train. Hands shaking outside an audition door.
     Very few words on screen, big and clean. The brand arrives at the end as the answer, and is
     the only place the product appears. No app walkthrough, no UI. 12 to 20 seconds.
  2. **Walkthrough**: the real app doing the thing, recorded live, with a hook and zooms. Ghost
     Light screens are recorded from the real app run as a web page (see below); web only features from
     actorrise.com.
  3. **Drawn**: the paper and ink story world, for comedy and for moments footage cannot show.
- Which brand closes which film: most films close on **Ghost Light** with the App Store button
  (end beat `"store": true`). Ghost Light has search, a scene partner and bring your sides too, so
  rehearsal moments can close on it. Close on ActorRise (actorrise.com) only when the film is about a
  web only part (auditions board, classes, Green Room).
- The ending is slow and gradual (Canberk, 2026-11-03): the last shot dissolves into a dark stage
  with the ghost light glow, the icon settles, then the name, the line, the App Store button, one
  after another. Give the end beat 3.5 to 4 seconds. Dark (`"bg": "ink"`) after footage, paper after drawn films.
- Ghost Light screens come from the real app: `ghostlight-web/serve.sh` builds it as a web page
  from a fresh copy plus `web-preview.patch`, then `BASE_URL=http://127.0.0.1:8099 APP=ghostlight`
  with the recorder. Never push anything to the ghostlight repo.
- Mix: cinematic films like the empty chair one are welcome, not every day.
- Sound: few sound effects, heavy and exactly on the cut (public/sfx/cine: impact when the line
  lands, reveal under the brand, switch for lights up, tick for waiting, heartbeat for nerves, room
  tone under silence). Footage keeps its own room sound low when it has some. Music is optional and
  quiet in cinematic films; silence plus one hit beats a busy bed. No whooshes, no pencil scratch spam.
- Text: speaks as the brand, never as the person in the footage. Nobody in stock footage is a user
  or says anything.
