// sw.js (root)

/* Attach ALL handlers at top-level immediately (Safari-friendly) */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

/*
  Network-first:
  - Always try the network
  - If offline, fall back to cache
  (We are NOT pre-caching during development)
*/
self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});