# _lib.sh — shared helpers for comibull shell scripts.
# Source this file, don't execute it: source "$(dirname "$0")/_lib.sh"

[[ -n "${_LIB_SOURCED:-}" ]] && return
_LIB_SOURCED=1

ensure_bun() {
    command -v bun &>/dev/null && return
    echo "⚙️  bun not found — installing..."
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
}
