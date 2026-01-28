#!/usr/bin/env bash
set -euo pipefail

NAME="background-maker"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$SCRIPT_DIR/.server.pid"

log() { echo "[$NAME] $1"; }

if [ ! -f "$PID_FILE" ]; then
  log "not running"
  exit 0
fi

PID=$(cat "$PID_FILE")

if kill -0 "$PID" 2>/dev/null; then
  kill "$PID" 2>/dev/null
  for _ in $(seq 1 10); do
    kill -0 "$PID" 2>/dev/null || break
    sleep 0.5
  done
  if kill -0 "$PID" 2>/dev/null; then
    kill -9 "$PID" 2>/dev/null || true
  fi
  log "stopped (pid $PID)"
else
  log "not running (stale pid $PID)"
fi

rm -f "$PID_FILE"
