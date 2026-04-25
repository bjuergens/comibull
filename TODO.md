# TODO

## Bulk processing

We started single-page only. Bring back bulk operations once single-page
flows feel solid.

- "Analyze all remaining pages" button (was in `PageAnalysisStatus` and
  `usePageOperations.bulkDetectAndAnalyze`). Should walk pages
  sequentially and surface progress somewhere visible (header bar?
  per-page overlay?).
- "Clear all regions" debug action (was a confirm modal in
  `ComicDetailPage` and `usePageOperations.bulkClear`). Useful when
  iterating on prompt/model changes.
- Cancellation: bulk runs can rack up real money, so a stop button is
  not optional.

Look at git history for the deleted implementations:
`git log -p --all -- frontend/src/pages/usePageOperations.ts`
(commit 24529e9 had them; the next commit removed them).

## Features removed for being dead code (consider reactivating)

These were wired up but unused in the single-page/no-DebugDrawer world.
Reactivating means restoring a UI consumer alongside the plumbing.

- **`autoAnalyze` user setting** — pre-collapsed into the single
  "Seite analysieren" button that always does detect+analyze. If we
  re-add a "Nur erkennen" button or bulk mode where pre-analyzing all
  pages is too expensive, reintroduce the setting. Storage key was
  `user_settings.autoAnalyze` in localStorage.
- **`vision_context` on pages** — the backend used to collect a scene
  summary + box-count estimate + font styles + mood from the vision
  call and render it in `DebugDrawer`. The new `detect` call dropped
  the field from prompt + schema + response. To revive: add the
  `vision_context` block back to `DETECT_PROMPT` / `DETECT_SCHEMA` in
  `shared-types.ts`, a `VisionContext` type, a `vision_context` field
  on `PageRow` + `PageItem`, and a UI surface (probably a new
  DebugDrawer). Git before this cleanup commit has the exact shapes.
- **Per-region `ocr_cache_hit` / `analysis_cache_hit` flags** —
  `RegionDetailPanel` displayed them in debug mode but nothing set
  them (anthropic.ts only tracks cache hits in the call log). With
  detect+analyze as single Anthropic calls, per-region OCR caching
  doesn't really apply. The Settings diagnostics table already shows
  cache-hit rates globally.
- **`PAGE_STATUS_COLORS`** — exported from `comic-detail.ts` but
  unused. If we want colored page-status dots somewhere, add it back.
- **`cacheCount` helper** in `store.ts` — `storageStats().cache`
  covers the same info.

## Regenerate after the transition

The plan deleted these intentionally; they need fresh content built for
the client-only product:

- Onboarding / first-run flow (the API-key prompt is the closest thing
  we have today).
- FAQ page.
- Demo comic seed (a built-in 2-page sample so users can try the app
  without uploading anything).
- Public-facing docs.

## Deploy

- Hosted on GitHub Pages from the `gh-pages` branch (created by the
  first CI run). Each branch lives at `/comibull/branch/<branch>/`;
  the repo root redirects to `/branch/main/`. Workflow:
  `.github/workflows/ci.yml`.
- One-time repo settings: enable GitHub Pages with source `gh-pages`
  branch / `/ (root)` directory. The workflow needs `contents: write`
  (already declared on the deploy job).
- Stale branch deploys are not auto-cleaned. When a feature branch is
  merged or deleted, its `branch/<name>/` directory still sits on
  `gh-pages` until someone removes it manually. Consider a cleanup
  job triggered on `delete` events if this gets noisy.
- No post-deploy smoke check yet. `VITE_BUILD_TIME` is baked into the
  bundle and shown on the Settings page; that's the closest thing to
  a version probe today.

## Maybe later

- Impressum / Datenschutz page (legally required for EU public hosting;
  out of scope until we publish broadly).
- Bug-report flow (was a backend POST; could become a "Copy diagnostics
  to clipboard" + GitHub-issues link).
- Archive uploads (CBZ/PDF) — need `jszip` / `pdfjs-dist` in the
  bundle. Skipped for now.
- Bundle splitting: Vite warns about >500KB chunks. Mantine is heavy;
  `manualChunks` would help.
- Retry logic for Anthropic 5xx / 529 (overloaded). Backend had
  `max_retries=3`; not implemented in the browser client.
