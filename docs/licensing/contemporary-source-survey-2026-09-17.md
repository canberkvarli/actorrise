# Where post-1980 play monologues can legally come from

Source survey, recommendation and ETL dry run. 2026-09-17.

Companion to H-20 in `docs/metrics/hypotheses.md`. Nothing in this session wrote
to the database.

---

## The answer, plainly

**No scrapeable source exists. This has to be a licensing deal.**

Every contemporary play is in copyright. The only parties who can grant a basis
to hold its text are the rights holders: the playwright, or the publisher acting
for them. No aggregator can convey a right it does not itself hold, and none of
them hold one.

That is the whole finding. The rest of this document is the evidence, and the
argument for which rights holder to approach first, because "it has to be a
licensing deal" is not the same as "it has to be Concord".

The recommendation is **Stage Partners**, not Concord, and the reason is that
they already give this material away and only ask for a credit.

---

## What I could and could not verify

This session's environment blocks all outbound HTTP except package registries
and the Anthropic API. I could not open a single ToS page directly. `WebFetch`
returned `EGRESS_BLOCKED` for stageagent.com, dailyactor.com, youthplays.com,
newplayexchange.org, concordtheatricals.com and even wikipedia.org.

So, against the instruction to read the real ToS pages rather than assume:

- **Verified first-hand**: everything about our own corpus and code. The SQL
  counts, the quality-gate run, the licensing behaviour. All of it executed.
- **Second-hand**: every external ToS claim below comes from web search result
  text, not from the page itself. Treat each as a lead to confirm, not as a
  cleared fact. I have marked these *(unconfirmed)*.
- **Not done**: the live-fetch dry run. No network means no fetch. What I ran
  instead is described under "Dry run", and it is a real measurement on real
  rows, not a simulation.

Before any permission email goes out, someone with an open browser should read
the two pages that actually matter: `yourstagepartners.com` terms and
`youthplays.com/terms.php`.

---

## What the corpus actually says

Read-only queries against production, 2026-09-17.

| | |
|---|---|
| Plays with `year_written >= 1980` | **1** |
| Monologues attached to it | **0** |
| Plays labelled `category = 'contemporary'` | 321 |
| Total plays | 1,033 |

H-20 confirmed and sharpened: the contemporary play catalogue is not thin, it is
empty. 321 plays carry the label; one of them is actually contemporary and it
has no monologues hanging off it.

### The whole library by rights basis

| `copyright_status` / `license_type` | Monologues |
|---|---|
| `public_domain` / `public_domain` + null | 18,416 |
| `copyrighted` / `fair_use` (film + TV) | 5,505 |
| `copyrighted` / **null** | **19** |
| `user_uploaded` / `user_content` | 10 |
| **Total** | **23,950** |

Two things fall out of this table.

**First, the fair-use excerpt posture is already load-bearing.** 5,505 film and
TV monologues, years 1941 to 2026, are served today as bounded excerpts of
copyrighted work. `backend/scripts/CONTEMPORARY_SOURCES.md` states flatly that
fair use "doesn't apply to commercial platforms" and that excerpting is "NOT
legal". The running system disagrees with that document 5,505 times. One of the
two is wrong, and the document is the newer liability: it is the reasoning that
produced `scrape_contemporary_monologues.py`. See "Documents to retire" below.

**Second, 19 rows are `copyrighted` with no basis recorded.** `may_store_text`
refuses them, so they are stored but unservable. They are the StageAgent
residue, and they matter out of proportion to their number. More below.

---

## Source survey, by legal basis

Classified by what right it gives us, not by how easy it is to scrape.

### A. Excerpt aggregators — no basis. Dead end.

**StageAgent, Daily Actor, AuditionScenes, NYCastings.**

One argument disposes of the whole category, before any ToS question:

> An aggregator does not own the play. It cannot license to us what it does not
> hold. Scraping it does not give us a basis for the underlying work; it gives
> us the publisher's claim *and* the aggregator's claim to answer instead of one.

Their own terms then add a second bar on top. StageAgent's terms state that
"no part of the Sites or the content available on it may be reproduced,
republished, copied, transmitted, or distributed in any form or by any means"
*(unconfirmed)*. Daily Actor publishes excerpts from in-copyright plays with no
stated publisher permission anywhere I could find *(unconfirmed)*.

**We have already ingested StageAgent** via `backend/scripts/scrape_stageagent.py`:
228 play rows, 191 monologues. That script never calls `may_store_text`, writes
`copyright_status="copyrighted"` with no `license_type` (`scrape_stageagent.py:264`),
and derives `category` from StageAgent's "Time Period" string, which is the same
read-the-label mistake H-20 documents for the 1920s anthologies.

I checked whether that ingest quietly relabelled copyrighted work as public
domain through `pipeline.py`'s rights-adoption path (lines 295-323). **It did
not.** 172 of the 191 landed on `public_domain` play rows, and those rows are
genuine public-domain classics that StageAgent also covers. The one borderline
case is *London Assurance* (Boucicault, 1841), correctly public domain. That
path behaved.

The real problem with the StageAgent ingest is not rights. It is that the
material is not monologues. See the dry run.

### B. Publishers who license directly — the only real basis.

These are the actual rights holders. A signature here produces
`license_type = 'licensed'`, which `max_words_for` lifts to the 900-word
ceiling rather than the 400-word fair-use cap.

**Tier 1, the majors: Concord Theatricals (Samuel French), Dramatists Play
Service.** Reachable in principle, slow in practice. Concord's guidance is that
reproducing "all or part of a Concord Theatricals publication in another
publication" needs express permission, and that for competition pieces,
cuttings and monologues the underlying rights are frequently "not held or
controlled by Concord Theatricals" with "no guarantee of permission being
granted" *(unconfirmed)*. That last clause is the important one: even a
willing Concord may not be able to grant monologue reprint rights title by
title, because those rights often sat with the author. A first deal here is a
legal-department negotiation, not an email.

**Tier 2, the independents: Stage Partners, YouthPLAYS, Playscripts, Broadway
Play Publishing.** Materially different posture, and this is the finding worth
acting on.

Stage Partners publishes free monologues on its own site and tells actors
directly that they may perform any of them free, student or professional,
including in auditions and self-tapes, asking only that you credit the play,
the playwright and the publisher *(unconfirmed)*. YouthPLAYS does the same:
monologues drawn from their published plays, free for audition and classroom
use, credit the play and author *(unconfirmed)*.

Read that carefully, because it is a grant to the **performing actor**, not to
a commercial platform that wants to copy the text into a database and serve it
to subscribers. It is not a licence we already have. What it is, is evidence
that the ask is small: we would be requesting permission to redistribute
material the rights holder already publishes for free, to precisely the
audience they published it for, with the credit they already ask for.

That is a one-email, one-signature ask to a small publisher, rather than a
catalogue negotiation with a major.

### C. Creative Commons new work — real, tiny, not a catalogue.

The only basis that needs no negotiation at all. `LICENSE_CC_BY` already exists
in `licensing.py` and clears `may_store_text` at the full 900-word ceiling.

The problem is supply. HowlRound Theatre Commons licenses its site content
CC BY 4.0 and asks for a specific republication credit line *(unconfirmed)*,
but HowlRound is essays and criticism about theatre; its "Scripts For Free"
page is a curated list pointing at other people's sites, not a script corpus we
could ingest. I found no substantial repository of CC-licensed contemporary
plays. Individual playwrights do release work under CC, one at a time.

Worth a standing intake path. Not worth a scraper.

### D. New Play Exchange — dead end, and worth stating clearly.

NPX is the obvious-looking answer and it is firmly closed. Scripts are visible
only to logged-in subscribers; content "may not be copied, distributed,
republished, uploaded, posted, or transmitted" without prior written consent,
with a personal-use printing exception; and NPX manages no rights or royalties
at all, directing all rights enquiries to the writer *(unconfirmed)*.

So NPX cannot grant anything even if it wanted to, and scraping it would breach
both its terms and each playwright's copyright. Its value to us is as a
**directory of living playwrights to approach individually**, nothing more.

---

## Recommendation

**Approach Stage Partners first. Not Concord.**

Reasons, in order of weight:

1. **They can actually grant it.** They are the publisher, and for their own
   commissioned catalogue the reprint right is theirs, not scattered across
   authors' agents the way Concord's monologue rights appear to be.
2. **The material is already free and public.** We are asking to mirror, with
   credit, what they publish to attract exactly our users. The incentive is
   aligned: every piece links back and sells a script.
3. **Everything is post-2010.** Their entire catalogue is new plays, so the
   era problem solves itself. No date archaeology.
4. **They are reachable.** A small publisher has a person who answers email.
5. **It is the cheapest possible test of the whole licensing thesis.** If a
   publisher who gives this away for free will not sign, Concord certainly will
   not, and we learn that for the price of one email instead of six months.

Run YouthPLAYS in parallel, same ask, same week. Their terms posture is nearly
identical and the two together would cover a real age range.

**Keep Concord for second, once one signature exists.** A second publisher is
much easier to sign than a first, and the Concord document gets materially
stronger when it can say "Stage Partners is already live on the platform under
these terms".

### What it would take

- One permission email. Drafted at `docs/licensing/draft-stage-partners-email.md`,
  not sent.
- A written reply naming the titles covered, the excerpt ceiling, the required
  credit line, and a takedown commitment. That reply *is* the
  `license_type = 'licensed'` basis and belongs in the repo.
- Two pipeline changes, described below, roughly a day.
- A scraper. The smallest part of the job.

---

## Dry run

The instruction was a dry run on the best scrapeable candidate. With no network
I could not fetch Stage Partners, so a live run was impossible, and I will not
invent sample rows from a publisher's catalogue and present them as output.

What I ran instead is a real measurement that answers the more useful question:
**does aggregator-sourced material even survive our monologue bar?** The 191
StageAgent rows already in the database are the same class of content the same
kind of scraper would fetch tomorrow. I pulled the 19 copyrighted ones read-only
and ran them through the repo's actual gate, `assess_monologue_quality`, with
the real bounds.

```
gate bounds: min=100 max=400 spoken words

rows evaluated:      19
  pass quality gate: 0
  rejected:          19
  end in ellipsis:   18   <- truncated preview, not a full speech

rejection reasons:
  too_short                19
  truncated_end            19

rights check (licensing.py):
  copyright_status='copyrighted' license_type=None
    -> may_store=False  may_serve=False  (copyrighted, no basis recorded)

word counts: min=14 median=35 max=40
rows at or above the 100-word floor: 0
```

**Zero of nineteen are monologues.** The median is 35 words against a 100-word
floor. Eighteen of nineteen end in an ellipsis, several carry a literal
`Start:` parse artifact, and the longest piece in the set is 40 words, which is
about fourteen seconds.

The reason is structural, and it is the single most useful thing in this
document: **StageAgent's public pages show a teaser, and the full text sits
behind their paid subscription.** The scraper faithfully collected the
marketing preview. It was never going to collect a monologue, and no amount of
fixing the parser changes that, because the words are not on the page.

Across the whole 191-row ingest: 39 are under 100 words, 6 are over 400, and the
average is 175, but that average is carried by the public-domain classics we
already hold from Gutenberg and Perseus at full length and better quality. The
aggregator contributed **zero** contemporary play monologues.

So the aggregator path fails twice over. It has no legal basis, and even setting
the law aside it does not return performable text.

### What a Stage Partners run would write, field by field

This is the mapping, not a measurement. It is what the scraper at
`backend/scripts/scrape_stage_partners.py` is built to produce. The rights rows
and the unknown-year rule are asserted in that file's `--self-check`, which runs
offline with no database and no API key:

```
rights:
  ok    licensed copyrighted text may be stored
  ok    ceiling is 900 words, not the 400-word fair-use cap
  ok    the same text with no basis is refused
era:
  ok    unknown title -> (None, None), never a guess
  skip  cutoff checks: semantic_search not importable here
write gate:
  ok    write refuses while no permission is on file
```

| Field | Value | Why |
|---|---|---|
| `copyright_status` | `copyrighted` | It is an in-copyright contemporary play. |
| `license_type` | `licensed` | Only once written permission is on file. Until then the scraper refuses to run in `--write` at all. |
| `year_written` | Real first-production or publication year, per title | Never from a page label, never from the word "contemporary" |
| `category` | `contemporary` **only if** `year_written >= 1980` | `ERA_CUTOFF_YEAR`, from `era_year_clause` |
| `year_written` unknown | left `NULL`, `category` not set to contemporary | No reliable year means unknown, not a guess |
| max words | 900 via `max_words_for` | `licensed`, so the 400-word fair-use cap does not bind |

Dedupe: `find_duplicate` compares a normalised fingerprint at
`DUPLICATE_DISTANCE = 0.02`. Against the current corpus I would expect close to
zero rejections for genuinely contemporary titles, because we hold no
contemporary plays for them to collide with. The realistic collision is
re-running the scraper against itself, which `text_fingerprint` catches exactly.
`_find_superseded` is not relevant on a first ingest.

---

## Pipeline changes needed (described, not made)

Two blockers. Neither was touched this session.

**1. `ingest_play()` cannot set `year_written`.** The `Play(...)` construction at
`pipeline.py:285-290` passes title, author, category, genre, source_type,
language, copyright_status, license_type, source_url. There is no
`year_written`, and the function signature has no parameter for it. Requirement
4 of this task is unimplementable until it does. The fix is a
`year_written: Optional[int] = None` parameter threaded to the constructor, and
`category` derived from it rather than passed in independently, so the label and
the date cannot disagree the way they do for the 321 mislabelled rows today.

**2. `ingest_play()` only accepts whole play texts.** It refuses anything under
2,000 characters (`pipeline.py:210`) and runs `PlainTextParser` to find speeches
inside a script. A publisher monologue page delivers one already-extracted
speech of roughly 200 words, which is about 1,200 characters, so every single
one would be refused as "no usable full text" before the gate ever sees it.

This needs a second entry point, something like
`ingest_monologue(db, *, play_title, author, character, text, rights...)`, that
skips the parser and the length floor but keeps everything that matters: the
`may_store_text` check first, `assess_monologue_quality`, `find_duplicate`,
`was_rejected` / `record_rejection`, the analyse-and-embed step, and the
`text_segments = None` rule. It should share the `IngestReport` type so dry runs
read the same.

Doing this as a new function rather than a flag on `ingest_play` keeps the
"rights are a required argument" guarantee intact and avoids loosening the
2,000-character floor for the sources that legitimately need it.

**3. The era constants are unreachable from a script.** `ERA_CUTOFF_YEAR` and
`MODERN_START_YEAR` live in `semantic_search.py`, which on import pulls in the
models, the SQLAlchemy engine, pgvector, and the whole LangChain stack. A
scraper that needs one integer to decide `category` has to stand up the entire
AI runtime to get it. I hit this building the dry run: `--self-check` could not
run without a live `DATABASE_URL` and an OpenAI-capable environment.

The repo's own rule against copying a shared constant is the right one
(`DEFAULT_MIN_WORDS` documents what happened when eight parsers each kept a
private copy of the word floor), so the answer is not to hardcode 1980 in the
scraper. It is to move `ERA_CUTOFF_YEAR`, `MODERN_START_YEAR` and `era_fields`-
style band logic into a small dependency-free module, say `app/services/eras.py`,
and have `semantic_search` import from there.

I worked around it for now with a lazy import that reports the check as skipped
rather than guessing, so the invariant is never silently wrong. That workaround
should not survive the real ingest.

---

## Documents and scripts to retire

**`backend/scripts/scrape_contemporary_monologues.py` — delete.**

Its premise is self-contradictory on its own face. The docstring says "Scrape
contemporary public domain monologues" and then defines the legal basis as
"Works published before 1928: Public domain". There is no such thing as a
contemporary public-domain play; that is the definition of the gap. This is the
script that produced the 1892-1926 anthology mess in H-20.

Delete rather than rename. A rename preserves a working scraper pointed at the
wrong idea, and the useful half, Gutenberg ingestion, is already covered
properly by `data_ingestion/gutenberg_scraper.py` going through the pipeline.
Nothing here is worth keeping.

**`backend/scripts/CONTEMPORARY_SOURCES.md` — rewrite or delete.**

It is the reasoning behind that scraper, and it is wrong in the direction that
costs us. It asserts excerpting is never legal for us, which the 5,505 film and
TV rows contradict in production, and it recommends "focus on forgotten
contemporary works from the 1920s-1960s", which is the exact instruction that
produced 325 plays from 1892-1926 labelled contemporary. This document should
be replaced by this one.

---

## What the Concord evidence document is missing

Taking the recommendation seriously, the first publisher I would approach is
Stage Partners, so the notes below cover both: what the document needs for any
publisher, and what changes when it is retargeted.

### Fix before it goes anywhere

**The rights claim is not accurate, and it is the one a counterparty will
check.** The document says:

> 19,400 monologues, all public domain ... I hold no scripts I do not have the
> right to hold, and nothing on the site was written after 1929 except screen
> work.

Production says 23,950 monologues: 18,416 public domain, **5,505 copyrighted
screen excerpts held under fair use**, 19 copyrighted with no basis recorded,
10 user uploads. "All public domain" is off by 5,505 rows, and the 19 rows are
literally scripts held without a recorded right.

Sending a rights holder a document that misstates your own rights position is
the worst possible opening, and the irony is that **the truth is a better
pitch**. "I run a bounded fair-use excerpt regime for 5,505 screen pieces, here
is the code that enforces the ceiling" demonstrates exactly the discipline they
need to see. Fix the numbers and turn the correction into the argument.

Clear the 19 no-basis rows before sending, too, so the claim is clean.

### Add

1. **An actual ask.** The document states a problem and stops. It never says
   what it wants: how many titles, what excerpt length, what the publisher
   receives, what money moves. A licensing person cannot say yes to a problem.
   Propose terms, even modest ones: a named pilot set, a 400-word ceiling, a
   fixed credit line, link-out to buy the script, annual renewal, takedown on
   request, and whatever revenue share or flat fee you can carry.

2. **What they get.** Publishers license excerpts to sell scripts and
   performance rights. The document has nothing on outbound clicks, referrals
   or purchases driven. If that number exists, it is the strongest sentence in
   the document. If it does not exist, instrument it before sending, because
   "I will send you attributed traffic" is unfalsifiable without it.

3. **The rights machinery, as an asset.** `licensing.py` fails closed, splits
   what the work is from what our basis is, caps fair use at 400 words, and
   gates both storage and serving. `/sources` promises never to host full
   scripts. That is a compliance story most licensees cannot tell and it is
   entirely absent. Offer them the takedown path explicitly.

4. **Excerpt length, stated plainly.** "Every one is a full text I extracted
   myself and can show in full" reads, to a publisher, like a site that
   displays complete works. Say the contemporary material would be capped, and
   name the number.

5. **Scale, framed honestly.** 537 actors and 71 asking will read as small.
   Give it a direction: growth over the six months, or reframe the ask as a
   pilot where small is the point.

### Change when retargeting to Stage Partners

- The named titles are wrong for them. *Rosencrantz and Guildenstern Are Dead*
  and *Speech and Debate* are Concord and DPS titles. Pull the request-form and
  search-log data for titles in **their** catalogue, and if there are none, say
  so honestly and lead with the age-range and category demand instead.
- Lead with the free-monologues page. They already publish for this audience;
  the ask is to extend that reach with the credit they already require.
- Drop the Samuel French framing in the closing section entirely.

The demand evidence itself, 173 searches, 71 actors, the verbatim queries and
the four write-ins, is genuinely strong and needs no change. The 0% contemporary
play figure matches what I measured independently today. Keep all of it.

---

## Sources

External claims above are from search results, not from the pages themselves.
Confirm before relying on any of them.

- [StageAgent](https://stageagent.com/) · [StageAgent terms](https://stageagent.org/pages/terms)
- [Daily Actor, monologues from plays](https://www.dailyactor.com/monologues-from-plays/)
- [Concord Theatricals help and FAQ](https://www.concordtheatricals.co.uk/resources/help-and-faq) · [Intro to licensing](https://www.concordtheatricals.co.uk/resources/intro-to-licensing)
- [Dramatists Play Service](https://en.wikipedia.org/wiki/Dramatists_Play_Service)
- [Stage Partners free monologues](https://www.yourstagepartners.com/resources/free-monologues) · [Stage Partners](https://www.yourstagepartners.com/)
- [YouthPLAYS free monologues](https://www.youthplays.com/monologues.php)
- [New Play Exchange terms](https://newplayexchange.org/legal) · [NPX rights and copyright FAQ](https://newplayexchange.org/faqs/rights-and-copyright)
- [HowlRound intellectual property](https://howlround.com/intellectual-property) · [HowlRound terms of use](https://howlround.com/terms-of-use) · [Creative Commons on HowlRound](https://creativecommons.org/2016/11/10/howlround/)
