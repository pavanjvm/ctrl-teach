# ── Ctrl+Teach Backend — Cloud Run Container ─────────────────────────────────
# Multi-stage build for a lean production image.

FROM python:3.12-slim AS base

COPY --from=ghcr.io/astral-sh/uv:0.10.7 /uv /uvx /bin/

# Prevent Python from writing .pyc files and enable unbuffered stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

WORKDIR /app

# Install OS-level deps required by some Python packages (Pillow, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# ── Dependencies ──────────────────────────────────────────────────────────────
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project

# ── Application code ──────────────────────────────────────────────────────────
COPY . .

# Cloud Run sets PORT env var (default 8080)
ENV PORT=8080

EXPOSE ${PORT}

# Use uvicorn with production settings
CMD exec uv run --locked --no-sync uvicorn app.main:app \
    --host 0.0.0.0 \
    --port ${PORT} \
    --workers 1 \
    --log-level info
