const SHELL_CACHE = 'bousai-quest-shell-v8';
const TILE_CACHE = 'bousai-quest-tiles-v8';
const SHELL_FILES = [
  './index.html',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

// Hosts we're willing to cache responses from at runtime (map tiles, fonts,
// leaflet library). This is what lets offline mode show "what was last
// loaded while online" instead of a blank map. Search/route/school APIs
// (Nominatim, Overpass, OSRM) are intentionally NOT cached here since they
// return live, situation-specific data.
const RUNTIME_HOSTS = [
  'cyberjapandata.gsi.go.jp',
  'disaportaldata.gsi.go.jp',
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== TILE_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // App shell: same-origin files. Network-first so that a newly uploaded
  // index.html is picked up right away; the cached copy is used only when
  // the network is unavailable.
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(event.request, copy));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Map tiles / hazard overlays / leaflet / fonts: cache-first, refresh in
  // the background when online, fall back to the cached copy when offline.
  if (RUNTIME_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.open(TILE_CACHE).then((cache) =>
        cache.match(event.request).then((cached) => {
          const networkFetch = fetch(event.request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                cache.put(event.request, networkResponse.clone());
              }
              return networkResponse;
            })
            .catch(() => cached);
          return cached || networkFetch;
        })
      )
    );
  }
  // Everything else (Nominatim search, Overpass school lookup, OSRM
  // routing) is left to the network as-is.
});
