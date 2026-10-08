#!/usr/bin/env bash
# Run all STEWARD backend services locally with auto-reload (no Docker).
# Usage: ./scripts/dev.sh        (Ctrl+C stops everything)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PY="$ROOT/backend/.venv/bin/python"

if [[ ! -x "$PY" ]]; then
  echo "Missing virtualenv. Run: python3.12 -m venv backend/.venv && (cd backend && .venv/bin/pip install -r requirements-dev.txt)"
  exit 1
fi

pids=()
start() {  # start <dir> <port>
  (cd "$ROOT/backend/$1" && exec "$PY" -m uvicorn app.main:app --port "$2" --reload --reload-dir app --reload-dir ../common) &
  pids+=($!)
}

trap 'kill "${pids[@]}" 2>/dev/null; wait' INT TERM EXIT

start user_service 8001
start restaurant_service 8002
start order_service 8003
start gateway 8000

echo "STEWARD backend running — gateway: http://localhost:8000/api/health"
wait
