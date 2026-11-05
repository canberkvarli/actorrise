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

## Public domain, still worth taking

- Plays published 1928 to 1963 whose copyright was never renewed.
- Plays released under Creative Commons (`cc_by`), with the attribution the licence asks for.
- Useful lists: Ohio Wesleyan "Plays in the Public Domain", SUNY Oswego public domain theatre
  guide, Project Gutenberg drama.
