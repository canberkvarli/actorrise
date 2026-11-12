# Packet splitters (2026-11-12)

Throwaway scripts that turn audition packets, studio pages and Tumblr archives into
manifests for `scripts/ingest_monologue_manifest.py`. They were written in a session
scratchpad and are kept so the work can be redone; paths inside them (`pk/`, `man/`,
`dl/`) are relative to that scratchpad, so run them from a scratch directory.

No monologue text is in this folder, and none should be: manifests hold the excerpts
and stay out of the repository.

Order: `getpdf.py` (PDF packets) → `split.py <key> [one] [cf]` per packet → `combine.py`
(titles, playwrights, deny list) with `fixes.py` (years, corrections); `wa_fetch.py` +
`wa_parse.py` (We Are Actors); `tumblr.py` + `tb_parse.py` + `tb_fix.py`; `sheas.py`;
`pai.py` + `mus.py` (musical audition packets).

State on 2026-11-12: about 520 pieces were ready to write (packets 200, We Are Actors 85,
Tumblr 205 at ten per play, Shea's 22, musicals 14) and NONE went in: the OpenAI account
had no credits, so analysis and embedding failed. Re-run the manifests once it is topped up.
