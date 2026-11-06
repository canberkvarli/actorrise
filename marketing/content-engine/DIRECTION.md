# Creative direction (Canberk's, read this before anything else)

Canberk gives direction in the Content Studio session; it lands here. Newest first. When a line
here disagrees with SKILL.md, this file wins.

## 2026-11-06, 13:25: Tape room films are one continuous take (wins over everything below)

Canberk on the actor-in-the-app film: "it looks amazing". Next version: no playback/recap scene after
"cut"; the film stays one continuous take in the Tape room. He is building two things in Ghost Light
itself: the prompter highlights each word as the actor says it, and on "cut" the take shrinks like an
iPhone screenshot and flies into Tapes at the bottom right. When those ship (OTA), re-record the Tape
room film with them; until then do not fake either in the edit.

## 2026-11-06, 12:50: AI actors for feature demos, always labelled (wins over everything below)

Canberk approved a generated actor for the Tape room film ("that guy is perfect"). This replaces "no AI
people" for feature demos only:
- Generate with `scripts/omni.py` (Gemini Omni). The person is ordinary looking, natural, a real working
  actor at home, never model handsome. Speech natural and a little messy ("uhh... cut! yeah that didn't
  feel like it, let's go again").
- Check the voice is the same person all the way through; the first word sometimes comes out in another
  voice: patch it from a later line of his.
- **Disclosure, every time:** the AI label on each platform (Instagram is_ai_generated, TikTok is_aigc,
  YouTube is_ai_generated) AND a plain line in the caption: "The actor is AI generated."
- Show him inside the real app when the feature has a camera: FAKE_CAM = the generated clip, the scripted
  ear timed to his words, so the Tape room's own interface (script, REC, playback) frames him.

## 2026-11-06, 11:20: one text layer at a time (wins over everything below)

Canberk on the hands-free remake: "too much caption", the voice-over subtitles and the app's own
script text sat on top of each other. When the app shows text (a script, a monologue, a scene page),
NO voice-over subtitles and no extra captions over it: `"voice": {"subtitles": false}` for those
lines, or end the subtitles before the screen beat. At most a single big cue word (ACTION, CUT) away
from the app's text. Subtitles only over footage or cards that carry no text of their own.

## 2026-11-06, 01:00: say what the feature IS (wins over everything below)

Canberk on the Tape room remake: music, sound effects and the ending are perfect. The message was wrong.
- **Lead with the feature's plain job, never an edge case.** The Tape room is "self-tape hands free:
  say action, it rolls; say cut, it stops and plays the take back". The cut-inside-the-monologue trick is
  a detail for the App Store page, not the hook. Before writing any film, write the feature in one
  sentence a tired actor gets in two seconds, and make the film show exactly that.
- **Tape room film shape:** hook card (the problem: nobody to hit record) → the app's camera full frame
  with an actor in it → "Action!" → he performs two short lines → "Oof. Okay... cut." → it stops and
  the take plays straight back → one short narrator line → the Earnest ending.
- **People in footage:** a different person every film, someone who reads as an actor performing (an
  expressive man or woman mid-speech at home), never the same clip twice. Keep the voice lines short so
  lip movement and words never visibly fight.
- **Layout:** one idea per moment, big readable cue words (ACTION, CUT) in the house font, nothing
  crowding the app.

## 2026-11-05, evening: quiet music under everything, feature demos show the feature working

Canberk on the Tape room film: "beautiful ending and sounds", loved the guy doing the product, but
wanted a real demonstration, and: "without music it sounds really creepy."
- **Every film gets a very subtle background bed, drawn films too.** `"music": {"style": "bed"}`
  (soft held strings and a warm Rhodes, slow bright chords, no drums, no melody, nothing catchy),
  `volume` about 0.14 under a voice, 0.2 without. It still lands on the Earnest ending (woodblock
  knock, two kalimba notes, marimba chord). This replaces "no music bed" for drawn films. Real
  one-shot films may keep `pulse` if it is not sparse enough to feel empty; when in doubt, `bed`.
- **Feature demos show the feature actually working**, in one continuous take, not stock footage
  around a glimpse. If the feature is voice driven, say the cues in the voice-over (a second voice
  for the actor, e.g. Will, the narrator George for the explanation) and let the app react on screen.
  The Ghost Light web preview has a scripted ear (`{"say": "..."}` flow step) so the Tape room
  rolls on "action", keeps rolling on a "cut" in the script and stops on a lone "cut".
- **App footage fills the frame**: screen beat `"frame": "full"` (full height, blurred edges, no
  bezel) when a person is in the camera; a `focus` event pushes in on the line that matters.
  Real-looking camera: `FAKE_CAM=<file.y4m>` on the recorder, stock footage only.
- Captions on screen are the voice-over's word by word subtitles; keep them short and spoken.

## 2026-11-04, 15:25: silent films sound good, every video is sharp

- **Silent one-shot films:** `pulse` bed (volume about 0.4) and the Earnest ending, nothing else. No
  `chime`, no `tick`, no extra sound effects on the shot. The old loud end chime is gone for good.
- **End card line:** "For when everyone else has gone home." (Canberk liked it; the ghost light idea.)
- **Quality:** render.sh now uploads ~12 Mbps H.264 High with 256k audio, and pexels.py never takes a
  file narrower than 1080 when a bigger one exists. If the best file of a clip is under 1080 wide,
  pick another clip: upscaled footage looks soft after Instagram's own re-encode.
- **No black bars** still applies: check the first and last frames of every render are full bleed.

## 2026-11-04, 13:53: app recordings look like the phone, mostly dark

Canberk on the comedic walkthrough: "beautifully designed", but two web artefacts gave it away: a
square box behind the lamp logo (react-native-web drew its glow as a box-shadow) and a rectangle around
the typed words (the browser's focus outline). The recorder now hides both on every recording. Check the
first frames of every app recording for anything a real iPhone would not show (focus rings, scrollbars,
hover states, square shadows) before using it.
- **Ghost Light records in its dark theme by default** (the dark stage is the brand). About one
  walkthrough in three can be light for variety: `SCHEME=light` on the recorder. Pick the frame's look
  to match (dark app inside a dark or paper frame both work).

## 2026-11-04, 13:48: the Earnest ending is THE ending (wins over everything below)

Canberk on the re-rendered Earnest: "beautiful ending, I love it, keep that." Every film from now on:
- **Sound:** the `wood` bed (marimba, kalimba, woodblock) under walkthroughs, scene reads and drawn
  films, quiet (`volume` about 0.16 under a voice, 0.25 without). Real one-shot films keep `pulse`.
- **Ending:** snap end card, `seconds` 1.8, `beats` [0, 0.55, 1.1], `sfx` []. Hard cut in; the woodblock
  knock lands with the Ghost Light icon, a kalimba note with the line, another with the App Store button,
  the marimba chord rings, the video stops. No fade, no riser, no extra chime. make_music.py does this
  for `wood` and `pulse` automatically.

## 2026-11-04, 11:10: acted voices, no black bars (wins over everything below)

- **Every voice-over is acted, never monotone** (Canberk: "very important"). Voices run on ElevenLabs
  `eleven_v3`, which performs audio tags. Each voiced line gets a `say` field: the same words with tags
  for the feeling, e.g. `"say": "[wry] Five actors in the lobby. [sighs] Every single one brought Juliet."`.
  `text` stays clean for the screen. Pick tones that fit the moment and vary them line to line: [warmly],
  [amused], [conspiratorial], [delighted], [teasing], [whispers], [excited], [sighs], [laughs softly].
  The scene partner acts the character (Algernon teasing, a Chekhov sister weary). No line without a tag.
- **No black bars, ever.** Every frame is full bleed 1080x1920. No letterbox (removed from the cinema
  look), no footage scaled to fit with bars above and below: cover the frame. Instagram and TikTok show
  the full frame when a video is opened, so bars that hide in the grid crop show up there.

## 2026-11-04, late morning: wooden sounds and a sharp Ghost Light close (wins over everything below)

Canberk, on the comedic nine seconds walkthrough:
- **Music is wooden and organic.** Walkthroughs use `"music": {"style": "wood", "drop": "end"}` (marimba,
  kalimba, woodblock); real films keep `pulse`. No pizzicato, sunny, festive or build beds unless he asks.
- **Walkthroughs: no "Real app. No cuts." caption.** Let the phone fill the frame and zoom into it; never
  crop the top of the phone. Put the hook on the title card, with the key word in the accent colour.
- **The end lands and stops.** Snap end, about 1.8s: the Ghost Light icon on the drop, line and App Store
  on the next two beats, then the video ends. No fade out, no tail.

## 2026-11-05, small hours: the tram film is the reference (wins over everything below)

Canberk approved the tram film ("it was perfect, same vibe for that type") and gave notes on the others:
- **Real films: the tram woman film is the reference.** One everyday moment, one unbroken shot, three
  short lines, pulse sound, crisp Ghost Light close. Match its pace and restraint.
- **Drawn films: the voice-over runs through the whole film.** A real narration script, about 45 to 60
  words for a 20 second film, one line flowing into the next with almost no gaps. Never read a scene
  title, a heading or the text already on screen; tell the little story. voice.py warns when the
  narration covers less than 60 percent of the film; treat that warning as a failure and rewrite.
- **One font, the house font.** Playfair (and Playfair italic) everywhere: titles, subtitles, labels,
  the drawn films' notes and phones. No Montserrat, no typewriter, no caps looks. Every look uses it.
- **Scene reads:** the play's name sits above the script page as its own heading, not inside the
  card. The scene ends about 0.6s after the last line (voice.py sets the beat's length), then a hard
  cut to the end card. No rising sound before the ending (riser and crash only exist in `build`).
- **Rotate the features.** The monologue finder is fine, but no more than about once a week. Check the
  last runs in the Callboard log and pick a different feature: scene partner, bring your sides, run
  lines, memorise, the nightly speech, auditions board.

## 2026-11-04, late: real films are American ads (wins over everything below)

Canberk: "live action ones are like advertisements, think American advertisements." Real one-shot
films are cut like a polished US brand spot (Apple, Google, Nike style): one clear human moment,
warm and confident, three short punchy lines at most, the product as the answer, a crisp brand
close. No arty melancholy, no slow drift: it should feel like a 15 second ad that could air on TV.
Sound: the `pulse` style (a soft low thum like a heartbeat plus sparse natural pin/pon notes),
Canberk approved it. Not the `felt` piano (too melodic, like the intro of a song). No voice, no hiss.
`"music": {"style": "pulse"}` on every real film.

## 2026-11-04, night: who speaks, what you hear, who sees it first (wins over everything below)

Canberk watched the voiced films: the voice did not work on a one-shot film. So:
- **Voice-over belongs to the drawn films** (longer, story driven): a narrator (George) and, in
  scene films, the partner (Lily) reading the other character. Drawn films get voice plus the
  playful sounds (ping, tap, pop), no music bed.
- **Real one-shot films are silent movies.** No voice-over, no narration, no room-tone hiss or
  white noise. Under the shot: the `felt` music style, a soft solo piano like a silent film's
  accompanist, resolving on the end card. `"music": {"style": "felt"}`.
- **Nothing goes to Approvals until Canberk has watched it.** Runs upload to TryPost as DRAFTS
  (status "draft"), send him the mp4, and stop. He says go in the Content Studio and it is queued.

## 2026-11-04, scene reads and the ending (wins over everything below)

Canberk, after the Earnest scene read: "first scene is really good", the ending "can be much much better".
- **Scene beats name the characters.** Set `"names": {"PARTNER": "ALGERNON", "YOU": "JACK"}`: the partner's
  name carries a small sharp AI mark (SCENE PARTNER the first time, AI after), YOU is said once next to the
  actor's character, never "your line" over and over.
- **The cue line arrives word by word**, underlined as it comes, never the whole line at once.
- **No fade out endings, no added end sound.** End beat `"snap": true`, `"sfx": []`, `seconds` about 3. The
  music bed already builds and drops on the end card's first frame: hard cut, Ghost Light icon and name land
  on that drop, the line and App Store button on the next two beats (`"beats"`, default [0, 0.55, 1.1]).
  The music is the effect; nothing is laid on top of it.

## 2026-11-04, voices and scenes (wins over everything below)

Canberk bought the ElevenLabs Starter plan (commercial use). Build every film to use it:
- **Voiceover with word by word subtitles.** Spec `"voice": {"lines": [{"text": "...", "at": 0.4}]}`;
  `scripts/voice.py` (run by render.sh) voices each line with ElevenLabs (narrator George by default)
  and fills in the word timings, and the subtitles light up word by word in the day's look, above
  the bottom quarter. Short lines, spoken like an actor talking to an actor. Not every film needs a
  narrator: a silent real film with one line can be stronger. Roughly half the films voiced.
- **The scene partner, heard.** Beat `{"kind": "scene", "play": "...", "lines": [{"who": "PARTNER", "text": "..."}, {"who": "YOU", "text": "..."}]}`:
  a script page where the partner's lines light up as the voice (Lily) reads them and YOUR line is
  underlined as the cue. Public domain plays only (Earnest, Hamlet, Chekhov, Ibsen, Shaw...). Close on Ghost Light.
- **Sound effects from ElevenLabs** when a film needs a sound we do not have: `scripts/eleven.py sfx`
  (add the description to its list), then use it as a cue. Keep the ending light and short.
- **Real films beyond theatres.** Pexels has far more home footage than stage footage: someone on a
  couch checking their phone and putting it face down, pacing a kitchen with pages, at a window at
  night waiting, on the floor of a small flat with a script on their knees, on a bus or train
  reading. Same rules: one continuous shot, wide or medium wide, no closeups, the brand closes it.
- No AI-generated people, ever. AI video only for shots with no people (a phone lighting up on a
  table, two mugs, an empty chair), and only through an API we have.

## 2026-11-03, night: the ending sound (wins over everything below)

Canberk, after the cinema re-render of curtain at seven: "quieter chime please, very like faster,
maybe like a tap sound, not that crazy of a chime."
- The end card lands on one small, quick sound, not the full `chime`. Use `tap` (or `plink`) at
  vol 0.25 to 0.35, right as the icon settles (about 0.5s into the end beat). Short and soft.
- `chime` only if a film truly needs it, and then quiet (vol 0.3 or less). Never the loud bell.
- The cinema look (letterboxed, small subtitle lines under the action) is the one he likes for
  real films; text never sits on an actor's head.

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
