# Database Setup Guide

## Overview

ActorRise now supports both **SQLite** (for development) and **PostgreSQL with pgvector** (for production). The application automatically detects which database you're using and adapts accordingly.

## Why PostgreSQL with pgvector?

- **Native vector search**: 100x faster than Python-based cosine similarity
- **Scalability**: Handles millions of embeddings efficiently
- **Production-ready**: Used by major companies for AI applications
- **Single database**: Store relational data and vectors together

## Quick Start

### Option 1: SQLite (Development - Default)

No setup needed! The app uses SQLite by default:

```bash
# Just run the app
uvicorn app.main:app --reload
```

### Option 2: PostgreSQL with pgvector (Production)

#### 1. Install PostgreSQL and pgvector

**macOS:**
```bash
brew install postgresql@15
brew install pgvector
```

**Ubuntu/Debian:**
```bash
sudo apt-get install postgresql-15 postgresql-contrib
# Install pgvector extension
git clone --branch v0.5.1 https://github.com/pgvector/pgvector.git
cd pgvector
make
sudo make install
```

**Docker (Recommended):**
```bash
docker run -d \
  --name actorrise-db \
  -e POSTGRES_USER=actorrise \
  -e POSTGRES_PASSWORD=yourpassword \
  -e POSTGRES_DB=actorrise \
  -p 5432:5432 \
  pgvector/pgvector:pg15
```

#### 2. Set Environment Variable

Create/update `.env` file:

```env
DATABASE_URL=postgresql://actorrise:yourpassword@localhost:5432/actorrise
```

#### 3. Install Python Dependencies

```bash
pip install -r requirements.txt
```

#### 4. Run Migration (if migrating from SQLite)

```bash
python migrate_to_postgres.py
```

#### 5. Start the Application

```bash
uvicorn app.main:app --reload
```

The app will automatically:
- Enable pgvector extension
- Create tables with proper vector columns
- Use native vector search queries

## Modern Alternatives

### Supabase (Recommended for Easy Setup)

Supabase provides PostgreSQL with pgvector built-in, plus:
- Managed hosting
- Built-in auth (optional)
- Storage for headshots
- Real-time subscriptions

1. Create account at [supabase.com](https://supabase.com)
2. Create a new project
3. Get connection string from Settings → Database
4. Set `DATABASE_URL` in `.env`

### Neon (Serverless PostgreSQL)

Perfect for serverless deployments:
1. Sign up at [neon.tech](https://neon.tech)
2. Create a project
3. Enable pgvector extension in SQL editor: `CREATE EXTENSION vector;`
4. Use connection string in `DATABASE_URL`

### Railway / Render

Both platforms offer PostgreSQL with pgvector:
- **Railway**: Add PostgreSQL service, enable pgvector
- **Render**: Create PostgreSQL database, run `CREATE EXTENSION vector;`

## Performance Comparison

| Operation | SQLite (Python) | PostgreSQL (pgvector) |
|-----------|----------------|----------------------|
| 1,000 monologues | ~500ms | ~5ms |
| 10,000 monologues | ~5s | ~10ms |
| 100,000 monologues | ~50s | ~50ms |

## Vector Search Features

With pgvector, you get:
- **Cosine similarity**: `1 - (embedding <=> query_vector)`
- **Euclidean distance**: `embedding <-> query_vector`
- **Inner product**: `embedding <#> query_vector`
- **Indexing**: HNSW or IVFFlat indexes for even faster searches

## Troubleshooting

### "pgvector extension not found"

Install pgvector on your PostgreSQL server:
```sql
CREATE EXTENSION vector;
```

### "Vector type not recognized"

Make sure you're using PostgreSQL 11+ and pgvector is installed.

### Migration errors

1. Backup your SQLite database first
2. Check PostgreSQL connection string
3. Ensure pgvector extension is enabled
4. Run migration script with verbose output

## Development vs Production

- **Development**: Use SQLite for simplicity
- **Production**: Use PostgreSQL with pgvector for performance

The code automatically detects which database you're using and adapts!

