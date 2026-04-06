const CACHE_NAME = 'pickpose-v' + Date.now(); // Dynamic versioning
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/admin.html',
  '/styles.css',
  '/admin.css',
  '/script.js',
  '/admin.js',
  '/firebase-config.js',
  '/images/pickpose-logo.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS_TO_CACHE))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Clear old caches
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }
          })
        );
      })
    ])
  );
});

self.addEventListener('fetch', event => {
  // We only want to handle same-origin or specific CDN assets
  const url = new URL(event.request.url);
  
  // Skip cross-origin requests for internal caching (except fonts/font-awesome)
  if (url.origin !== location.origin && 
      !url.hostname.includes('gstatic.com') && 
      !url.hostname.includes('googleapis.com') && 
      !url.hostname.includes('cdnjs.cloudflare.com')) {
    return;
  }

  // --- Network-First Strategy for HTML ---
  if (event.request.mode === 'navigate' || 
      (event.request.method === 'GET' && event.request.headers.get('accept').includes('text/html'))) {
    event.respondWith(
      fetch(event.request).then(networkResponse => {
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
      }).catch(() => {
        return caches.match(event.request);
      })
    );
    return;
  }

  // --- Stale-While-Revalidate Strategy for Assets ---
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(event.request).then(cachedResponse => {
        const fetchedResponse = fetch(event.request).then(networkResponse => {
          if (networkResponse.ok) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => {
            // Silently fail if network is down
        });

        return cachedResponse || fetchedResponse;
      });
    })
  );
});
