FROM python:3.13-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

# install deps first so this layer is cached until the lockfile changes
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --locked --no-install-project

COPY . .

# run as non-root user
RUN adduser --system --no-create-home nonroot
USER nonroot

EXPOSE 8080
CMD ["fastapi", "run", "main.py", "--host", "0.0.0.0", "--port", "8080"]
