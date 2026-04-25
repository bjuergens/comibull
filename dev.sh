#!/usr/bin/env bash
# Local dev server for the LexiBulle SPA. No backend, no database — just Vite.
#
# Usage:
#   ./dev.sh              # start Vite on http://localhost:3000
#   ./dev.sh e2e [args]   # run Playwright e2e tests (starts its own Vite)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/_lib.sh"

ensure_bun

cmd_start() {
    cd "$SCRIPT_DIR/frontend"
    [ -d node_modules ] || bun install --silent
    exec bun run vite --port 3000
}

cmd_e2e() {
    cd "$SCRIPT_DIR/tests/e2e"
    [ -d node_modules ] || bun install --silent
    # Pre-installed Chromium in the Claude Code environment lives under /opt.
    export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"
    exec bunx playwright test "$@"
}

case "${1:-start}" in
    start) cmd_start ;;
    e2e)   shift; cmd_e2e "$@" ;;
    *)     echo "Usage: ./dev.sh [start|e2e [args]]"; exit 1 ;;
esac
