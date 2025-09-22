// 即時更新型 Service Worker（ネット優先・オフライン時のみキャッシュ）
// index.html 側で `service-worker.js?v=__APP_VERSION__` で登録される前提。
// その `v` を参照してキャッシュ名に反映し、デプロイ毎に自動ローテーションする。
const VERSION = (()=>{
  try { return new URL(self.location.href).searchParams.get('v') || 'dev'; }
  catch(_) { return 'dev'; }
})();
const CACHE_NAME = `app-cache-${VERSION}`;

self.addEventListener('install', event => { self.skipWaiting(); });

self.addEventListener('activate', event => {
  event.waitUntil((async ()=>{
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
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
