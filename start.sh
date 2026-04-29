#!/usr/bin/env bash
# Install dependencies, production-build the client, then run the dev server (Vite + Express).
# If POSTGRES_URL is unset, tries to start Postgres via Docker (host port 55432) when nothing is listening on 5432.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if ! command -v npm >/dev/null 2>&1; then
  echo "start.sh: npm is not on PATH" >&2
  exit 1
fi

# Export vars from .env.local so we respect existing POSTGRES_URL / keys for subprocesses.
if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env.local
  set +a
fi

DOCKER_IMAGE="${DOCKER_IMAGE:-postgres:16-alpine}"
PG_CONTAINER="${PG_CONTAINER:-eqrreports-postgres}"
PG_USER="${PG_USER:-eqrreports}"
PG_PASS="${PG_PASS:-eqrreports_local_dev}"
PG_DB="${PG_DB:-eqrreports}"
# Host port avoids clashing with a system Postgres on 5432.
HOST_PG_PORT="${HOST_PG_PORT:-55432}"

pg_ready() {
  local port="${1:-5432}"
  if command -v pg_isready >/dev/null 2>&1; then
    pg_isready -h 127.0.0.1 -p "$port" -q 2>/dev/null
  else
    nc -z -w 1 127.0.0.1 "$port" 2>/dev/null
  fi
}

wait_pg_container() {
  local i=0
  while [ "$i" -lt 60 ]; do
    if docker exec "$PG_CONTAINER" pg_isready -U "$PG_USER" -q 2>/dev/null; then
      return 0
    fi
    sleep 1
    i=$((i + 1))
  done
  echo "start.sh: timeout waiting for Postgres in container $PG_CONTAINER" >&2
  return 1
}

ensure_postgres() {
  if [ -n "${POSTGRES_URL:-}" ]; then
    echo "start.sh: POSTGRES_URL is set; skipping auto Postgres"
    return 0
  fi

  if pg_ready 5432; then
    echo "start.sh: Postgres already reachable on 127.0.0.1:5432 (set POSTGRES_URL in .env.local to enable dual-write)"
    return 0
  fi

  if command -v docker >/dev/null 2>&1; then
    echo "start.sh: starting Postgres in Docker ($DOCKER_IMAGE, localhost:${HOST_PG_PORT} → 5432)"
    if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx "$PG_CONTAINER"; then
      docker start "$PG_CONTAINER" >/dev/null
    else
      docker run -d \
        --name "$PG_CONTAINER" \
        -e "POSTGRES_USER=$PG_USER" \
        -e "POSTGRES_PASSWORD=$PG_PASS" \
        -e "POSTGRES_DB=$PG_DB" \
        -p "${HOST_PG_PORT}:5432" \
        "$DOCKER_IMAGE" >/dev/null
    fi
    wait_pg_container
    export POSTGRES_URL="postgresql://${PG_USER}:${PG_PASS}@127.0.0.1:${HOST_PG_PORT}/${PG_DB}"
    echo "start.sh: POSTGRES_URL set for this session (dual-write). Add to .env.local to persist:"
    echo "  POSTGRES_URL=$POSTGRES_URL"
    return 0
  fi

  if [ "$(uname -s)" = "Darwin" ] && command -v brew >/dev/null 2>&1; then
    echo "start.sh: Docker not found; trying Homebrew PostgreSQL…"
    if ! brew list postgresql@16 >/dev/null 2>&1 && ! brew list postgresql >/dev/null 2>&1; then
      echo "start.sh: brew install postgresql@16 (first run can take several minutes)"
      brew install postgresql@16
    fi
    brew services start postgresql@16 2>/dev/null || brew services start postgresql 2>/dev/null || true
    sleep 2
    if pg_ready 5432; then
      echo "start.sh: Homebrew Postgres is up on 5432. Create role/database if needed, then set POSTGRES_URL in .env.local."
      return 0
    fi
  fi

  echo "start.sh: Postgres not started automatically. Options:" >&2
  echo "  • Install Docker Desktop and re-run, or" >&2
  echo "  • brew install postgresql@16 && brew services start postgresql@16" >&2
  echo "  • App still runs on SQLite without POSTGRES_URL." >&2
  return 0
}

ensure_postgres

echo "start.sh: npm install"
npm install

echo "start.sh: npm run build"
npm run build

echo "start.sh: npm run dev (http://localhost:3000)"
exec npm run dev
