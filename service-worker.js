// 即時更新型 Service Worker（ネット優先・オフライン時のみキャッシュ）
const CACHE_NAME = 'app-cache-v2'; // ← 更新時に必ず値を変える

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  event.respondWith(
    fetch(req)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        return res;
      })
      .catch(() => caches.match(req))
  );
});
