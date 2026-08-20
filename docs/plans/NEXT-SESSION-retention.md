# Prompt: make ActorRise a place actors return to

Paste the block below into a fresh Claude Code session. Everything in it is
measured, not assumed — it is here so the next session starts from the numbers
instead of rediscovering them.

---

I want to fix retention on ActorRise. Actors sign up, run a search or two, and
never come back. I want the app to be something they stay in.

Start by reading `docs/plans/2026-08-19-workspace-not-search-engine.md` — the
thinking is already partly there. Then `docs/metrics/hypotheses.md` (H-10 in
particular) and `docs/metrics/metrics-history.csv`.

The measured position as of 2026-08-20:

- 515 users, 48 signups in 7d, 197 in 30d.
- **20 of 197 came back twice or more in 30 days. 10.2%.**
- 114 searches in 7d — so the ones who show up do search.
- **36 users out of 515 have ever saved a favorite. 7%.**
- Of 105 favorites total: **2 have a cut, 2 have a note, 8 are marked
  memorized.** Practically nobody uses the working features.
- rehearsals_7d has been flat at 7-8 for 14 straight days.
- The old activation metric says 86.8% activated against 10.2% retention, which
  means it measures nothing. H-10 proposes redefining it as ">=1 search AND >=1
  favorite within 7 days" — decide this as part of the work.

My read, which I want you to challenge rather than accept: a search engine
gives nobody a reason to return. You go when you need something and you leave.
A workspace has your things in it — your pieces, your cuts, your notes, what
you are off-book on, what you have an audition for on Thursday. The 7% favorite
rate says we never got anyone to put anything down.

What I want from this session:

1. Work out what the smallest thing is that makes an actor's second visit
   inevitable. Not a feature list — one loop, with the reason it should work.
2. Argue against yourself. If the honest answer is that retention is a content
   problem or an audience problem rather than a product one, say so. 15 of 41
   weak searches last week had no detectable title, and the film/TV corpus
   skews 74/26 male — either could be the real reason people leave.
3. Then design it, with a way to tell within two weeks whether it worked, and
   a condition that would prove it did not.

Do not start building until we have agreed the loop.

Useful context: `/work` (audio-first monologue rehearsal) and ScenePartner
already exist and are barely used — find out whether that is discovery, value,
or friction before proposing anything new. The activation cliff is documented
from 2026-06-29: 88.6% of users search, 3.9% ever rehearse.
