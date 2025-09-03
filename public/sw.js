// Service Worker for caching and offline functionality
const CACHE_NAME = 'beekon-ai-cache-v1';
const STATIC_CACHE_NAME = 'beekon-ai-static-v1';
const API_CACHE_NAME = 'beekon-ai-api-v1';

// Files to cache immediately
const STATIC_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/robots.txt',
  '/favicon.ico',
];

// API endpoints to cache
const CACHEABLE_API_PATTERNS = [
  /\/api\/dashboard\/metrics/,
  /\/api\/competitors\/performance/,
  /\/api\/analysis\/results/,
  /\/api\/topics/,
  /\/api\/workspaces/,
  /\/api\/websites/,
];

// Cache duration in milliseconds
const CACHE_DURATION = {
  STATIC: 24 * 60 * 60 * 1000, // 24 hours
  API: 5 * 60 * 1000, // 5 minutes
  IMAGES: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// Install event - cache static files
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE_NAME).then((cache) => {
        return cache.addAll(STATIC_FILES);
      }),
      caches.open(API_CACHE_NAME),
    ])
  );
  
  // Force the service worker to become active immediately
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (
            cacheName !== CACHE_NAME &&
            cacheName !== STATIC_CACHE_NAME &&
            cacheName !== API_CACHE_NAME
          ) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  
  // Take control of all clients immediately
  self.clients.claim();
});

// Fetch event - handle requests
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome-extension requests
  if (url.protocol === 'chrome-extension:') {
    return;
  }

  // Handle different types of requests
  if (isStaticFile(url)) {
    event.respondWith(handleStaticFile(request));
  } else if (isApiRequest(url)) {
    event.respondWith(handleApiRequest(request));
  } else if (isImageRequest(url)) {
    event.respondWith(handleImageRequest(request));
  } else {
    event.respondWith(handleNavigationRequest(request));
  }
});

// Check if request is for a static file
function isStaticFile(url) {
  return (
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.json') ||
    url.pathname === '/' ||
    url.pathname.endsWith('.html')
  );
}

// Check if request is for an API endpoint
function isApiRequest(url) {
  return (
    url.pathname.startsWith('/api/') ||
    CACHEABLE_API_PATTERNS.some((pattern) => pattern.test(url.pathname))
  );
}

// Check if request is for an image
function isImageRequest(url) {
  return (
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.jpeg') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.gif') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.webp')
  );
}

// Handle static file requests - Cache First strategy
async function handleStaticFile(request) {
  const cache = await caches.open(STATIC_CACHE_NAME);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    // Check if cached response is still valid
    const cachedDate = new Date(cachedResponse.headers.get('date'));
    const now = new Date();
    
    if (now - cachedDate < CACHE_DURATION.STATIC) {
      return cachedResponse;
    }
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // If network fails, return cached version if available
    if (cachedResponse) {
      return cachedResponse;
    }
    // For navigation requests, return offline page
    if (request.mode === 'navigate') {
      return new Response('Offline', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    }
    throw error;
  }
}

// Handle API requests - Network First with stale-while-revalidate
async function handleApiRequest(request) {
  const cache = await caches.open(API_CACHE_NAME);
  const cachedResponse = await cache.match(request);

  try {
    // Always try network first for API requests
    const response = await fetch(request);
    
    if (response.ok) {
      // Cache successful responses
      const responseClone = response.clone();
      cache.put(request, responseClone);
    }
    
    return response;
  } catch (error) {
    // If network fails, try to serve from cache
    if (cachedResponse) {
      // Check if cached response is still valid
      const cachedDate = new Date(cachedResponse.headers.get('date'));
      const now = new Date();
      
      if (now - cachedDate < CACHE_DURATION.API) {
        return cachedResponse;
      }
    }
    
    // If no valid cache, return error response
    return new Response(JSON.stringify({ error: 'Network error' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Handle image requests - Cache First strategy
async function handleImageRequest(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    const cachedDate = new Date(cachedResponse.headers.get('date'));
    const now = new Date();
    
    if (now - cachedDate < CACHE_DURATION.IMAGES) {
      return cachedResponse;
    }
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

// Handle navigation requests - Network First with cache fallback
async function handleNavigationRequest(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch (error) {
    // If network fails, try to serve from cache
    const cache = await caches.open(STATIC_CACHE_NAME);
    const cachedResponse = await cache.match('/index.html');
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return offline page
    return new Response('Offline', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  }
}

// Message handler for cache management
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      })
    );
  }
  
  if (event.data && event.data.type === 'CACHE_URLS') {
    const urls = event.data.urls;
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.addAll(urls);
      })
    );
  }
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

// Handle background sync
async function doBackgroundSync() {
  // Implement background sync logic here
  // This could include sending queued API requests when back online
  // Background sync triggered - console removed for security
}

// Push notification handler
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    
    event.waitUntil(
      self.registration.showNotification(data.title, {
        body: data.body,
        icon: '/icon-192x192.png',
        badge: '/icon-192x192.png',
        data: data.data,
      })
    );
  }
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.notification.data && event.notification.data.url) {
    event.waitUntil(
      clients.openWindow(event.notification.data.url)
    );
  }
});

// Error handler
self.addEventListener('error', (event) => {
  // Service Worker error handling - console removed for security
});

// Unhandled rejection handler
self.addEventListener('unhandledrejection', (event) => {
  // Service Worker unhandled rejection - console removed for security
});

// Helper function to log cache statistics
async function logCacheStats() {
  const cacheNames = await caches.keys();
  const stats = {};
  
  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    stats[cacheName] = keys.length;
  }
  
  // Cache statistics - console removed for security
}

// Periodic cleanup of expired cache entries
setInterval(async () => {
  await cleanupExpiredCache();
}, 60 * 60 * 1000); // Run every hour

async function cleanupExpiredCache() {
  const cache = await caches.open(API_CACHE_NAME);
  const keys = await cache.keys();
  const now = new Date();
  
  for (const request of keys) {
    const response = await cache.match(request);
    if (response) {
      const cachedDate = new Date(response.headers.get('date'));
      if (now - cachedDate > CACHE_DURATION.API) {
        await cache.delete(request);
      }
    }
  }
}