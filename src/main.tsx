/**
 * @file main.tsx
 * @description Application entry point. Handles React root mounting and
 *   Progressive Web App (PWA) service-worker registration.
 *
 * In the Lovable preview environment, service workers and caches are
 * forcefully cleared so the latest code changes are always visible.
 * In production, we register the SW with an aggressive update strategy.
 */

import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";
import "./i18n";

/* ------------------------------------------------------------------ */
/*  Service-worker handling (preview vs production)                   */
/* ------------------------------------------------------------------ */

/** Detect whether we're running inside the Lovable preview iframe */
const isLovablePreview = window.location.hostname.includes("id-preview--");

if (isLovablePreview && "serviceWorker" in navigator) {
  // ── Preview mode: unregister all SWs and flush caches so the UI
  //    always reflects the latest code changes instantly.
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => {
      void registration.unregister();
    });
  });

  if ("caches" in window) {
    caches.keys().then((keys) => {
      keys.forEach((key) => {
        void caches.delete(key);
      });
    });
  }
} else if ("serviceWorker" in navigator) {
  // ── Production mode: register the SW with auto-update behaviour.

  /** Guard against multiple reload loops */
  let refreshing = false;

  // Reload the page when a new SW takes control (e.g. after skipWaiting)
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  /**
   * Register the SW via vite-plugin-pwa helper.
   * - `immediate: true` → install right away on first visit
   * - `onNeedRefresh`   → auto-accept new version (skip user prompt)
   * - `onRegisteredSW`  → set up periodic + visibility-based update checks
   */
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      // Automatically apply the waiting SW (no user confirmation dialog)
      updateSW(true);
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

      /** Check for an updated SW when the tab becomes visible */
      const refreshRegistration = () => {
        if (document.visibilityState === "visible") {
          registration.update();
        }
      };

      // Kick off an initial check, then poll every 60 s
      registration.update();
      document.addEventListener("visibilitychange", refreshRegistration);
      window.setInterval(refreshRegistration, 60_000);
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Mount the React tree                                              */
/* ------------------------------------------------------------------ */

createRoot(document.getElementById("root")!).render(<App />);
