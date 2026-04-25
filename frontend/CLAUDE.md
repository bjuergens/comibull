# Frontend CLAUDE.md

## UI Framework

Mantine UI for all components. Use Mantine primitives (Button, Text, Group, Stack, Table, etc.) instead of raw HTML elements.

## CSS Modules

Use a `<PageName>.module.css` file when a page needs custom styles beyond what Mantine provides. Not every page needs one — pages that are fully expressed with Mantine components don't need a CSS module. Do not reuse another page's CSS module.

## Error Handling

- **Errors bubble up by default.** Local try/catch is the exception, not the rule. If you add one, it should be a deliberate choice.
- **Every error produces a toast.** Helpers in `src/notifications.ts`.
- **Inline error display** is optional — use it when it adds value, not as a substitute for a toast.
- **Global safety net**: `ErrorBoundary` + unhandled error/rejection listeners in `main.tsx`.
