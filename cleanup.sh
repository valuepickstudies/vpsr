#!/usr/bin/env bash
# Remove generated artifacts and local runtime DB/logs (does not remove node_modules unless --all).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

RM_NODE=false
for arg in "$@"; do
  case "$arg" in
    --all) RM_NODE=true ;;
    -h|--help)
      echo "Usage: $0 [--all]"
      echo "  Default: dist, build/, coverage/, *.log, announcements.db"
      echo "  --all: also remove node_modules/"
      exit 0
      ;;
  esac
done

echo "cleanup.sh: removing build outputs and local data…"
rm -rf dist build coverage

rm -f announcements.db
find "$ROOT" -maxdepth 1 -name "*.log" -type f -delete 2>/dev/null || true

if [ "$RM_NODE" = true ]; then
  echo "cleanup.sh: removing node_modules (npm install to restore)…"
  rm -rf node_modules
fi

echo "cleanup.sh: done."
