/// <reference lib="webworker" />

const CACHE_NAME = 'okr-tracker-v1';

// Assets to cache on install
const PRECACHE_ASSETS = [
	'/',
	'/manifest.json',
	'/icons/icon-192.png',
	'/icons/icon-512.png',
	'/icons/icon.svg'
];

// Install event - cache core assets
self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => {
			return cache.addAll(PRECACHE_ASSETS);
		})
	);
	// Activate immediately
	self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((cacheNames) => {
			return Promise.all(
				cacheNames
					.filter((name) => name !== CACHE_NAME)
					.map((name) => caches.delete(name))
			);
		})
	);
	// Take control of all pages immediately
	self.clients.claim();
});

// Fetch event - network-first strategy for API, cache-first for assets
self.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);

	// Skip non-GET requests
	if (event.request.method !== 'GET') {
		return;
	}

	// Skip cross-origin requests
	if (url.origin !== self.location.origin) {
		return;
	}

	// API requests - network only (we want fresh data)
	if (url.pathname.startsWith('/api/')) {
		event.respondWith(
			fetch(event.request).catch(() => {
				return new Response(JSON.stringify({ error: 'Offline' }), {
					status: 503,
					headers: { 'Content-Type': 'application/json' }
				});
			})
		);
		return;
	}

	// For navigation requests (HTML pages) - network first, fallback to cache
	if (event.request.mode === 'navigate') {
		event.respondWith(
			fetch(event.request)
				.then((response) => {
					// Cache successful responses
					if (response.status === 200) {
						const responseClone = response.clone();
						caches.open(CACHE_NAME).then((cache) => {
							cache.put(event.request, responseClone);
						});
					}
					return response;
				})
				.catch(() => {
					// Try cache, then show offline page
					return caches.match(event.request).then((cachedResponse) => {
						if (cachedResponse) {
							return cachedResponse;
						}
						// Return cached home page as fallback
						return caches.match('/');
					});
				})
		);
		return;
	}

	// For static assets - cache first, network fallback
	event.respondWith(
		caches.match(event.request).then((cachedResponse) => {
			if (cachedResponse) {
				// Update cache in background
				fetch(event.request).then((response) => {
					if (response.status === 200) {
						caches.open(CACHE_NAME).then((cache) => {
							cache.put(event.request, response);
						});
					}
				});
				return cachedResponse;
			}

			// Not in cache - fetch and cache
			return fetch(event.request).then((response) => {
				if (response.status === 200) {
					const responseClone = response.clone();
					caches.open(CACHE_NAME).then((cache) => {
						cache.put(event.request, responseClone);
					});
				}
				return response;
			});
		})
	);
});

// Handle messages from the app
self.addEventListener('message', (event) => {
	if (event.data === 'skipWaiting') {
		self.skipWaiting();
	}
});
