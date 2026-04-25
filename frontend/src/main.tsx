import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import App from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import { showCatastrophic } from "./notifications";

import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";

// Global safety net for unhandled errors
window.addEventListener("unhandledrejection", (e) => {
  const msg = e.reason instanceof Error ? e.reason.message : "Unhandled promise rejection";
  showCatastrophic(msg);
});

window.addEventListener("error", (e) => {
  showCatastrophic(e.message || "Unhandled error");
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MantineProvider>
      <Notifications position="top-right" />
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </MantineProvider>
  </StrictMode>
);
