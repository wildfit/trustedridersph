// Minimal service worker — required by Android Chrome / Samsung Internet
// for the install prompt criteria. Intentionally does NOT cache anything
// so it can never serve stale content. Pure passthrough fetch handler.
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// A fetch handler must exist (even if it does nothing) for installability.
self.addEventListener("fetch", (event) => {
  // no-op — let the network handle everything
});
