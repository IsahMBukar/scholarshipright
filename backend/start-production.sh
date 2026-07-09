#!/bin/bash
# ── ScholarshipRight production startup ──────────────────────────
#
# Starts all services:
#   1. API server (4 uvicorn workers)
#   2. Task queue worker (match recompute, invalidation)
#
# Usage:
#   ./start-production.sh              # default: 4 workers
#   WORKERS=8 ./start-production.sh    # custom worker count
#
# Prerequisites:
#   - PostgreSQL running
#   - Redis running
#   - .env configured

set -euo pipefail

cd "$(dirname "$0")"

WORKERS=${WORKERS:-4}
API_PORT=${PORT:-8000}
LOG_LEVEL=${LOG_LEVEL:-info}

echo "═══════════════════════════════════════════════"
echo " ScholarshipRight — Production Mode"
echo "═══════════════════════════════════════════════"
echo " API workers:  $WORKERS"
echo " API port:     $API_PORT"
echo " Log level:    $LOG_LEVEL"
echo "═══════════════════════════════════════════════"
echo ""

# ── Health checks ────────────────────────────────────────────────

echo -n "PostgreSQL... "
if pg_isready -q 2>/dev/null; then
    echo "✓"
else
    echo "✗ (not running — start with: pg_ctl start -D ~/pgdata)"
    exit 1
fi

echo -n "Redis...      "
if redis-cli ping 2>/dev/null | grep -q PONG; then
    echo "✓"
else
    echo "✗ (not running — start with: redis-server --daemonize yes)"
    exit 1
fi

echo ""

# ── Start task queue worker (background) ─────────────────────────

echo "Starting task queue worker..."
uv run python -m app.core.task_queue &
WORKER_PID=$!
echo "  Worker PID: $WORKER_PID"

# ── Start API server (multi-worker) ─────────────────────────────

echo "Starting API server ($WORKERS workers on port $API_PORT)..."
exec uv run python -m uvicorn app.main:app \
    --host 0.0.0.0 \
    --port "$API_PORT" \
    --workers "$WORKERS" \
    --log-level "$LOG_LEVEL" \
    --access-log \
    --proxy-headers \
    --forwarded-allow-ips='*'
