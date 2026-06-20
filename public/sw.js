// sw.js — minimal service worker, just enough to make the app installable
// (PWA "Add to Home Screen" requires a registered service worker).
// Intentionally does NOT cache aggressively, since this app needs fresh
// data (live schedule/status) every time it's opened.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Pass-through: always go to network, never serve stale cached data.
  event.respondWith(fetch(event.request));
});
