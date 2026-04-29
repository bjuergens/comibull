# CLAUDE.md

## Project

ComiBulle is a single-user, client-only React web app. Users upload comic pages, paste their own Anthropic API key, and get AI-powered text detection + linguistic analysis for language learners. No backend, no database, no server-side accounts — everything lives in the browser.

**Target audience: one user per browser profile.** No multi-user concerns until that ever changes.

## Principles

- 🎯 Lean and fail fast. Simplest thing that works.
- 📏 Big functions are fine. Extract when there's reuse or the established abstractions call for it.
- ⏳ No premature performance optimization.
- 🔊 Fail loudly. Throw errors, don't swallow them. Toasts surface them to the user.
- 📋 Plans define *what* and *done when*, not *how*. Challenge a plan when it fights reality; don't silently deviate.

## Emoji

Use consistently in code, commits, and logging.

### Commits

`<emoji> <type>: <description>`

- ✨ feat: new feature
- 🐛 fix: bug fix
- 🔧 config: configuration changes
- 📦 deps: dependency changes
- 🧪 test: tests
- 📝 docs: documentation
- 🧹 refactor: cleanup (no behavior change)

### Logging

- ✅ success operations
- ❌ errors and failures
- ⚠️ warnings

## Tech Stack

- **Frontend**: React 19, Mantine UI 9, Vite, TypeScript
- **Storage**: IndexedDB (via `idb`) for comics/pages/AI-cache/call-log; localStorage for preferences + API key
- **AI**: Anthropic Messages API called directly from the browser (`anthropic-dangerous-direct-browser-access: true`). User brings their own key.
- **Testing**: Vitest (unit), ESLint, TypeScript
- **Build tools**: bun
- **Hosting**: static `dist/` deployed to GitHub Pages under `/comibull/branch/<branch>/`. Pushes to `main` land at `/branch/main/` (canonical app URL); same-repo PRs land at `/branch/<head_ref>/` for previews. The repo root (`/comibull/`) is a meta-refresh redirect to `/branch/main/`. Fork PRs skip deploy (no write token).

## Architecture

- Two-step AI pipeline per page: **detect** (Vision call → bboxes + OCR text) → **analyze** (text call → vocab/grammar/translation). Both run synchronously in the browser.
- Content-addressed AI cache in IndexedDB: identical input → same cached response, no re-spend.
- No auth, no sessions, no accounts. Any user of the browser profile is the user.
- Debug mode is a single localStorage toggle in Settings.
- DB schema upgrades go through a per-version migration registry in `frontend/src/store.ts`. Callers only see the current schema — no backwards-compat shims.

## Code Style

- No docstrings on obvious functions. Comments explain *why*, not *what*.
- Prefer flat file structure over deep nesting.
- When the code takes a non-obvious path, link the authoritative upstream source.
- Per-browser UI toggles (debug, collapsed panels) live in localStorage directly, not in `UserSettings`.

## Frontend Specifics

- **UI Framework**: Mantine UI. Use Mantine primitives (Button, Text, Stack, etc.) over raw HTML.
- **CSS Modules**: one `<PageName>.module.css` per page when Mantine isn't enough. Don't reuse another page's module.
- **Errors bubble up by default.** Local try/catch only when deliberate. Every error produces a toast via `src/notifications.ts`.
- **Global safety net**: `ErrorBoundary` + unhandled error/rejection listeners in `main.tsx`.

## Local Development

- `./dev.sh` starts Vite on port 3000. No Docker, no backend, no DB.
- `./check.sh` runs lint + build + unit tests.

## Deployment

Static SPA. `bun run build` produces `frontend/dist/`. CI deploys it to GitHub Pages via `peaceiris/actions-gh-pages` (see `.github/workflows/ci.yml`). The build is base-path-aware: `VITE_BASE_PATH` controls Vite's `base` so assets resolve under any subpath. Routing uses `HashRouter` (URLs look like `/comibull/branch/main/#/comics/1`) — the hash keeps reload working on GH Pages, which doesn't serve per-directory `404.html` for project sites. `VITE_BUILD_TIME` is baked into the build and shown on the Settings page.

## Don't

- Don't re-introduce a backend or a custom-server deployment. Hosting is GitHub Pages, period. If something needs a backend, talk about it first.
- Don't store the user's API key anywhere except localStorage. Don't send it anywhere except Anthropic.
- Don't fetch anything from a server other than `api.anthropic.com`.
- Don't add UUIDs or account concepts.
- Don't create PRs — just push to the branch. The human creates PRs.

## Blind Spots

Files in `.claudeignore` are invisible to Claude.

- `*.lock` — dependency lockfiles (bun.lock). Auto-generated.
