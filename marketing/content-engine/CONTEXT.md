# What the site knows this week

Written by the ActorRise session in Claude Code from the live database, Stripe, GA4 and the
search log. The ActorRise session refreshes the numbers when it has new ones; the feature map and rules hold until changed.
Last updated 2026-11-02 (week 45). If this date is more than 10 days old, say so in your
message to Canberk and use it anyway.

## How to use this file

Rotate through the whole app, not just the monologue search (Canberk, 2026-11-02: "create
videos that touch everywhere on the app"). Pick the moment first, then the part of the app
that answers it, and never feature the same part twice in 4 days. Write it in the `notes`
column as `feature=<name from CONTEXT.md>`.

See what shipped lately, so a new feature gets its video within the week:
`git -C /home/claude/actorrise fetch --depth 200 origin main && git -C /home/claude/actorrise log FETCH_HEAD --since="7 days ago" --format=%s`.
Only something an actor can see or do counts (skip admin, email, billing and fixes). Show it
the way it actually works: read its code on main (`git -C /home/claude/actorrise show FETCH_HEAD:<path>`) before drawing it, never guess.

## The whole app: rotate through all of it

Each line is a part an actor can use, with the moment it answers. Name in `feature=`.

Web, actorrise.com
- `search`: describe the piece you need ("comedic, a girl around sixteen, under two minutes") and get matches, not a title list. Moment: the night before, nothing fits.
- `character`: type a character's name (Shiv Roy, Fleabag, Nina from Black Swan) and get their speeches. Moment: "I want to do her."
- `overdone`: every piece shows how overdone it is. Moment: everyone brings Juliet.
- `scene-partner`: the other lines are read aloud so you rehearse alone. Moment: the partner who cancelled, the 2am self tape.
- `off-book`: rehearse with the Script, then only Cues, then Off book; say "line" for a prompt. Moment: memorizing on the train.
- `your-script`: upload your own sides or script and rehearse that. Moment: sides arrived an hour ago.
- `scenes`: two person scenes from plays, ready to run. Moment: scene class on Thursday, no partner picked.
- `work`: work one monologue out loud, beat by beat. Moment: it's memorized but it's flat.
- `auditions`: track every audition, its date and the piece you're bringing. Moment: three auditions this week, which piece for which.
- `callboard`: the board of what you're working on and what's next. Moment: the pin board of sticky notes.
- `green-room`: a room to rehearse with other actors. Moment: actor friends in three cities.
- `cue`: ask the in-app assistant what to work on or how to find something. Moment: stuck, no coach to ask.
- `classes`: a teacher makes one link and the whole class joins with their own accounts. Moment: the drama teacher with forty kids and one photocopier. Teacher angle only, never aimed at students under 13.

Ghost Light, the iOS app
- `tonight`: one speech a night to read, chosen for you. Moment: you haven't touched a monologue in weeks.
- `run-lines`: Ghost Light runs lines with you. Moment: lines in the kitchen.
- `reminder`: a nudge at seven with tonight's speech, and a home screen widget. Moment: the habit you keep dropping.
- `check-in`: log what you worked on tonight (a speech, a scene, a class, an audition). Moment: did I actually practice this week.
- `list`: keep a list of pieces and share it with a link. Moment: your coach asks what's in your book.

If a feature here is not on main any more, skip it and say so in the message to Canberk.

## Why the videos matter right now

- Traffic is the bottleneck, not the paywall. Google sessions to actorrise.com, last 5 weeks:
  688, 613, 568, 624, 551. Outside school class waves, signups are flat (122 to 129 a week).
- The walls work: a free actor who opens their 4th monologue of the month or runs out of free
  rehearsals sees the Plus offer. Too few people get that far. Videos feed the top.
- Ghost Light gets about 2 App Store impressions a day. 18 people read in the app this week.

## What actors come for (use for scenarios and hooks)

Pages Google sends people to most, 28 days: the monologue database, Lady Bird, Black Swan
(Nina), Anastasia, the monologue finder, Barry (Sally), The Importance of Being Earnest
(Algernon), The Handmaid's Tale (Offred). Character names are how actors search.

Character searches that now work (fixed 2026-11-01/02): Shiv Roy, Fleabag, Bing (Black
Mirror), Lorelai Gilmore, Joker, Sherlock.

Where the library is thin (searches that come back weak, 30 days): contemporary pieces for
teens 44%, contemporary 34%, villains 53% (small numbers), against 24% overall. Do not make a
video that promises these; they are where the library is weakest.

Searched for and not found this week: Pokemon, Hamilton, Mamma Mia, Beauty and the Beast,
Cat in the Hat. Never imply any of these are in the library.

The angle that fits the data: the moment an actor needs a specific kind of piece (comedic,
under two minutes, a character they love) and finds it by describing it, not by title.

## Rules from the ActorRise side

- Film and TV titles and character names may be named in a caption or a hook. Their text
  never goes on screen or in a caption (the film and TV corpus is not public domain).
- Never name a price, a free amount, a quota or a trial length in a caption or on screen.
  They change (the free tier changed on 2026-10-31) and the app shows each person their own.
- No coupon, no discount, no "free trial" promise. "Try it free" is fine; the app is free to start.
- The audience is actors 13 and up. No scenario aimed at children or middle school.
- Never claim a number of users, a testimonial, or a result.
