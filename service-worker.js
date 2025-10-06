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

// ✅ fetch：HTMLだけはキャッシュしない（ここを追加）
self.addEventListener('fetch', event => {
  const req = event.request;
  const isHTML =
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  event.respondWith((async () => {
    try {
      // HTMLは no-store で都度ネット取得
      const net = await fetch(req, isHTML ? { cache: 'no-store' } : undefined);

      // HTML以外のみキャッシュへ保存
      if (!isHTML) {
        const clone = net.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, clone));
      }

      return net;
    } catch {
      // オフライン時のフォールバック
      const cache = await caches.match(req);
      return cache || Response.error();
    }
  })());
});

// HTMLはキャッシュしない（常に最新を取得）。静的資産のみキャッシュ。
self.addEventListener('fetch', event => {
  const req = event.request;
  const accept = req.headers.get('accept') || '';
  const isHTML = req.mode === 'navigate' || accept.includes('text/html');

  event.respondWith((async () => {
    try {
      const net = await fetch(req, isHTML ? { cache: 'no-store' } : undefined);
      if (!isHTML) {
        const clone = net.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
      }
      return net;
    } catch (e) {
      // オフライン時などはキャッシュを試す（HTMLは通常入っていない想定）
      const cached = await caches.match(req);
      if (cached) return cached;
      throw e;
    }
  })());
});
