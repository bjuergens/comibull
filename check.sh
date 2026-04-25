#!/usr/bin/env bash
# Run frontend validation: lint, typecheck, build, unit tests.
# Usage: ./check.sh [-v|--verbose]
set -uo pipefail

VERBOSE=false
for arg in "$@"; do
    [[ "$arg" == "-v" || "$arg" == "--verbose" ]] && VERBOSE=true
done

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"

run_step() {
    local label="$1"
    shift
    printf "▶  %s\n" "$label"
    if $VERBOSE; then
        if "$@"; then printf "✅ %s\n" "$label"
        else          printf "❌ %s\n" "$label"; exit 1
        fi
    else
        local log; log=$(mktemp)
        if "$@" >"$log" 2>&1; then
            printf "✅ %s\n" "$label"
            rm -f "$log"
        else
            printf "❌ %s\n" "$label"
            cat "$log"
            rm -f "$log"
            exit 1
        fi
    fi
}

cd "$REPO_ROOT/frontend"
run_step "install" bun install --silent
run_step "lint"    bun run lint
run_step "build"   bun run build
run_step "test"    bun run test

printf "\n✅ All checks passed\n"
