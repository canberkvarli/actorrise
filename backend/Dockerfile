# ActorRise API - Docker image for Render (or any container host)
FROM python:3.12-slim

WORKDIR /app

# Install uv for fast, reproducible installs
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy dependency manifests first for better layer caching
COPY pyproject.toml uv.lock ./

# Install dependencies (no dev)
RUN uv sync --frozen --no-dev --no-install-project

# Copy application code
COPY . .

# Render sets PORT; default for local runs
ENV PORT=8000
EXPOSE 8000

# Run from /app so `app.main` resolves (PORT set by Render at runtime)
CMD ["sh", "-c", ".venv/bin/uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
