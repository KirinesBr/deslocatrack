const CACHE_NAME = 'deslocatrack-v4';
const LOCAL_ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    './icon.png'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(LOCAL_ASSETS);
        }).catch(err => console.error('SW Install Error:', err))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    if (!event.request.url.startsWith('http')) return; // Ignore chrome-extension schemes etc
    
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            // Serve from cache if found
            if (cachedResponse) {
                return cachedResponse;
            }
            
            // Otherwise go to network and cache it dynamically (for CDNs, Fonts, etc)
            return fetch(event.request).then((networkResponse) => {
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });
                return networkResponse;
            }).catch(() => {
                // If network fails (offline) and not in cache, fallback to index
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});
