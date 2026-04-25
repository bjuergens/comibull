# LexiBulle

A single-user, client-only web app that helps German speakers learning French (and Japanese) practice reading with comics. Upload pages → Anthropic detects bubbles + OCRs + analyzes → read with per-bubble vocabulary, grammar notes, and translations.

Everything stays in your browser. You bring your own Anthropic API key.

## Links

| What | URL |
|------|-----|
| **GitHub repo** | https://github.com/bjuergens/lexibulle |
| **Example comic** (Pepper&Carrot) | https://www.peppercarrot.com/fr/webcomics/peppercarrot.html |

## Stack

React 19 + Mantine UI + Vite. No backend, no database. IndexedDB for comics/pages, localStorage for preferences and the API key. Anthropic Messages API called directly from the browser.

## Local Development

```sh
./dev.sh             # start Vite on http://localhost:3000
./check.sh           # lint + build + unit tests
```

## Build & Deploy

```sh
cd frontend && bun run build
```

Produces a static `dist/`. CI deploys to GitHub Pages on every push to `main` and on same-repo PRs:

| Branch | URL |
|--------|-----|
| `main` | https://bjuergens.github.io/lexibulle/branch/main/ |
| any other branch | https://bjuergens.github.io/lexibulle/branch/&lt;branch&gt;/ |
| repo root | redirects to `/branch/main/` |

To run a custom-base-path build locally: `VITE_BASE_PATH=/some/path/ bun run build`.

## Using the App

1. Open the app, go to **Einstellungen**, paste your Anthropic API key.
2. Upload a PNG/JPG/WebP comic page.
3. Click **Analysieren** — Claude finds bubbles, OCRs them, and analyzes the text.
4. Read the page; click a bubble to see translation, vocab, grammar.
