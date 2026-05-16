// Minimal service worker — required for PWA installability on Chrome.
// Network-first pass-through; no caching (the wallet must stay fresh).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
