/**
 * @file main.tsx
 * @description Application entry point. Mounts the React root.
 *
 * The app no longer uses an offline service worker: stale cached copies
 * repeatedly caused blank screens on installed phones. It stays installable
 * via public/manifest.json. Any leftover app worker is unregistered here,
 * and public/sw.js is a kill-switch that evicts old installs.
 */

import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";

/* ------------------------------------------------------------------ */
/*  Remove any leftover app service worker + its caches               */
/* ------------------------------------------------------------------ */

if ("serviceWorker" in navigator) {
  void (async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      // Only touch the app-shell worker (sw.js); leave any messaging workers alone.
      const appRegs = registrations.filter((r) => {
        const url = r.active?.scriptURL || r.waiting?.scriptURL || r.installing?.scriptURL || "";
        return url.endsWith("/sw.js") || url.endsWith("/service-worker.js");
      });
      await Promise.all(appRegs.map((r) => r.unregister()));

      if ("caches" in window) {
        const keys = await window.caches.keys();
        const appCaches = keys.filter(
          (k) => k.startsWith("workbox-") || ["html-cache", "google-fonts-cache", "gstatic-fonts-cache"].includes(k),
        );
        await Promise.all(appCaches.map((k) => window.caches.delete(k)));
      }
    } catch {
      /* ignore: cleanup is best-effort */
    }
  })();
}

/* ------------------------------------------------------------------ */
/*  Mount the React tree                                              */
/* ------------------------------------------------------------------ */

createRoot(document.getElementById("root")!).render(<App />);
