# Creative direction (Canberk's, read this before anything else)

Canberk gives direction in the Content Studio session; it lands here. Newest first. When a line
here disagrees with SKILL.md, this file wins.

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
