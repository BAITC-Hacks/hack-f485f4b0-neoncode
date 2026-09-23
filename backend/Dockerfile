# syntax=docker/dockerfile:1
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

RUN groupadd -r app && useradd -r -g app -d /app -s /sbin/nologin app

# Install dependencies first so this layer is cached while app code changes.
COPY --chown=app:app pyproject.toml uv.lock ./
RUN uv sync --locked --no-install-project --no-dev

# Copy application source and the synthetic dataset used to seed SQLite on startup.
COPY --chown=app:app app ./app
COPY --chown=app:app data ./data

RUN uv sync --locked --no-dev

# Dedicated, non-root-owned directory for the SQLite file so it can be
# mounted as a volume without hiding the app code copied into /app.
RUN mkdir -p /app/storage && chown app:app /app/storage

USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request as u; u.urlopen('http://127.0.0.1:8000/openapi.json', timeout=2)" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
