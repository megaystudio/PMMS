/* ---------------------------------------------------------------------------
   PMMS Service Worker
   Strategy: NETWORK-FIRST for everything. When online, the browser always
   fetches the latest file from GitHub Pages (so editing db.js — like the
   WhatsApp number — shows up immediately, exactly like before this file
   existed). The cache is only a fallback for when the device is offline,
   and it's kept in sync with whatever was last successfully fetched.

   This file's own name doesn't need a version bump for content updates to
   propagate — only bump CACHE_NAME below if you need to force every
   visitor's offline cache to be wiped and rebuilt from scratch.
--------------------------------------------------------------------------- */
const CACHE_NAME = "pmms-cache-v1";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./src/styles.css",
  "./src/db.js",
  "./src/ui.js",
  "./src/app.js",
  "./src/charts.js",
  "./src/global-search.js",
  "./src/pages-dashboard-assets.js",
  "./src/pages-analytics.js",
  "./src/pages-activitylog.js",
  "./src/pages-workorder.js",
  "./src/pages-masters.js",
  "./src/pages-pmcore.js",
  "./src/pages-rca.js",
  "./src/pages-reports.js",
  "./src/pages-settings.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // don't intercept wa.me, fonts, etc.

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html")))
  );
});
