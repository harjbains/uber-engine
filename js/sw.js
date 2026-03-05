// sw.js
const CACHE_NAME = "uber-engine-cache-v1";

// Minimal SW: do NOT aggressively cache JS/HTML during development.
// We’ll use “network first” so new builds appear quickly.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Network-first for everything
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Always try network first; fallback to cache if offline.
  event.respondWith(
    fetch(req)
      .then((res) => res)
      .catch(() => caches.match(req))
  );

  self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

});