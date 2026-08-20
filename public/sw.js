const CACHE_NAME = 'integral-frequencia-v3.0';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/pwa-192.png',
  '/pwa-512.png',
  '/apple-touch-icon.png',
  '/logo-web.png'
];

// Install Event - Pre-cache core shell for instant startup
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[PWA ServiceWorker] Pre-caching app shell for instant startup');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[PWA ServiceWorker] Pre-cache warning:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - Clean old caches & take control immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[PWA ServiceWorker] Removing outdated cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Instant Local Cache Load + Async Background Sync
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Skip non-GET requests, non-HTTP protocols, or Firebase/Firestore requests
  if (
    req.method !== 'GET' ||
    !url.protocol.startsWith('http') ||
    url.origin.includes('firestore') ||
    url.origin.includes('firebase') ||
    url.origin.includes('googleapis')
  ) {
    return;
  }

  // 1. Navigation / HTML Requests (App Opening from Mobile Home Screen)
  // Strategy: Cache-First / Stale-While-Revalidate -> Returns cached /index.html in 0ms, revalidates in background
  if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      caches.match('/index.html').then((cachedHtml) => {
        const networkFetch = fetch(req)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', responseClone));
            }
            return networkResponse;
          })
          .catch(() => {
            console.log('[PWA ServiceWorker] Offline / Render sleeping - app loaded instantly from local cache');
          });

        return cachedHtml || networkFetch;
      })
    );
    return;
  }

  // 2. Static Assets & Bundles (JS, CSS, Images, Icons)
  // Strategy: Stale-While-Revalidate -> Serve immediately from local cache, revalidate in background
  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      const networkFetch = fetch(req)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, responseClone));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || networkFetch;
    })
  );
});

// Push Event - Handle incoming Web Push Notifications
self.addEventListener('push', (event) => {
  let data = {
    title: '🔔 Integral: Notificação de Chamada',
    body: 'Verifique as atividades e chamadas do Programa Integral.',
    tag: 'integral_push_notification',
    url: '/',
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    } catch {
      data.body = event.data.text() || data.body;
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/pwa-192.png',
    badge: data.badge || '/icon.svg',
    tag: data.tag || 'integral_notification',
    renotify: true,
    vibrate: [200, 100, 200, 100, 300],
    data: {
      url: data.url || '/',
      activityId: data.activityId,
      turma: data.turma,
      date: data.date,
    },
    actions: [
      { action: 'open_attendance', title: '📋 Abrir Chamada' },
      { action: 'dismiss', title: 'Dispensar' },
    ],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Notification Click Event - Bring app tab into focus or navigate
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a tab is already open, focus it and post a message
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          if (event.notification.data) {
            client.postMessage({
              type: 'NOTIFICATION_CLICKED',
              data: event.notification.data,
            });
          }
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (self.clients.openWindow) {
        const targetUrl = event.notification.data?.url || '/';
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
