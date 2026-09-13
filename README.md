# ActorRise

A platform for actors, built with Next.js and FastAPI. Find audition material in
plain English, then actually rehearse it.

Live at [actorrise.com](https://actorrise.com).

## What's in the library

| | monologues | titles |
|---|---|---|
| Plays | 13,998 | 732 |
| Film | 4,069 | 1,208 |
| Television | 1,313 | 224 |
| **Searchable total** | **19,380** | |

Every piece is 100+ words for stage and 75+ for screen (see
`monologue_quality.min_words_for_source` — the floor is per-source and lives in
one place). Full text is stored only where the rights allow it; everything else
links out to where an actor can buy the script.

**A known gap, stated plainly:** the play corpus is public domain, which means
nothing written after 1929. There is no contemporary play in the library, and no
amount of scraping changes that, because every contemporary play is in
copyright. 8% of searches ask for contemporary work.

## Features

- **Monologue search** — semantic search over the whole library. Understands
  duration ("under 90 seconds"), act and scene, character names, tone, age, and
  gender. Filters for overdone pieces so you are not the fourth Hamlet that day.
- **ScenePartner** — AI scene reader that runs the other parts so you can
  rehearse a scene alone. Upload a script, it extracts the scenes.
- **Monologue Work** — audio-first rehearsal for a single piece, with
  line-by-line delivery tracking.
- **Callboard / Green Room** — a shared board and activity feed.
- **Auditions, resume, self-tapes** — track submissions, build a resume, store
  tapes.
- **Actor profiles** — headshot, age range, type and training, used to bias
  search results toward what suits you.

## Tech stack

**Frontend** — Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4,
shadcn/ui, Framer Motion, Zod 4. Deployed on Vercel.

**Backend** — FastAPI, SQLAlchemy, Pydantic, `uv`. Deployed on Render
(auto-deploys on pushes touching `backend/**`).

**Data** — Supabase Postgres with pgvector. Embeddings are
`text-embedding-3-large` at 1536 dimensions, searched with cosine distance over
an HNSW index. `gpt-4o-mini` handles query parsing and content analysis.

**Auth and storage** — Supabase.

## Getting started

Prerequisites: Node 18+, Python 3.9+, [uv](https://docs.astral.sh/uv/), a
Postgres database with the `vector` extension, and a Supabase project.

```bash
git clone <your-repo-url> && cd actorrise

# Frontend
npm install
npm run dev                    # http://localhost:3000

# Backend, in a second terminal
cd backend
uv pip install -e .
uv run uvicorn app.main:app --reload   # http://localhost:8000
```

Create `.env.local` and `backend/.env` by hand from the blocks below. There are
no `.env.example` files to copy: `.gitignore` excludes `.env*`, so a committed
example would be invisible to everyone who cloned the repo.

Tables are created by SQLAlchemy on first startup.

### Environment

**Frontend, `.env.local`**

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
# NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX   # optional
```

**Backend, `.env`** (the settings `app/core/config.py` reads)

```env
DATABASE_URL=postgresql://user:password@localhost:5432/actorrise
JWT_SECRET=
JWT_ALGORITHM=HS256
CORS_ORIGINS=http://localhost:3000
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=headshots
OPENAI_API_KEY=
ENVIRONMENT=development
SUPERUSER_EMAILS=
REVIEW_EMAILS=
```

## Layout

```
app/                     Next.js App Router
  (auth)/                login, signup
  (marketing)/           public pages, SEO collection pages
  (platform)/            monologues, practice, rehearse, scenes, callboard,
                         greenroom, audition, resume, profile, billing, admin
components/              React components (search/, profile/, ui/, ...)
lib/                     api client, auth context, Supabase client
backend/
  app/api/               route modules, incl. admin/
  app/models/            SQLAlchemy models
  app/services/
    search/              semantic_search, title_lookup, query_optimizer
    extraction/          TEI XML, Gutenberg plain text, screenplay PDF parsers
    data_ingestion/      pipeline.py — the only supported way to add monologues
    ai/                  embeddings, content analysis
  scripts/               corpus maintenance and audits (see below)
  tests/                 119 files, 1,537 tests
```

## Working on the corpus

`ingest_play()` in `app/services/data_ingestion/pipeline.py` is the only
supported way to add monologues. It enforces the rights model
(`services/licensing.py`), the word floor, and cross-source deduplication.

Useful scripts:

```bash
python -m scripts.audit_corpus_quality        # run after EVERY ingest
python -m scripts.audit_search_constraints    # replay real searches, check results
python -m scripts.apply_table_storage_params  # DB storage params, in version control
```

Two habits worth keeping:

1. **Run the quality audit after every ingest.** It found a Plautus footnote bug
   in minutes on a source nobody had read, where every other problem cost hours
   of sampling and luck.
2. **Do not scan the whole corpus from a laptop.** Supabase bills egress and the
   maintenance scripts are the largest consumer. Select the columns you need and
   page; push work into SQL where you can.

## Testing

```bash
cd backend && pytest -q          # 1,537 tests
npm run lint                     # frontend
```

## License

MIT
