import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// VITE_BUILD_TIME: explicit timestamp from CI so the stamp matches the commit;
// fall back to "now" for local builds.
const buildTime = process.env.VITE_BUILD_TIME ?? new Date().toISOString();

// VITE_BASE_PATH: subpath we're served from. GitHub Pages deploys land under
// /comibull/branch/<branch>/; local dev runs at /. Always trailing-slashed.
const basePath = process.env.VITE_BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  plugins: [react()],
  define: {
    "import.meta.env.VITE_BUILD_TIME": JSON.stringify(buildTime),
  },
});
