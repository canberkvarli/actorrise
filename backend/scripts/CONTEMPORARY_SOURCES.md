# Contemporary monologue sources

## The rule (Canberk, 2026-11-05)

Actors, and teens most of all, keep asking for contemporary pieces, and the library is
mostly pre-1928. So contemporary plays come in, as text, not as metadata only.

What we hold for a copyrighted play:

- **One monologue at a time, never the play.** Each piece is an excerpt of at most
  400 words (`licensing.EXCERPT_MAX_WORDS`). Full scripts are never stored, not even
  for a moment between download and extraction.
- **Credit and a way to the play.** Every row carries the playwright, the play title and
  a `source_url` back to where the play is published or sold. The point is that an
  actor who finds a piece here goes and gets the play.
- **Basis recorded.** `copyright_status='copyrighted'` with `license_type='fair_use'`.
  Written permission upgrades a play to `licensed` (no 400-word ceiling). Rows with no
  basis are refused by `services/licensing.py`, which fails closed.
- **Takedown is immediate.** A playwright or publisher who asks to be taken out is taken
  out the same day: hide the play's monologues and record why. No argument about fair use.
- **Plays only for now.** Film and TV come later, and film or TV scene text is never
  hosted publicly (standing rule in `CLAUDE.md`).

This replaces the earlier version of this file, which said excerpts of contemporary plays
were off limits for a paid product. That was a judgement call, and the call is now the
other way. The risk is real and accepted: the 400-word ceiling, the credit, the link out
and the same-day takedown are what keep it reasonable.

## Where pieces come from

In order of preference:

1. **Permission.** A playwright or publisher who says yes in writing (`licensed`). Best for
   everyone: they get actors sent to their play, we get to show the whole speech.
2. **Text the writer or publisher already puts on the web for free.** Playwrights who post
   their own scripts (samgraber.com, proplay.ws, already ingested by
   `ingest_contemporary_plays.py`), publishers who post sample monologues from their plays.
3. **Aggregators that post monologues from contemporary plays** with credit. Ingest only the
   monologue, credit the play, link the play, not the aggregator alone.

Always: respect `robots.txt`, crawl slowly with the `ActorRiseBot` user agent, and go through
`services/data_ingestion/pipeline.py::ingest_play()` so the cap and the basis are enforced.

The research shortlist of sources (teen and youth, musicals, adult contemporary) is kept in
the session where it was made and told to Canberk in chat. When a source is approved, it
gets a `discover_*` function in `web_play_scraper.py` and a `--source` flag here.

## Ingested

- **2026-11-05, Daily Actor** (`--source dailyactor`): 139 stage pieces, monologues
  44179-44318. Film and TV pages skipped.
- **2026-11-05, YouthPLAYS** (`--source youthplays`): 85 teen and youth pieces,
  monologues 44319-44403. Undated plays carry a labelled floor year (see
  `date_youthplays.py`).
  **Taken down 2026-11-10** at their request ("we want our text to stay on our
  site", 2026-11-09): all 90 YouthPLAYS rows are `taken_down`, no text served. The
  source is switched off. Listing with links is welcome and is in
  `monologue_references`.

- **2026-11-06, NYCastings** (`--source nycastings`): 24 pieces, 44404-44427. Posts with
  no author credit (most kids' "Jr." musicals) are skipped.
- **2026-11-06, Adam Szymkowicz's blog** (`--source szymkowicz`): 109 pieces, 44428-44536;
  20 more were the same speeches NYCastings carries and were refused as duplicates.

- **2026-11-06, Jonathan Dorf** (`--source dorf`): 25 pieces, mostly teen; 11 more were
  YouthPLAYS speeches already stored. **Taken down 2026-11-12**: he is the playwright who
  answered for YouthPLAYS, so his own site's 20 pieces (5 more sat on YouthPLAYS play
  rows) are `taken_down` with the rest and the source is switched off. Before ingesting
  from any source, search Gmail and `contact_log` for its domain: an answer may be in. **Tristan B. Willis** (`--source willis`): 4 pieces.
  **Reina Hardy** (`--source reinahardy`): written but not run; her site's bot check
  refused the live page reads that day, and only about 3 pieces clear the gate.

- **2026-11-09, Ian McWethy** (`--source mcwethy`, needs `--user-agent`): 8 pieces,
  44566-44573, mostly teen (Molly Denholtz, Last Day of School). 5 more were refused by
  the quality gate (`caps_residue`: his characters shout in capitals). Years for all six
  plays are in `data/contemporary_play_years.json` from publisher and edition records.

- **2026-11-11, Kristen Doherty** (`--source doherty`): 16 pieces, 44574-44589, mostly teen
  (TEEN, Bully!, Shakespeare Bachelor, Queens). Her plays have no published premiere year,
  so `year_written` is a floor from each PDF's creation date (2022, two at 2026). Two more
  were refused by the gate (direction-heavy).
  **Jane Cafarella** (`--source cafarella`): 38 standalone monologues for women,
  44590-44627, free on her site with full credit. Each piece is its own work, so its year
  is the date of the post that published it (`Parsed.year`, not the title-keyed years file,
  because titles like "The Gift" would collide). 3 more were the same speeches under a
  second title and were refused as duplicates.
  **Audrey Cefaly**: tried and dropped. Her Gulf PDF extracts with hidden characters inside
  words, and her two HTML pieces fail the gate (capitals and directions).

- **2026-11-12, packets and archives** (`scripts/ingest_monologue_manifest.py`, splitters in
  `scripts/packets/`): 469 pieces, monologues 44628-45096.
  - School and drama-college audition packets plus the Take 2 studio page: 154 (NIDA, Laine,
    Dawson, Seattle Children's Theatre, VCA, Village Theatre, Charter Arts, Cab Calloway,
    Newark Arts, Lakeside HS). 50 more were already in the library.
  - Tumblr archives (themonologuearchive, fuckyeahgreatmonologues, monologue-database): 202,
    capped at ten per play.
  - We Are Actors: 58 (28 already in). Shea's teen library: 13 (9 already in).
  - Musical audition packets: 42, on the 60-word musical floor (`MUSICAL_MIN_WORDS`).
  Left out on purpose: Harry Potter and the Cursed Child, Hamilton (lyrics), "Jr"/"Kids"
  school editions (MTI's text; MTI blocks AI crawlers), and any writer on the deny list in
  `packets/combine.py`. Years for these plays are editor's knowledge, marked unverified.
  Not done: three school collections (two Drive/Docs sets, a Texas school site, about 85
  pieces) and a 251-page scanned binder that needs proofreading.

Asks rather than scrapes (permission emails): Monologue Blogger (terms forbid commercial
use), Broadway Play Publishing (about 1,500 free audition pieces, 403 to our client),
Don Zolidis (403), Arthur M. Jolly (PDFs, disallowed), Stage Partners (403).

All were written from a cloud session with `--write-rest`, which goes through
`app/services/data_ingestion/rest_writer.py` because Postgres is unreachable there.
Duplicates are checked library-wide by the database function `monologue_duplicate_of`
(`scripts/add_monologue_duplicate_function.py`): identical text, near-identical vector,
and the same speech in another cut. Three such cuts from the first Daily Actor run
(44193, 44208, 44212) were deleted on 2026-11-06.

## Blocked, and why

- **Stage Partners**: their CDN answers 403 to every non-browser client. Run from the
  laptop with `--user-agent`, or ask them.
- **Theatrefolk, MTI, Brooklyn Publishers**: robots.txt names ClaudeBot and other AI
  crawlers. Permission only.

## Public domain, still worth taking

- Plays published 1928 to 1963 whose copyright was never renewed.
- Plays released under Creative Commons (`cc_by`), with the attribution the licence asks for.
- Useful lists: Ohio Wesleyan "Plays in the Public Domain", SUNY Oswego public domain theatre
  guide, Project Gutenberg drama.
