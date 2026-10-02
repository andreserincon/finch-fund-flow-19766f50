// Kill-switch service worker.
// Replaces the old offline-caching worker so installed apps and browsers
// that still hold a stale copy evict it, reload fresh, and unregister.
function isWorkboxCacheForThisRegistration(name) {
  const hasWorkboxBucket = /(^|-)precache-v\d+-|(^|-)runtime-|(^|-)googleAnalytics-/.test(name);
  return hasWorkboxBucket && name.endsWith(self.registration.scope);
}

// Runtime caches created by the old worker (named explicitly in vite.config).
const LEGACY_CACHES = ["html-cache", "google-fonts-cache", "gstatic-fonts-cache"];

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      try {
        const cacheNames = await caches.keys();
        const toDelete = cacheNames.filter(
          (n) => isWorkboxCacheForThisRegistration(n) || LEGACY_CACHES.includes(n) || n.startsWith("workbox-"),
        );
        await Promise.allSettled(toDelete.map((name) => caches.delete(name)));
        await self.clients.claim();
        const windowClients = await self.clients.matchAll({ type: "window" });
        await Promise.allSettled(windowClients.map((client) => client.navigate(client.url)));
      } finally {
        await self.registration.unregister();
      }
    })(),
  ),
);
