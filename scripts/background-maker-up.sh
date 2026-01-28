#!/usr/bin/env bash
set -euo pipefail

NAME="background-maker"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PID_FILE="$SCRIPT_DIR/.server.pid"
LOG_FILE="$SCRIPT_DIR/.server.log"
DAEMON=false
[ "${1:-}" = "-d" ] && DAEMON=true

# Load .env
if [ -f "$PROJECT_DIR/.env" ]; then
  set -a; source "$PROJECT_DIR/.env"; set +a
fi
PORT="${PORT:-2000}"

log() { echo "[$NAME] $1"; }

# Stop existing server if running
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    log "stopping previous server (pid $OLD_PID)"
    kill "$OLD_PID" 2>/dev/null || true
    sleep 1
  fi
  rm -f "$PID_FILE"
fi

# Install dependencies if needed
if [ ! -d "$PROJECT_DIR/node_modules" ]; then
  log "installing dependencies"
  (cd "$PROJECT_DIR" && npm install --silent)
fi

cd "$PROJECT_DIR"

if [ "$DAEMON" = true ]; then
  npx vite --port "$PORT" --host 0.0.0.0 > "$LOG_FILE" 2>&1 &
  SERVER_PID=$!
  echo "$SERVER_PID" > "$PID_FILE"
  sleep 2
  if kill -0 "$SERVER_PID" 2>/dev/null; then
    log "started on http://localhost:$PORT (pid $SERVER_PID)"
  else
    log "failed to start"
    rm -f "$PID_FILE"
    exit 1
  fi
else
  log "starting on http://localhost:$PORT"
  exec npx vite --port "$PORT" --host 0.0.0.0
fi
