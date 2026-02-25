# AGENTS.md

## Cursor Cloud specific instructions

### Overview

ActorRise is a two-service monorepo:

| Service | Location | Runtime | Dev command |
|---------|----------|---------|-------------|
| Next.js 16 frontend | `/` (root) | Node.js 22+ / npm | `npm run dev` (port 3000) |
| FastAPI backend | `/backend/` | Python 3.12 / uv | `cd backend && uv run uvicorn app.main:app --reload` (port 8000) |

### Prerequisites (system-level, installed in the VM snapshot)

- **PostgreSQL 16** with **pgvector** extension — must be running before the backend starts.
- **uv** (Python package manager) — installed at `~/.local/bin/uv`.

### Starting services

1. **PostgreSQL**: `sudo pg_ctlcluster 16 main start`
2. **Backend**: `cd /workspace/backend && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`
3. **Frontend**: `cd /workspace && npm run dev`

### Environment files (git-ignored via `.env*` in `.gitignore`)

- `/workspace/.env.local` — frontend env vars (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- `/workspace/backend/.env` — backend env vars (`DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`, etc.)

Placeholder values are sufficient for starting both servers locally. Real Supabase/OpenAI/Stripe keys are only needed for auth, AI search, and billing features.

### Non-obvious caveats

- The backend `config.py` **raises a ValueError at import time** if `DATABASE_URL` is missing or doesn't start with `postgresql`. The `.env` file must exist before running the backend.
- The local PostgreSQL database is `actorrise` with user `actorrise` / password `actorrise`.
- `pgvector` extension is auto-created by the backend on startup (`CREATE EXTENSION IF NOT EXISTS vector`), but the PostgreSQL package `postgresql-16-pgvector` must be installed.
- `uv sync` (not `uv pip install -e .`) is the correct way to install backend deps — it uses the lockfile.
- The frontend uses `npm` (lockfile is `package-lock.json`).

### Lint / Test / Build

- **Frontend lint**: `npm run lint` (ESLint 9 — the codebase has pre-existing warnings/errors)
- **Frontend build**: `npm run build`
- **Backend**: no automated test suite or linter is configured in the repo. Manual API testing via `http://localhost:8000/docs` (Swagger UI).

### Database

Local PostgreSQL connection: `postgresql://actorrise:actorrise@localhost:5432/actorrise`. Tables are auto-created by SQLAlchemy on backend startup.
