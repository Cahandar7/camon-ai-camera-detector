#!/usr/bin/env bash
# Start CamOn.
#   ./start.sh        dev mode:  backend :8000 + Vite (hot reload) → http://localhost:5173
#   ./start.sh prod   demo mode: builds the UI, everything on one port → http://localhost:8000
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -x backend/.venv/bin/python ]; then
  echo "Run ./setup.sh first" >&2
  exit 1
fi

if [ "${1:-dev}" = "prod" ]; then
  (cd frontend && npm run build)
  CAMON_FRONTEND_DIST="${CAMON_FRONTEND_DIST:-$PWD/frontend/dist}" exec backend/.venv/bin/python backend/run.py
fi

backend/.venv/bin/python backend/run.py &
BACKEND=$!
trap 'kill $BACKEND 2>/dev/null' EXIT INT TERM
cd frontend && npm run dev
