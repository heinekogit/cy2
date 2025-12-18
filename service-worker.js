// service-worker.js
// 注意：このファイルもコミット毎に内容が何かしら変わる（例えば下の CACHE_VERSION を書き換える）ようにしてください。
// あるいは登録時の ?v=APP_VERSION が変わるので、それでも十分です。

const CACHE_VERSION = (new URL(self.location)).searchParams.get('v') || 'dev';
const STATIC_CACHE = `static-${CACHE_VERSION}`;

// 即時適用
self.addEventListener('install', (event) => {
  self.skipWaiting(); // 旧SWの待機をスキップ
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // 古いキャッシュ全部消す（自バージョン以外）
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== STATIC_CACHE).map(k => caches.delete(k)));
    await self.clients.claim(); // すぐコントロール
  })());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // ✅ これが超重要：自ドメイン以外はSWで触らず、普通にネットへ流す
  if (url.origin !== self.location.origin) {
    return; // 何もしない = ブラウザ標準の fetch に任せる
  }

  // ↓ ここから先だけ、今までのキャッシュ処理をやる
  // 重要：HTML(=navigate)は必ずネットワーク優先 + no-store
  const req = event.request;

  // ナビゲーション（HTML）
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(req, { cache: 'no-store' });
      } catch (e) {
        // オフライン時は最後のキャッシュ（あれば）→なければ簡易オフライン
        const cached = await caches.match(req);
        return cached || new Response('<h1>Offline</h1>', { headers: { 'Content-Type': 'text/html' }});
      }
    })());
    return;
  }

  // 画像/JS/CSS など同一オリジン静的は Cache First（v付与で更新保証済み）
  const sameOrigin = url.origin === self.location.origin;
  const isStatic = sameOrigin && /\.(?:js|css|png|jpg|jpeg|gif|svg|webp|ico|json)$/.test(url.pathname);

  if (isStatic) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      // OKなものだけ保存
      if (res && res.status === 200) cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  // それ以外（APIなど）はネットワーク優先で良い
  event.respondWith(fetch(req).catch(() => caches.match(req)));
});

// ページからのメッセージ（skipWaiting 等）
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
